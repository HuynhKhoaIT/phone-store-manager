"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import type { Prisma, Product } from "@prisma/client";
import { TAGS } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { BRANCH_COOKIE, getAllowedBranches, getCurrentBranch } from "@/lib/branch";
import { isValidDate, todayVN } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { ADMIN_TASKS, periodKey } from "@/lib/admin-tasks";
import { can, isPermission } from "@/lib/permissions";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { adjustQty, branchTwin, consumeBorrowed } from "@/lib/stock";
import { RAM_OPTIONS, STORAGE_OPTIONS, isSingleUnit, productLabel } from "@/lib/product-labels";
import {
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth";

export type ActionResult = { error?: string };

const NO_PERMISSION = { error: "Bạn không có quyền thực hiện thao tác này." };
const NOT_LOGGED_IN = { error: "Phiên đăng nhập đã hết, vui lòng đăng nhập lại." };

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optional(fd: FormData, key: string) {
  return str(fd, key) || null;
}

function money(fd: FormData, key: string) {
  const raw = str(fd, key).replace(/\D/g, "");
  return raw === "" ? NaN : Number(raw);
}

function warranty(fd: FormData) {
  const n = Number(str(fd, "warrantyMonths") || 0);
  return Number.isInteger(n) && n >= 0 && n <= 12 ? n : NaN;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_RE = /^[0-9+ .-]{8,15}$/;

const isAdmin = (u: SessionUser) => u.role === "ADMIN";

/* ---------------- Đăng nhập ---------------- */

async function setBranchCookie(branchId: number) {
  (await cookies()).set(BRANCH_COOKIE, String(branchId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function login(fd: FormData): Promise<ActionResult> {
  const user = await prisma.user.findUnique({ where: { username: str(fd, "username").toLowerCase() } });
  if (!user || !user.active || !verifyPassword(str(fd, "password"), user.passwordHash))
    return { error: "Sai tên đăng nhập hoặc mật khẩu." };

  const allowed = await getAllowedBranches({ ...user, role: user.role as SessionUser["role"] });
  if (allowed.length === 0) return { error: "Tài khoản chưa được phân công chi nhánh nào đang hoạt động." };
  const branchId = Number(str(fd, "branchId"));
  // Đã chọn chi nhánh thì phải đúng chi nhánh được phân công — không tự đổi sang chi nhánh khác
  const branch = branchId ? allowed.find((b) => b.id === branchId) : allowed.length === 1 ? allowed[0] : null;
  if (!branch)
    return {
      error: branchId
        ? `Bạn không được phân công làm việc ở chi nhánh này. Chi nhánh của bạn: ${allowed.map((b) => b.name).join(", ")}.`
        : "Vui lòng chọn chi nhánh làm việc.",
    };

  await createSession(user.id);
  await setBranchCookie(branch.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  (await cookies()).delete(BRANCH_COOKIE);
  redirect("/login");
}

/** Lần đầu chạy (chưa có tài khoản nào): tạo admin + chi nhánh. */
export async function setupFirstAdmin(fd: FormData): Promise<ActionResult> {
  if ((await prisma.user.count()) > 0) return { error: "Hệ thống đã được thiết lập." };
  const name = str(fd, "name");
  const username = str(fd, "username").toLowerCase();
  const password = str(fd, "password");
  const branchName = str(fd, "branchName");

  if (!name || !username) return { error: "Vui lòng nhập họ tên và tên đăng nhập." };
  if (password.length < 6) return { error: "Mật khẩu tối thiểu 6 ký tự." };
  if (!branchName) return { error: "Vui lòng nhập tên chi nhánh." };

  const [branch, user] = await prisma.$transaction([
    prisma.branch.upsert({ where: { name: branchName }, update: {}, create: { name: branchName } }),
    prisma.user.create({ data: { name, username, passwordHash: hashPassword(password), role: "ADMIN" } }),
  ]);
  revalidateTag(TAGS.users);
  revalidateTag(TAGS.branches);
  await createSession(user.id);
  await setBranchCookie(branch.id);
  redirect("/");
}

export async function changeOwnPassword(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!verifyPassword(str(fd, "currentPassword"), user.passwordHash)) return { error: "Mật khẩu hiện tại không đúng." };
  const next = str(fd, "newPassword");
  if (next.length < 6) return { error: "Mật khẩu mới tối thiểu 6 ký tự." };
  if (next !== str(fd, "confirmPassword")) return { error: "Xác nhận mật khẩu mới không khớp." };
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: hashPassword(next) } });
  return {};
}

/* ---------------- Tài khoản (admin) ---------------- */

export async function saveUser(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  const username = str(fd, "username").toLowerCase();
  const password = str(fd, "password");
  const role = str(fd, "role") === "ADMIN" ? "ADMIN" : "STAFF";
  const active = str(fd, "active") !== "false";
  const branchIds = fd.getAll("branchIds").map(Number).filter(Number.isInteger);

  if (!name) return { error: "Vui lòng nhập họ tên." };
  if (!/^[a-z0-9._-]{3,30}$/.test(username))
    return { error: "Tên đăng nhập 3-30 ký tự, chỉ gồm chữ thường không dấu, số, dấu . _ -" };
  if (!id && password.length < 6) return { error: "Mật khẩu tối thiểu 6 ký tự." };
  if (id && password && password.length < 6) return { error: "Mật khẩu mới tối thiểu 6 ký tự." };
  if (id === me.id && (role !== "ADMIN" || !active))
    return { error: "Không thể tự hạ quyền hoặc khoá tài khoản của chính mình." };

  const dup = await prisma.user.findUnique({ where: { username } });
  if (dup && dup.id !== id) return { error: "Tên đăng nhập đã tồn tại." };

  const data = { name, username, role, active, ...(password ? { passwordHash: hashPassword(password) } : {}) };
  const branches = branchIds.map((bid) => ({ id: bid }));
  if (id) await prisma.user.update({ where: { id }, data: { ...data, branches: { set: branches } } });
  else
    await prisma.user.create({ data: { ...data, passwordHash: hashPassword(password), branches: { connect: branches } } });
  revalidateTag(TAGS.users);
  revalidatePath("/users");
  return {};
}

/** Lưu quyền của một nhân viên (trang Phân quyền). Admin luôn toàn quyền nên không lưu. */
export async function saveUserPermissions(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const user = await prisma.user.findUnique({ where: { id: Number(str(fd, "id")) || 0 } });
  if (!user) return { error: "Không tìm thấy tài khoản." };
  if (user.role === "ADMIN") return { error: "Admin luôn có toàn quyền, không cần phân quyền." };
  // Chỉ nhận khoá quyền có trong danh sách — bỏ qua giá trị lạ gửi từ form
  const permissions = [...new Set(fd.getAll("permissions").map(String).filter(isPermission))];

  await prisma.user.update({ where: { id: user.id }, data: { permissions } });
  revalidateTag(TAGS.users);
  revalidatePath("/", "layout");
  return {};
}

/* ---------------- Chi nhánh (admin) ---------------- */

export async function saveBranch(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  const active = str(fd, "active") !== "false";
  // Ngày bắt đầu tính hoà vốn (trang Báo cáo › Hoà vốn); để trống = từ ca đầu tiên
  const openedAt = optional(fd, "openedAt");
  if (!name) return { error: "Vui lòng nhập tên chi nhánh." };
  if (openedAt && !isValidDate(openedAt)) return { error: "Ngày bắt đầu tính không hợp lệ." };

  // Thông tin hiện trên web bán hàng (/api/public/branches)
  const web = {
    address: optional(fd, "address"),
    phone: optional(fd, "phone"),
    zalo: optional(fd, "zalo"),
    facebookUrl: optional(fd, "facebookUrl"),
    tiktokUrl: optional(fd, "tiktokUrl"),
    mapUrl: optional(fd, "mapUrl"),
    openingHours: optional(fd, "openingHours"),
    showOnWeb: str(fd, "showOnWeb") === "on",
    webSortOrder: Number(str(fd, "webSortOrder") || 0),
  };
  if (web.phone && !PHONE_RE.test(web.phone)) return { error: "Số điện thoại không hợp lệ." };
  // Zalo: số điện thoại hoặc link
  if (web.zalo && !PHONE_RE.test(web.zalo) && !/^https?:\/\//i.test(web.zalo))
    return { error: "Zalo phải là số điện thoại hoặc link (https://zalo.me/...)." };
  for (const [label, url] of [["Facebook", web.facebookUrl], ["TikTok", web.tiktokUrl], ["Google Maps", web.mapUrl]] as const)
    if (url && !/^https?:\/\//i.test(url)) return { error: `Link ${label} phải bắt đầu bằng http:// hoặc https://` };
  if (!Number.isInteger(web.webSortOrder)) return { error: "Thứ tự hiển thị phải là số nguyên." };

  const dup = await prisma.branch.findUnique({ where: { name } });
  if (dup && dup.id !== id) return { error: "Tên chi nhánh đã tồn tại." };
  if (id && !active && (await prisma.branch.count({ where: { active: true, id: { not: id } } })) === 0)
    return { error: "Phải còn ít nhất 1 chi nhánh đang hoạt động." };

  if (id) await prisma.branch.update({ where: { id }, data: { name, active, openedAt, ...web } });
  else await prisma.branch.create({ data: { name, openedAt, ...web } });
  revalidateTag(TAGS.branches);
  revalidatePath("/", "layout");
  return {};
}

/* ---------------- Chi nhánh ---------------- */

export async function chooseBranch(branchId: number) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const allowed = await getAllowedBranches(me);
  if (!allowed.some((b) => b.id === branchId)) return NO_PERMISSION;
  await setBranchCookie(branchId);
  redirect("/");
}

/* ---------------- Ca làm việc & bán hàng ---------------- */

export async function openShift(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  if (!can(me, "sell")) return NO_PERMISSION;

  const date = str(fd, "date");
  const branch = await getCurrentBranch();
  if (!branch) return { error: "Vui lòng chọn chi nhánh làm việc." };
  const branchId = branch.id;
  const checkIn = str(fd, "checkIn");
  const openingCash = money(fd, "openingCash");

  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (isAdmin(me)) return { error: "Chỉ nhân viên mới vào ca. Admin chỉ xem và quản lý ca của nhân viên." };
  if (date !== todayVN()) return { error: "Chỉ được vào ca cho ngày hôm nay." };
  if (!TIME_RE.test(checkIn)) return { error: "Giờ vào ca không hợp lệ." };
  if (!Number.isFinite(openingCash)) return { error: "Vui lòng nhập số tiền nhận đầu ca." };

  const existing = await prisma.shift.findFirst({ where: { date, branchId, userId: me.id, closedAt: null } });
  if (existing) return { error: "Bạn đang có một ca chưa kết thúc trong ngày này." };

  await prisma.shift.create({
    data: { date, branchId, userId: me.id, staffName: me.name, checkIn, openingCash },
  });
  revalidatePath(`/day/${date}`);
  return {};
}

/** Ca còn mở và người dùng được phép chỉnh sửa (chủ ca trong hôm nay, hoặc admin). */
async function getEditableShift(me: SessionUser, shiftId: number) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) return { error: "Không tìm thấy ca làm việc." } as const;
  if (shift.closedAt) return { error: "Ca này đã kết thúc, không thể chỉnh sửa." } as const;
  if (!isAdmin(me) && (!can(me, "sell") || shift.userId !== me.id || shift.date !== todayVN())) return NO_PERMISSION;
  return { shift } as const;
}

export async function addTransaction(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  const found = await getEditableShift(me, Number(str(fd, "shiftId")));
  if ("error" in found) return { error: found.error };

  const rawKind = str(fd, "kind");
  const kind = rawKind === "REPAIR" || rawKind === "SIM" || rawKind === "TOPUP" ? rawKind : "SALE";
  const paymentMethod = str(fd, "paymentMethod") === "TRANSFER" ? "TRANSFER" : "CASH";
  // Bán SIM: chọn số + đấu nối làm trên app nhà mạng, ở đây ghi nhận số thuê bao + giá SIM + giá gói cước
  // Nạp card: nhà mạng + số tiền nạp. Cả hai không có lãi: giá vốn = giá thu
  const sim = kind === "SIM" ? simFields(fd) : kind === "TOPUP" ? topupFields(fd) : null;
  if (sim && "error" in sim) return { error: sim.error };
  const productName = sim
    ? kind === "TOPUP"
      ? `Nạp card ${sim.simCarrier}`
      : `SIM ${sim.simCarrier} ${sim.simNumber}`
    : str(fd, "productName");
  const price = sim ? sim.price : money(fd, "price");
  const bankAccount = paymentMethod === "TRANSFER" ? optional(fd, "bankAccount") : null;
  const warrantyMonths = sim ? 0 : warranty(fd);
  const customerName = optional(fd, "customerName");
  const customerPhone = optional(fd, "customerPhone");
  // Bán trả góp qua công ty tài chính: khách trả trước (TM/CK), phần còn lại công ty tài chính trả sau
  const installment = kind === "SALE" && str(fd, "installment") === "1";
  const financeCompany = installment ? optional(fd, "financeCompany") : null;
  const downPayment = installment ? money(fd, "downPayment") : null;

  if (!productName)
    return { error: kind === "REPAIR" ? "Vui lòng nhập nội dung sửa chữa." : "Vui lòng nhập tên sản phẩm." };
  if (!Number.isFinite(price) || price <= 0)
    return { error: kind === "SIM" ? "Giá SIM + gói cước phải lớn hơn 0." : "Vui lòng nhập giá tiền." };
  if (installment) {
    if (!financeCompany) return { error: "Vui lòng nhập công ty tài chính." };
    if (downPayment == null || !Number.isFinite(downPayment) || downPayment < 0)
      return { error: "Vui lòng nhập số tiền khách trả trước (không trả trước thì nhập 0)." };
    if (downPayment >= price) return { error: "Tiền trả trước phải nhỏ hơn giá bán." };
    if (!customerName || !customerPhone) return { error: "Bán trả góp bắt buộc nhập tên và số điện thoại khách hàng." };
  }
  // Trả góp không trả trước thì không có tiền vào → không cần tài khoản nhận
  const receivesMoney = !installment || (downPayment ?? 0) > 0;
  if (paymentMethod === "TRANSFER" && receivesMoney && !bankAccount)
    return { error: "Chuyển khoản thì phải ghi tài khoản nhận tiền." };
  if (Number.isNaN(warrantyMonths)) return { error: "Bảo hành phải từ 0 đến 12 tháng." };
  if (warrantyMonths > 0 && (!customerName || !customerPhone))
    return { error: "Có bảo hành thì bắt buộc nhập tên và số điện thoại khách hàng." };
  if (customerPhone && !PHONE_RE.test(customerPhone)) return { error: "Số điện thoại không hợp lệ." };

  // Bán sản phẩm chọn từ bảng giá: lưu giá nhập để tính lợi nhuận; máy có IMEI thì đánh dấu đã bán, hàng khác trừ số lượng
  const productId = kind === "SALE" ? Number(str(fd, "productId")) || null : null;
  const product = productId ? await prisma.product.findUnique({ where: { id: productId } }) : null;
  const markSold = !!product && isSingleUnit(product);
  if (markSold && product.soldBranchId != null) return { error: "Máy này đã được bán trước đó." };

  // Quà tặng kèm (chỉ khi bán): phụ kiện trong hàng hoá, giá 0 đ, trừ số lượng; giá nhập cộng vào giá vốn giao dịch
  const giftIds = kind === "SALE" ? fd.getAll("giftProductId").map((v) => Number(v) || 0) : [];
  const giftQtys = fd.getAll("giftQty").map((v) => Number(v));
  if (giftIds.some((id) => !id)) return { error: "Quà tặng phải chọn từ danh sách phụ kiện của cửa hàng." };
  if (giftQtys.slice(0, giftIds.length).some((q) => !Number.isInteger(q) || q <= 0 || q > 99))
    return { error: "Số lượng quà tặng không hợp lệ." };
  const giftProducts = giftIds.length ? await prisma.product.findMany({ where: { id: { in: giftIds } } }) : [];
  const gifts = giftIds.map((id, i) => ({ product: giftProducts.find((g) => g.id === id)!, qty: giftQtys[i] }));
  if (gifts.some((g) => !g.product)) return { error: "Không tìm thấy quà tặng trong hàng hoá." };
  if (gifts.some((g) => isSingleUnit(g.product))) return { error: "Máy có IMEI không tặng kèm được." };
  const giftCost = gifts.reduce((s, g) => s + (g.product.costPrice ?? 0) * g.qty, 0);
  const branchId = found.shift.branchId;
  // Hàng (bán hoặc tặng) của quán khác → tự ghi sổ Mượn hàng
  const borrowed = [product, ...gifts.map((g) => g.product)].some(
    (p) => p && p.ownerBranchId != null && p.ownerBranchId !== branchId,
  );

  await prisma.$transaction(async (db) => {
    const tx = await db.transaction.create({
      data: {
        shiftId: found.shift.id,
        kind,
        productId: product?.id ?? null,
        // SIM / nạp card thu hộ nhà mạng, không có lãi → giá vốn = giá thu
        costPrice: sim ? price : (product?.costPrice ?? null),
        giftCost,
        // Chọn đúng gợi ý thì lưu tên chuẩn (gợi ý có thể kèm "(hàng quán khác)")
        productName: product ? productLabel(product) : productName,
        price,
        paymentMethod,
        bankAccount,
        warrantyMonths,
        customerName,
        customerPhone: customerPhone?.replace(/[ .-]/g, "") ?? null,
        note: optional(fd, "note"),
        financeCompany,
        financeContract: installment ? optional(fd, "financeContract") : null,
        downPayment,
        simCarrier: sim?.simCarrier ?? null,
        simNumber: sim?.simNumber ?? null,
        simSerial: sim?.simSerial ?? null,
        simPlanPrice: sim?.simPlanPrice ?? null,
        gifts: {
          create: gifts.map((g) => ({
            productId: g.product.id,
            productName: productLabel(g.product),
            quantity: g.qty,
            costPrice: g.product.costPrice,
          })),
        },
      },
    });
    const borrow = { borrowerBranchId: branchId, date: found.shift.date, transactionId: tx.id, createdBy: me.name };
    if (product) {
      if (markSold)
        await db.product.update({ where: { id: product.id }, data: { soldBranchId: branchId, soldAt: new Date() } });
      else await adjustQty(db, product.id, -1);
      await consumeBorrowed(db, { ...borrow, product, qty: 1, note: "Tự ghi khi bán" });
    }
    for (const g of gifts) {
      await adjustQty(db, g.product.id, -g.qty);
      await consumeBorrowed(db, { ...borrow, product: g.product, qty: g.qty, note: "Tự ghi khi tặng quà" });
    }
  });
  if (borrowed) revalidatePath("/products/loans");
  if (product || gifts.length) {
    revalidateTag(TAGS.prices);
    revalidatePath("/products");
  }
  if (installment) revalidatePath("/installments");
  revalidatePath(`/day/${found.shift.date}`);
  return {};
}

const SIM_NUMBER_RE = /^0\d{9}$/;

/** Đọc + kiểm tra phần bán SIM của form giao dịch. price = giá SIM + giá gói cước */
function simFields(fd: FormData) {
  const simCarrier = str(fd, "simCarrier");
  const simNumber = str(fd, "simNumber").replace(/[ .-]/g, "");
  const simSerial = str(fd, "simSerial").replace(/\s/g, "") || null;
  const simPrice = money(fd, "simPrice");
  const simPlanPrice = str(fd, "simPlanPrice") ? money(fd, "simPlanPrice") : 0;
  if (!simCarrier) return { error: "Vui lòng chọn nhà mạng." };
  if (!SIM_NUMBER_RE.test(simNumber)) return { error: "Số thuê bao phải gồm 10 chữ số, bắt đầu bằng 0." };
  if (simSerial && !/^\d{6,20}$/.test(simSerial)) return { error: "Serial SIM chỉ gồm chữ số." };
  if (!Number.isFinite(simPrice) || simPrice < 0) return { error: "Vui lòng nhập giá SIM (không thu thì nhập 0)." };
  if (!Number.isFinite(simPlanPrice) || simPlanPrice < 0) return { error: "Giá gói cước không hợp lệ." };
  return { simCarrier, simNumber, simSerial, simPlanPrice, price: simPrice + simPlanPrice };
}

/** Đọc + kiểm tra phần nạp card: nhà mạng + số tiền nạp */
function topupFields(fd: FormData) {
  const simCarrier = str(fd, "simCarrier");
  const price = money(fd, "topupAmount");
  if (!simCarrier) return { error: "Vui lòng chọn nhà mạng." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Vui lòng nhập số tiền nạp." };
  return { simCarrier, simNumber: null, simSerial: null, simPlanPrice: null, price };
}

export async function deleteTransaction(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  // Chỉ admin được xoá giao dịch; nhân viên nhập sai thì báo admin xoá
  if (!isAdmin(me)) return NO_PERMISSION;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { gifts: true, _count: { select: { financePayments: true } } },
  });
  if (!tx) return { error: "Không tìm thấy giao dịch." };
  // Tiền trả góp đã thu nằm trong tiền của ca khác — xoá các lần thu trước để tiền ca không bị lệch
  if (tx._count.financePayments > 0)
    return { error: "Đơn trả góp này đã ghi nhận tiền công ty tài chính trả. Xoá các lần thu ở trang Bán trả góp trước." };
  const found = await getEditableShift(me, tx.shiftId);
  if ("error" in found) return { error: found.error };
  const product = tx.productId ? await prisma.product.findUnique({ where: { id: tx.productId } }) : null;
  await prisma.$transaction(async (db) => {
    // Huỷ bán / tặng hàng mượn: dòng mượn hàng chưa thanh toán quay về "đang mượn" (hàng vẫn ở quán mượn).
    // Đã thanh toán thì giữ nguyên để admin tự xử lý.
    await db.branchLoan.updateMany({
      where: { transactionId: id, paidAt: null },
      data: { status: "BORROWED", transactionId: null, soldDate: null },
    });
    await db.transaction.delete({ where: { id } });
    // Hoàn hàng: máy có mã trở lại "đang bán", hàng khác + quà tặng cộng lại số lượng
    if (product && isSingleUnit(product)) {
      if (product.soldBranchId != null)
        await db.product.update({ where: { id: product.id }, data: { soldBranchId: null, soldAt: null } });
    } else if (product) await adjustQty(db, product.id, 1);
    for (const g of tx.gifts) if (g.productId) await adjustQty(db, g.productId, g.quantity);
  });
  if (product || tx.gifts.length) {
    revalidateTag(TAGS.prices);
    revalidatePath("/products", "layout");
  }
  if (tx.financeCompany) revalidatePath("/installments");
  revalidatePath(`/day/${found.shift.date}`);
  return {};
}

