import "server-only";
import { prisma } from "./db";
import { todayVN, warrantyEnd } from "./format";

export type Customer = {
  phone: string;
  /** Tên ở giao dịch gần nhất (khách có thể được ghi tên khác nhau qua các lần) */
  name: string;
  count: number;
  saleCount: number;
  repairCount: number;
  total: number;
  firstDate: string;
  lastDate: string;
  /** Số sản phẩm / dịch vụ còn bảo hành */
  activeWarranties: number;
};

/**
 * Khách hàng = các giao dịch có SĐT, gom theo SĐT (đã chuẩn hoá khi lưu).
 * Không có bảng riêng: khách tự xuất hiện khi nhân viên nhập SĐT lúc bán / sửa.
 * Tính trong bộ nhớ — đủ nhanh với quy mô một cửa hàng (vài chục nghìn giao dịch).
 */
export async function getCustomers(): Promise<Customer[]> {
  const rows = await prisma.transaction.findMany({
    where: { customerPhone: { not: null } },
    select: {
      customerPhone: true,
      customerName: true,
      kind: true,
      price: true,
      warrantyMonths: true,
      shift: { select: { date: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const today = todayVN();
  const map = new Map<string, Customer>();
  for (const t of rows) {
    const phone = t.customerPhone!;
    const date = t.shift.date;
    const c = map.get(phone) ?? {
      phone,
      name: "",
      count: 0,
      saleCount: 0,
      repairCount: 0,
      total: 0,
      firstDate: date,
      lastDate: date,
      activeWarranties: 0,
    };
    c.count++;
    if (t.kind === "REPAIR") c.repairCount++;
    else c.saleCount++;
    c.total += t.price;
    if (date < c.firstDate) c.firstDate = date;
    if (date >= c.lastDate) {
      c.lastDate = date;
      if (t.customerName) c.name = t.customerName;
    }
    if (!c.name && t.customerName) c.name = t.customerName;
    if (t.warrantyMonths > 0 && warrantyEnd(date, t.warrantyMonths) >= today) c.activeWarranties++;
    map.set(phone, c);
  }
  return [...map.values()];
}

/** "0901234567" → "0901 234 567" cho dễ đọc */
export function formatPhone(phone: string) {
  return /^0\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}
