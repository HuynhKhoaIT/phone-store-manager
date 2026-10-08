import { CircleDot, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getCurrentBranch } from "@/lib/branch";
import { summarize } from "@/lib/summary";
import { daysInMonth, formatDateLong, formatMonth, formatVND, isValidMonth, todayVN } from "@/lib/format";
import { MonthNav } from "@/components/MonthNav";

const WEEK_HEADER = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission("history");
  const today = todayVN();
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);
  const branch = await getCurrentBranch();
  if (!branch) redirect("/choose-branch");

  const shifts = await prisma.shift.findMany({
    where: { branchId: branch.id, date: { startsWith: month } },
    include: {
      transactions: {
        select: { kind: true, price: true, paymentMethod: true, bankAccount: true, financeCompany: true, downPayment: true },
      },
      financePayments: { select: { amount: true, paymentMethod: true, bankAccount: true } },
    },
    orderBy: [{ date: "asc" }, { checkIn: "asc" }],
  });

  const days = new Map<string, typeof shifts>();
  for (const s of shifts) days.set(s.date, [...(days.get(s.date) ?? []), s]);

  const dayInfo = (date: string) => {
    const list = days.get(date) ?? [];
    const sum = summarize(
      list.flatMap((s) => s.transactions),
      list.flatMap((s) => s.financePayments),
    );
    const open = list.some((s) => !s.closedAt);
    const mismatch = list.some(
      (s) => s.closedAt && s.handoverCash !== s.openingCash + summarize(s.transactions, s.financePayments).cash,
    );
    return { list, sum, open, mismatch };
  };

  const monthSum = summarize(
    shifts.flatMap((s) => s.transactions),
    shifts.flatMap((s) => s.financePayments),
  );
  const count = daysInMonth(month);
  const firstWeekday = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // T2 = 0
  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lịch sử — {formatMonth(month)}</h1>
          <p className="text-sm text-slate-500">
            {branch.name} · Doanh thu tháng <b className="text-slate-800">{formatVND(monthSum.total)}</b>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthNav path="/history" month={month} />
        </div>
      </div>

      <div className="card p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          {WEEK_HEADER.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} />;
            const { list, sum, open, mismatch } = dayInfo(date);
            const isToday = date === today;
            return (
              <Link
                key={date}
                href={`/day/${date}`}
                className={`flex min-h-16 flex-col rounded-md border p-1 text-left hover:border-blue-400 hover:bg-blue-50 sm:min-h-20 sm:p-2 ${
                  isToday ? "border-blue-500" : "border-slate-200"
                } ${list.length ? "bg-white" : "bg-slate-50"}`}
              >
                <span className={`text-xs font-semibold ${isToday ? "text-blue-600" : "text-slate-700"}`}>
                  {Number(date.slice(8))}
                </span>
                {list.length > 0 && (
                  <>
                    <span className="mt-auto truncate text-[11px] font-semibold text-slate-800 tabular-nums sm:text-sm">
                      {sum.total >= 1_000_000
                        ? `${(sum.total / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`
                        : `${Math.round(sum.total / 1000)}k`}
                    </span>
                    <span className="hidden text-[11px] text-slate-500 sm:block">{sum.count} giao dịch</span>
                    {open && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-green-700">
                        <CircleDot size={10} aria-hidden /> đang mở
                      </span>
                    )}
                    {mismatch && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-red-600">
                        <TriangleAlert size={10} aria-hidden /> lệch tiền
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Nhân viên</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">Tiền mặt</th>
              <th className="text-right">Chuyển khoản</th>
              <th className="text-right">Bàn giao</th>
            </tr>
          </thead>
          <tbody>
            {[...days.keys()].reverse().map((date) => {
              const { list, sum } = dayInfo(date);
              const handover = list.reduce((s, x) => s + (x.handoverCash ?? 0), 0);
              return (
                <tr key={date}>
                  <td data-title className="whitespace-nowrap">
                    <Link href={`/day/${date}`} className="font-medium text-blue-600 hover:underline">
                      {formatDateLong(date)}
                    </Link>
                  </td>
                  <td data-label="Nhân viên">
                    {list.map((s) => `${s.staffName} (${s.checkIn}–${s.checkOut ?? "…"})`).join(", ")}
                  </td>
                  <td data-label="Doanh thu" className="text-right font-semibold tabular-nums">
                    {formatVND(sum.total)}
                  </td>
                  <td data-label="Tiền mặt" className="text-right tabular-nums">
                    {formatVND(sum.cash)}
                  </td>
                  <td data-label="Chuyển khoản" className="text-right tabular-nums">
                    {formatVND(sum.transfer)}
                  </td>
                  <td data-label="Bàn giao" className="text-right tabular-nums">
                    {formatVND(handover)}
                  </td>
                </tr>
              );
            })}
            {days.size === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Chưa có dữ liệu trong tháng này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