/* ---------------- Bán trả góp ---------------- */

/**
 * Ghi nhận tiền trả góp (thường công ty tài chính chuyển phần còn lại).
 * Nhân viên: phải đang trong ca hôm nay ở chi nhánh hiện tại — tiền cộng vào TM / CK của ca.
 * Admin không có ca → chỉ ghi sổ.
 */
export async function recordInstallmentPayment(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  if (!can(me, "sell")) return NO_PERMISSION;
  const branch = await getCurrentBranch();
  if (!branch) return { error: "Vui lòng chọn chi nhánh làm việc." };

  const tx = await prisma.transaction.findUnique({
    where: { id: Number(str(fd, "transactionId")) },
    include: { shift: { select: { branchId: true } }, financePayments: { select: { amount: true } } },
  });
  if (!tx || !tx.financeCompany) return { error: "Không tìm thấy đơn trả góp." };
  if (tx.shift.branchId !== branch.id) return { error: "Đơn trả góp này thuộc chi nhánh khác." };
  const remaining = tx.price - (tx.downPayment ?? 0) - tx.financePayments.reduce((s, p) => s + p.amount, 0);
  if (remaining <= 0) return { error: "Đơn này đã thanh toán đủ." };

  const amount = money(fd, "amount");
  const paymentMethod = str(fd, "paymentMethod") === "CASH" ? "CASH" : "TRANSFER";
  const bankAccount = paymentMethod === "TRANSFER" ? optional(fd, "bankAccount") : null;
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Vui lòng nhập số tiền nhận được." };
  if (amount > remaining) return { error: `Số tiền lớn hơn phần còn lại (${remaining.toLocaleString("vi-VN")} đ).` };
  if (paymentMethod === "TRANSFER" && !bankAccount) return { error: "Chuyển khoản thì phải ghi tài khoản nhận tiền." };

  const today = todayVN();
  let shiftId: number | null = null;
  if (!isAdmin(me)) {
    const shift = await prisma.shift.findFirst({
      where: { userId: me.id, branchId: branch.id, date: today, closedAt: null },
      orderBy: { id: "desc" },
    });
    if (!shift) return { error: "Bạn cần vào ca trước khi ghi nhận tiền trả góp." };
    shiftId = shift.id;
  }

  await prisma.$transaction([
    prisma.installmentPayment.create({
      data: {
        transactionId: tx.id,
        shiftId,
        date: today,
        amount,
        paymentMethod,
        bankAccount,
        note: optional(fd, "note"),
        createdBy: me.name,
      },
    }),
    ...(amount === remaining
      ? [prisma.transaction.update({ where: { id: tx.id }, data: { financePaidAt: new Date() } })]
      : []),
  ]);
  revalidatePath("/installments");
  revalidatePath(`/day/${today}`);
  return {};
}

