import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAllowedBranches, getCurrentBranch } from "@/lib/branch";
import { formatDateLong, todayVN } from "@/lib/format";
import { visibleLinks, type NavItem } from "@/lib/nav";

/** Trang chủ: danh sách chức năng dạng app (mở app là thấy ngay các mục). */
export default async function Home() {
  const user = await requireUser();
  const [allowed, branch] = await Promise.all([getAllowedBranches(user), getCurrentBranch()]);
  const canChange = allowed.length > 1 || !branch;
  const links = visibleLinks(user);

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{formatDateLong(todayVN())}</p>
          <h1 className="truncate text-xl font-bold">Xin chào, {user.name}</h1>
        </div>
        <Link
          href="/choose-branch"
          className={`flex min-w-0 items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 ${
            canChange ? "hover:bg-blue-100" : "pointer-events-none"
          }`}
          aria-disabled={!canChange}
        >
          <MapPin size={16} className="shrink-0" aria-hidden />
          <span className="truncate font-medium">{branch?.name ?? "Chọn chi nhánh"}</span>
          {canChange && <span className="shrink-0 text-xs text-blue-600">Đổi</span>}
        </Link>
      </div>

      {links.staff.length > 0 && <MenuSection items={links.staff} />}
      {links.admin.length > 0 && <MenuSection title="Quản lý" items={links.admin} />}
      {links.staff.length === 0 && links.admin.length === 0 && (
        <p className="card text-center text-sm text-slate-500">
          Tài khoản chưa được cấp chức năng nào. Vui lòng liên hệ admin.
        </p>
      )}
    </div>
  );
}

function MenuSection({ title, items }: { title?: string; items: NavItem[] }) {
  return (
    <section>
      {title && <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500">{title}</h2>}
      <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition active:scale-[0.98] hover:border-blue-300 hover:shadow sm:p-4"
              >
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-white ${item.tone}`}>
                  <Icon size={22} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{item.label}</span>
                  <span className="block truncate text-xs text-slate-500">{item.description}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-300" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
