import Link from "next/link";

const TABS = [
  { href: "/reports", label: "Lãi lỗ", key: "pnl" },
  { href: "/reports/break-even", label: "Hoà vốn", key: "break-even" },
  { href: "/reports/capital", label: "Góp vốn", key: "capital" },
] as const;

/** Tab con của trang Báo cáo (cùng kiểu với ProductsTabs). */
export function ReportsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex gap-6 border-b border-slate-200 text-sm" aria-label="Báo cáo">
      {TABS.map((t) => (
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
