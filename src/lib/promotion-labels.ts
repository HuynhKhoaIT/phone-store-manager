/** Nhãn + logic áp dụng chương trình khuyến mãi — không phụ thuộc DB nên dùng được cả ở client. */

export const PROMOTION_TYPE_LABEL: Record<string, string> = {
  DISCOUNT: "Giảm giá",
  GIFT: "Quà tặng",
  INSTALLMENT: "Trả góp 0%",
  TRADE_IN: "Thu cũ đổi mới",
  OTHER: "Ưu đãi khác",
};

export const PROMOTION_TYPE_BADGE: Record<string, string> = {
  DISCOUNT: "bg-red-100 text-red-700",
  GIFT: "bg-rose-100 text-rose-700",
  INSTALLMENT: "bg-fuchsia-100 text-fuchsia-700",
  TRADE_IN: "bg-amber-100 text-amber-800",
  OTHER: "bg-slate-100 text-slate-700",
};

export type PromotionStatus = "RUNNING" | "UPCOMING" | "ENDED" | "PAUSED";

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  RUNNING: "Đang diễn ra",
  UPCOMING: "Sắp diễn ra",
  ENDED: "Đã kết thúc",
  PAUSED: "Tạm dừng",
};

export type PromotionRule = {
  id: number;
  type: string;
  discountType: string | null;
  discountValue: number | null;
  maxDiscount: number | null;
  startDate: string;
  endDate: string | null;
  categories: string[];
  brandIds: number[];
  conditions: string[];
  productIds: number[];
  branchIds: number[];
  active: boolean;
};

/** Trạng thái theo ngày (YYYY-MM-DD giờ Việt Nam); ngày bắt đầu và kết thúc đều tính. */
export function promotionStatus(
  p: Pick<PromotionRule, "active" | "startDate" | "endDate">,
  today: string,
): PromotionStatus {
  if (!p.active) return "PAUSED";
  if (p.startDate > today) return "UPCOMING";
  if (p.endDate && p.endDate < today) return "ENDED";
  return "RUNNING";
}

/** Chương trình có áp dụng cho sản phẩm này không (chưa xét ngày / chi nhánh). */
export function matchesPromotion(
  p: Pick<PromotionRule, "categories" | "brandIds" | "conditions" | "productIds">,
  product: { id: number; category: string; brandId: number | null; condition: string },
) {
  // Chọn sản phẩm cụ thể thì bỏ qua các điều kiện lọc
  if (p.productIds.length) return p.productIds.includes(product.id);
  return (
    (!p.categories.length || p.categories.includes(product.category)) &&
    (!p.brandIds.length || (product.brandId != null && p.brandIds.includes(product.brandId))) &&
    (!p.conditions.length || p.conditions.includes(product.condition))
  );
}

/** Áp dụng ở chi nhánh này không (trống = mọi chi nhánh). */
export function appliesToBranch(p: Pick<PromotionRule, "branchIds">, branchId: number) {
  return !p.branchIds.length || p.branchIds.includes(branchId);
}

/**
 * Số tiền được giảm trên giá `price`. Giảm % làm tròn tới 1.000 đ, không vượt `maxDiscount`.
 * Không giảm hết giá (giá sau giảm phải > 0) — trả 0 nếu không hợp lệ.
 */
export function promotionDiscount(p: Pick<PromotionRule, "type" | "discountType" | "discountValue" | "maxDiscount">, price: number) {
  if (p.type !== "DISCOUNT" || !p.discountValue || price <= 0) return 0;
  let amount =
    p.discountType === "PERCENT" ? Math.round((price * p.discountValue) / 100 / 1000) * 1000 : p.discountValue;
  if (p.discountType === "PERCENT" && p.maxDiscount) amount = Math.min(amount, p.maxDiscount);
  return amount > 0 && amount < price ? amount : 0;
}

/** "Giảm 10% (tối đa 500.000 đ)" / "Giảm 300.000 đ" */
export function discountText(p: Pick<PromotionRule, "discountType" | "discountValue" | "maxDiscount">) {
  if (!p.discountValue) return "";
  if (p.discountType === "PERCENT")
    return `Giảm ${p.discountValue}%${p.maxDiscount ? ` (tối đa ${p.maxDiscount.toLocaleString("vi-VN")} đ)` : ""}`;
  return `Giảm ${p.discountValue.toLocaleString("vi-VN")} đ`;
}

/**
 * Các chương trình đang chạy áp dụng cho một sản phẩm + mức giảm tốt nhất (không cộng dồn nhiều chương trình giảm giá,
 * giống cách các chuỗi bán lẻ làm: lấy ưu đãi giảm cao nhất).
 */
export function promotionsFor<T extends PromotionRule>(
  promos: T[],
  product: { id: number; category: string; brandId: number | null; condition: string },
  price: number,
) {
  const matched = promos.filter((p) => matchesPromotion(p, product));
  let best: { promo: T; amount: number } | null = null;
  for (const p of matched) {
    const amount = promotionDiscount(p, price);
    if (amount > 0 && (!best || amount > best.amount)) best = { promo: p, amount };
  }
  return { matched, best };
}
