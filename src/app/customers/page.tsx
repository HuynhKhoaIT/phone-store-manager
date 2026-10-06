import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { formatPhone, getCustomers, type Customer } from "@/lib/customers";
import { formatDate, formatVND, todayVN } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { q?: string; sort?: string; page?: string };

const SORTS: Record<string, { label: string; compare: (a: Customer, b: Customer) => number }> = {
  recent: { label: "Mua gần nhất", compare: (a, b) => b.lastDate.localeCompare(a.lastDate) },
  total: { label: "Chi tiêu nhiều nhất", compare: (a, b) => b.total - a.total },
  count: { label: "Đến nhiều lần nhất", compare: (a, b) => b.count - a.count || b.total - a.total },
  new: { label: "Khách mới nhất", compare: (a, b) => b.firstDate.localeCompare(a.firstDate) },
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const sort = SORTS[sp.sort ?? ""] ? sp.sort! : "recent";

  const all = await getCustomers();
  const month = todayVN().slice(0, 7);
  const stats = {
    total: all.length,
    newThisMonth: all.filter((c) => c.firstDate.startsWith(month)).length,
    returning: all.filter((c) => c.count > 1).length,
    withWarranty: all.filter((c) => c.activeWarranties > 0).length,
  };

  const phoneQ = q.replace(/[ .-]/g, "");
  const nameQ = q.toLowerCase();
  const filtered = (
    q
      ? all.filter((c) => (/^\+?\d{3,}$/.test(phoneQ) && c.phone.includes(phoneQ)) || c.name.toLowerCase().includes(nameQ))
      : all
  ).sort(SORTS[sort].compare);
  const paging = getPaging(filtered.length, sp.page);
  const shown = filtered.slice(0, paging.take);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Khách hàng"
        subtitle="Tự tổng hợp từ các giao dịch có số điện thoại khách"
        hideTitleOnMobile
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tổng khách hàng" value={stats.total} />
        <Stat label="Khách mới tháng này" value={stats.newThisMonth} />
        <Stat
          label="Khách quay lại"
          value={stats.returning}
          sub={stats.total ? `${Math.round((stats.returning / stats.total) * 100)}% số khách` : undefined}
        />
        <Stat label="Đang còn bảo hành" value={stats.withWarranty} />
      </div>

      <form action="/customers" className="flex flex-wrap gap-2">
        {/* Điện thoại: ô tìm chiếm cả hàng, sắp xếp + nút xuống hàng dưới */}
        <label className="relative min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            name="q"
            type="search"
            defaultValue={q}
            inputMode="search"
            placeholder="Tìm SĐT hoặc tên khách..."
            aria-label="Tìm khách hàng"
            className="input pl-9"
          />
        </label>
        <select name="sort" defaultValue={sort} aria-label="Sắp xếp" className="input min-w-0 flex-1 sm:w-auto sm:flex-none">
          {Object.entries(SORTS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Tìm</button>
      </form>

      {q && <p className="text-sm text-slate-500">Tìm thấy {filtered.length} khách hàng.</p>}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th className="text-right">Số lần</th>
              <th className="text-right">Tổng chi tiêu</th>
              <th>Lần đầu</th>
              <th>Gần nhất</th>
              <th>Bảo hành</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c, i) => (
              <tr key={c.phone} className={rowClass(paging, i)}>
                <td data-title>
                  <span>
                    <span className="block font-medium">{c.name || "(chưa có tên)"}</span>
                    <span className="block text-xs font-normal text-slate-500 tabular-nums">{formatPhone(c.phone)}</span>
                  </span>
                </td>
                <td data-label="Số lần" className="text-right whitespace-nowrap tabular-nums">
                  <span>
                    {c.count}
                    <span className="ml-1 text-xs text-slate-400">
                      ({[c.saleCount && `${c.saleCount} mua`, c.repairCount && `${c.repairCount} sửa`].filter(Boolean).join(", ")})
                    </span>
                  </span>
                </td>
                <td data-label="Tổng chi tiêu" className="text-right font-medium whitespace-nowrap tabular-nums">
                  {formatVND(c.total)}
                </td>
                <td data-label="Lần đầu" className="whitespace-nowrap max-sm:hidden!">
                  {formatDate(c.firstDate)}
                </td>
                <td data-label="Gần nhất" className="whitespace-nowrap">
                  {formatDate(c.lastDate)}
                </td>
                <td data-label="Bảo hành">
                  {c.activeWarranties > 0 ? (
                    <span className="badge bg-green-100 text-green-800">Còn {c.activeWarranties}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/customers/${encodeURIComponent(c.phone)}`} className="text-sm text-[#1677ff] hover:underline">
                    Chi tiết
                  </Link>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  {q ? "Không tìm thấy khách hàng." : "Chưa có giao dịch nào ghi số điện thoại khách."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/customers", { q, sort: sort === "recent" ? "" : sort })} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString("vi-VN")}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
