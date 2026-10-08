import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

const TABS = [
  { href: "/reports", label: "Lãi lỗ", key: "pnl", permission: "reports" },
  { href: "/reports/break-even", label: "Hoà vốn", key: "break-even", permission: "capital" },
  { href: "/reports/capital", label: "Góp vốn", key: "capital", permission: "capital" },
  { href: "/reports/missing-cost", label: "Thiếu giá vốn", key: "missing-cost", permission: "cost-prices" },
] as const;

/** Tab con của trang Báo cáo (cùng kiểu với ProductsTabs) — chỉ hiện tab có quyền. */
export async function ReportsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  const me = await getSessionUser();
  const tabs = TABS.filter((t) => me && can(me, t.permission));
  return (
    <nav className="flex gap-6 border-b border-slate-200 text-sm" aria-label="Báo cáo">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`-mb-px border-b-2 pb-2.5 transition-colors ${
            active === t.key
              ? "border-[#1677ff] font-medium text-[#1677ff]"
              : "border-transparent text-slate-600 hover:text-[#4096ff]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
