/**
 * Quyền riêng từng tài khoản nhân viên. Admin luôn có toàn quyền (không cần tick).
 * Dùng chung server/client — không import gì từ server.
 *
 * Mỗi quyền ứng với một mục menu: có quyền thì thấy menu, vào được trang và gọi được server action.
 * Riêng `product-stats` là quyền con của `products` (không có menu): hiện khối thống kê ở trang Hàng hoá.
 * Nhóm "Tài chính" (`reports`, `capital`, `customers`, `cost-prices`, `installments-manage`) trước đây chỉ admin —
 * tách thành quyền để giao cho kế toán. Những việc có thể tự nâng quyền / sửa dữ liệu gốc vẫn luôn chỉ admin.
 * Nhân viên / Chi nhánh / Phân quyền luôn chỉ admin — tránh nhân viên tự nâng quyền cho mình.
 */
export const PERMISSIONS = [
  { key: "sell", group: "Bán hàng", label: "Bán hàng", description: "Vào ca, nhập giao dịch, chốt ca, tick checklist hôm nay" },
  { key: "products", group: "Bán hàng", label: "Hàng hoá", description: "Xem bảng giá, ghi phiếu nhập / chuyển hàng" },
  {
    key: "product-stats",
    group: "Bán hàng",
    label: "Thống kê hàng hoá",
    description: "Xem số đang bán, đã bán tháng này, giá trị hàng ở trang Hàng hoá",
  },
  { key: "repair-prices", group: "Bán hàng", label: "Giá sửa chữa", description: "Xem bảng giá sửa chữa" },
  { key: "warranty", group: "Bán hàng", label: "Bảo hành", description: "Tra cứu bảo hành theo SĐT" },
  { key: "timesheet", group: "Bán hàng", label: "Chấm công", description: "Xem ngày công của mình" },
  { key: "dashboard", group: "Quản lý", label: "Dashboard", description: "Doanh thu mọi chi nhánh (lãi cần thêm quyền Giá nhập & lãi)" },
  { key: "history", group: "Quản lý", label: "Lịch sử", description: "Xem lại các ngày trước (chỉ xem)" },
  { key: "posts", group: "Quản lý", label: "Tin tức", description: "Viết, sửa, xoá bài trên web" },
  { key: "promotions", group: "Quản lý", label: "Khuyến mãi", description: "Tạo, sửa chương trình khuyến mãi" },
  { key: "checklist", group: "Quản lý", label: "Checklist", description: "Thiết lập việc cần làm hằng ngày" },
  { key: "brands", group: "Quản lý", label: "Thương hiệu", description: "Thêm, sửa thương hiệu" },
  { key: "reports", group: "Tài chính", label: "Báo cáo", description: "Lãi lỗ, chi phí (thêm / sửa / xoá), xuất Excel" },
  { key: "capital", group: "Tài chính", label: "Hoà vốn & góp vốn", description: "Người góp vốn, sổ góp / rút, hoà vốn từng chi nhánh" },
  { key: "customers", group: "Tài chính", label: "Khách hàng", description: "Danh sách khách, lịch sử mua / sửa" },
  {
    key: "cost-prices",
    group: "Tài chính",
    label: "Giá nhập & lãi",
    description: "Xem giá nhập, lãi ở Hàng hoá / Giá sửa chữa / ca bán hàng; ghi giá nhập phiếu nhập; thanh toán Mượn hàng",
  },
  { key: "installments-manage", group: "Tài chính", label: "Quản lý trả góp", description: "Xoá lần thu tiền trả góp ghi sai" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

/** Quyền mặc định của nhân viên mới — giữ đúng những gì nhân viên làm được trước khi có phân quyền. */
export const DEFAULT_STAFF_PERMISSIONS: Permission[] = ["sell", "products", "repair-prices", "warranty", "timesheet"];

export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

export function isPermission(key: string): key is Permission {
  return PERMISSIONS.some((p) => p.key === key);
}

export function can(user: { role: string; permissions: readonly string[] }, permission: Permission) {
  return user.role === "ADMIN" || user.permissions.includes(permission);
}
