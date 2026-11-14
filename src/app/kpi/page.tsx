import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBranches } from "@/lib/branch";
import { formatMonth, formatVND, isValidMonth, todayVN } from "@/lib/format";
import { eachDay } from "@/lib/period";
import { profitOf } from "@/lib/profit";
import { loadKpiMonth, type StaffKpi } from "@/lib/kpi";
import { REVENUE_METRICS, formatPct } from "@/lib/kpi-metrics";
import { BranchFilter, MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { DailyRevenueChart, type DailyPoint } from "@/components/DailyRevenueChart";
import { KpiTabs, Progress } from "./parts";

type Search = { month?: string; branch?: string; sort?: string; user?: string };

const SORTS = [
  { key: "revenue", label: "Doanh thu" },
  { key: "profit", label: "Lợi nhuận" },
  { key: "pct", label: "% KPI" },
] as const;

/**
 * Dashboard KPI tháng: tổng quan cửa hàng, chỉ tiêu doanh thu so với thực tế, thưởng dự kiến,
 * nhân viên chưa đạt, biểu đồ, bảng xếp hạng. KPI mỗi nhân viên luôn tính mọi chi nhánh — lọc chi nhánh chỉ
 * thu hẹp số liệu cửa hàng / biểu đồ và danh sách nhân viên có làm ở chi nhánh đó.
 */
export default async function KpiPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("kpi");
  const canCost = can(me, "cost-prices");
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : todayVN().slice(0, 7);
  if (Number(sp.user) > 0) redirect(`/kpi/staff/${Number(sp.user)}?month=${month}`);

  const [data, branches] = await Promise.all([loadKpiMonth(month), getBranches()]);
  const branchId = branches.find((b) => b.id === Number(sp.branch))?.id;
  const storeTxs = branchId ? data.storeTxs.filter((t) => t.shift.branchId === branchId) : data.storeTxs;
  const staff = branchId ? data.staff.filter((s) => s.branchIds.includes(branchId)) : data.staff;
  const store = profitOf(storeTxs);

  const withTargets = staff.filter((s) => s.rows.length > 0);
  let revenueTarget = 0;
  let revenueActual = 0;
  for (const s of withTargets)
    for (const r of s.rows)
      if (REVENUE_METRICS.includes(r.metric)) {
        revenueTarget += r.target;
        revenueActual += r.actual;
      }
  const avgCompletion = withTargets.length
    ? withTargets.reduce((sum, s) => sum + (s.completion ?? 0), 0) / withTargets.length
    : null;
  const achieved = withTargets.filter((s) => (s.completion ?? 0) >= 1);
  const behind = withTargets.filter((s) => (s.completion ?? 0) < 1).sort((x, y) => (x.completion ?? 0) - (y.completion ?? 0));
  const totalBonus = staff.reduce((sum, s) => sum + s.payout.total, 0);
  // Chia theo cách thưởng: A (theo phần), B (hoa hồng), C (lợi nhuận), CAP (phần vượt mức tối đa, số âm);
  // khoản C chưa tính được vì thiếu giá vốn đếm vào `blocked`
  const byKind = { PART: 0, COMMISSION: 0, PROFIT: 0, CAP: 0 };
  let blocked = 0;
  for (const s of staff)
    for (const l of s.payout.lines) {
      byKind[l.key.split("_")[0] as keyof typeof byKind] += l.amount;
      if (l.blocked) blocked++;
    }
  const bonusParts = [
    byKind.PART && `theo phần ${formatVND(byKind.PART)}`,
    byKind.COMMISSION && `hoa hồng ${formatVND(byKind.COMMISSION)}`,
    byKind.PROFIT && `lợi nhuận ${formatVND(byKind.PROFIT)}`,
    byKind.CAP && `trừ vượt mức tối đa ${formatVND(-byKind.CAP)}`,
  ].filter(Boolean);
  const noTargets = staff.filter((s) => s.rows.length === 0 && s.user.active);
  const unclassified = staff.reduce((sum, s) => sum + s.actuals.unclassified, 0);

  const daily: DailyPoint[] = eachDay(data.from, data.to).map((date) => ({ date, sale: 0, repair: 0 }));
  const dayIndex = new Map(daily.map((d, i) => [d.date, i]));
  for (const t of storeTxs) {
    const d = daily[dayIndex.get(t.shift.date)!];
    if (t.kind === "SALE") d.sale += t.price;
    else if (t.kind === "REPAIR") d.repair += t.price;
  }

  const sort = SORTS.find((s) => s.key === sp.sort && (s.key !== "profit" || canCost))?.key ?? "revenue";
  const ranked = [...staff].sort((x, y) =>
    sort === "pct"
      ? (y.completion ?? -1) - (x.completion ?? -1)
      : sort === "profit"
        ? y.actuals.GROSS_PROFIT - x.actuals.GROSS_PROFIT
        : y.actuals.revenue - x.actuals.revenue,
  );
  const maxRevenue = Math.max(1, ...staff.map((s) => s.actuals.revenue));
  const query = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams({ month });
    if (branchId) p.set("branch", String(branchId));
    for (const [k, v] of Object.entries(extra)) if (v != null) p.set(k, String(v));
    return `/kpi?${p}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader title={`KPI & thưởng — ${formatMonth(month)}`} subtitle="Chỉ tiêu, kết quả thực tế, thưởng dự kiến theo nhân viên" />
      <KpiTabs active="overview" month={month} />

      <div className="flex flex-wrap items-center gap-2">
        <MonthNav path="/kpi" month={month} params={{ branch: branchId, sort: sp.sort }} />
        <BranchFilter path="/kpi" keep={{ month }} branchId={branchId} branches={branches} />
        <form action="/kpi" className="flex gap-2">
          <input type="hidden" name="month" value={month} />
          <AutoSubmitSelect aria-label="Nhân viên" name="user" defaultValue="" className="input w-auto">
            <option value="">Xem từng nhân viên...</option>
            {data.staff.map((s) => (
              <option key={s.user.id} value={s.user.id}>
                {s.user.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Doanh thu cửa hàng"
          value={formatVND(store.revenue)}
          sub={
            canCost
              ? `Lãi gộp ${formatVND(store.gross)}${store.missingCost ? ` · ${store.missingCost} đơn thiếu giá vốn` : ""}`
              : undefined
          }
        />
        <StatCard
          label="Chỉ tiêu doanh thu"
          value={formatVND(revenueTarget)}
          sub={revenueTarget ? `Thực tế ${formatVND(revenueActual)} · ${formatPct(revenueActual / revenueTarget)}` : "Chưa đặt chỉ tiêu doanh thu"}
        />
        <StatCard label="Hoàn thành KPI (TB)" value={formatPct(avgCompletion)} sub={`${withTargets.length} nhân viên có chỉ tiêu`} />
        <StatCard
          label="Đạt KPI"
          value={`${achieved.length}/${withTargets.length}`}
          sub={behind.length ? `${behind.length} nhân viên chưa đạt` : undefined}
        />
        <StatCard
          label="Thưởng dự kiến"
          value={formatVND(totalBonus)}
          sub={bonusParts.length ? `${bonusParts.join(" · ")} — chưa chốt` : "Chưa chốt — có thể thay đổi đến cuối tháng"}
        />
      </div>

      {(noTargets.length > 0 || unclassified > 0 || blocked > 0) && (
        <div className="space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {noTargets.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5">
              <TriangleAlert size={16} aria-hidden />
              {noTargets.length} nhân viên chưa có chỉ tiêu tháng này ({noTargets.map((s) => s.user.name).join(", ")}).
              <Link href={`/kpi/targets?month=${month}`} className="font-medium text-[#1677ff] hover:underline">
                Đặt chỉ tiêu
              </Link>
            </p>
          )}
          {blocked > 0 && (
            <p className="flex flex-wrap items-center gap-1.5">
              <TriangleAlert size={16} aria-hidden />
              {blocked} khoản thưởng theo lợi nhuận chưa tính vì còn đơn thiếu giá vốn.
              {canCost && (
                <Link href={`/reports/missing-cost?month=${month}`} className="font-medium text-[#1677ff] hover:underline">
                  Nhập giá vốn
                </Link>
              )}
            </p>
          )}
          {unclassified > 0 && (
            <p className="flex flex-wrap items-center gap-1.5">
              <TriangleAlert size={16} aria-hidden />
              {unclassified} đơn bán gõ tay chưa phân loại điện thoại / phụ kiện — phân loại ở trang chi tiết từng nhân viên.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Doanh thu theo ngày (bán + sửa)</h2>
          <DailyRevenueChart data={daily} />
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Chưa đạt KPI</h2>
          {behind.length === 0 ? (
            <p className="text-sm text-slate-500">
              {withTargets.length ? "Mọi nhân viên có chỉ tiêu đều đã đạt." : "Chưa có nhân viên nào có chỉ tiêu."}
            </p>
          ) : (
            <ul className="space-y-3">
              {behind.map((s) => {
                // Chỉ tiêu yếu nhất — gợi ý chỗ cần hỗ trợ
                const weakest = [...s.rows].sort((x, y) => x.ratio - y.ratio)[0];
                return (
                  <li key={s.user.id}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/kpi/staff/${s.user.id}?month=${month}`} className="font-medium text-[#1677ff] hover:underline">
                        {s.user.name}
                      </Link>
                    </div>
                    <Progress ratio={s.completion} />
                    {weakest && (
                      <p className="text-xs text-slate-500">
                        Yếu nhất: {weakest.label} ({formatPct(weakest.ratio)})
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Bảng xếp hạng nhân viên</h2>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-slate-500">Sắp xếp:</span>
            {SORTS.filter((s) => s.key !== "profit" || canCost).map((s) => (
              <Link
                key={s.key}
                href={query({ sort: s.key })}
                aria-current={sort === s.key ? "true" : undefined}
                className={`rounded px-2 py-1 ${sort === s.key ? "bg-blue-50 font-medium text-[#1677ff]" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
        {ranked.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có dữ liệu tháng này.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Nhân viên</th>
                <th>Doanh thu</th>
                {canCost && <th className="text-right">Lãi gộp</th>}
                <th className="min-w-44">KPI</th>
                <th className="text-right">Điện thoại</th>
                <th className="text-right">DT phụ kiện</th>
                <th className="text-right">Thưởng dự kiến</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr key={s.user.id}>
                  <td data-label="Hạng" className="tabular-nums text-slate-500">
                    {i + 1}
                  </td>
                  <td data-title>
                    <Link href={`/kpi/staff/${s.user.id}?month=${month}`} className="font-medium text-[#1677ff] hover:underline">
                      {s.user.name}
                    </Link>
                    {!s.user.active && <span className="badge ml-1.5 bg-slate-100 text-slate-500">Đã khoá</span>}
                  </td>
                  <td data-label="Doanh thu">
                    <div className="min-w-32">
                      <p className="font-medium tabular-nums">{formatVND(s.actuals.revenue)}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(s.actuals.revenue / maxRevenue) * 100}%`, background: "var(--series-sale)" }}
                        />
                      </div>
                    </div>
                  </td>
                  {canCost && (
                    <td data-label="Lãi gộp" className="text-right tabular-nums">
                      {formatVND(s.actuals.GROSS_PROFIT)}
                      {s.actuals.missingCost > 0 && (
                        <span className="block text-xs text-amber-700">{s.actuals.missingCost} đơn thiếu giá vốn</span>
                      )}
                    </td>
                  )}
                  <td data-label="KPI">
                    {s.rows.length ? <Progress ratio={s.completion} /> : <span className="text-sm text-slate-400">Chưa có chỉ tiêu</span>}
                  </td>
                  <td data-label="Điện thoại" className="text-right tabular-nums">
                    {s.actuals.PHONE_COUNT}
                  </td>
                  <td data-label="DT phụ kiện" className="text-right tabular-nums">
                    {formatVND(s.actuals.ACCESSORY_REVENUE)}
                  </td>
                  <td data-label="Thưởng dự kiến" className="text-right font-medium tabular-nums">
                    {formatVND(s.payout.total)}
                    <span className="block text-xs font-normal text-slate-500">{payoutSummary(s.payout)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Xếp hạng chỉ phản ánh số liệu bán hàng — không thay thế đánh giá chất lượng phục vụ và tuân thủ quy trình.
          Doanh số tính cho người trực ca, gộp mọi chi nhánh; không tính SIM, nạp card, đổi bảo hành.
        </p>
      </section>
    </div>
  );
}

/** "Đạt 2/3 phần (700.000 đ) · hoa hồng 454.700 đ · cắt về mức tối đa" — tiền thưởng gồm những khoản nào */
function payoutSummary(p: StaffKpi["payout"]) {
  const sum = (prefix: string) => p.lines.filter((l) => l.key.startsWith(prefix)).reduce((t, l) => t + l.amount, 0);
  const parts = sum("PART_");
  const out = [
    p.partsCount > 0 && `Đạt ${p.partsMet}/${p.partsCount} phần${parts ? ` (${formatVND(parts)})` : ""}`,
    sum("COMMISSION_") > 0 && `hoa hồng ${formatVND(sum("COMMISSION_"))}`,
    sum("PROFIT_") > 0 && `thưởng lãi ${formatVND(sum("PROFIT_"))}`,
    sum("CAP") < 0 && "cắt về mức tối đa",
  ].filter(Boolean);
  return out.join(" · ");
}
