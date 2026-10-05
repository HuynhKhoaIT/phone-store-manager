"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const LINKS = [
  { href: "/", match: "/day", label: "Bán hàng" },
  { href: "/prices", match: "/prices", label: "Bảng giá" },
  { href: "/repair-prices", match: "/repair-prices", label: "Giá sửa chữa" },
  { href: "/warranty", match: "/warranty", label: "Bảo hành" },
  { href: "/transfers", match: "/transfers", label: "Nhập hàng" },
  { href: "/timesheet", match: "/timesheet", label: "Chấm công" },
];

const ADMIN_LINKS = [
  { href: "/dashboard", match: "/dashboard", label: "Dashboard doanh thu" },
  { href: "/history", match: "/history", label: "Lịch sử theo ngày" },
  { href: "/checklist", match: "/checklist", label: "Checklist công việc" },
  { href: "/users", match: "/users", label: "Nhân viên" },
  { href: "/branches", match: "/branches", label: "Chi nhánh" },
];

const itemClass = (active: boolean) =>
  `rounded-md px-2.5 py-1.5 whitespace-nowrap ${
    active ? "bg-slate-700 font-semibold text-white" : "text-slate-300 hover:text-white"
  }`;

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const adminActive = ADMIN_LINKS.some((l) => pathname.startsWith(l.match));

  // Đóng menu khi chuyển trang
  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [pathname]);

  return (
    <nav className="-mx-1 flex items-center gap-1 text-sm">
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={itemClass(pathname.startsWith(l.match))}>
            {l.label}
          </Link>
        ))}
      </div>
      {isAdmin && (
        <details ref={menuRef} className="relative shrink-0">
          <summary className={`cursor-pointer list-none ${itemClass(adminActive)}`}>Quản lý ▾</summary>
          <div className="absolute right-0 z-30 mt-1 flex w-52 flex-col rounded-lg bg-slate-800 p-1 shadow-lg md:left-0 md:right-auto">
            {ADMIN_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={itemClass(pathname.startsWith(l.match))}>
                {l.label}
              </Link>
            ))}
          </div>
        </details>
      )}
    </nav>
  );
}
