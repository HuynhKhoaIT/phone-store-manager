"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { BRANCH_COOKIE, getAllowedBranches, getCurrentBranch } from "@/lib/branch";
import { isValidDate, todayVN } from "@/lib/format";
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

/* ---------------- Chi nhánh (admin) ---------------- */

export async function saveBranch(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const name = str(fd, "name");
  const active = str(fd, "active") !== "false";
  if (!name) return { error: "Vui lòng nhập tên chi nhánh." };

  const dup = await prisma.branch.findUnique({ where: { name } });
  if (dup && dup.id !== id) return { error: "Tên chi nhánh đã tồn tại." };
  if (id && !active && (await prisma.branch.count({ where: { active: true, id: { not: id } } })) === 0)
    return { error: "Phải còn ít nhất 1 chi nhánh đang hoạt động." };

  if (id) await prisma.branch.update({ where: { id }, data: { name, active } });
  else await prisma.branch.create({ data: { name } });
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

  const date = str(fd, "date");
  const branch = await getCurrentBranch();
  if (!branch) return { error: "Vui lòng chọn chi nhánh làm việc." };
  const branchId = branch.id;
  const checkIn = str(fd, "checkIn");
  const openingCash = money(fd, "openingCash");

  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (!isAdmin(me) && date !== todayVN()) return { error: "Nhân viên chỉ được vào ca cho ngày hôm nay." };
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
  if (!isAdmin(me) && (shift.userId !== me.id || shift.date !== todayVN())) return NO_PERMISSION;
  return { shift } as const;
}

export async function addTransaction(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  const found = await getEditableShift(me, Number(str(fd, "shiftId")));
  if ("error" in found) return { error: found.error };

  const kind = str(fd, "kind") === "REPAIR" ? "REPAIR" : "SALE";
  const paymentMethod = str(fd, "paymentMethod") === "TRANSFER" ? "TRANSFER" : "CASH";
  const productName = str(fd, "productName");
  const price = money(fd, "price");
  const bankAccount = paymentMethod === "TRANSFER" ? optional(fd, "bankAccount") : null;
  const warrantyMonths = warranty(fd);
  const customerName = optional(fd, "customerName");
  const customerPhone = optional(fd, "customerPhone");

  if (!productName)
    return { error: kind === "REPAIR" ? "Vui lòng nhập nội dung sửa chữa." : "Vui lòng nhập tên sản phẩm." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Vui lòng nhập giá tiền." };
  if (paymentMethod === "TRANSFER" && !bankAccount) return { error: "Chuyển khoản thì phải ghi tài khoản nhận tiền." };
  if (Number.isNaN(warrantyMonths)) return { error: "Bảo hành phải từ 0 đến 12 tháng." };
  if (warrantyMonths > 0 && (!customerName || !customerPhone))
    return { error: "Có bảo hành thì bắt buộc nhập tên và số điện thoại khách hàng." };
  if (customerPhone && !PHONE_RE.test(customerPhone)) return { error: "Số điện thoại không hợp lệ." };

  await prisma.transaction.create({
    data: {
      shiftId: found.shift.id,
      kind,
      productName,
      price,
      paymentMethod,
      bankAccount,
      warrantyMonths,
      customerName,
      customerPhone: customerPhone?.replace(/[ .-]/g, "") ?? null,
      note: optional(fd, "note"),
    },
  });
  revalidatePath(`/day/${found.shift.date}`);
  return {};
}

export async function deleteTransaction(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) return { error: "Không tìm thấy giao dịch." };
  const found = await getEditableShift(me, tx.shiftId);
  if ("error" in found) return { error: found.error };
  await prisma.transaction.delete({ where: { id } });
  revalidatePath(`/day/${found.shift.date}`);
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

  const date = str(fd, "date");
  const productName = str(fd, "productName");
  const quantity = Number(str(fd, "quantity"));
  const fromBranchId = Number(str(fd, "fromBranchId"));
  const toBranchId = Number(str(fd, "toBranchId"));

  if (!isValidDate(date)) return { error: "Ngày không hợp lệ." };
  if (!isAdmin(me) && date > todayVN()) return { error: "Không thể ghi phiếu cho ngày trong tương lai." };
  if (!productName) return { error: "Vui lòng nhập tên sản phẩm." };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Số lượng phải lớn hơn 0." };
  if (fromBranchId === toBranchId) return { error: "Chi nhánh gửi và nhận phải khác nhau." };

  await prisma.stockTransfer.create({
    data: { date, productName, quantity, fromBranchId, toBranchId, staffName: me.name, note: optional(fd, "note") },
  });
  revalidatePath("/transfers");
  return {};
}

export async function deleteStockTransfer(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.stockTransfer.delete({ where: { id } });
  revalidatePath("/transfers");
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

  if (!CATEGORIES.includes(category)) return { error: "Vui lòng chọn loại sản phẩm." };
  if (!name) return { error: "Vui lòng nhập tên sản phẩm." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Vui lòng nhập giá bán." };
  if (Number.isNaN(warrantyMonths)) return { error: "Bảo hành phải từ 0 đến 12 tháng." };

  const data = {
    category,
    name,
    price,
    warrantyMonths,
    variant: optional(fd, "variant"),
    condition: str(fd, "condition") === "USED" ? "USED" : "NEW",
    note: optional(fd, "note"),
    active: str(fd, "active") !== "false",
  };
  if (id) await prisma.product.update({ where: { id }, data });
  else await prisma.product.create({ data });
  revalidateTag(TAGS.prices);
  revalidatePath("/prices");
  return {};
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.product.delete({ where: { id } });
  revalidateTag(TAGS.prices);
  revalidatePath("/prices");
  return {};
}

export async function saveRepairPrice(fd: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) return NO_PERMISSION;

  const id = Number(str(fd, "id")) || null;
  const service = str(fd, "service");
  const device = str(fd, "device");
  const price = money(fd, "price");

  if (!service) return { error: "Vui lòng nhập dịch vụ (VD: Thay pin)." };
  if (!device) return { error: "Vui lòng nhập dòng máy." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Vui lòng nhập giá." };

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
  if (!me || !isAdmin(me)) return NO_PERMISSION;

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
  if (!me || !isAdmin(me)) return NO_PERMISSION;
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
  if (!me || !isAdmin(me)) return NO_PERMISSION;
  await prisma.checklistTask.delete({ where: { id } });
  revalidatePath("/checklist");
  return {};
}

/** Tick / bỏ tick một việc trong ngày tại chi nhánh đang làm việc. */
export async function toggleChecklist(taskId: number, date: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return NOT_LOGGED_IN;
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
  return {};
}
