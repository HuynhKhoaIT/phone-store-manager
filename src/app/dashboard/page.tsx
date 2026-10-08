import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getBranches } from "@/lib/branch";
import { summarize } from "@/lib/summary";
import { formatVND, todayVN } from "@/lib/format";
import { eachDay, getPeriod, periodParams } from "@/lib/period";
import { percentChange, profitOf } from "@/lib/profit";
import { BranchFilter, DateRangeFilter, MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DailyRevenueChart, type DailyPoint } from "@/components/DailyRevenueChart";

type Search = { month?: string; from?: string; to?: string; branch?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("dashboard");
  const sp = await searchParams;
  // Theo tháng (?month=) hoặc từ ngày đến ngày (?from=&to=)
  const period = getPeriod(sp, todayVN());
  const keep = periodParams(period);
  const branches = await getBranches();
  const branchId = branches.find((b) => b.id === Number(sp.branch))?.id;

  const shiftFilter = (r: { from: string; to: string }) => ({
    date: { gte: r.from, lte: r.to },
    ...(branchId && { branchId }),
  });
  const [txs, prevTxs] = await Promise.all([
    prisma.transaction.findMany({
      where: { shift: shiftFilter(period) },
      include: { shift: { select: { date: true, branchId: true, staffName: true } } },
    }),
    prisma.transaction.findMany({
      where: { shift: shiftFilter(period.prev) },
      select: { kind: true, price: true, costPrice: true, giftCost: true },
    }),
  ]);

  const sum = summarize(txs);
  // Cùng công thức với trang Báo cáo (lib/profit.ts) để hai trang ra cùng một số
  const cur = profitOf(txs);
  const prev = profitOf(prevTxs);

  const daily: DailyPoint[] = eachDay(period.from, period.to).map((date) => ({ date, sale: 0, repair: 0 }));
  const dayIndex = new Map(daily.map((d, i) => [d.date, i]));
  for (const t of txs) {
    const d = daily[dayIndex.get(t.shift.date)!];
    if (t.kind === "REPAIR") d.repair += t.price;
    else d.sale += t.price;
  }
  const activeDays = daily.filter((d) => d.sale + d.repair > 0).length;

  const groupBy = (key: (t: (typeof txs)[number]) => string) => {
    const m = new Map<string, { count: number; total: number }>();
    for (const t of txs) {
      const k = key(t);
      const cur = m.get(k) ?? { count: 0, total: 0 };
      m.set(k, { count: cur.count + 1, total: cur.total + t.price });
    }
    return [...m].sort((a, b) => b[1].total - a[1].total);
  };
  const byBranch = groupBy((t) => branches.find((b) => b.id === t.shift.branchId)?.name ?? "?");
  const byStaff = groupBy((t) => t.shift.staffName);
  const topSales = groupBy((t) => (t.kind === "SALE" ? t.productName : ""))
    .filter(([k]) => k)
    .slice(0, 10);
  const topRepairs = groupBy((t) => (t.kind === "REPAIR" ? t.productName : ""))
    .filter(([k]) => k)
    .slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Dashboard — ${period.label}`}
        subtitle="Doanh thu theo ngày, chi nhánh, nhân viên, sản phẩm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <MonthNav path="/dashboard" month={period.month} params={{ branch: branchId }} />
        <BranchFilter path="/dashboard" keep={keep} branchId={branchId} branches={branches} />
        <DateRangeFilter path="/dashboard" period={period} branchId={branchId} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Doanh thu"
          value={formatVND(sum.total)}
          change={percentChange(cur.revenue, prev.revenue)}
          changeLabel={period.prevLabel}
        />
        <StatCard
          label="Lãi gộp"
          value={formatVND(cur.gross)}
          amount={cur.gross}
          profit
          change={percentChange(cur.gross, prev.gross)}
          changeLabel={period.prevLabel}
          sub={
            <>
              {cur.missingCost > 0 && `${cur.missingCost} giao dịch bán chưa có giá nhập · `}
              <Link
                href={`/reports?${new URLSearchParams({ ...keep, ...(branchId && { branch: String(branchId) }) })}`}
                className="text-[#1677ff] hover:underline"
              >
                Lãi ròng ở Báo cáo
              </Link>
            </>
          }
        />
        <StatCard label="Bán hàng" value={formatVND(sum.sale)} sub={pct(sum.sale, sum.total)} />
        <StatCard label="Sửa chữa" value={formatVND(sum.repair)} sub={pct(sum.repair, sum.total)} />
        <StatCard
          label="Số giao dịch"
          value={sum.count.toLocaleString("vi-VN")}
          sub={activeDays ? `TB ${formatVND(Math.round(sum.total / activeDays))}/ngày` : undefined}
        />
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Doanh thu theo ngày</h2>
        <DailyRevenueChart data={daily} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Hình thức thanh toán</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Tiền mặt (TM)</p>
              <p className="text-lg font-bold tabular-nums">{formatVND(sum.cash)}</p>
              <p className="text-xs text-slate-500">{pct(sum.cash, sum.total)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Chuyển khoản (CK)</p>
              <p className="text-lg font-bold tabular-nums">{formatVND(sum.transfer)}</p>
              <p className="text-xs text-slate-500">{pct(sum.transfer, sum.total)}</p>
            </div>
            {/* Bán trả góp: phần công ty tài chính trả (trả trước đã nằm trong TM / CK) */}
            {sum.financed > 0 && (
              <div>
                <p className="text-xs text-slate-500">Trả góp (cty tài chính)</p>
                <p className="text-lg font-bold tabular-nums">{formatVND(sum.financed)}</p>
                <p className="text-xs text-slate-500">{pct(sum.financed, sum.total)}</p>
              </div>
            )}
          </div>
          {sum.byAccount.length > 0 && (
            <table className="table mt-3">
              <thead>
                <tr>
                  <th>Tài khoản nhận</th>
                  <th className="text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {sum.byAccount
                  .sort((a, b) => b[1] - a[1])
                  .map(([acc, amount]) => (
                    <tr key={acc}>
                      <td data-title>{acc}</td>
                      <td data-label="Số tiền" className="text-right tabular-nums">
                        {formatVND(amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">{branchId ? "Theo nhân viên" : "Theo chi nhánh & nhân viên"}</h2>
          {!branchId && <RankTable rows={byBranch} label="Chi nhánh" total={sum.total} />}
          <RankTable rows={byStaff} label="Nhân viên" total={sum.total} />
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Top sản phẩm bán chạy</h2>
          <RankTable rows={topSales} label="Sản phẩm" />
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Top dịch vụ sửa chữa</h2>
          <RankTable rows={topRepairs} label="Dịch vụ" />
        </section>
      </div>
    </div>
  );
}

function pct(part: number, total: number) {
  return total
    ? `${((part / total) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% doanh thu`
    : undefined;
}

function RankTable({
  rows,
  label,
  total,
}: {
  rows: [string, { count: number; total: number }][];
  label: string;
  total?: number;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>;
  return (
    <table className="table mb-3">
      <thead>
        <tr>
          <th>{label}</th>
          <th className="text-right">SL</th>
          <th className="text-right">Doanh thu</th>
          {total != null && <th className="text-right">Tỷ trọng</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, v]) => (
          <tr key={name}>
            <td data-title>{name}</td>
            <td data-label="Số lượng" className="text-right tabular-nums">
              {v.count}
            </td>
            <td data-label="Doanh thu" className="text-right font-medium tabular-nums">
              {formatVND(v.total)}
            </td>
            {total != null && (
              <td data-label="Tỷ trọng" className="text-right text-slate-500 tabular-nums">
                {total ? `${Math.round((v.total / total) * 100)}%` : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
