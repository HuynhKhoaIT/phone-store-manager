import { isSingleUnit } from "./product-labels";

/**
 * Hàng đếm được (không phải máy có IMEI — máy theo dõi bằng Đang bán / Đã bán, không dùng số lượng) còn <= ngưỡng
 * cảnh báo (tính cả hết hàng / âm). Dùng để tô đậm ở trang /stock-check — ngưỡng đặt ở AppSetting (src/lib/settings.ts).
 */
export function isLowStock(p: { category: string; code: string | null; quantity: number }, threshold: number) {
  return !isSingleUnit(p) && p.quantity <= Math.max(threshold, 0);
}
