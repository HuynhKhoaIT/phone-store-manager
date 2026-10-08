import Link from "next/link";
import { Download, TriangleAlert } from "lucide-react";
import type { Expense } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getActiveBranches, getBranches } from "@/lib/branch";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { addMonths, formatDate, formatMonth, formatVND, todayVN } from "@/lib/format";
import { getPeriod, inPeriod, periodParams } from "@/lib/period";
import { deleteExpense, saveExpense } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { BranchFilter, DateRangeFilter, MonthNav } from "@/components/MonthNav";
import { StatCard } from "@/components/StatCard";
import { ReportsTabs } from "@/components/ReportsTabs";
import { percentChange, profitOf } from "@/lib/profit";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { month?: string; from?: string; to?: string; branch?: string; edit?: string; page?: string };
type TxRow = { kind: string; price: number; costPrice: number | null; giftCost: number };
type Pnl = ReturnType<typeof profitOf> & { expenses: number };

const TREND_MONTHS = 6;

/** Lãi gộp dùng chung công thức với Dashboard (lib/profit.ts); lãi ròng = lãi gộp − chi phí. */
const pnl = (txs: TxRow[], expenses: number): Pnl => ({ ...profitOf(txs), expenses });
const gross = (p: Pnl) => p.gross;
const net = (p: Pnl) => p.gross - p.expenses;

