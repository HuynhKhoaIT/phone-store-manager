/** Loại chi phí. Thêm loại mới thì thêm ở đây (khoá lưu trong DB, không đổi khoá cũ). */
export const EXPENSE_CATEGORIES: Record<string, string> = {
  RENT: "Mặt bằng",
  SALARY: "Lương nhân viên",
  UTILITIES: "Điện, nước, internet",
  PARTS: "Linh kiện sửa chữa",
  MARKETING: "Quảng cáo",
  EQUIPMENT: "Dụng cụ, thiết bị",
  OTHER: "Khác",
};
