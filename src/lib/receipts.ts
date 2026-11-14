import "server-only";
import { prisma } from "./db";

export const RECEIPT_TYPE_LABEL: Record<string, string> = { IMPORT: "Nhập từ NCC", TRANSFER: "Chuyển chi nhánh" };

/** Nhãn nguồn tiền của phiếu nhập (`StockReceipt.fundSource`) */
export function fundLabel(r: { fundSource: string | null; investor?: { name: string } | null }) {
  if (r.fundSource === "STORE") return "Quỹ cửa hàng";
  if (r.fundSource === "INVESTOR") return r.investor ? `Tiền của ${r.investor.name}` : "Người góp vốn";
  return "Chưa ghi nguồn tiền";
}

/** Tổng tiền hàng của phiếu (dòng chưa có giá nhập tính 0) + có dòng nào thiếu giá nhập không */
export function receiptTotal(items: { quantity: number; unitCost: number | null }[]) {
  return {
    total: items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0),
    missingCost: items.some((i) => i.unitCost == null),
  };
}

/**
 * Dòng phiếu cũ (trước khi có phiếu nhiều dòng) chưa thuộc phiếu nào → mỗi dòng thành một phiếu riêng
 * (nguồn tiền chưa ghi). Chạy lúc mở trang Phiếu nhập; hết dòng cũ thì chỉ tốn một câu truy vấn.
 */
export async function backfillReceipts() {
  const orphans = await prisma.stockTransfer.findMany({ where: { receiptId: null }, orderBy: { id: "asc" } });
  for (const t of orphans) {
    await prisma.stockReceipt.create({
      data: {
        type: t.type,
        date: t.date,
        fromBranchId: t.fromBranchId,
        toBranchId: t.toBranchId,
        supplier: t.supplier,
        staffName: t.staffName ?? "",
        note: t.note,
        createdAt: t.createdAt,
        items: { connect: { id: t.id } },
      },
    });
  }
}
