import Link from "next/link";

const TABS = [
  { href: "/products", label: "Danh sách hàng hoá", key: "list" },
  { href: "/products/receipts", label: "Phiếu nhập / chuyển", key: "receipts" },
] as const;

/** Tab con của trang Hàng hoá (kiểu antd Tabs). */
export function ProductsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex gap-6 border-b border-slate-200 text-sm" aria-label="Hàng hoá">
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
