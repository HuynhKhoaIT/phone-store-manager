import "server-only";
import { prisma } from "./db";
import { getBranches } from "./branch";
import { CATEGORY_LABEL, sellingPrice } from "./product-labels";
import { fundLabel, receiptTotal } from "./receipts";

export type StockValue = {
  /** Số sản phẩm còn (chỉ tính SL > 0) */
  qty: number;
  /** Tiền hàng theo giá nhập (chỉ hàng đã có giá nhập) */
  cost: number;
  /** Giá trị theo giá bán (mọi hàng còn) */
  retail: number;
  /** Giá bán của phần hàng đã có giá nhập — để tính lãi dự kiến đúng phần đó */
  retailWithCost: number;
  /** Số mặt hàng / số sản phẩm còn mà chưa có giá nhập (không vào `cost`) */
  missingCostItems: number;
  missingCostQty: number;
  /** Mặt hàng SL âm (số liệu chưa khớp, cần kiểm kho) — không tính giá trị */
  negativeItems: number;
};

const empty = (): StockValue => ({
  qty: 0,
  cost: 0,
  retail: 0,
  retailWithCost: 0,
  missingCostItems: 0,
  missingCostQty: 0,
  negativeItems: 0,
});

/** Lãi dự kiến nếu bán hết phần hàng đã có giá nhập */
export const expectedProfit = (v: StockValue) => v.retailWithCost - v.cost;

/**
 * Tồn kho & vốn (Báo cáo › Tồn kho & vốn): hàng Đang bán còn số lượng, theo chi nhánh quản lý (`ownerBranchId`)
 * và theo loại; vốn góp còn lại (góp − rút) của từng chi nhánh = tiền hàng + vật tư / decor / xây dựng (`CapitalSpend`)
 * + phần còn lại; tiền nhập hàng theo nguồn tiền.
 */
export async function getInventoryReport() {
  const [branches, products, capital, imports, spends] = await Promise.all([
    getBranches(),
    prisma.product.findMany({
      where: { active: true, soldBranchId: null },
      select: { ownerBranchId: true, category: true, price: true, salePrice: true, costPrice: true, quantity: true },
    }),
    prisma.capitalEntry.groupBy({ by: ["branchId", "type"], _sum: { amount: true } }),
    prisma.stockReceipt.findMany({
      where: { type: "IMPORT" },
      select: {
        fundSource: true,
        investor: { select: { name: true } },
        items: { select: { quantity: true, unitCost: true } },
      },
    }),
    // Tiền vốn đã chi vật tư, decor, xây dựng, thiết bị
    prisma.capitalSpend.groupBy({ by: ["branchId"], _sum: { amount: true } }),
  ]);

  const byBranch = new Map<number | null, StockValue>();
  const byCategory = new Map<string, StockValue>();
  const total = empty();
  for (const p of products) {
    const targets = [
      byBranch.get(p.ownerBranchId) ?? byBranch.set(p.ownerBranchId, empty()).get(p.ownerBranchId)!,
      byCategory.get(p.category) ?? byCategory.set(p.category, empty()).get(p.category)!,
      total,
    ];
    for (const v of targets) {
      if (p.quantity < 0) v.negativeItems++;
      if (p.quantity <= 0) continue;
      const retail = sellingPrice(p) * p.quantity;
      v.qty += p.quantity;
      v.retail += retail;
      if (p.costPrice != null) {
        v.cost += p.costPrice * p.quantity;
        v.retailWithCost += retail;
      } else {
        v.missingCostItems++;
        v.missingCostQty += p.quantity;
      }
    }
  }

  const capitalOf = (branchId: number, type: string) =>
    capital.find((c) => c.branchId === branchId && c.type === type)?._sum.amount ?? 0;
  const branchRows = branches
    .map((b) => {
      const contributed = capitalOf(b.id, "CONTRIBUTE");
      const withdrawn = capitalOf(b.id, "WITHDRAW");
      const fixtures = spends.find((s) => s.branchId === b.id)?._sum.amount ?? 0;
      const stock = byBranch.get(b.id) ?? empty();
      return { id: b.id, name: b.name, active: b.active, stock, fixtures, contributed, withdrawn };
    })
    // Chi nhánh đã đóng, không còn hàng, không có vốn thì không cần hiện
    .filter((b) => b.active || b.stock.qty > 0 || b.contributed > 0 || b.fixtures > 0);
  const unassigned = byBranch.get(null);

  const categoryRows = Object.entries(CATEGORY_LABEL)
    .map(([key, label]) => ({ key, label, stock: byCategory.get(key) ?? empty() }))
    .filter((c) => c.stock.qty > 0 || c.stock.negativeItems > 0);

  // Tiền đã nhập hàng (mọi thời gian) theo nguồn tiền
  const funding = new Map<string, { amount: number; receipts: number }>();
  for (const r of imports) {
    const label = fundLabel(r);
    const f = funding.get(label) ?? { amount: 0, receipts: 0 };
    f.amount += receiptTotal(r.items).total;
    f.receipts++;
    funding.set(label, f);
  }

  const contributed = branchRows.reduce((s, b) => s + b.contributed, 0);
  const withdrawn = branchRows.reduce((s, b) => s + b.withdrawn, 0);
  return {
    total,
    branches: branchRows,
    unassigned: unassigned && (unassigned.qty > 0 || unassigned.negativeItems > 0) ? unassigned : null,
    categories: categoryRows,
    funding: [...funding].map(([label, f]) => ({ label, ...f })).sort((a, b) => b.amount - a.amount),
    capital: { contributed, withdrawn, net: contributed - withdrawn },
    /** Tổng tiền vật tư, decor, xây dựng, thiết bị (mọi chi nhánh) */
    fixtures: branchRows.reduce((s, b) => s + b.fixtures, 0),
  };
}
