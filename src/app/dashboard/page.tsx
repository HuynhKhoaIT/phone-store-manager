import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getBranches } from "@/lib/branch";
import { summarize } from "@/lib/summary";
import { addMonths, daysInMonth, formatMonth, formatVND, isValidMonth, todayVN } from "@/lib/format";
import { NavInput } from "@/components/NavInput";
import { DailyRevenueChart, type DailyPoint } from "@/components/DailyRevenueChart";

type Search = { month?: string; branch?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("dashboard");
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : todayVN().slice(0, 7);
  const branches = await getBranches();
  const branchId = branches.find((b) => b.id === Number(sp.branch))?.id;
  const prevMonth = addMonths(month, -1);

  const shiftFilter = (m: string) => ({ date: { startsWith: m }, ...(branchId && { branchId }) });
  const [txs, prevTotal] = await Promise.all([
    prisma.transaction.findMany({
      where: { shift: shiftFilter(month) },
      include: { shift: { select: { date: true, branchId: true, staffName: true } } },
    }),
    prisma.transaction.aggregate({ where: { shift: shiftFilter(prevMonth) }, _sum: { price: true } }),
  ]);

  const sum = summarize(txs);
  // Lợi nhuận: chỉ tính các giao dịch bán từ bảng giá có giá nhập
  const withCost = txs.filter((t) => t.costPrice != null);
  const profit = withCost.reduce((s, t) => s + t.price - (t.costPrice ?? 0), 0);
  const prev = prevTotal._sum.price ?? 0;
  const growth = prev > 0 ? ((sum.total - prev) / prev) * 100 : null;

  const daily: DailyPoint[] = Array.from({ length: daysInMonth(month) }, (_, i) => ({
    date: `${month}-${String(i + 1).padStart(2, "0")}`,
    sale: 0,
    repair: 0,
  }));
  for (const t of txs) {
    const d = daily[Number(t.shift.date.slice(8)) - 1];
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
  const topSales = groupBy((t) => (t.kind === "SALE" ? t.productName : "")).filter(([k]) => k).slice(0, 10);
  const topRepairs = groupBy((t) => (t.kind === "REPAIR" ? t.productName : "")).filter(([k]) => k).slice(0, 10);

  const qs = (patch: Search) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ month, branch: branchId ? String(branchId) : "", ...patch })) if (v) p.set(k, v);
    return `/dashboard?${p}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard — {formatMonth(month)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/dashboard" className="flex gap-2">
            <input type="hidden" name="month" value={month} />
            <select aria-label="Chi nhánh" name="branch" defaultValue={branchId ?? ""} className="input w-auto">
              <option value="">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary">Lọc</button>
          </form>
          <Link href={qs({ month: prevMonth })} className="btn-secondary" aria-label="Tháng trước">
            <ChevronLeft size={16} aria-hidden />
          </Link>
          <NavInput
            type="month"
            value={month}
            hrefPrefix="/dashboard?month="
            hrefSuffix={branchId ? `&branch=${branchId}` : ""}
            label="Chọn tháng"
          />
          <Link href={qs({ month: addMonths(month, 1) })} className="btn-secondary" aria-label="Tháng sau">
            <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="card">
          <p className="text-xs font-medium text-slate-500">Doanh thu tháng</p>
          <p className="mt-1 text-2xl font-bold text-blue-700 tabular-nums">{formatVND(sum.total)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {growth == null ? (
              "Tháng trước chưa có dữ liệu"
            ) : (
              <>
                <span className={growth >= 0 ? "text-green-700" : "text-red-600"}>
                  {growth >= 0 ? (
                    <TrendingUp size={12} className="inline" aria-hidden />
                  ) : (
                    <TrendingDown size={12} className="inline" aria-hidden />
                  )}{" "}
                  {Math.abs(growth).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
                </span>{" "}
                so với tháng trước ({formatVND(prev)})
              </>
            )}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500">Lợi nhuận</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>
            {formatVND(profit)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {withCost.length === 0
              ? "Chưa có giao dịch nào có giá nhập"
              : `Tính trên ${withCost.length}/${sum.count} giao dịch có giá nhập`}
          </p>
        </div>
        <Tile label="Bán hàng" value={formatVND(sum.sale)} sub={pct(sum.sale, sum.total)} />
        <Tile label="Sửa chữa" value={formatVND(sum.repair)} sub={pct(sum.repair, sum.total)} />
        <Tile
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
  return total ? `${((part / total) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% doanh thu` : undefined;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
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
