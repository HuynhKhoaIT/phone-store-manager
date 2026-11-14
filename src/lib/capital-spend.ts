/**
 * Loại khoản chi đầu tư (vốn) cho chi nhánh — không phải chi phí tháng (xem EXPENSE_CATEGORIES ở lib/expenses.ts).
 * Thêm loại mới thì thêm ở đây (khoá lưu trong DB, không đổi khoá cũ).
 */
export const SPEND_CATEGORIES: Record<string, string> = {
  CONSTRUCTION: "Xây dựng, sửa mặt bằng",
  MATERIAL: "Vật tư",
  DECOR: "Decor, trang trí",
  FURNITURE: "Tủ kệ, quầy trưng bày",
  SIGNAGE: "Bảng hiệu, đèn",
  EQUIPMENT: "Thiết bị (máy tính, camera...)",
  OTHER: "Khác",
};