/** Xoá một lần thu trả góp (ghi nhầm) — chỉ admin; ca nhận tiền đã chốt thì phải mở lại ca trước. */
export async function deleteInstallmentPayment(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  const payment = await prisma.installmentPayment.findUnique({
    where: { id },
    include: { shift: { select: { closedAt: true, date: true } } },
  });
  if (!payment) return { error: "Không tìm thấy lần thu này." };
  if (payment.shift?.closedAt) return { error: "Ca nhận tiền này đã chốt — mở lại ca trước khi xoá." };
  await prisma.$transaction([
    prisma.installmentPayment.delete({ where: { id } }),
    prisma.transaction.update({ where: { id: payment.transactionId }, data: { financePaidAt: null } }),
  ]);
  revalidatePath("/installments");
  if (payment.shift) revalidatePath(`/day/${payment.shift.date}`);
  return {};
}

export async function closeShift(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  const found = await getEditableShift(me, Number(str(fd, "shiftId")));
  if ("error" in found) return { error: found.error };

  const checkOut = str(fd, "checkOut");
  const handoverCash = money(fd, "handoverCash");
  if (!TIME_RE.test(checkOut)) return { error: "Giờ ra về không hợp lệ." };
  if (!Number.isFinite(handoverCash)) return { error: "Vui lòng nhập số tiền bàn giao." };

  await prisma.shift.update({
    where: { id: found.shift.id },
    data: { checkOut, handoverCash, closingNote: optional(fd, "closingNote"), closedAt: new Date() },
  });
  revalidatePath(`/day/${found.shift.date}`);
  return {};
}

