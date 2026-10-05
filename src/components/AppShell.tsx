"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  LogOut,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
  UserRound,
} from "lucide-react";
import { logout } from "@/app/actions";
import { SIDER_COOKIE } from "@/lib/ui";
import { Toaster } from "./Toaster";
import { ADMIN_LINKS, HOME_ITEM, STAFF_LINKS, breadcrumbFor, type NavItem } from "@/lib/nav";

/**
 * Khung giao diện.
 * - Máy tính (lg+): kiểu Ant Design Pro — Sider tối thu gọn được + Header + Content + Footer.
 * - Điện thoại: kiểu app — trang chủ là danh sách chức năng; các trang khác có thanh trên cùng
 *   với nút quay lại, tên trang và logo (bấm về trang chủ).
 */
export function AppShell({
  isAdmin,
  userName,
  branchName,
  canChangeBranch,
  initialCollapsed,
  children,
}: {
  isAdmin: boolean;
  userName: string;
  branchName: string | null;
  canChangeBranch: boolean;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // Thanh tiến trình khi bấm menu. Không dùng loading.tsx ở root: Suspense ở root làm kết quả
  // server action đôi khi không được cập nhật lên màn hình.
  const [navigating, setNavigating] = useState(false);
  // Đã chuyển trang trong app chưa — để nút quay lại biết dùng history hay về trang chủ
  const firstPath = useRef(pathname);
  const [hasInAppHistory, setHasInAppHistory] = useState(false);

  useEffect(() => {
    setNavigating(false);
    if (pathname !== firstPath.current) setHasInAppHistory(true);
  }, [pathname]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // Lưu vào cookie để server render đúng độ rộng ngay lần tải sau
    document.cookie = `${SIDER_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000`;
  }

  function goBack() {
    setNavigating(true);
    if (hasInAppHistory) router.back();
    else router.push("/");
  }

  const isHome = pathname === "/";
  const crumbs = breadcrumbFor(pathname);
  const title = crumbs.at(-1) ?? HOME_ITEM.label;
  const startNav = () => setNavigating(true);

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {navigating && <div className="nav-progress" role="progressbar" aria-label="Đang tải trang" />}
      <Toaster />

      {/* ---------- Sider (chỉ máy tính) ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#001529] text-white/65 transition-all duration-200 lg:flex ${
          collapsed ? "w-20" : "w-52"
        }`}
      >
        <Link href="/" onClick={() => !isHome && startNav()} className="flex h-16 shrink-0 items-center gap-3 overflow-hidden px-6">
          <Logo />
          {!collapsed && <span className="truncate text-base font-semibold text-white">Cửa hàng</span>}
        </Link>

        <nav className="flex-1 overflow-x-hidden overflow-y-auto py-2 text-sm">
          <ul className="mb-2 space-y-1 px-2">
            <SiderLink
              item={HOME_ITEM}
              active={isHome}
              collapsed={collapsed}
              onNavigate={startNav}
            />
            {STAFF_LINKS.map((l) => (
              <SiderLink key={l.href} item={l} active={pathname.startsWith(l.match)} collapsed={collapsed} onNavigate={startNav} />
            ))}
          </ul>
          {isAdmin && (
            <>
              {collapsed ? (
                <hr className="mx-4 my-2 border-white/10" />
              ) : (
                <p className="px-6 pt-3 pb-1 text-xs text-white/45">Quản lý</p>
              )}
              <ul className="space-y-1 px-2">
                {ADMIN_LINKS.map((l) => (
                  <SiderLink key={l.href} item={l} active={pathname.startsWith(l.match)} collapsed={collapsed} onNavigate={startNav} />
                ))}
              </ul>
            </>
          )}
        </nav>
      </aside>

      {/* ---------- Header + Content + Footer ---------- */}
      <div className={`flex min-h-screen flex-col transition-all duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-52"}`}>
        {/* Header máy tính */}
        <header className="sticky top-0 z-30 hidden h-16 shrink-0 items-center gap-2 bg-white px-6 shadow-[0_1px_4px_rgba(0,21,41,0.08)] lg:flex">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            className="-ml-2 rounded-md p-2 text-slate-600 hover:bg-slate-100"
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            {isHome ? (
              <span className="text-slate-900">{HOME_ITEM.label}</span>
            ) : (
              <Link href="/" className="text-slate-400 hover:text-slate-700">
                {HOME_ITEM.label}
              </Link>
            )}
            {crumbs.map((c, i) => (
              <span key={c} className="flex min-w-0 items-center gap-2">
                <span className="text-slate-300">/</span>
                <span className={`truncate ${i === crumbs.length - 1 ? "text-slate-900" : "text-slate-400"}`}>{c}</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <BranchBadge name={branchName} canChange={canChangeBranch} />
            <UserMenu name={userName} isAdmin={isAdmin} pathname={pathname} canChangeBranch={canChangeBranch} />
          </div>
        </header>

        {/* Thanh trên cùng kiểu app (điện thoại) */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1 bg-white px-2 shadow-[0_1px_4px_rgba(0,21,41,0.08)] lg:hidden">
          {isHome ? (
            <>
              <span className="flex items-center gap-2 px-2">
                <Logo />
                <span className="font-semibold">Cửa hàng</span>
              </span>
              <div className="ml-auto">
                <UserMenu name={userName} isAdmin={isAdmin} pathname={pathname} canChangeBranch={canChangeBranch} />
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={goBack}
                aria-label="Quay lại"
                className="flex size-10 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
              >
                <ChevronLeft size={24} />
              </button>
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
              <Link
                href="/"
                onClick={startNav}
                aria-label="Về trang chủ"
                className="flex size-10 items-center justify-center rounded-full active:bg-slate-100"
              >
                <Logo />
              </Link>
            </>
          )}
        </header>

        <main className="flex-1 p-3 sm:p-4 lg:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>

        <footer className="hidden px-4 py-6 text-center text-sm text-slate-400 lg:block">
          Phone Store Manager ©{new Date().getFullYear()} · Quản lý bán hàng điện thoại &amp; phụ kiện
        </footer>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#1677ff] text-white">
      <Smartphone size={18} strokeWidth={2} aria-hidden />
    </span>
  );
}

function SiderLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: Pick<NavItem, "href" | "label" | "icon">;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={() => !active && onNavigate()}
        className={`flex h-10 items-center gap-3 rounded-lg transition-colors ${collapsed ? "justify-center" : "px-4"} ${
          active ? "bg-[#1677ff] text-white" : "hover:text-white"
        }`}
      >
        <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden />
        {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  );
}

function BranchBadge({ name, canChange }: { name: string | null; canChange: boolean }) {
  const content = (
    <>
      <MapPin size={16} className="shrink-0 text-[#1677ff]" aria-hidden />
      <span className="max-w-48 truncate font-medium">{name ?? "Chưa chọn chi nhánh"}</span>
      {canChange && <ChevronDown size={14} className="shrink-0 text-slate-400" aria-hidden />}
    </>
  );
  const cls = "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-700";
  return canChange ? (
    <Link href="/choose-branch" className={`${cls} hover:bg-slate-100`} title="Đổi chi nhánh làm việc">
      {content}
    </Link>
  ) : (
    <span className={cls}>{content}</span>
  );
}

function UserMenu({
  name,
  isAdmin,
  pathname,
  canChangeBranch,
}: {
  name: string;
  isAdmin: boolean;
  pathname: string;
  canChangeBranch: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Đóng khi chuyển trang hoặc bấm ra ngoài
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label="Tài khoản"
        className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[#1677ff] text-sm font-medium text-white">
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate text-sm text-slate-700 md:inline">{name}</span>
      </summary>
      <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg bg-white py-1 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_3px_6px_-4px_rgba(0,0,0,0.12),0_9px_28px_8px_rgba(0,0,0,0.05)]">
        <div className="border-b border-slate-100 px-4 py-2">
          <p className="truncate text-sm font-medium text-slate-900">{name}</p>
          <p className="text-xs text-slate-500">{isAdmin ? "Admin" : "Nhân viên"}</p>
        </div>
        <Link href="/account" className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
          <UserRound size={16} aria-hidden /> Tài khoản
        </Link>
        {canChangeBranch && (
          <Link
            href="/choose-branch"
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeftRight size={16} aria-hidden /> Đổi chi nhánh
          </Link>
        )}
        <form action={logout}>
          <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
            <LogOut size={16} aria-hidden /> Đăng xuất
          </button>
        </form>
      </div>
    </details>
  );
}
