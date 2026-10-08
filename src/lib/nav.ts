import {
  BadgePercent,
  Boxes,
  CalendarDays,
  ChartColumn,
  Contact,
  ClipboardCheck,
  Clock,
  HandCoins,
  House,
  LayoutDashboard,
  KeyRound,
  ListChecks,
  Newspaper,
  Receipt,
  ShieldCheck,
  Store,
  Tags,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission } from "./permissions";

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
  /** Quyền cần có (mảng = có một trong các quyền); không đặt = chỉ admin */
  permission?: Permission | Permission[];
};

export const HOME_ITEM = {
  href: "/",
  label: "Trang chủ",
  icon: House,
};

export const STAFF_LINKS: NavItem[] = [
  { href: "/day", match: "/day", label: "Bán hàng", description: "Vào ca, nhập giao dịch, chốt ca", icon: Receipt, tone: "bg-blue-500", permission: "sell" },
  { href: "/installments", match: "/installments", label: "Bán trả góp", description: "Trả trước, chờ công ty tài chính", icon: HandCoins, tone: "bg-fuchsia-500", permission: ["sell", "installments-manage"] },
  { href: "/tasks", match: "/tasks", label: "Việc cần làm", description: "Checklist công việc", icon: ClipboardCheck, tone: "bg-green-500", permission: "sell" },
  { href: "/products", match: "/products", label: "Hàng hoá", description: "Bảng giá, nhập / chuyển hàng", icon: Boxes, tone: "bg-indigo-500", permission: "products" },
  { href: "/repair-prices", match: "/repair-prices", label: "Giá sửa chữa", description: "Thay pin, thay màn...", icon: Wrench, tone: "bg-orange-500", permission: "repair-prices" },
  { href: "/warranty", match: "/warranty", label: "Bảo hành", description: "Tra cứu theo SĐT", icon: ShieldCheck, tone: "bg-emerald-500", permission: "warranty" },
  { href: "/timesheet", match: "/timesheet", label: "Chấm công", description: "Ngày công, giờ làm", icon: Clock, tone: "bg-cyan-600", permission: "timesheet" },
];

export const ADMIN_LINKS: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", label: "Dashboard", description: "Doanh thu tháng", icon: LayoutDashboard, tone: "bg-violet-500", permission: "dashboard" },
  { href: "/reports", match: "/reports", label: "Báo cáo", description: "Lãi lỗ, chi phí, xuất Excel", icon: ChartColumn, tone: "bg-emerald-600", permission: ["reports", "capital", "cost-prices"] },
  { href: "/customers", match: "/customers", label: "Khách hàng", description: "Lịch sử mua, bảo hành", icon: Contact, tone: "bg-orange-500", permission: "customers" },
  { href: "/history", match: "/history", label: "Lịch sử", description: "Xem lại từng ngày", icon: CalendarDays, tone: "bg-sky-600", permission: "history" },
  { href: "/posts", match: "/posts", label: "Tin tức", description: "Bài viết cho web bán hàng", icon: Newspaper, tone: "bg-rose-500", permission: "posts" },
  { href: "/promotions", match: "/promotions", label: "Khuyến mãi", description: "Chương trình giảm giá, quà tặng", icon: BadgePercent, tone: "bg-red-500", permission: "promotions" },
  { href: "/checklist", match: "/checklist", label: "Checklist", description: "Việc cần làm hằng ngày", icon: ListChecks, tone: "bg-green-600", permission: "checklist" },
  { href: "/users", match: "/users", label: "Nhân viên", description: "Tài khoản, chi nhánh được làm", icon: Users, tone: "bg-pink-500" },
  { href: "/permissions", match: "/permissions", label: "Phân quyền", description: "Chức năng từng nhân viên được dùng", icon: KeyRound, tone: "bg-amber-500" },
  { href: "/brands", match: "/brands", label: "Thương hiệu", description: "Danh mục thương hiệu", icon: Tags, tone: "bg-teal-600", permission: "brands" },
  { href: "/branches", match: "/branches", label: "Chi nhánh", description: "Thêm, sửa chi nhánh", icon: Store, tone: "bg-slate-600" },
];

/** Các mục người dùng được thấy trong menu (sidebar + trang chủ). */
export function visibleLinks(user: { role: string; permissions: readonly string[] }) {
  const allowed = (l: NavItem) =>
    l.permission ? [l.permission].flat().some((p) => can(user, p)) : user.role === "ADMIN";
  return { staff: STAFF_LINKS.filter(allowed), admin: ADMIN_LINKS.filter(allowed) };
}

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
