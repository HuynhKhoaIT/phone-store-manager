import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCurrentBranch } from "@/lib/branch";
import { getPriceSuggestions } from "@/lib/prices";
import { summarize } from "@/lib/summary";
import { getDayChecklist } from "@/lib/checklist";
import { addDays, formatDateLong, formatTimeVN, formatVND, isValidDate, nowTimeVN, todayVN } from "@/lib/format";
import { openShift } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { MoneyInput } from "@/components/MoneyInput";
import { NavInput } from "@/components/NavInput";
import { DailyChecklist } from "@/components/DailyChecklist";
import { ShiftCard } from "./ShiftCard";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const today = todayVN();
  if (!isAdmin && date !== today) redirect(`/day/${today}`);

  const branch = await getCurrentBranch();
  if (!branch) redirect("/choose-branch");

  const [shifts, accounts, suggestions, checklist] = await Promise.all([
    prisma.shift.findMany({
      where: { date, branchId: branch.id },
      include: { transactions: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ checkIn: "asc" }, { id: "asc" }],
    }),
    prisma.transaction.findMany({
      where: { bankAccount: { not: null } },
      select: { bankAccount: true },
      distinct: ["bankAccount"],
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    getPriceSuggestions(),
    getDayChecklist(date, branch.id),
  ]);
  const checklistItems = checklist.map(({ task, check }) => ({
    taskId: task.id,
    title: task.title,
    description: task.description,
    doneBy: check ? (check.user.id === me.id ? "Bạn" : check.user.name) : null,
    doneAt: check ? formatTimeVN(check.doneAt) : null,
    canToggle: isAdmin || !check || check.user.id === me.id,
  }));
  const checklistLeft = checklistItems.filter((i) => !i.doneBy).length;

  const day = summarize(shifts.flatMap((s) => s.transactions));
  const hasOpenShift = shifts.some((s) => s.userId === me.id && !s.closedAt);
  const canOpenShift = !hasOpenShift && (isAdmin || date === today);
  const hadShift = shifts.some((s) => s.userId === me.id);
  const bankAccounts = accounts.map((a) => a.bankAccount!).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{formatDateLong(date)}</h1>
          <p className="text-sm text-slate-500">
            {branch.name}
            {date === today && " · Hôm nay"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link href={`/day/${addDays(date, -1)}`} className="btn-secondary" aria-label="Ngày trước">
              ←
            </Link>
            <NavInput type="date" value={date} hrefPrefix="/day/" label="Chọn ngày" />
            <Link href={`/day/${addDays(date, 1)}`} className="btn-secondary" aria-label="Ngày sau">
              →
            </Link>
            {date !== today && (
              <Link href={`/day/${today}`} className="btn-secondary">
                Hôm nay
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Doanh thu ngày" value={formatVND(day.total)} sub={`${day.count} giao dịch`} strong />
        <Stat label="Bán hàng / Sửa chữa" value={formatVND(day.sale)} sub={`Sửa chữa: ${formatVND(day.repair)}`} />
        <Stat label="Tiền mặt (TM)" value={formatVND(day.cash)} />
        <Stat label="Chuyển khoản (CK)" value={formatVND(day.transfer)} />
      </div>

      <DailyChecklist date={date} items={checklistItems} editable={isAdmin || date === today} />

      {canOpenShift && (
        <details open={!hadShift} className="card border-blue-200 bg-blue-50/40">
          <summary className="cursor-pointer font-semibold">
            {hadShift ? "+ Vào ca mới" : "Vào ca"} — {me.name}
          </summary>
          <ActionForm action={openShift} submitLabel="Bắt đầu ca" className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="date" value={date} />
            <label className="field">
              <span>Giờ đi làm *</span>
              <input
                name="checkIn"
                type="time"
                required
                defaultValue={date === today ? nowTimeVN() : "08:00"}
                className="input"
              />
            </label>
            <label className="field">
              <span>Tiền nhận đầu ca *</span>
              <MoneyInput name="openingCash" required />
            </label>
          </ActionForm>
        </details>
      )}

      {shifts.length === 0 && !canOpenShift && (
        <p className="card text-center text-slate-500">Không có ca làm việc nào trong ngày này.</p>
      )}

      {shifts.map((s) => (
        <ShiftCard
          key={s.id}
          shift={s}
          canEdit={!s.closedAt && (isAdmin || (s.userId === me.id && date === today))}
          isAdmin={isAdmin}
          defaultCheckOut={date === today ? nowTimeVN() : "21:00"}
          checklistLeft={checklistLeft}
          bankAccounts={bankAccounts}
          saleSuggestions={suggestions.sale}
          repairSuggestions={suggestions.repair}
        />
      ))}
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-bold tabular-nums ${strong ? "text-2xl text-blue-700" : "text-lg"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
