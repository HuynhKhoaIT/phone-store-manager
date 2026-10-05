// Tạo dữ liệu mẫu để test ở local:  npm run db:seed
// - Giữ nguyên dữ liệu đã có. Mỗi phần chỉ tạo khi bảng tương ứng đang trống → chạy lại nhiều lần không bị trùng.
// - KHÔNG chạy trên database production.
import { randomBytes, scryptSync } from "node:crypto";
import { rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url) && !process.argv.includes("--allow-remote")) {
  console.error("✖ DATABASE_URL không phải localhost — dừng lại để tránh ghi dữ liệu mẫu vào database thật.");
  console.error("  (Nếu thật sự muốn, chạy: node scripts/seed-demo.mjs --allow-remote)");
  process.exit(1);
}

// ---------- tiện ích ----------
const TZ = "Asia/Ho_Chi_Minh";
const todayVN = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`);
const hashPassword = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
};
// Ngẫu nhiên có seed → lần nào tạo cũng giống nhau
let seed = 20261005;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const log = (s) => console.log("  " + s);

const today = todayVN();

// ---------- 1. Chi nhánh ----------
let branches = await prisma.branch.findMany({ where: { active: true }, orderBy: { id: "asc" } });
if (branches.length < 2) {
  await prisma.branch.upsert({ where: { name: "Mobile - Quận 8" }, update: {}, create: { name: "Mobile - Quận 8" } });
  if (branches.length === 0)
    await prisma.branch.upsert({ where: { name: "Mobile - Bình Đông" }, update: {}, create: { name: "Mobile - Bình Đông" } });
  branches = await prisma.branch.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  log(`Chi nhánh: ${branches.map((b) => b.name).join(", ")}`);
}
const [b1, b2] = branches;

// ---------- 2. Tài khoản ----------
const ensureUser = async (username, name, role, branchIds) => {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;
  log(`Tài khoản ${role === "ADMIN" ? "admin" : "nhân viên"}: ${username} / 123456 (${name})`);
  return prisma.user.create({
    data: {
      username,
      name,
      role,
      passwordHash: hashPassword("123456"),
      branches: { connect: branchIds.map((id) => ({ id })) },
    },
  });
};
if ((await prisma.user.count({ where: { role: "ADMIN" } })) === 0) await ensureUser("admin", "Chủ cửa hàng", "ADMIN", []);
const lan = await ensureUser("lan", "Nguyễn Thị Lan", "STAFF", [b1.id]);
const nam = await ensureUser("nam", "Trần Văn Nam", "STAFF", [b1.id, b2.id]);
const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { id: "asc" } });

// ---------- 3. Thương hiệu ----------
if ((await prisma.brand.count()) === 0) {
  const names = ["Apple", "Samsung", "Xiaomi", "OPPO", "Anker", "Baseus", "Ugreen"];
  await prisma.brand.createMany({ data: names.map((name) => ({ name })) });
  log(`Thương hiệu: ${names.join(", ")}`);
}
const brand = Object.fromEntries((await prisma.brand.findMany()).map((b) => [b.name, b.id]));

// ---------- 4. Hàng hoá ----------
if ((await prisma.product.count()) === 0) {
  const P = (o) => ({
    condition: "NEW",
    warrantyMonths: 0,
    showOnWeb: true,
    featured: false,
    sortOrder: 0,
    ...o,
    slug: o.showOnWeb === false ? null : slugify(o.slugText ?? `${o.name} ${o.variant ?? ""} ${o.condition === "USED" ? "cu" : ""}`),
    // Không tạo ảnh giả: để trống như sản phẩm thật chưa có ảnh → web hiện ảnh mặc định theo loại
    imageUrls: o.imageUrls ?? [],
    slugText: undefined,
  });
  const products = [
    // iPhone mới
    P({ category: "IPHONE", name: "iPhone 15 Pro Max", ramGb: 8, storageGb: 256, variant: "Titan tự nhiên", price: 29990000, salePrice: 28990000, costPrice: 27500000, warrantyMonths: 12, featured: true, sortOrder: 1, description: "Hàng chính hãng VN/A, nguyên seal. Chip A17 Pro, khung Titan, camera 48MP zoom 5x.\n\n- Bảo hành 12 tháng chính hãng\n- Tặng ốp lưng + cường lực" }),
    P({ category: "IPHONE", name: "iPhone 15", ramGb: 6, storageGb: 128, variant: "Hồng", price: 19490000, costPrice: 17800000, warrantyMonths: 12, description: "Hàng chính hãng VN/A, Dynamic Island, cổng USB-C." }),
    // iPhone cũ (mỗi dòng là 1 máy, có IMEI + pin)
    P({ category: "IPHONE", condition: "USED", name: "iPhone 14 Pro", ramGb: 6, storageGb: 128, variant: "Tím", code: "353912110458721", batteryHealth: 89, price: 16990000, costPrice: 14800000, warrantyMonths: 6, featured: true, sortOrder: 2, description: "Máy đẹp 99%, zin nguyên bản, chưa qua sửa chữa. Face ID nhạy." }),
    P({ category: "IPHONE", condition: "USED", name: "iPhone 13 Pro Max", ramGb: 6, storageGb: 256, variant: "Xanh Sierra", code: "356789104512345", batteryHealth: 86, price: 14490000, costPrice: 12600000, warrantyMonths: 6, featured: true, sortOrder: 3, description: "Ngoại hình đẹp, màn zin, pin 86%." }),
    P({ category: "IPHONE", condition: "USED", name: "iPhone 13", ramGb: 4, storageGb: 128, variant: "Đen", code: "352019113307654", batteryHealth: 91, price: 9990000, salePrice: 9690000, costPrice: 8500000, warrantyMonths: 6, description: "Pin 91%, máy zin all." }),
    P({ category: "IPHONE", condition: "USED", name: "iPhone 12", ramGb: 4, storageGb: 64, variant: "Trắng", code: "351234107789012", batteryHealth: 84, price: 6490000, costPrice: 5300000, warrantyMonths: 3 }),
    P({ category: "IPHONE", condition: "USED", name: "iPhone 11", ramGb: 4, storageGb: 64, variant: "Đỏ", code: "359876102233445", batteryHealth: 82, price: 4790000, costPrice: 3900000, warrantyMonths: 3 }),
    P({ category: "IPHONE", condition: "USED", name: "iPhone 11", ramGb: 4, storageGb: 128, variant: "Đen", code: "359876105566778", batteryHealth: 87, price: 5490000, costPrice: 4500000, warrantyMonths: 3, slugText: "iphone 11 128gb den cu" }),
    P({ category: "IPHONE", condition: "USED", name: "iPhone XS Max", ramGb: 4, storageGb: 64, variant: "Vàng", code: "357111098877665", batteryHealth: 80, price: 3990000, costPrice: 3200000, warrantyMonths: 1, showOnWeb: false, note: "Màn có vết xước nhẹ, chưa đưa lên web" }),
    // Android
    P({ category: "ANDROID", brandId: brand.Samsung, name: "Galaxy S24 Ultra", ramGb: 12, storageGb: 256, variant: "Xám Titan", price: 26990000, salePrice: 25490000, costPrice: 24800000, warrantyMonths: 12, featured: true, sortOrder: 4, description: "Chính hãng Samsung VN, bút S-Pen, camera 200MP, Galaxy AI." }),
    P({ category: "ANDROID", brandId: brand.Samsung, name: "Galaxy A55 5G", ramGb: 8, storageGb: 128, variant: "Xanh", price: 9490000, costPrice: 8300000, warrantyMonths: 12 }),
    P({ category: "ANDROID", brandId: brand.Samsung, condition: "USED", name: "Galaxy S22 Ultra", ramGb: 12, storageGb: 256, variant: "Đen", code: "354433221100998", price: 10990000, costPrice: 9200000, warrantyMonths: 3 }),
    P({ category: "ANDROID", brandId: brand.Xiaomi, name: "Redmi Note 13", ramGb: 8, storageGb: 256, variant: "Đen", price: 5490000, costPrice: 4600000, warrantyMonths: 12 }),
    P({ category: "ANDROID", brandId: brand.OPPO, name: "OPPO Reno11 F 5G", ramGb: 8, storageGb: 256, variant: "Xanh", price: 7990000, costPrice: 6900000, warrantyMonths: 12 }),
    // Phụ kiện
    P({ category: "ACCESSORY", brandId: brand.Apple, name: "Tai nghe AirPods Pro 2 (USB-C)", code: "MTJV3", price: 4990000, salePrice: 4790000, costPrice: 4400000, warrantyMonths: 12, featured: true, sortOrder: 5, description: "Chống ồn chủ động gấp 2 lần, hộp sạc USB-C, chính hãng VN/A." }),
    P({ category: "ACCESSORY", brandId: brand.Anker, name: "Củ sạc nhanh Anker 20W", code: "A2633", variant: "Trắng", price: 290000, costPrice: 160000, warrantyMonths: 12 }),
    P({ category: "ACCESSORY", brandId: brand.Samsung, name: "Củ sạc Samsung 25W", code: "EP-TA800", variant: "Đen", price: 350000, costPrice: 220000, warrantyMonths: 6 }),
    P({ category: "ACCESSORY", brandId: brand.Baseus, name: "Cáp Type-C to Lightning Baseus 1m", code: "CATLYS-A02", price: 150000, costPrice: 70000, warrantyMonths: 3 }),
    P({ category: "ACCESSORY", brandId: brand.Ugreen, name: "Cáp USB-C Ugreen 2m 100W", code: "UG-15311", price: 180000, costPrice: 90000, warrantyMonths: 6 }),
    P({ category: "ACCESSORY", brandId: brand.Baseus, name: "Sạc dự phòng Baseus 10000mAh 22.5W", code: "PPBD050", variant: "Đen", price: 450000, costPrice: 280000, warrantyMonths: 6 }),
    P({ category: "ACCESSORY", brandId: brand.Ugreen, name: "Ốp lưng trong suốt iPhone 15 Pro Max", code: "UG-OP15PM", price: 120000, costPrice: 40000 }),
    P({ category: "ACCESSORY", name: "Kính cường lực iPhone (các dòng)", code: "KCL-IP", price: 100000, costPrice: 20000, showOnWeb: false }),
  ];
  for (const data of products) await prisma.product.create({ data });
  log(`Hàng hoá: ${products.length} sản phẩm (${products.filter((p) => p.showOnWeb).length} hiển thị trên web)`);
}

// ---------- 5. Giá sửa chữa ----------
if ((await prisma.repairPrice.count()) === 0) {
  const R = (service, device, price, warranty) => ({ service, device, price, warranty });
  const repairs = [
    R("Thay pin", "iPhone 11", 450000, "6 tháng"),
    R("Thay pin", "iPhone 12", 550000, "6 tháng"),
    R("Thay pin", "iPhone 13", 650000, "6 tháng"),
    R("Thay pin", "iPhone 14 Pro", 850000, "6 tháng"),
    R("Thay pin", "Galaxy A55", 500000, "3 tháng"),
    R("Thay màn hình", "iPhone 11", 1200000, "3 tháng"),
    R("Thay màn hình", "iPhone 12", 1900000, "3 tháng"),
    R("Thay màn hình", "iPhone 13 Pro Max", 3500000, "3 tháng"),
    R("Thay màn hình", "Galaxy S22 Ultra", 4500000, "3 tháng"),
    R("Ép kính", "iPhone 13 Pro Max", 900000, "1 tháng"),
    R("Thay chân sạc", "iPhone 12", 350000, "3 tháng"),
    R("Thay camera sau", "iPhone 13", 1500000, "3 tháng"),
  ];
  await prisma.repairPrice.createMany({ data: repairs });
  log(`Giá sửa chữa: ${repairs.length} dòng`);
}

// ---------- 6. Checklist ----------
if ((await prisma.checklistTask.count()) === 0) {
  const tasks = ["Chấm công", "Vệ sinh quán", "Kiểm tra hàng hoá", "Tưới cây", "Đăng bài Facebook", "Đăng bài TikTok", "Chốt ngày"];
  await prisma.checklistTask.createMany({ data: tasks.map((title, i) => ({ title, sortOrder: i })) });
  log(`Checklist: ${tasks.length} việc`);
}

// ---------- 7. Ca làm + giao dịch 30 ngày ----------
if ((await prisma.shift.count()) === 0) {
  const accessories = await prisma.product.findMany({ where: { category: "ACCESSORY" } });
  const newPhones = await prisma.product.findMany({ where: { category: { not: "ACCESSORY" }, code: null } });
  const repairs = await prisma.repairPrice.findMany();
  const tasks = await prisma.checklistTask.findMany();
  const soldPhone = await prisma.product.findFirst({ where: { slug: "iphone-11-128gb-den-cu" } });
  const customers = ["Anh Minh", "Chị Hoa", "Anh Tuấn", "Chị Mai", "Anh Phúc", "Chị Ngọc", "Anh Long", "Chị Thảo"];
  const accounts = ["VCB - 0123456789", "MB - 9988776655"];
  let shifts = 0;
  let txCount = 0;

  for (let d = 29; d >= 0; d--) {
    const date = addDays(today, -d);
    for (const [branch, staff] of [
      [b1, d % 3 === 0 ? nam : lan],
      [b2, nam],
    ]) {
      if (branch === b2 && d % 3 === 0) continue; // Nam làm CN1 hôm đó
      const isToday = d === 0;
      const opening = pick([500000, 1000000, 1000000, 1500000]);
      const shift = await prisma.shift.create({
        data: {
          date,
          branchId: branch.id,
          userId: staff.id,
          staffName: staff.name,
          checkIn: `08:${String(between(0, 25)).padStart(2, "0")}`,
          openingCash: opening,
          createdAt: at(date, "08:00"),
        },
      });
      shifts++;

      const n = isToday ? 3 : between(3, 8);
      let cash = 0;
      for (let i = 0; i < n; i++) {
        const minute = 9 * 60 + Math.floor(((i + rand()) / n) * 11 * 60);
        const createdAt = at(date, `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
        const roll = rand();
        let data;
        if (roll < 0.3) {
          const r = pick(repairs);
          data = { kind: "REPAIR", productName: `${r.service} ${r.device}`, price: r.price, warrantyMonths: r.warranty?.startsWith("6") ? 6 : 3 };
        } else if (roll < 0.42 && newPhones.length) {
          const p = pick(newPhones);
          data = {
            kind: "SALE",
            productId: p.id,
            costPrice: p.costPrice,
            productName: [p.name, p.ramGb && p.storageGb ? `${p.ramGb}/${p.storageGb}GB` : null, p.variant].filter(Boolean).join(" "),
            price: p.salePrice ?? p.price,
            warrantyMonths: p.warrantyMonths,
          };
        } else {
          const p = pick(accessories);
          data = { kind: "SALE", productId: p.id, costPrice: p.costPrice, productName: p.name, price: p.price, warrantyMonths: p.warrantyMonths };
        }
        const transfer = data.price >= 2000000 ? rand() < 0.7 : rand() < 0.25;
        const needCustomer = data.warrantyMonths > 0;
        await prisma.transaction.create({
          data: {
            ...data,
            shiftId: shift.id,
            paymentMethod: transfer ? "TRANSFER" : "CASH",
            bankAccount: transfer ? pick(accounts) : null,
            customerName: needCustomer ? pick(customers) : null,
            customerPhone: needCustomer ? `09${between(10000000, 99999999)}` : null,
            createdAt,
          },
        });
        if (!transfer) cash += data.price;
        txCount++;
      }

      // Một máy cũ có IMEI đã bán 10 ngày trước ở CN1
      if (d === 10 && branch === b1 && soldPhone) {
        await prisma.transaction.create({
          data: {
            shiftId: shift.id,
            kind: "SALE",
            productId: soldPhone.id,
            costPrice: soldPhone.costPrice,
            productName: `iPhone 11 4/128GB Đen (Cũ) - Mã ${soldPhone.code}`,
            price: soldPhone.price,
            paymentMethod: "TRANSFER",
            bankAccount: accounts[0],
            warrantyMonths: 3,
            customerName: "Anh Khánh",
            customerPhone: "0912345678",
            createdAt: at(date, "15:20"),
          },
        });
        await prisma.product.update({ where: { id: soldPhone.id }, data: { soldBranchId: b1.id, soldAt: at(date, "15:20") } });
        txCount++;
      }

      // Checklist
      const done = isToday ? 2 : between(5, tasks.length);
      for (const t of tasks.slice(0, done)) {
        await prisma.checklistCheck.create({
          data: { taskId: t.id, date, branchId: branch.id, userId: staff.id, doneAt: at(date, `0${between(8, 9)}:${String(between(10, 59))}`) },
        });
      }

      // Chốt ca (trừ hôm nay để còn ca đang mở); vài ngày lệch tiền
      if (!isToday) {
        const expected = opening + cash;
        const diff = d === 4 ? -20000 : d === 17 ? 50000 : 0;
        await prisma.shift.update({
          where: { id: shift.id },
          data: {
            checkOut: `21:${String(between(0, 30)).padStart(2, "0")}`,
            handoverCash: expected + diff,
            closingNote: diff < 0 ? "Thiếu 20k do thối nhầm" : diff > 0 ? "Dư 50k chưa rõ" : null,
            closedAt: at(date, "21:30"),
          },
        });
      }
    }
  }
  log(`Bán hàng: ${shifts} ca, ${txCount} giao dịch trong 30 ngày (hôm nay có ca đang mở ở ${b1.name})`);
}

