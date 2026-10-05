import {
  CalendarDays,
  Clock,
  House,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  /** Tiền tố đường dẫn để biết mục đang được chọn */
  match: string;
  label: string;
  /** Mô tả ngắn hiển thị ở ô trên trang chủ */
  description: string;
  icon: LucideIcon;
  /** Màu nền icon ở trang chủ (Tailwind class) */
  tone: string;
};

export const HOME_ITEM = {
  href: "/",
  label: "Trang chủ",
  icon: House,
};

export const STAFF_LINKS: NavItem[] = [
  { href: "/day", match: "/day", label: "Bán hàng", description: "Vào ca, nhập giao dịch, chốt ca", icon: Receipt, tone: "bg-blue-500" },
  { href: "/prices", match: "/prices", label: "Bảng giá", description: "Giá máy & phụ kiện", icon: Smartphone, tone: "bg-indigo-500" },
  { href: "/repair-prices", match: "/repair-prices", label: "Giá sửa chữa", description: "Thay pin, thay màn...", icon: Wrench, tone: "bg-orange-500" },
  { href: "/warranty", match: "/warranty", label: "Bảo hành", description: "Tra cứu theo SĐT", icon: ShieldCheck, tone: "bg-emerald-500" },
  { href: "/transfers", match: "/transfers", label: "Nhập hàng", description: "Chuyển hàng giữa chi nhánh", icon: Package, tone: "bg-amber-500" },
  { href: "/timesheet", match: "/timesheet", label: "Chấm công", description: "Ngày công, giờ làm", icon: Clock, tone: "bg-cyan-600" },
];

export const ADMIN_LINKS: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", label: "Dashboard", description: "Doanh thu tháng", icon: LayoutDashboard, tone: "bg-violet-500" },
  { href: "/history", match: "/history", label: "Lịch sử", description: "Xem lại từng ngày", icon: CalendarDays, tone: "bg-sky-600" },
  { href: "/checklist", match: "/checklist", label: "Checklist", description: "Việc cần làm hằng ngày", icon: ListChecks, tone: "bg-green-600" },
  { href: "/users", match: "/users", label: "Nhân viên", description: "Tài khoản, phân quyền", icon: Users, tone: "bg-pink-500" },
  { href: "/branches", match: "/branches", label: "Chi nhánh", description: "Thêm, sửa chi nhánh", icon: Store, tone: "bg-slate-600" },
];

const EXTRA_TITLES: Record<string, string> = { "/account": "Tài khoản", "/choose-branch": "Chọn chi nhánh" };

/** Breadcrumb của trang hiện tại (không gồm "Trang chủ"), vd ["Quản lý", "Nhân viên"]. */
export function breadcrumbFor(pathname: string): string[] {
  if (pathname === "/") return [];
  const staff = STAFF_LINKS.find((l) => pathname.startsWith(l.match));
  if (staff) return [staff.label];
  const admin = ADMIN_LINKS.find((l) => pathname.startsWith(l.match));
  if (admin) return ["Quản lý", admin.label];
  const extra = Object.entries(EXTRA_TITLES).find(([p]) => pathname.startsWith(p));
  return extra ? [extra[1]] : [];
}
