import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCurrentBranch } from "@/lib/branch";
import { can } from "@/lib/permissions";
import { getPriceSuggestions } from "@/lib/prices";
import { summarize } from "@/lib/summary";
import { getDayChecklist } from "@/lib/checklist";
import { addDays, formatDateLong, formatVND, isValidDate, nowTimeVN, todayVN } from "@/lib/format";
import { openShift } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { MoneyInput } from "@/components/MoneyInput";
import { NavInput } from "@/components/NavInput";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { ShiftCard } from "./ShiftCard";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const canSell = can(me, "sell");
  const canViewHistory = can(me, "history");
  if (!canSell && !canViewHistory) redirect("/");
  const today = todayVN();
  // Nhân viên chỉ làm trong hôm nay; có quyền Lịch sử thì xem được ngày khác (vẫn không sửa được)
  if (!isAdmin && !canViewHistory && date !== today) redirect(`/day/${today}`);

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
  // Checklist nằm ở trang Việc cần làm; ở đây chỉ đếm việc chưa xong để cảnh báo khi chốt ca
  const checklistLeft = checklist.filter((c) => !c.check).length;

  const day = summarize(shifts.flatMap((s) => s.transactions));
  const hasOpenShift = shifts.some((s) => s.userId === me.id && !s.closedAt);
  // Chỉ nhân viên vào ca (admin chỉ xem / quản lý ca của nhân viên)
  const canOpenShift = !isAdmin && canSell && !hasOpenShift && date === today;
  const hadShift = shifts.some((s) => s.userId === me.id);
  const bankAccounts = accounts.map((a) => a.bankAccount!).filter(Boolean);

  const openShiftDialog = (
    <FormDialog title={`Vào ca — ${me.name}`} triggerLabel={hadShift ? "Vào ca mới" : "Vào ca"}>
      <ActionForm action={openShift} submitLabel="Bắt đầu ca" successMessage="Đã vào ca." className="grid gap-3 sm:grid-cols-2">
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
    </FormDialog>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={formatDateLong(date)}
        subtitle={`${branch.name}${date === today ? " · Hôm nay" : ""}`}
        actions={
          <>
            {(isAdmin || canViewHistory) && (
              <div className="flex items-center gap-2">
                <Link href={`/day/${addDays(date, -1)}`} className="btn-secondary" aria-label="Ngày trước">
                  <ChevronLeft size={16} aria-hidden />
                </Link>
                <NavInput type="date" value={date} hrefPrefix="/day/" label="Chọn ngày" />
                <Link href={`/day/${addDays(date, 1)}`} className="btn-secondary" aria-label="Ngày sau">
                  <ChevronRight size={16} aria-hidden />
                </Link>
                {date !== today && (
                  <Link href={`/day/${today}`} className="btn-secondary">
                    Hôm nay
                  </Link>
                )}
              </div>
            )}
            {canOpenShift && hadShift && openShiftDialog}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Doanh thu ngày" value={formatVND(day.total)} sub={`${day.count} giao dịch`} strong />
        <Stat label="Bán hàng / Sửa chữa" value={formatVND(day.sale)} sub={`Sửa chữa: ${formatVND(day.repair)}`} />
        <Stat label="Tiền mặt (TM)" value={formatVND(day.cash)} />
        <Stat label="Chuyển khoản (CK)" value={formatVND(day.transfer)} />
      </div>

      {canOpenShift && !hadShift && (
        <div className="card flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-[#1677ff]">
            <Clock size={24} aria-hidden />
          </span>
          <div>
            <p className="font-semibold">Bạn chưa vào ca hôm nay</p>
            <p className="text-sm text-slate-500">Nhập giờ đi làm và tiền nhận đầu ca để bắt đầu bán hàng.</p>
          </div>
          {openShiftDialog}
        </div>
      )}

      {shifts.length === 0 && !canOpenShift && (
        <p className="card text-center text-slate-500">
          {isAdmin ? "Chưa có nhân viên nào vào ca trong ngày này." : "Không có ca làm việc nào trong ngày này."}
        </p>
      )}

      {shifts.map((s) => (
        <ShiftCard
          key={s.id}
          shift={s}
          canEdit={!s.closedAt && (isAdmin || (canSell && s.userId === me.id && date === today))}
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
