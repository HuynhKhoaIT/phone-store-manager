import type { Metadata } from "next";
import Link from "next/link";
import { getAllowedBranches, getCurrentBranch } from "@/lib/branch";
import { getSessionUser } from "@/lib/auth";
import { logout } from "./actions";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quản lý cửa hàng",
  description: "Quản lý bán hàng cửa hàng điện thoại & phụ kiện",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    return (
      <html lang="vi">
        <body className="min-h-screen antialiased">{children}</body>
      </html>
    );
  }

  const [allowed, current] = await Promise.all([getAllowedBranches(user), getCurrentBranch()]);

  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 bg-slate-900 text-white shadow">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
            <span className="shrink-0 font-bold">📱 Cửa hàng</span>
            <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
              <NavLinks isAdmin={user.role === "ADMIN"} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3 md:ml-0">
              <span className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-sm">
                <span aria-hidden>📍</span>
                <b>{current?.name ?? "Chưa chọn chi nhánh"}</b>
                {(allowed.length > 1 || !current) && (
                  <Link href="/choose-branch" className="ml-1 text-xs text-blue-300 hover:underline">
                    Đổi
                  </Link>
                )}
              </span>
              <Link href="/account" className="text-sm text-slate-300 hover:text-white" title="Tài khoản">
                {user.name}
                {user.role === "ADMIN" && <span className="ml-1 text-xs text-amber-300">(admin)</span>}
              </Link>
              <form action={logout}>
                <button className="text-sm text-slate-400 hover:text-white">Đăng xuất</button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
