"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = { href: string; match: string; label: string; icon: string };

const STAFF_LINKS: NavItem[] = [
  { href: "/", match: "/day", label: "Bán hàng", icon: "🧾" },
  { href: "/prices", match: "/prices", label: "Bảng giá", icon: "📱" },
  { href: "/repair-prices", match: "/repair-prices", label: "Giá sửa chữa", icon: "🔧" },
  { href: "/warranty", match: "/warranty", label: "Bảo hành", icon: "🛡️" },
  { href: "/transfers", match: "/transfers", label: "Nhập hàng", icon: "📦" },
  { href: "/timesheet", match: "/timesheet", label: "Chấm công", icon: "🕘" },
];

const ADMIN_LINKS: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/history", match: "/history", label: "Lịch sử theo ngày", icon: "📅" },
  { href: "/checklist", match: "/checklist", label: "Checklist công việc", icon: "✅" },
  { href: "/users", match: "/users", label: "Nhân viên", icon: "👥" },
  { href: "/branches", match: "/branches", label: "Chi nhánh", icon: "🏬" },
];

export function Sidebar({
  isAdmin,
  branchName,
  canChangeBranch,
  userName,
  footer,
}: {
  isAdmin: boolean;
  branchName: string | null;
  canChangeBranch: boolean;
  userName: string;
  /** Nút đăng xuất (form server action) */
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Hiện thanh tiến trình ngay khi bấm menu, tắt khi trang mới đã hiển thị.
  // (Không dùng loading.tsx: Suspense ở root làm kết quả server action đôi khi không được cập nhật.)
  const [navigating, setNavigating] = useState(false);

  // Đóng menu (mobile) và tắt thanh tiến trình khi chuyển trang xong
  useEffect(() => {
    setOpen(false);
    setNavigating(false);
  }, [pathname]);

  const onNavigate = (href: string) => {
    if (href !== pathname) setNavigating(true);
  };

  const branchBox = (
    <div className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
      <p className="text-xs text-slate-400">Chi nhánh làm việc</p>
      <div className="flex items-center justify-between gap-2">
        <b className="truncate" title={branchName ?? undefined}>
          📍 {branchName ?? "Chưa chọn"}
        </b>
        {canChangeBranch && (
          <Link href="/choose-branch" className="shrink-0 text-xs text-blue-300 hover:underline">
            Đổi
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      {navigating && <div className="nav-progress" role="progressbar" aria-label="Đang tải trang" />}

      {/* Thanh trên cùng cho điện thoại */}
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-4 py-2.5 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở menu"
          aria-expanded={open}
          className="-ml-1 rounded-md px-2 py-1 text-xl hover:bg-slate-800"
        >
          ☰
        </button>
        <span className="font-bold">📱 Cửa hàng</span>
        <span className="ml-auto truncate text-sm text-slate-300">📍 {branchName ?? "Chưa chọn"}</span>
      </div>

      {/* Nền tối khi mở menu trên điện thoại */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-white transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <span className="text-lg font-bold">📱 Cửa hàng</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
            className="rounded-md px-2 text-xl text-slate-400 hover:text-white lg:hidden"
          >
            ✕
          </button>
        </div>

        <div className="px-3">{branchBox}</div>

        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4 text-sm">
          <NavGroup items={STAFF_LINKS} pathname={pathname} onNavigate={onNavigate} />
          {isAdmin && <NavGroup title="Quản lý" items={ADMIN_LINKS} pathname={pathname} onNavigate={onNavigate} />}
        </nav>

        <div className="border-t border-slate-800 px-3 py-3 text-sm">
          <Link
            href="/account"
            className={`block rounded-md px-3 py-2 hover:bg-slate-800 ${pathname.startsWith("/account") ? "bg-slate-800" : ""}`}
          >
            <span className="block truncate font-medium">{userName}</span>
            <span className="text-xs text-slate-400">{isAdmin ? "Admin" : "Nhân viên"} · Tài khoản</span>
          </Link>
          {footer}
        </div>
      </aside>
    </>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <div>
      {title && <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</p>}
      <ul className="space-y-0.5">
        {items.map((l) => {
          const active = pathname.startsWith(l.match);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                onClick={() => !active && onNavigate(l.href)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                  active ? "bg-blue-600 font-semibold text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span aria-hidden className="w-5 text-center">
                  {l.icon}
                </span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