export async function reopenShift(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  const shift = await prisma.shift.update({
    where: { id },
    data: { closedAt: null, checkOut: null, handoverCash: null },
  });
  revalidatePath(`/day/${shift.date}`);
  return {};
}

/* ---------------- Nhập hàng giữa chi nhánh ---------------- */

export async function addStockTransfer(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  if (!can(me, "products")) return NO_PERMISSION;

  const type = str(fd, "type") === "IMPORT" ? "IMPORT" : "TRANSFER";
  const date = str(fd, "date");
  const quantity = Number(str(fd, "quantity"));
  const toBranchId = Number(str(fd, "toBranchId"));
  const fromBranchId = type === "TRANSFER" ? Number(str(fd, "fromBranchId")) : null;
  // Giá nhập chỉ admin nhập/xem
  const unitCostRaw = isAdmin(me) && type === "IMPORT" ? str(fd, "unitCost") : "";
  const unitCost = unitCostRaw ? money(fd, "unitCost") : null;

  // Sản phẩm chọn từ danh sách hàng hoá (hoặc tên gõ tự do nếu chưa có trong danh sách)
  const productId = Number(str(fd, "productId")) || null;
  const product = productId ? await prisma.product.findUnique({ where: { id: productId } }) : null;
  const productName = product ? productLabel(product) : str(fd, "productName");

  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (!isAdmin(me) && date > todayVN()) return { error: "Không thể ghi phiếu cho ngày trong tương lai." };
  if (!productName) return { error: "Vui lòng chọn sản phẩm." };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Số lượng phải lớn hơn 0." };
  if (!toBranchId) return { error: "Vui lòng chọn chi nhánh nhận hàng." };
  if (type === "TRANSFER" && (!fromBranchId || fromBranchId === toBranchId))
    return { error: "Chi nhánh gửi và nhận phải khác nhau." };
  if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) return { error: "Giá nhập không hợp lệ." };

  if (product && isSingleUnit(product) && quantity !== 1) return { error: "Máy có IMEI chỉ nhập / chuyển 1 máy mỗi phiếu." };

  await prisma.$transaction(async (db) => {
    await db.stockTransfer.create({
      data: {
        type,
        date,
        productId: product?.id ?? null,
        productName,
        quantity,
        fromBranchId,
        toBranchId,
        supplier: type === "IMPORT" ? optional(fd, "supplier") : null,
        unitCost,
        staffName: me.name,
        note: optional(fd, "note"),
      },
    });
    if (!product) return;
    // Phiếu nhập có giá nhập → cập nhật giá nhập mới nhất cho sản phẩm
    if (unitCost != null) await db.product.update({ where: { id: product.id }, data: { costPrice: unitCost } });
    await moveStock(db, product, type, quantity, fromBranchId, toBranchId);
  });
  if (product) {
    revalidateTag(TAGS.prices);
    revalidatePath("/products");
  }
  revalidatePath("/products/receipts");
  return {};
}

