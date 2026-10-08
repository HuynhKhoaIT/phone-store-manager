import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CACHE_SECONDS, TAGS } from "./cache";
import { isSingleUnit, productPickLabel, sellingPrice } from "./product-labels";
import { discountText, promotionsFor } from "./promotion-labels";
import { getRunningPromotions } from "./promotions";
import type { PriceSuggestion } from "@/components/TransactionFields";

export { CATEGORY_LABEL, CONDITION_LABEL, STATUS_LABEL, productLabel, productStatus } from "./product-labels";

/** Gợi ý tên + giá khi nhập giao dịch, lấy từ bảng giá (cache, xoá khi sửa bảng giá / bán máy). */
export const getPriceSuggestions = unstable_cache(loadPriceSuggestions, ["price-suggestions"], {
  tags: [TAGS.prices], revalidate: CACHE_SECONDS,
});

async function loadPriceSuggestions() {
  const [products, repairs] = await Promise.all([
    // Chỉ máy đang bán (chưa bán, chưa ẩn)
    prisma.product.findMany({
      where: { active: true, soldBranchId: null },
      include: { ownerBranch: { select: { name: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.repairPrice.findMany({ orderBy: [{ device: "asc" }, { service: "asc" }] }),
  ]);
  type Match = { id: number; category: string; brandId: number | null; condition: string };
  const sale: (PriceSuggestion & { match: Match })[] = products.map((p) => ({
    // Khi lưu, server lấy lại tên đầy đủ từ productId (productLabel) nên nhãn này chỉ để hiển thị / tìm kiếm
    label: productPickLabel(p),
    // Điện thoại có giá sale thì gợi ý giá sale
    price: sellingPrice(p),
    warrantyMonths: p.warrantyMonths,
    productId: p.id,
    // Trang Bán hàng dùng để ghi "(hàng quán khác)" và lọc danh sách quà tặng
    ownerBranchId: p.ownerBranchId,
    ownerName: p.ownerBranch?.name,
    quantity: isSingleUnit(p) ? undefined : p.quantity,
    giftable: !isSingleUnit(p) && p.category === "ACCESSORY",
    // Để áp khuyến mãi (getSaleSuggestions) — bỏ đi trước khi gửi xuống client
    match: { id: p.id, category: p.category, brandId: p.brandId, condition: p.condition },
  }));
  const repair: PriceSuggestion[] = repairs.map((r) => ({ label: `${r.service} ${r.device}`, price: r.price }));
  return { sale, repair };
}

/**
 * Gợi ý bán hàng cho một chi nhánh: hàng quán khác ghi rõ "(hàng …)" (bán / tặng sẽ tự ghi sổ Mượn hàng),
 * hàng quán mình xếp trước. Giá đã trừ chương trình khuyến mãi đang chạy ở chi nhánh (giảm cao nhất),
 * kèm tên các ưu đãi để nhân viên báo khách. Kèm danh sách phụ kiện còn hàng để tặng kèm.
 */
export async function getSaleSuggestions(branchId: number) {
  const [{ sale, repair }, promos] = await Promise.all([getPriceSuggestions(), getRunningPromotions(branchId)]);
  const saleSuggestions = sale
    .map(({ match, ...s }): PriceSuggestion => {
      const { matched, best } = promotionsFor(promos, match, s.price);
      if (!matched.length) return s;
      return {
        ...s,
        listPrice: best ? s.price : undefined,
        price: s.price - (best?.amount ?? 0),
        promo: matched
          .map((p) => (p === best?.promo ? `${p.title}: ${discountText(p)}` : `${p.title}: ${p.summary}`))
          .join(" · "),
      };
    })
    .map((s) => (s.ownerBranchId && s.ownerBranchId !== branchId ? { ...s, label: `${s.label} (hàng ${s.ownerName})` } : s))
    // Hàng chưa gắn chi nhánh coi như của quán mình
    .sort(
      (a, b) =>
        Number((a.ownerBranchId ?? branchId) !== branchId) - Number((b.ownerBranchId ?? branchId) !== branchId),
    );
  const giftOptions = saleSuggestions.filter((s) => s.giftable && (s.quantity ?? 0) > 0);
  return { saleSuggestions, repairSuggestions: repair, giftOptions };
}

/** Tài khoản nhận chuyển khoản đã dùng gần đây — gợi ý khi nhập CK */
export async function getRecentBankAccounts() {
  const rows = await prisma.transaction.findMany({
    where: { bankAccount: { not: null } },
    select: { bankAccount: true },
    distinct: ["bankAccount"],
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((r) => r.bankAccount!).filter(Boolean);
}
