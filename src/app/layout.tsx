import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getAllowedBranches, getCurrentBranch } from "@/lib/branch";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { SIDER_COOKIE } from "@/lib/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tài Khoa Mobile · Quản lý",
  description: "Quản lý bán hàng cửa hàng điện thoại & phụ kiện",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    return (
      <html lang="vi">
        <body className="min-h-screen bg-[#f5f5f5] antialiased">{children}</body>
      </html>
    );
  }

  const [allowed, current, cookieStore] = await Promise.all([
    getAllowedBranches(user),
    getCurrentBranch(),
    cookies(),
  ]);

  return (
    <html lang="vi">
      <body className="antialiased">
        <AppShell
          isAdmin={user.role === "ADMIN"}
          roleName={user.roleName ?? "Nhân viên"}
          permissions={user.permissions}
          userName={user.name}
          branchName={current?.name ?? null}
          canChangeBranch={allowed.length > 1 || !current}
          initialCollapsed={cookieStore.get(SIDER_COOKIE)?.value === "collapsed"}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