/**
 * Cập nhật số lượng theo phiếu (mỗi quán quản lý hàng riêng, xem lib/stock.ts):
 * - Máy có IMEI: chuyển = đổi chi nhánh quản lý máy; nhập thì giữ nguyên (máy là 1 chiếc).
 * - Hàng khác: nhập cộng vào mặt hàng của quán nhận; chuyển trừ quán gửi, cộng quán nhận (chưa có thì tạo).
 * `sign = -1` để hoàn lại khi xoá phiếu.
 */
async function moveStock(
  db: Prisma.TransactionClient,
  product: Product,
  type: string,
  quantity: number,
  fromBranchId: number | null,
  toBranchId: number,
  sign: 1 | -1 = 1,
) {
  if (isSingleUnit(product)) {
    if (type === "TRANSFER")
      await db.product.update({ where: { id: product.id }, data: { ownerBranchId: sign === 1 ? toBranchId : fromBranchId } });
    return;
  }
  // Hàng chưa gắn chi nhánh: nhận về chi nhánh này luôn
  if (product.ownerBranchId == null)
    product = await db.product.update({ where: { id: product.id }, data: { ownerBranchId: fromBranchId ?? toBranchId } });
  const to = await branchTwin(db, product, toBranchId, true);
  if (to) await adjustQty(db, to.id, sign * quantity);
  if (type === "TRANSFER" && fromBranchId) {
    const from = await branchTwin(db, product, fromBranchId, true);
    if (from) await adjustQty(db, from.id, -sign * quantity);
  }
}

export async function deleteStockTransfer(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { product: true } });
  if (!t) return { error: "Không tìm thấy phiếu." };
  await prisma.$transaction(async (db) => {
    await db.stockTransfer.delete({ where: { id } });
    // Hoàn lại số lượng đã cộng / trừ khi tạo phiếu
    if (t.product) await moveStock(db, t.product, t.type, t.quantity, t.fromBranchId, t.toBranchId, -1);
  });
  revalidateTag(TAGS.prices);
  revalidatePath("/products");
  revalidatePath("/products/receipts");
  return {};
}

/* ---------------- Bảng giá (admin sửa, mọi người xem) ---------------- */

const CATEGORIES = ["IPHONE", "ANDROID", "ACCESSORY"];

export async function saveProduct(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const category = str(fd, "category");
  const name = str(fd, "name");
  const price = money(fd, "price");
  const warrantyMonths = warranty(fd);

  const costRaw = str(fd, "costPrice");
  const costPrice = costRaw ? money(fd, "costPrice") : null;
  const isIphone = category === "IPHONE";
  const code = str(fd, "code").replace(/\s/g, "") || null;
  // RAM / bộ nhớ chỉ cho điện thoại
  const isPhone = category !== "ACCESSORY";
  const ramGb = isPhone ? Number(str(fd, "ramGb")) || null : null;
  const storageGb = isPhone ? Number(str(fd, "storageGb")) || null : null;
  const batteryRaw = isIphone ? str(fd, "batteryHealth") : "";
  const batteryHealth = batteryRaw ? Number(batteryRaw) : null;
  const status = str(fd, "status");
  // Thương hiệu chỉ dùng cho Android / phụ kiện (iPhone mặc định Apple)
  const brandId = category !== "IPHONE" ? Number(str(fd, "brandId")) || null : null;
  const soldBranchId = status === "SOLD" ? Number(str(fd, "soldBranchId")) || null : null;
  const ownerBranchId = Number(str(fd, "ownerBranchId")) || null;
  // Máy có IMEI luôn là 1 chiếc; hàng khác nhập số lượng còn (kiểm kho)
  const quantity = isPhone && code ? 1 : Number(str(fd, "quantity") || 0);

  if (!CATEGORIES.includes(category)) return { error: "Vui lòng chọn loại sản phẩm." };
  if (!name) return { error: "Vui lòng nhập tên sản phẩm." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Vui lòng nhập giá bán." };
  if (costPrice != null && (!Number.isFinite(costPrice) || costPrice < 0)) return { error: "Giá nhập không hợp lệ." };
  if (Number.isNaN(warrantyMonths)) return { error: "Bảo hành phải từ 0 đến 12 tháng." };
  if (isIphone && !code) return { error: "iPhone bắt buộc nhập IMEI." };
  if (isIphone && batteryHealth == null) return { error: "iPhone bắt buộc nhập tình trạng pin." };
  if (code && !/^[A-Za-z0-9._\-\/]{1,40}$/.test(code))
    return { error: "Mã sản phẩm tối đa 40 ký tự, chỉ gồm chữ, số và . _ - /" };
  if (batteryHealth != null && (!Number.isInteger(batteryHealth) || batteryHealth < 1 || batteryHealth > 100))
    return { error: "Tình trạng pin phải từ 1 đến 100%." };
  if (status === "SOLD" && !soldBranchId) return { error: "Đã bán thì phải chọn chi nhánh đã bán." };
  if (!ownerBranchId) return { error: "Vui lòng chọn chi nhánh quản lý hàng này." };
  if (!Number.isInteger(quantity) || quantity < 0) return { error: "Số lượng không hợp lệ." };
  if (ramGb != null && !RAM_OPTIONS.includes(ramGb)) return { error: "RAM không hợp lệ." };
  if (storageGb != null && !STORAGE_OPTIONS.includes(storageGb)) return { error: "Bộ nhớ không hợp lệ." };
  if (code) {
    // Mỗi quán quản lý hàng riêng: cùng mã vạch phụ kiện ở 2 quán là 2 dòng; trùng trong một quán thì báo
    const dup = await prisma.product.findFirst({ where: { code, ownerBranchId, ...(id && { id: { not: id } }) } });
    if (dup) return { error: `Mã này đã có trong hàng hoá của chi nhánh này (${dup.name}).` };
  }

  // Hiển thị trên web marketing
  const showOnWeb = str(fd, "showOnWeb") === "on";
  // Điện thoại: giá sale dùng cả khi bán hàng; phụ kiện: giá khuyến mãi chỉ cho web
  const salePriceRaw = isPhone || showOnWeb ? str(fd, "salePrice") : "";
  const salePrice = salePriceRaw ? money(fd, "salePrice") : null;
  const imageUrls = str(fd, "imageUrls")
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean);
  if (salePrice != null && (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= price))
    return { error: isPhone ? "Giá sale phải lớn hơn 0 và nhỏ hơn giá bán." : "Giá khuyến mãi phải lớn hơn 0 và nhỏ hơn giá bán." };
  if (imageUrls.length > 10) return { error: "Tối đa 10 ảnh." };
  if (imageUrls.some((u) => !/^https?:\/\/\S+$/i.test(u) || u.length > 500))
    return { error: "Link ảnh phải bắt đầu bằng http:// hoặc https://" };
  const sortOrder = Number(str(fd, "sortOrder") || 0);
  if (!Number.isInteger(sortOrder)) return { error: "Thứ tự hiển thị phải là số nguyên." };

  const existing = id ? await prisma.product.findUnique({ where: { id } }) : null;

  // Slug: nhập tay hoặc tự tạo từ tên; giữ slug cũ nếu không đổi; thêm -2, -3... nếu trùng
  const slugInput = slugify(str(fd, "slug"));
  let slug: string | null = slugInput || existing?.slug || null;
  if (!slug && showOnWeb) {
    slug = slugify([name, ramGb && storageGb ? `${ramGb}-${storageGb}gb` : storageGb ? `${storageGb}gb` : null,
      optional(fd, "variant"), str(fd, "condition") === "USED" ? "cu" : null].filter(Boolean).join(" ")) || "san-pham";
  }
  if (slug) {
    const base = slug;
    for (let n = 2; await prisma.product.findFirst({ where: { slug, ...(id && { id: { not: id } }) } }); n++) {
      if (slugInput && n === 2) return { error: `Đường dẫn "${slugInput}" đã được dùng cho sản phẩm khác.` };
      slug = `${base}-${n}`;
    }
  }
  const data = {
    category,
    name,
    price,
    costPrice,
    brandId,
    warrantyMonths,
    code,
    ramGb,
    storageGb,
    batteryHealth,
    variant: optional(fd, "variant"),
    condition: str(fd, "condition") === "USED" ? "USED" : "NEW",
    note: optional(fd, "note"),
    active: status !== "HIDDEN",
    showOnWeb,
    slug,
    description: showOnWeb ? optional(fd, "description") : (existing?.description ?? null),
    salePrice,
    priceOnRequest: showOnWeb && str(fd, "priceOnRequest") === "on",
    featured: showOnWeb && str(fd, "featured") === "on",
    sortOrder,
    imageUrls: showOnWeb ? imageUrls : (existing?.imageUrls ?? []),
    soldBranchId,
    // Giữ thời điểm bán cũ nếu vẫn là "đã bán"
    soldAt: soldBranchId ? (existing?.soldAt ?? new Date()) : null,
    ownerBranchId,
    quantity,
  };
  if (id) await prisma.product.update({ where: { id }, data });
  else await prisma.product.create({ data });
  revalidateTag(TAGS.prices);
  revalidatePath("/products");
  return {};
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.product.delete({ where: { id } });
  revalidateTag(TAGS.prices);
  revalidatePath("/products");
  return {};
}