// ---------- 8. Phiếu nhập / chuyển ----------
if ((await prisma.stockTransfer.count()) === 0) {
  const byName = async (name) => prisma.product.findFirst({ where: { name } });
  const charger = await byName("Củ sạc nhanh Anker 20W");
  const cable = await byName("Cáp Type-C to Lightning Baseus 1m");
  const pb = await byName("Sạc dự phòng Baseus 10000mAh 22.5W");
  const rows = [
    { type: "IMPORT", date: addDays(today, -20), product: charger, quantity: 20, toBranchId: b1.id, supplier: "Kho phụ kiện Hải Phòng", unitCost: 160000 },
    { type: "IMPORT", date: addDays(today, -12), product: pb, quantity: 10, toBranchId: b1.id, supplier: "Baseus Việt Nam", unitCost: 280000 },
    { type: "TRANSFER", date: addDays(today, -8), product: charger, quantity: 5, fromBranchId: b1.id, toBranchId: b2.id },
    { type: "TRANSFER", date: addDays(today, -3), product: cable, quantity: 10, fromBranchId: b1.id, toBranchId: b2.id, note: "Bổ sung hàng cuối tuần" },
  ];
  for (const { product, ...r } of rows) {
    await prisma.stockTransfer.create({
      data: { ...r, productId: product?.id ?? null, productName: product?.name ?? "Hàng hoá", staffName: admin?.name ?? "Admin" },
    });
  }
  log(`Phiếu nhập / chuyển: ${rows.length} phiếu`);
}

