import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CACHE_SECONDS, TAGS } from "./cache";
import { isSingleUnit, productLabel } from "./product-labels";
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
  const sale: PriceSuggestion[] = products.map((p) => ({
    label: productLabel(p),
    price: p.price,
    warrantyMonths: p.warrantyMonths,
    productId: p.id,
    // Trang Bán hàng dùng để ghi "(hàng quán khác)" và lọc danh sách quà tặng
    ownerBranchId: p.ownerBranchId,
    ownerName: p.ownerBranch?.name,
    quantity: isSingleUnit(p) ? undefined : p.quantity,
    giftable: !isSingleUnit(p) && p.category === "ACCESSORY",
  }));
  const repair: PriceSuggestion[] = repairs.map((r) => ({ label: `${r.service} ${r.device}`, price: r.price }));
  return { sale, repair };
}
