/** Nhãn sản phẩm — không phụ thuộc DB nên dùng được cả ở client component. */

export const CATEGORY_LABEL: Record<string, string> = {
  IPHONE: "iPhone",
  ANDROID: "Android",
  ACCESSORY: "Phụ kiện",
};

export const CONDITION_LABEL: Record<string, string> = { NEW: "Mới", USED: "Cũ 99%" };

/** Trạng thái trong bảng giá: suy ra từ active + soldBranchId */
export const STATUS_LABEL: Record<ProductStatus, string> = {
  AVAILABLE: "Đang bán",
  SOLD: "Đã bán",
  HIDDEN: "Ngừng bán",
};
export type ProductStatus = "AVAILABLE" | "SOLD" | "HIDDEN";

export function productStatus(p: { active: boolean; soldBranchId: number | null }): ProductStatus {
  if (p.soldBranchId != null) return "SOLD";
  return p.active ? "AVAILABLE" : "HIDDEN";
}

/**
 * Điện thoại có mã (IMEI) = một máy cụ thể → bán xong tự chuyển "Đã bán".
 * Phụ kiện có mã thường là mã chung cho nhiều cái cùng loại → không tự đánh dấu.
 */
export function isSingleUnit(p: { category: string; code: string | null }) {
  return !!p.code && p.category !== "ACCESSORY";
}

/** Lựa chọn RAM / bộ nhớ cho điện thoại (GB; 1TB = 1024). */
export const RAM_OPTIONS = [2, 3, 4, 6, 8, 12, 16];
export const STORAGE_OPTIONS = [32, 64, 128, 256, 512, 1024];

export function gbLabel(gb: number) {
  return gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`;
}

/** "8/256GB", "128GB" hoặc "RAM 8GB" */
export function capacityLabel(p: { ramGb?: number | null; storageGb?: number | null }) {
  if (p.ramGb && p.storageGb) return `${p.ramGb}/${gbLabel(p.storageGb)}`;
  if (p.storageGb) return gbLabel(p.storageGb);
  if (p.ramGb) return `RAM ${p.ramGb}GB`;
  return null;
}

/** Tên hiển thị khi bán (lưu vào giao dịch), kèm mã để tra bảo hành theo IMEI / mã. */
export function productLabel(p: {
  name: string;
  variant: string | null;
  condition: string;
  code?: string | null;
  ramGb?: number | null;
  storageGb?: number | null;
}) {
  return [p.name, capacityLabel(p), p.variant, p.condition === "USED" ? "(Cũ)" : null, p.code ? `- Mã ${p.code}` : null]
    .filter(Boolean)
    .join(" ");
}
