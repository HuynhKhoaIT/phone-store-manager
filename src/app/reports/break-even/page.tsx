import Link from "next/link";
import { CircleCheck, PiggyBank, TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { RECENT_DAYS, getCapitalReport } from "@/lib/capital";
import { addMonths, formatDate, formatMonth, formatVND } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ReportsTabs } from "@/components/ReportsTabs";
import { StatCard } from "@/components/StatCard";

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

export default async function BreakEvenPage() {
  await requirePermission("capital");
  const { today, branches, sharedExpense, total } = await getCapitalReport();
  const missing = branches.filter((b) => b.investment === 0);
  const totalRemaining = Math.max(0, total.investment - total.net);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo — Hoà vốn"
        subtitle="Vốn góp từng chi nhánh so với lãi ròng cộng dồn từ ngày bắt đầu"
        actions={
          <Link href="/reports/capital" className="btn-secondary">
            <PiggyBank size={16} aria-hidden /> Sổ góp vốn
          </Link>
        }
      />

      <ReportsTabs active="break-even" />

      {total.investment > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Tổng vốn góp" value={formatVND(total.investment)} />
          <StatCard
            label="Đã thu hồi (lãi ròng cộng dồn)"
            value={formatVND(total.net)}
            amount={total.net}
            profit
            sub={sharedExpense > 0 ? `Đã trừ ${formatVND(sharedExpense)} chi phí chung` : undefined}
          />
          <StatCard label="Còn lại để hoà vốn" value={totalRemaining > 0 ? formatVND(totalRemaining) : "Đã hoà vốn"} />
          <StatCard label="Tỉ lệ hoà vốn" value={fmtPct(pct(total.net, total.investment))} />
        </div>
      )}

      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert size={16} className="mr-1 inline align-text-bottom" aria-hidden />
          Chưa ghi vốn góp: {missing.map((m) => m.name).join(", ")}.{" "}
          <Link href="/reports/capital" className="font-medium underline">
            Ghi ở Sổ góp vốn
          </Link>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {branches
          .filter((r) => r.investment > 0)
          .map((r) => {
            const ratio = pct(r.net, r.investment);
            const done = r.net >= r.investment;
            const bar = Math.min(100, Math.max(0, ratio));
            return (
              <section key={r.id} className={`card space-y-4 ${r.active ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{r.name}</h2>
                    <p className="text-xs text-slate-500">
                      Tính từ {formatDate(r.start)}
                      {!r.openedAt && " (ca đầu tiên)"}
                      {!r.active && " · Ngừng hoạt động"}
                    </p>
                  </div>
                  {done ? (
                    <span className="badge inline-flex items-center gap-1 bg-green-100 text-green-800">
                      <CircleCheck size={12} aria-hidden /> Đã hoà vốn
                    </span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-800">Đang thu hồi vốn</span>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-2xl font-bold tabular-nums ${r.net < 0 ? "text-red-600" : "text-green-700"}`}>
                      {fmtPct(ratio)}
                    </span>
                    <span className="text-sm text-slate-500 tabular-nums">
                      {formatVND(r.net)} / {formatVND(r.investment)}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2.5 rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={Math.round(bar)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Tỉ lệ hoà vốn ${r.name}`}
                  >
                    <div className={`h-2.5 rounded-full ${done ? "bg-green-600" : "bg-[#1677ff]"}`} style={{ width: `${bar}%` }} />
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">Vốn góp</dt>
                  <dd className="text-right font-medium tabular-nums">{formatVND(r.investment)}</dd>
                  <dt className="text-slate-500">Đã thu hồi</dt>
                  <dd className={`text-right font-medium tabular-nums ${r.net < 0 ? "text-red-600" : "text-green-700"}`}>
                    {formatVND(r.net)}
                  </dd>
                  <dt className="text-slate-500">{done ? "Lãi sau hoà vốn" : "Còn lại để hoà vốn"}</dt>
                  <dd className={`text-right font-semibold tabular-nums ${done ? "text-green-700" : "text-slate-900"}`}>
                    {formatVND(done ? r.net - r.investment : r.remaining)}
                  </dd>
                  <dt className="text-slate-500">Lãi ròng TB / tháng</dt>
                  <dd className="text-right tabular-nums">
                    {r.monthly == null ? <span className="text-slate-400">Chưa đủ dữ liệu</span> : formatVND(Math.round(r.monthly))}
                  </dd>
                  {!done && (
                    <>
                      <dt className="text-slate-500">Dự kiến hoà vốn</dt>
                      <dd className="text-right">
                        {r.monthsLeft != null ? (
                          <>
                            {formatMonth(addMonths(today.slice(0, 7), r.monthsLeft))}
                            <span className="block text-xs text-slate-500">khoảng {r.monthsLeft} tháng nữa</span>
                          </>
                        ) : (
                          <span className="text-slate-400">
                            {r.monthly == null ? "Chưa đủ dữ liệu" : "Chưa ước tính được (đang lỗ)"}
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                </dl>

                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Người góp vốn</p>
                  <ul className="space-y-1 text-sm">
                    {r.contributors.map((c) => (
                      <li key={c.investorId} className="flex justify-between gap-3">
                        <span>{c.name}</span>
                        <span className="text-slate-600 tabular-nums">
                          {formatVND(c.amount)} · <b className="text-slate-900">{fmtPct(c.share * 100)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
      </div>

      {branches.length === 0 && <p className="card text-center text-slate-500">Chưa có chi nhánh nào.</p>}

      <div className="card text-sm text-slate-600">
        <p className="mb-1 font-semibold text-slate-800">Cách tính</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Vốn góp</b> = tổng tiền mọi người góp vào chi nhánh (Sổ góp vốn). <b>Đã thu hồi</b> = lãi ròng cộng dồn từ
            ngày bắt đầu = doanh thu − giá vốn − chi phí của chi nhánh (giống tab Lãi lỗ theo tháng).
          </li>
          <li>
            <b>Tỉ lệ hoà vốn</b> = đã thu hồi ÷ vốn góp. <b>Dự kiến</b> = phần còn lại ÷ lãi ròng trung bình mỗi tháng của{" "}
            {RECENT_DAYS} ngày gần nhất.
          </li>
          <li>Tiền rút ra không tính là chi phí nên không làm giảm lãi. Chi phí chung chỉ trừ ở phần tổng phía trên.</li>
          <li>
            Ngày bắt đầu tính đặt ở trang <Link href="/branches" className="text-[#1677ff] hover:underline">Chi nhánh</Link>.
          </li>
        </ul>
      </div>
    </div>
  );
}