function groupSum<T, K>(items: T[], key: (t: T) => K, value: (t: T) => number) {
  const m = new Map<K, number>();
  for (const t of items) m.set(key(t), (m.get(key(t)) ?? 0) + value(t));
  return m;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAnyPermission("reports", "capital", "cost-prices");
  // Không có quyền Báo cáo → vào thẳng tab được phép
  if (!can(me, "reports")) redirect(can(me, "capital") ? "/reports/break-even" : "/reports/missing-cost");
  const sp = await searchParams;
  const today = todayVN();
  // Theo tháng (?month=) hoặc từ ngày đến ngày (?from=&to=); bảng 6 tháng lấy theo tháng của ngày cuối
  const period = getPeriod(sp, today);
  const keep = periodParams(period);
  const month = period.month;
  const [branches, activeBranches] = await Promise.all([getBranches(), getActiveBranches()]);
  const branchId = branches.find((b) => b.id === Number(sp.branch))?.id;
  const firstMonth = addMonths(month, -(TREND_MONTHS - 1));
  // Đủ cho cả bảng 6 tháng lẫn kỳ trước của khoảng ngày (có thể lùi xa hơn 6 tháng)
  const startDate = [`${firstMonth}-01`, period.prev.from].sort()[0];
  const range = { gte: startDate, lte: `${month}-31` };

  const [txs, expenses] = await Promise.all([
    prisma.transaction.findMany({
      where: { shift: { date: range, ...(branchId && { branchId }) } },
      select: {
        kind: true,
        price: true,
        costPrice: true,
        giftCost: true,
        shift: { select: { date: true, branchId: true } },
      },
    }),
    prisma.expense.findMany({
      where: { date: range },
      include: { branch: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
  ]);
  // Lọc chi nhánh: chỉ tính chi phí của chi nhánh đó; chi phí chung để riêng
  const inScope = (e: Expense) => (branchId ? e.branchId === branchId : true);

  // Xu hướng theo tháng
  const expenseByMonth = groupSum(
    expenses.filter(inScope),
    (e) => e.date.slice(0, 7),
    (e) => e.amount,
  );
  const trend = new Map<string, Pnl>();
  for (let i = 0; i < TREND_MONTHS; i++) {
    const m = addMonths(firstMonth, i);
    trend.set(
      m,
      pnl(
        txs.filter((t) => t.shift.date.startsWith(m)),
        expenseByMonth.get(m) ?? 0,
      ),
    );
  }
  // Kỳ đang xem và kỳ trước (tháng trước / cùng số ngày liền trước)
  const sumExpenses = (r: { from: string; to: string }) =>
    expenses.filter((e) => inScope(e) && inPeriod(e.date, r)).reduce((s, e) => s + e.amount, 0);
  const cur = pnl(
    txs.filter((t) => inPeriod(t.shift.date, period)),
    sumExpenses(period),
  );
  const prev = pnl(
    txs.filter((t) => inPeriod(t.shift.date, period.prev)),
    sumExpenses(period.prev),
  );

  const monthTxs = txs.filter((t) => inPeriod(t.shift.date, period));
  const monthExpenses = expenses.filter((e) => inPeriod(e.date, period));
  const sharedExpense = monthExpenses.filter((e) => e.branchId == null).reduce((s, e) => s + e.amount, 0);

  const expenseByBranch = groupSum(
    monthExpenses.filter((e) => e.branchId != null),
    (e) => e.branchId!,
    (e) => e.amount,
  );
  const branchIds = new Set([...monthTxs.map((t) => t.shift.branchId), ...expenseByBranch.keys()]);
  const byBranch = new Map(
    [...branchIds].map((id) => [
      id,
      pnl(
        monthTxs.filter((t) => t.shift.branchId === id),
        expenseByBranch.get(id) ?? 0,
      ),
    ]),
  );

  const byCategory = new Map<string, number>();
  for (const e of monthExpenses.filter(inScope))
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);

  // Chỉ phân trang danh sách chi phí; các bảng tổng hợp ở trên vẫn tính trên toàn bộ
  const scopedExpenses = monthExpenses.filter(inScope);
  const paging = getPaging(scopedExpenses.length, sp.page);
  const shownExpenses = scopedExpenses.slice(0, paging.take);
  const curPage = paging.page > 1 ? String(paging.page) : "";

  const editing = monthExpenses.find((e) => e.id === Number(sp.edit));
  const qs = (patch: Search) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, branch: branchId ? String(branchId) : "", ...patch }))
      if (v) p.set(k, v);
    return `/reports?${p}`;
  };
  const backHref = qs({ page: curPage });
  const exportHref = (type: string) =>
    `/reports/export?${new URLSearchParams({ type, ...keep, ...(branchId && { branch: String(branchId) }) })}`;

  const renderForm = (e?: Expense) => (
    <ActionForm
      action={saveExpense}
      submitLabel={e ? "Lưu thay đổi" : "Thêm chi phí"}
      successMessage={e ? "Đã lưu chi phí." : "Đã thêm chi phí."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {e && <input type="hidden" name="id" value={e.id} />}
      <label className="field">
        <span>Ngày *</span>
        <input
          name="date"
          type="date"
          required
          defaultValue={e?.date ?? (inPeriod(today, period) ? today : period.from)}
          className="input"
        />
      </label>
      <label className="field">
        <span>Số tiền *</span>
        <MoneyInput name="amount" required defaultValue={e?.amount} />
      </label>
      <label className="field">
        <span>Loại chi phí *</span>
        <select name="category" required defaultValue={e?.category ?? ""} className="input">
          <option value="" disabled>
            Chọn loại...
          </option>
          {Object.entries(EXPENSE_CATEGORIES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Chi nhánh</span>
        <select name="branchId" defaultValue={e ? (e.branchId ?? "") : (branchId ?? "")} className="input">
          <option value="">Chung cả cửa hàng</option>
          {activeBranches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field col-span-full">
        <span>Ghi chú</span>
        <input name="note" defaultValue={e?.note ?? ""} className="input" placeholder="VD: Tiền nhà tháng 10" />
      </label>
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Báo cáo — ${period.label}`}
        subtitle="Lãi lỗ theo tháng hoặc khoảng ngày: doanh thu, giá vốn, chi phí vận hành"
        actions={
          <FormDialog title="Thêm chi phí" triggerLabel="Thêm chi phí">
            {renderForm()}
          </FormDialog>
        }
      />

      <ReportsTabs active="pnl" />

      {editing && (
        <FormDialog key={editing.id} title="Sửa chi phí" defaultOpen closeHref={backHref}>
          {renderForm(editing)}
        </FormDialog>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <MonthNav path="/reports" month={month} params={{ branch: branchId }} />
        <BranchFilter path="/reports" keep={keep} branchId={branchId} branches={branches} />
        <DateRangeFilter path="/reports" period={period} branchId={branchId} />
        <div className="flex gap-2 sm:ml-auto">
          <a href={exportHref("transactions")} className="btn-secondary">
            <Download size={16} aria-hidden /> Giao dịch
          </a>
          <a href={exportHref("expenses")} className="btn-secondary">
            <Download size={16} aria-hidden /> Chi phí
          </a>
        </div>
      </div>

      {/* Lãi lỗ tháng */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Doanh thu"
          value={formatVND(cur.revenue)}
          change={percentChange(cur.revenue, prev?.revenue)}
          changeLabel={period.prevLabel}
        />
        <StatCard
          label="Giá vốn hàng bán"
          value={formatVND(cur.cogs)}
          change={percentChange(cur.cogs, prev?.cogs)}
          changeLabel={period.prevLabel}
          inverse
        />
        <StatCard
          label="Lãi gộp"
          value={formatVND(gross(cur))}
          amount={gross(cur)}
          profit
          change={percentChange(gross(cur), prev && gross(prev))}
          changeLabel={period.prevLabel}
        />
        <StatCard
          label="Chi phí"
          value={formatVND(cur.expenses)}
          change={percentChange(cur.expenses, prev?.expenses)}
          changeLabel={period.prevLabel}
          inverse
        />
        <StatCard
          label="Lãi ròng"
          value={formatVND(net(cur))}
          amount={net(cur)}
          profit
          change={percentChange(net(cur), prev && net(prev))}
          changeLabel={period.prevLabel}
        />
      </div>

      {(cur.missingCost > 0 || (branchId && sharedExpense > 0)) && (
        <div className="space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {cur.missingCost > 0 && (
            <p>
              <TriangleAlert size={16} className="mr-1 inline align-text-bottom" aria-hidden />
              {cur.missingCost} giao dịch chưa có giá vốn (bán / sửa ngoài bảng giá hoặc chưa nhập giá) — lãi có thể
              cao hơn thực tế.{" "}
              {can(me, "cost-prices") && (
                <Link
                  href={`/reports/missing-cost?${new URLSearchParams({ ...keep, ...(branchId && { branch: String(branchId) }) })}`}
                  className="font-medium underline"
                >
                  Nhập giá vốn
                </Link>
              )}
            </p>
          )}
          {branchId && sharedExpense > 0 && (
            <p>Chi phí chung cả cửa hàng {formatVND(sharedExpense)} không tính vào chi nhánh này.</p>
          )}
        </div>
      )}

      {/* Lọc 1 chi nhánh thì không có bảng "Theo chi nhánh" → thẻ chi phí chiếm cả hàng, không để trống nửa bên */}
      <div className={`grid gap-4 ${branchId ? "" : "lg:grid-cols-2"}`}>
        {!branchId && (
          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Theo chi nhánh</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Chi nhánh</th>
                  <th className="text-right">Doanh thu</th>
                  <th className="text-right">Lãi gộp</th>
                  <th className="text-right">Chi phí</th>
                  <th className="text-right">Lãi ròng</th>
                </tr>
              </thead>
              <tbody>
                {[...byBranch]
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .map(([id, p]) => (
                    <tr key={id}>
                      <td data-title>{branches.find((b) => b.id === id)?.name ?? "?"}</td>
                      <Money label="Doanh thu" value={p.revenue} />
                      <Money label="Lãi gộp" value={gross(p)} />
                      <Money label="Chi phí" value={p.expenses} />
                      <Money label="Lãi ròng" value={net(p)} tone strong />
                    </tr>
                  ))}
                {sharedExpense > 0 && (
                  <tr>
                    <td data-title className="text-slate-500">
                      Chi phí chung
                    </td>
                    <Money label="Doanh thu" value={0} />
                    <Money label="Lãi gộp" value={0} />
                    <Money label="Chi phí" value={sharedExpense} />
                    <Money label="Lãi ròng" value={-sharedExpense} tone strong />
                  </tr>
                )}
                {byBranch.size === 0 && sharedExpense === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      Chưa có dữ liệu tháng này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        <section className="card">
          <h2 className="mb-3 font-semibold">Chi phí theo loại</h2>
          {byCategory.size === 0 ? (
            <p className="text-sm text-slate-500">Chưa có chi phí nào trong {period.mode === "month" ? "tháng" : "khoảng ngày"} này.</p>
          ) : (
            <ul className="space-y-2.5">
              {[...byCategory]
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => (
                  <li key={cat}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{EXPENSE_CATEGORIES[cat] ?? cat}</span>
                      <span className="font-medium tabular-nums">{formatVND(amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-[var(--series-repair)]"
                        style={{ width: `${(amount / cur.expenses) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">{TREND_MONTHS} tháng gần đây</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Tháng</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">Giá vốn</th>
              <th className="text-right">Lãi gộp</th>
              <th className="text-right">Chi phí</th>
              <th className="text-right">Lãi ròng</th>
            </tr>
          </thead>
          <tbody>
            {[...trend].reverse().map(([m, p]) => (
              <tr key={m} className={period.mode === "month" && m === month ? "bg-blue-50/50" : ""}>
                <td data-title>
                  <Link href={qs({ month: m, from: "", to: "" })} className="hover:text-[#1677ff]">
                    {formatMonth(m)}
                  </Link>
                </td>
                <Money label="Doanh thu" value={p.revenue} />
                <Money label="Giá vốn" value={p.cogs} />
                <Money label="Lãi gộp" value={gross(p)} />
                <Money label="Chi phí" value={p.expenses} />
                <Money label="Lãi ròng" value={net(p)} tone strong />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Chi phí {period.mode === "month" ? "trong tháng" : "trong khoảng ngày"}</h2>
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Loại</th>
                <th>Ngày</th>
                <th className="text-right">Số tiền</th>
                <th>Chi nhánh</th>
                <th>Ghi chú</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shownExpenses.map((e, i) => (
                <tr key={e.id} className={rowClass(paging, i)}>
                  <td data-title className="font-medium">
                    {EXPENSE_CATEGORIES[e.category] ?? e.category}
                  </td>
                  <td data-label="Ngày" className="whitespace-nowrap">
                    {formatDate(e.date)}
                  </td>
                  <td data-label="Số tiền" className="text-right font-medium whitespace-nowrap tabular-nums">
                    {formatVND(e.amount)}
                  </td>
                  <td data-label="Chi nhánh">{e.branch?.name ?? <span className="text-slate-500">Chung</span>}</td>
                  <td data-label="Ghi chú">
                    <span>
                      {e.note}
                      <span className="block text-xs text-slate-400">Nhập bởi {e.createdBy}</span>
                    </span>
                  </td>
                  <td className="space-x-3 text-right whitespace-nowrap">
                    <Link
                      href={qs({ edit: String(e.id), page: curPage })}
                      className="text-sm text-[#1677ff] hover:underline"
                    >
                      Sửa
                    </Link>
                    <ConfirmButton
                      action={deleteExpense.bind(null, e.id)}
                      message={`Xoá chi phí ${formatVND(e.amount)} ngày ${formatDate(e.date)}?`}
                    >
                      Xoá
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
              {scopedExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Chưa có chi phí nào. Bấm &quot;Thêm chi phí&quot; để ghi tiền mặt bằng, lương, điện nước...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paging={paging} href={pageHref("/reports", { ...keep, branch: branchId })} />
      </section>
    </div>
  );
}

function Money({ label, value, tone, strong }: { label: string; value: number; tone?: boolean; strong?: boolean }) {
  return (
    <td
      data-label={label}
      className={`text-right whitespace-nowrap tabular-nums ${strong ? "font-semibold" : ""} ${
        tone ? (value >= 0 ? "text-green-700" : "text-red-600") : ""
      }`}
    >
      {formatVND(value)}
    </td>
  );
}
