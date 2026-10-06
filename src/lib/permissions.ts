/**
 * Quyền riêng từng tài khoản nhân viên. Admin luôn có toàn quyền (không cần tick).
 * Dùng chung server/client — không import gì từ server.
 *
 * Mỗi quyền ứng với một mục menu: có quyền thì thấy menu, vào được trang và gọi được server action.
 * Nhân viên / Chi nhánh / Phân quyền luôn chỉ admin — tránh nhân viên tự nâng quyền cho mình.
 */
export const PERMISSIONS = [
  { key: "sell", group: "Bán hàng", label: "Bán hàng", description: "Vào ca, nhập giao dịch, chốt ca, tick checklist hôm nay" },
  { key: "products", group: "Bán hàng", label: "Hàng hoá", description: "Xem bảng giá, ghi phiếu nhập / chuyển hàng" },
  { key: "repair-prices", group: "Bán hàng", label: "Giá sửa chữa", description: "Xem bảng giá sửa chữa" },
  { key: "warranty", group: "Bán hàng", label: "Bảo hành", description: "Tra cứu bảo hành theo SĐT" },
  { key: "timesheet", group: "Bán hàng", label: "Chấm công", description: "Xem ngày công của mình" },
  { key: "dashboard", group: "Quản lý", label: "Dashboard", description: "Doanh thu, lợi nhuận mọi chi nhánh" },
  { key: "history", group: "Quản lý", label: "Lịch sử", description: "Xem lại các ngày trước (chỉ xem)" },
  { key: "posts", group: "Quản lý", label: "Tin tức", description: "Viết, sửa, xoá bài trên web" },
  { key: "checklist", group: "Quản lý", label: "Checklist", description: "Thiết lập việc cần làm hằng ngày" },
  { key: "brands", group: "Quản lý", label: "Thương hiệu", description: "Thêm, sửa thương hiệu" },
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