export async function saveRepairPrice(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const service = str(fd, "service");
  const device = str(fd, "device");
  // Để trống giá = giá thay đổi theo linh kiện / thị trường → web hiện "Liên hệ"
  const price = str(fd, "price") ? money(fd, "price") : 0;

  if (!service) return { error: "Vui lòng nhập dịch vụ (VD: Thay pin)." };
  if (!device) return { error: "Vui lòng nhập dòng máy." };
  if (!Number.isFinite(price) || price < 0) return { error: "Giá không hợp lệ." };

  const data = { service, device, price, warranty: optional(fd, "warranty"), note: optional(fd, "note") };
  if (id) await prisma.repairPrice.update({ where: { id }, data });
  else await prisma.repairPrice.create({ data });
  revalidateTag(TAGS.prices);
  revalidatePath("/repair-prices");
  return {};
}

export async function deleteRepairPrice(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.repairPrice.delete({ where: { id } });
  revalidateTag(TAGS.prices);
  revalidatePath("/repair-prices");
  return {};
}

/* ---------------- Checklist công việc hằng ngày ---------------- */

export async function saveChecklistTask(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "checklist")) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const title = str(fd, "title");
  const branchId = Number(str(fd, "branchId")) || null;
  if (!title) return { error: "Vui lòng nhập tên công việc." };

  const data = {
    title,
    branchId,
    description: optional(fd, "description"),
    active: str(fd, "active") !== "false",
  };
  if (id) await prisma.checklistTask.update({ where: { id }, data });
  else {
    const last = await prisma.checklistTask.aggregate({ _max: { sortOrder: true } });
    await prisma.checklistTask.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath("/checklist");
  return {};
}

export async function moveChecklistTask(id: number, direction: -1 | 1): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "checklist")) return NO_PERMISSION;
  const tasks = await prisma.checklistTask.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const i = tasks.findIndex((t) => t.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= tasks.length) return {};
  [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  await prisma.$transaction(
    tasks.map((t, idx) => prisma.checklistTask.update({ where: { id: t.id }, data: { sortOrder: idx } })),
  );
  revalidatePath("/checklist");
  return {};
}

export async function deleteChecklistTask(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "checklist")) return NO_PERMISSION;
  await prisma.checklistTask.delete({ where: { id } });
  revalidatePath("/checklist");
  return {};
}

/** Tick / bỏ tick một việc trong ngày tại chi nhánh đang làm việc. */
export async function toggleChecklist(taskId: number, date: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  if (!can(me, "sell")) return NO_PERMISSION;
  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (!isAdmin(me) && date !== todayVN()) return { error: "Chỉ được đánh dấu công việc của ngày hôm nay." };
  const branch = await getCurrentBranch();
  if (!branch) return { error: "Vui lòng chọn chi nhánh làm việc." };

  const key = { taskId_date_branchId: { taskId, date, branchId: branch.id } };
  const existing = await prisma.checklistCheck.findUnique({ where: key });
  if (existing) {
    if (!isAdmin(me) && existing.userId !== me.id)
      return { error: "Việc này do người khác đánh dấu, bạn không thể bỏ tick." };
    await prisma.checklistCheck.delete({ where: key });
  } else {
    await prisma.checklistCheck.create({ data: { taskId, date, branchId: branch.id, userId: me.id } });
  }
  revalidatePath(`/day/${date}`);
  revalidatePath("/tasks");
  return {};
}

/** Tick / bỏ tick một việc của chủ quán. Tính chung cả cửa hàng, không theo chi nhánh. */
export async function toggleAdminTask(taskKey: string, date: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  const task = ADMIN_TASKS.find((t) => t.key === taskKey);
  if (!task) return { error: "Công việc không tồn tại." };

  const key = { taskKey_period: { taskKey, period: periodKey(task.period, date) } };
  const existing = await prisma.adminCheck.findUnique({ where: key });
  if (existing) await prisma.adminCheck.delete({ where: key });
  else await prisma.adminCheck.create({ data: { ...key.taskKey_period, userName: me.name } });
  revalidatePath("/tasks");
  return {};
}

/* ---------------- Thương hiệu (admin) ---------------- */

export async function saveBrand(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "brands")) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  if (!name) return { error: "Vui lòng nhập tên thương hiệu." };
  const dup = await prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (dup && dup.id !== id) return { error: "Thương hiệu này đã có." };

  const data = { name, active: str(fd, "active") !== "false" };
  if (id) await prisma.brand.update({ where: { id }, data });
  else await prisma.brand.create({ data });
  revalidateTag(TAGS.prices);
  revalidatePath("/brands");
  revalidatePath("/products");
  return {};
}

/* ---------------- Tin tức (admin) ---------------- */