// ---------- 9. Tin tức ----------
if ((await prisma.post.count()) === 0) {
  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * 86400000);
  const posts = [
    {
      title: "Khuyến mãi tháng 10: giảm đến 1 triệu cho iPhone cũ",
      category: "PROMOTION",
      featured: true,
      publishedAt: ago(2),
      excerpt: "Từ nay đến hết tháng 10, mua iPhone cũ được giảm đến 1.000.000đ, tặng kèm ốp lưng và cường lực.",
      content:
        "## Ưu đãi tháng 10\n\nTừ nay đến hết **31/10**, khi mua iPhone cũ tại cửa hàng:\n\n- Giảm ngay **500.000đ – 1.000.000đ** tuỳ dòng máy\n- Tặng **ốp lưng + kính cường lực**\n- Bảo hành **6 tháng**, 1 đổi 1 trong 7 ngày\n\n> Số lượng có hạn, liên hệ Zalo để giữ máy trước.\n\n[Nhắn Zalo ngay](https://zalo.me/0909123456)",
    },
    {
      title: "5 mẹo giữ pin iPhone luôn trên 85%",
      category: "GUIDE",
      publishedAt: ago(6),
      excerpt: "Những thói quen sạc đơn giản giúp pin iPhone bền hơn, ít chai hơn sau 1–2 năm sử dụng.",
      content:
        "## 1. Bật Sạc pin được tối ưu hoá\nVào **Cài đặt → Pin → Tình trạng pin & sạc** và bật tính năng này.\n\n## 2. Tránh để máy quá nóng\nKhông vừa sạc vừa chơi game nặng.\n\n## 3. Dùng củ sạc chính hãng\nCủ sạc kém chất lượng làm pin nhanh chai.\n\n## 4. Giữ pin trong khoảng 20% – 80%\n\n## 5. Cập nhật iOS mới nhất\n\nPin đã dưới 80%? Cửa hàng **thay pin lấy liền 30 phút**, bảo hành 6 tháng.",
    },
    {
      title: "Cửa hàng khai trương chi nhánh Quận 8",
      category: "NEWS",
      publishedAt: ago(15),
      content:
        "Chúng tôi chính thức mở thêm chi nhánh **Mobile - Quận 8** với đầy đủ dịch vụ: mua bán điện thoại mới và cũ, phụ kiện chính hãng, sửa chữa lấy liền.\n\nTuần đầu khai trương **giảm 10% phụ kiện**.",
    },
    {
      title: "So sánh iPhone 13 Pro Max và iPhone 14 Pro: nên mua máy nào?",
      category: "GUIDE",
      publishedAt: ago(20),
      content:
        "| | iPhone 13 Pro Max | iPhone 14 Pro |\n|---|---|---|\n| Màn hình | 6.7\" | 6.1\" Dynamic Island |\n| Chip | A15 | A16 |\n| Camera chính | 12MP | 48MP |\n\nNếu cần **pin trâu và màn lớn**, chọn 13 Pro Max. Nếu thích **camera tốt, máy gọn**, chọn 14 Pro.",
    },
    {
      title: "Black Friday 2026 sắp đến",
      category: "PROMOTION",
      publishedAt: new Date(now.getTime() + 30 * 86400000),
      content: "Bài **hẹn giờ** — chỉ hiện trên web khi tới ngày đăng.",
    },
    {
      title: "Bài nháp: kinh nghiệm chọn sạc dự phòng",
      category: "GUIDE",
      status: "DRAFT",
      content: "Bài **nháp** — không hiện trên web.",
    },
  ];
  for (const p of posts) {
    await prisma.post.create({
      data: {
        status: "PUBLISHED",
        ...p,
        slug: slugify(p.title),
        coverImageUrl: null, // chưa có ảnh bìa → web hiện ảnh mặc định
        authorId: admin?.id ?? null,
      },
    });
  }
  log(`Tin tức: ${posts.length} bài (4 đã đăng, 1 hẹn giờ, 1 nháp)`);
}

// Dữ liệu được ghi thẳng vào DB (không qua app) → xoá cache dữ liệu của Next ở local để app thấy ngay
rmSync(".next/cache/fetch-cache", { recursive: true, force: true });

console.log("\n✔ Xong. Đăng nhập: admin hiện có của bạn, hoặc nhân viên lan / nam (mật khẩu 123456).");
await prisma.$disconnect();
