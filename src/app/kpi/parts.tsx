import Link from "next/link";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { formatDate, formatVND } from "@/lib/format";
import type { StaffKpi } from "@/lib/kpi";
import { formatMetric, formatPct, pctTone, type BonusConfig } from "@/lib/kpi-metrics";
import { setTransactionCategory } from "../actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DailyRevenueChart } from "@/components/DailyRevenueChart";
import { StatCard } from "@/components/StatCard";

const TABS = [
  { href: "/kpi", label: "Tổng quan", key: "overview", adminOnly: false },
  { href: "/kpi/targets", label: "Chỉ tiêu", key: "targets", adminOnly: false },
  { href: "/kpi/bonus", label: "Cấu hình thưởng", key: "bonus", adminOnly: true },
] as const;

/** Tab con của trang KPI (cùng kiểu ReportsTabs); giữ tháng đang xem khi chuyển tab */
export async function KpiTabs({ active, month }: { active: (typeof TABS)[number]["key"]; month: string }) {
  const me = await getSessionUser();
  const tabs = TABS.filter((t) => !t.adminOnly || me?.role === "ADMIN");
  return (
    <nav className="flex gap-6 border-b border-slate-200 text-sm" aria-label="KPI">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${t.href}?month=${month}`}
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

/** Thanh tiến độ % hoàn thành (tối đa đầy thanh ở 100%) */
export function Progress({ ratio }: { ratio: number | null }) {
  const width = ratio == null ? 0 : Math.min(1, Math.max(0, ratio)) * 100;
  const bar = ratio == null ? "" : ratio >= 1 ? "bg-green-500" : ratio >= 0.7 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
      <span className={`w-14 shrink-0 text-right text-sm font-medium tabular-nums ${pctTone(ratio)}`}>{formatPct(ratio)}</span>
    </div>
  );
}

/** "Đạt 1/3 phần · tiếp theo: Bán kèm 2/7 máy = 28,6% (cần ≥ 50%)" — chỉ nhân viên biết còn thiếu gì */
export function bonusHint(kpi: Pick<StaffKpi, "payout">) {
  const { partsMet, partsCount, lines } = kpi.payout;
  if (!partsCount) return undefined;
  const next = lines.find((l) => l.key.startsWith("PART_") && !l.met);
  const missing = next?.conditions?.find((c) => !c.met);
  return `Đạt ${partsMet}/${partsCount} phần${missing ? ` · tiếp theo: ${missing.text}` : ""}`;
}

export type UnclassifiedTx = { id: number; productName: string; price: number; date: string };

/**
 * Chi tiết KPI một nhân viên trong tháng — dùng ở /kpi/staff/[id] (quản lý) và /my-kpi (nhân viên tự xem).
 * `canCost`: thấy số tiền lãi gộp; thiếu quyền thì chỉ thấy % của chỉ tiêu lãi gộp.
 */
export function StaffKpiView({
  kpi,
  config,
  canCost,
  unclassified,
  emptyAction,
  reviewForm,
}: {
  kpi: StaffKpi;
  config: BonusConfig;
  canCost: boolean;
  /** Đơn bán chưa phân loại kèm nút phân loại (người có quyền `kpi`); không truyền = chỉ hiện số đơn */
  unclassified?: UnclassifiedTx[];
  /** Nút / link khi chưa có chỉ tiêu (vd "Đặt chỉ tiêu") */
  emptyAction?: React.ReactNode;
  /** Form đánh giá của chủ quán (người có quyền `kpi`); không truyền = chỉ xem kết quả */
  reviewForm?: React.ReactNode;
}) {
  const a = kpi.actuals;
  const hasProfitRow = kpi.rows.some((r) => r.metric === "GROSS_PROFIT");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Hoàn thành KPI"
          value={formatPct(kpi.completion)}
          sub={kpi.rows.length ? `${kpi.rows.length} chỉ tiêu, có trọng số` : "Chưa có chỉ tiêu"}
        />
        <StatCard
          label="Thưởng dự kiến"
          value={formatVND(kpi.payout.total)}
          sub={config.partsEnabled ? bonusHint(kpi) : undefined}
        />
        <StatCard label="Doanh thu (bán + sửa)" value={formatVND(a.revenue)} />
        <StatCard
          label="Số đơn"
          value={a.ORDER_COUNT.toLocaleString("vi-VN")}
          sub={`${a.PHONE_COUNT} điện thoại${a.PHONE_COUNT ? ` · bán kèm ${a.attached}/${a.PHONE_COUNT}` : ""}`}
        />
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Chỉ tiêu tháng</h2>
        {kpi.rows.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>Chưa có chỉ tiêu KPI cho tháng này.</span>
            {emptyAction}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Chỉ tiêu</th>
                <th className="text-right">Mục tiêu</th>
                <th className="text-right">Thực tế</th>
                <th className="text-right">Còn thiếu</th>
                <th className="min-w-44">Hoàn thành</th>
                <th className="text-right">Trọng số</th>
              </tr>
            </thead>
            <tbody>
              {kpi.rows.map((r) => {
                // Lãi gộp lộ giá vốn → thiếu quyền "Giá nhập & lãi" thì chỉ hiện %
                const hidden = r.metric === "GROSS_PROFIT" && !canCost;
                const fmt = (n: number) => (hidden ? "—" : formatMetric(n, r.unit));
                return (
                  <tr key={r.metric}>
                    <td data-title>{r.label}</td>
                    <td data-label="Mục tiêu" className="text-right tabular-nums">
                      {fmt(r.target)}
                    </td>
                    <td data-label="Thực tế" className="text-right font-medium tabular-nums">
                      {fmt(r.actual)}
                    </td>
                    <td data-label="Còn thiếu" className="text-right tabular-nums">
                      {r.remaining > 0 ? fmt(r.remaining) : <span className="text-green-700">Đã đạt</span>}
                    </td>
                    <td data-label="Hoàn thành">
                      <Progress ratio={r.ratio} />
                    </td>
                    <td data-label="Trọng số" className="text-right tabular-nums">
                      ×{r.weight}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {kpi.rows.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            % chung = trung bình theo trọng số, mỗi chỉ tiêu tính tối đa 150%.
          </p>
        )}
        {hasProfitRow && a.missingCost > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700">
            <TriangleAlert size={16} aria-hidden /> {a.missingCost} đơn chưa có giá vốn — chưa tính vào lợi nhuận gộp.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Thưởng dự kiến</h2>
        {kpi.payout.lines.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa cấu hình cách thưởng nào.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Khoản</th>
                <th>Cách tính</th>
                <th className="text-right">Tiền thưởng</th>
              </tr>
            </thead>
            <tbody>
              {kpi.payout.lines.map((l) => (
                <tr key={l.key}>
                  <td data-title>{l.label}</td>
                  <td data-label="Cách tính" className="text-sm text-slate-600">
                    {l.conditions ? (
                      <ul className="space-y-0.5 text-left">
                        {l.conditions.map((c) => (
                          <li key={c.text} className={`flex items-start gap-1.5 ${c.met ? "text-green-700" : "text-slate-600"}`}>
                            {c.met ? (
                              <CircleCheck size={15} className="mt-0.5 shrink-0" aria-label="Đạt" />
                            ) : (
                              <CircleX size={15} className="mt-0.5 shrink-0 text-slate-400" aria-label="Chưa đạt" />
                            )}
                            {c.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      l.rate
                    )}
                    {/* Lãi gộp lộ giá vốn → chỉ hiện cơ sở tính khi có quyền */}
                    {l.base != null && !l.blocked && (!l.profitBased || canCost) && ` × ${formatVND(l.base)}`}
                    {l.blocked && (
                      <span className="mt-0.5 flex items-center gap-1 text-amber-700">
                        <TriangleAlert size={14} aria-hidden /> {l.blocked}
                      </span>
                    )}
                  </td>
                  <td data-label="Tiền thưởng" className="text-right font-medium tabular-nums">
                    {formatVND(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={2}>Tổng</td>
                <td className="text-right tabular-nums">{formatVND(kpi.payout.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Dự kiến theo số liệu hiện tại — có thể thay đổi đến khi chốt tháng. Các phần đạt được cộng dồn
          {config.maxTotal != null && `, tối đa ${formatVND(config.maxTotal)} / tháng`}. Mỗi nhóm hàng chỉ tính một cách (hoa
          hồng hoặc thưởng lợi nhuận) nên không thưởng hai lần cho cùng một khoản.
        </p>
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold">Đánh giá của chủ quán</h2>
        <p className="mb-3 text-sm text-slate-500">Chất lượng phục vụ, tuân thủ quy trình — phần số liệu không đo được.</p>
        {kpi.facts.review ? (
          <p className={`flex items-start gap-1.5 text-sm ${kpi.facts.review.passed ? "text-green-700" : "text-red-600"}`}>
            {kpi.facts.review.passed ? <CircleCheck size={16} className="mt-0.5 shrink-0" aria-hidden /> : <CircleX size={16} className="mt-0.5 shrink-0" aria-hidden />}
            <span>
              {kpi.facts.review.passed ? "Đạt" : "Không đạt"}
              {kpi.facts.review.note && ` — ${kpi.facts.review.note}`}
              <span className="text-slate-400"> · {kpi.facts.review.reviewedBy}</span>
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Chưa đánh giá tháng này.</p>
        )}
        {reviewForm && <div className="mt-3">{reviewForm}</div>}
      </section>

      {a.unclassified > 0 && (
        <section className="card">
          <h2 className="mb-1 flex items-center gap-1.5 font-semibold">
            <TriangleAlert size={18} className="text-amber-600" aria-hidden /> Đơn bán chưa phân loại
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            {a.unclassified} đơn ({formatVND(a.unclassifiedRevenue)}) bán gõ tay, chưa biết là điện thoại hay phụ kiện —
            chưa tính vào chỉ tiêu theo loại hàng.
          </p>
          {unclassified && unclassified.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Sản phẩm</th>
                  <th className="text-right">Giá</th>
                  <th className="text-right">Phân loại</th>
                </tr>
              </thead>
              <tbody>
                {unclassified.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Ngày" className="tabular-nums">
                      {formatDate(t.date)}
                    </td>
                    <td data-title>{t.productName}</td>
                    <td data-label="Giá" className="text-right tabular-nums">
                      {formatVND(t.price)}
                    </td>
                    <td data-label="Phân loại" className="text-right">
                      <span className="inline-flex gap-2">
                        <ConfirmButton
                          noConfirm
                          message=""
                          action={setTransactionCategory.bind(null, t.id, "PHONE")}
                          className="btn-secondary py-1 text-sm"
                        >
                          Điện thoại
                        </ConfirmButton>
                        <ConfirmButton
                          noConfirm
                          message=""
                          action={setTransactionCategory.bind(null, t.id, "ACCESSORY")}
                          className="btn-secondary py-1 text-sm"
                        >
                          Phụ kiện
                        </ConfirmButton>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 font-semibold">Xu hướng doanh thu theo ngày</h2>
        <DailyRevenueChart data={kpi.daily} />
      </section>
    </div>
  );
}
