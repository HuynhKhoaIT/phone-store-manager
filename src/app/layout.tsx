import type { Metadata } from "next";
import { getAllowedBranches, getCurrentBranch } from "@/lib/branch";
import { getSessionUser } from "@/lib/auth";
import { logout } from "./actions";
import { Sidebar } from "@/components/Sidebar";
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
        <Sidebar
          isAdmin={user.role === "ADMIN"}
          branchName={current?.name ?? null}
          canChangeBranch={allowed.length > 1 || !current}
          userName={user.name}
          footer={
            <form action={logout}>
              <button className="mt-1 w-full rounded-md px-3 py-2 text-left text-slate-400 hover:bg-slate-800 hover:text-white">
                ↩ Đăng xuất
              </button>
            </form>
          }
        />
        <main className="px-4 py-5 lg:ml-64 lg:px-8 lg:py-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