const POST_CATEGORIES = ["NEWS", "PROMOTION", "GUIDE"];

export async function savePost(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "posts")) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const title = str(fd, "title");
  const category = str(fd, "category");
  const status = str(fd, "status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const excerpt = optional(fd, "excerpt");
  const content = str(fd, "content");
  const coverImageUrl = optional(fd, "coverImageUrl");
  const publishedAtRaw = str(fd, "publishedAt"); // "YYYY-MM-DDTHH:mm" theo giờ Việt Nam

  if (!title) return { error: "Vui lòng nhập tiêu đề." };
  if (title.length > 200) return { error: "Tiêu đề tối đa 200 ký tự." };
  if (!POST_CATEGORIES.includes(category)) return { error: "Vui lòng chọn chuyên mục." };
  if (excerpt && excerpt.length > 300) return { error: "Tóm tắt tối đa 300 ký tự." };
  if (coverImageUrl && (!/^https?:\/\/\S+$/i.test(coverImageUrl) || coverImageUrl.length > 500))
    return { error: "Link ảnh bìa phải bắt đầu bằng http:// hoặc https://" };
  if (status === "PUBLISHED" && !content) return { error: "Bài đăng cần có nội dung." };
  if (publishedAtRaw && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(publishedAtRaw))
    return { error: "Ngày đăng không hợp lệ." };

  const existing = id ? await prisma.post.findUnique({ where: { id } }) : null;
  if (id && !existing) return { error: "Không tìm thấy bài viết." };
  const publishedAt = publishedAtRaw
    ? new Date(`${publishedAtRaw}:00+07:00`)
    : status === "PUBLISHED"
      ? (existing?.publishedAt ?? new Date())
      : (existing?.publishedAt ?? null);

  // Slug: nhập tay hoặc tự tạo từ tiêu đề; thêm -2, -3... nếu trùng
  const slugInput = slugify(str(fd, "slug"));
  const base = slugInput || existing?.slug || slugify(title) || "bai-viet";
  let slug = base;
  for (let n = 2; await prisma.post.findFirst({ where: { slug, ...(id && { id: { not: id } }) } }); n++) {
    if (slugInput && n === 2) return { error: `Đường dẫn "${slugInput}" đã được dùng cho bài khác.` };
    slug = `${base}-${n}`;
  }

  const data = {
    title,
    slug,
    category,
    status,
    excerpt,
    content,
    coverImageUrl,
    publishedAt,
    featured: str(fd, "featured") === "on",
  };
  if (id) await prisma.post.update({ where: { id }, data });
  else await prisma.post.create({ data: { ...data, authorId: me.id } });
  revalidateTag(TAGS.posts);
  revalidatePath("/posts");
  return {};
}

export async function deletePost(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "posts")) return NO_PERMISSION;
  await prisma.post.delete({ where: { id } });
  revalidateTag(TAGS.posts);
  revalidatePath("/posts");
  return {};
}

/* ---------------- Chương trình khuyến mãi ---------------- */

const PROMOTION_TYPES = ["DISCOUNT", "GIFT", "INSTALLMENT", "TRADE_IN", "OTHER"];

export async function savePromotion(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "promotions")) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const title = str(fd, "title");
  const type = str(fd, "type");
  const isDiscount = type === "DISCOUNT";
  const discountType = isDiscount ? (str(fd, "discountType") === "PERCENT" ? "PERCENT" : "AMOUNT") : null;
  const discountValue = !isDiscount
    ? null
    : discountType === "PERCENT"
      ? Number(str(fd, "discountPercent"))
      : money(fd, "discountAmount");
  const maxDiscount = discountType === "PERCENT" && str(fd, "maxDiscount") ? money(fd, "maxDiscount") : null;
  const startDate = str(fd, "startDate");
  const endDate = optional(fd, "endDate");
  const bannerUrl = optional(fd, "bannerUrl");
  const ints = (key: string) => [...new Set(fd.getAll(key).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))];
  const byProduct = str(fd, "scope") === "PRODUCTS";
  const productIds = byProduct ? ints("productIds") : [];
  const categories = byProduct ? [] : fd.getAll("categories").map(String).filter((c) => CATEGORIES.includes(c));
  const brandIds = byProduct ? [] : ints("brandIds");
  const conditions = byProduct ? [] : fd.getAll("conditions").map(String).filter((c) => c === "NEW" || c === "USED");
  const branchIds = ints("branchIds");

  if (!title) return { error: "Vui lòng nhập tên chương trình." };
  if (title.length > 200) return { error: "Tên chương trình tối đa 200 ký tự." };
  if (!PROMOTION_TYPES.includes(type)) return { error: "Vui lòng chọn loại ưu đãi." };
  if (discountType === "PERCENT" && (!Number.isInteger(discountValue) || discountValue! < 1 || discountValue! > 90))
    return { error: "Mức giảm phải từ 1% đến 90%." };
  if (discountType === "AMOUNT" && (!Number.isFinite(discountValue) || discountValue! <= 0))
    return { error: "Vui lòng nhập số tiền giảm." };
  if (maxDiscount != null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0))
    return { error: "Giảm tối đa không hợp lệ." };
  // Giảm giá thì tự tạo mô tả nếu để trống; loại khác bắt buộc ghi ưu đãi là gì
  const summary =
    str(fd, "summary") ||
    (isDiscount ? `Giảm ${discountType === "PERCENT" ? `${discountValue}%` : `${discountValue!.toLocaleString("vi-VN")} đ`}` : "");
  if (!summary) return { error: "Vui lòng nhập nội dung ưu đãi (vd: Tặng ốp lưng + cường lực)." };
  if (summary.length > 200) return { error: "Nội dung ưu đãi tối đa 200 ký tự." };
  if (!isValidDate(startDate)) return { error: "Vui lòng chọn ngày bắt đầu." };
  if (endDate && !isValidDate(endDate)) return { error: "Ngày kết thúc không hợp lệ." };
  if (endDate && endDate < startDate) return { error: "Ngày kết thúc phải sau ngày bắt đầu." };
  if (byProduct && !productIds.length) return { error: "Vui lòng chọn ít nhất một sản phẩm áp dụng." };
  if (bannerUrl && (!/^https?:\/\/\S+$/i.test(bannerUrl) || bannerUrl.length > 500))
    return { error: "Link ảnh banner phải bắt đầu bằng http:// hoặc https://" };

  const existing = id ? await prisma.promotion.findUnique({ where: { id } }) : null;
  if (id && !existing) return { error: "Không tìm thấy chương trình." };

  // Slug: nhập tay hoặc tự tạo từ tên; thêm -2, -3... nếu trùng
  const slugInput = slugify(str(fd, "slug"));
  const base = slugInput || existing?.slug || slugify(title) || "khuyen-mai";
  let slug = base;
  for (let n = 2; await prisma.promotion.findFirst({ where: { slug, ...(id && { id: { not: id } }) } }); n++) {
    if (slugInput && n === 2) return { error: `Đường dẫn "${slugInput}" đã được dùng cho chương trình khác.` };
    slug = `${base}-${n}`;
  }

  const data = {
    title,
    slug,
    type,
    discountType,
    discountValue,
    maxDiscount,
    summary,
    content: str(fd, "content"),
    bannerUrl,
    startDate,
    endDate,
    categories,
    brandIds,
    conditions,
    productIds,
    branchIds,
    active: str(fd, "active") !== "false",
    showOnWeb: str(fd, "showOnWeb") === "on",
    featured: str(fd, "featured") === "on",
    sortOrder: Number(str(fd, "sortOrder")) || 0,
  };
  if (id) await prisma.promotion.update({ where: { id }, data });
  else await prisma.promotion.create({ data: { ...data, createdBy: me.name } });
  revalidateTag(TAGS.promotions);
  revalidatePath("/promotions");
  return {};
}

/** Tạm dừng / chạy lại nhanh từ danh sách */
export async function togglePromotion(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "promotions")) return NO_PERMISSION;
  const p = await prisma.promotion.findUnique({ where: { id } });
  if (!p) return { error: "Không tìm thấy chương trình." };
  await prisma.promotion.update({ where: { id }, data: { active: !p.active } });
  revalidateTag(TAGS.promotions);
  revalidatePath("/promotions");
  return {};
}

export async function deletePromotion(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !can(me, "promotions")) return NO_PERMISSION;
  await prisma.promotion.delete({ where: { id } });
  revalidateTag(TAGS.promotions);
  revalidatePath("/promotions");
  return {};
}

/* ---------------- Chi phí (admin, trang Báo cáo) ---------------- */

export async function saveExpense(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const date = str(fd, "date");
  const category = str(fd, "category");
  const amount = money(fd, "amount");
  const branchId = Number(str(fd, "branchId")) || null;

  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (!EXPENSE_CATEGORIES[category]) return { error: "Vui lòng chọn loại chi phí." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Vui lòng nhập số tiền." };
  if (branchId && !(await prisma.branch.findUnique({ where: { id: branchId } })))
    return { error: "Chi nhánh không tồn tại." };

  const data = { date, category, amount, branchId, note: optional(fd, "note") };
  if (id) await prisma.expense.update({ where: { id }, data });
  else await prisma.expense.create({ data: { ...data, createdBy: me.name } });
  revalidatePath("/reports");
  return {};
}

export async function deleteExpense(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/reports");
  return {};
}

/* ---------------- Góp vốn (admin, Báo cáo › Góp vốn) ---------------- */

export async function saveInvestor(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  const phone = optional(fd, "phone");
  if (!name) return { error: "Vui lòng nhập tên người góp vốn." };
  if (phone && !PHONE_RE.test(phone)) return { error: "Số điện thoại không hợp lệ." };

  const data = { name, phone, note: optional(fd, "note"), active: str(fd, "active") !== "false" };
  if (id) await prisma.investor.update({ where: { id }, data });
  else await prisma.investor.create({ data });
  revalidatePath("/reports", "layout");
  return {};
}

export async function saveCapitalEntry(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const type = str(fd, "type") === "WITHDRAW" ? "WITHDRAW" : "CONTRIBUTE";
  const investorId = Number(str(fd, "investorId"));
  const branchId = Number(str(fd, "branchId"));
  const date = str(fd, "date");
  const amount = money(fd, "amount");

  if (!investorId || !(await prisma.investor.findUnique({ where: { id: investorId } })))
    return { error: "Vui lòng chọn người góp vốn." };
  if (!branchId || !(await prisma.branch.findUnique({ where: { id: branchId } })))
    return { error: "Vui lòng chọn chi nhánh." };
  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Vui lòng nhập số tiền." };

  const data = { type, investorId, branchId, date, amount, note: optional(fd, "note") };
  if (id) await prisma.capitalEntry.update({ where: { id }, data });
  else await prisma.capitalEntry.create({ data: { ...data, createdBy: me.name } });
  revalidatePath("/reports", "layout");
  revalidatePath("/branches");
  return {};
}

export async function deleteCapitalEntry(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.capitalEntry.delete({ where: { id } });
  revalidatePath("/reports", "layout");
  revalidatePath("/branches");
  return {};
}

/* ---------------- Mượn hàng giữa chi nhánh (Hàng hoá › Mượn hàng) ---------------- */

/** Ghi mượn hàng (mọi người có quyền Hàng hoá). Sửa (số tiền, ghi chú) chỉ admin vì số tiền là giá nhập. */
export async function saveLoan(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  if (!can(me, "products")) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  if (id) {
    if (!isAdmin(me)) return NO_PERMISSION;
    const amount = str(fd, "amount") ? money(fd, "amount") : 0;
    if (!Number.isFinite(amount) || amount < 0) return { error: "Số tiền không hợp lệ." };
    await prisma.branchLoan.update({ where: { id }, data: { amount, note: optional(fd, "note") } });
    revalidatePath("/products/loans");
    return {};
  }

  const date = str(fd, "date");
  const quantity = Number(str(fd, "quantity") || 1);
  const lenderBranchId = Number(str(fd, "lenderBranchId"));
  const borrowerBranchId = Number(str(fd, "borrowerBranchId"));
  const productId = Number(str(fd, "productId")) || null;
  const product = productId ? await prisma.product.findUnique({ where: { id: productId } }) : null;
  const productName = product ? productLabel(product) : str(fd, "productName");

  if (!productName) return { error: "Vui lòng chọn sản phẩm." };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Số lượng phải lớn hơn 0." };
  if (!lenderBranchId || !borrowerBranchId || lenderBranchId === borrowerBranchId)
    return { error: "Chi nhánh cho mượn và chi nhánh mượn phải khác nhau." };
  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (!isAdmin(me) && date > todayVN()) return { error: "Không thể ghi cho ngày trong tương lai." };

  await prisma.branchLoan.create({
    data: {
      productId: product?.id ?? null,
      productName,
      quantity,
      lenderBranchId,
      borrowerBranchId,
      date,
      // Số tiền phải trả khi bán = giá nhập × SL (chưa có giá nhập thì admin nhập sau)
      amount: (product?.costPrice ?? 0) * quantity,
      note: optional(fd, "note"),
      createdBy: me.name,
    },
  });
  revalidatePath("/products/loans");
  return {};
}

/**
 * Đổi trạng thái: trả hàng / đã bán (quyền Hàng hoá), đã thanh toán / bỏ thanh toán (chỉ admin).
 * `sold` dùng cho hàng bán ngoài trang Bán hàng (vd phụ kiện) — bán qua trang Bán hàng thì tự cập nhật.
 */
export async function setLoanStatus(id: number, action: "return" | "sold" | "paid" | "unpaid"): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  if (!can(me, "products")) return NO_PERMISSION;
  if ((action === "paid" || action === "unpaid") && !isAdmin(me)) return NO_PERMISSION;
  const loan = await prisma.branchLoan.findUnique({ where: { id } });
  if (!loan) return { error: "Không tìm thấy." };

  const today = todayVN();
  if (action === "return" || action === "sold") {
    if (loan.status !== "BORROWED") return { error: "Chỉ đổi được khi hàng đang mượn." };
    await prisma.branchLoan.update({
      where: { id },
      data: action === "return" ? { status: "RETURNED", returnedDate: today } : { status: "SOLD", soldDate: today },
    });
  } else {
    if (loan.status !== "SOLD") return { error: "Chỉ thanh toán được hàng đã bán." };
    await prisma.branchLoan.update({
      where: { id },
      data: action === "paid" ? { paidAt: new Date(), paidBy: me.name } : { paidAt: null, paidBy: null },
    });
  }
  revalidatePath("/products/loans");
  return {};
}

export async function deleteLoan(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.branchLoan.delete({ where: { id } });
  revalidatePath("/products/loans");
  return {};
}
