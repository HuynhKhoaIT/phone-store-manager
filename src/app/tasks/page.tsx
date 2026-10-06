import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getCurrentBranch } from "@/lib/branch";
import { getDayChecklist } from "@/lib/checklist";
import { ADMIN_TASKS, periodKey } from "@/lib/admin-tasks";
import { addDays, dateVN, formatDate, formatDateLong, formatTimeVN, isValidDate, todayVN } from "@/lib/format";
import { AdminChecklist } from "@/components/AdminChecklist";
import { DailyChecklist } from "@/components/DailyChecklist";
import { NavInput } from "@/components/NavInput";
import { PageHeader } from "@/components/PageHeader";

/** Việc cần làm: admin thấy việc của chủ quán, nhân viên thấy checklist của chi nhánh. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await requirePermission("sell");
  const isAdmin = me.role === "ADMIN";
  const today = todayVN();
  const { date: param } = await searchParams;
  // Nhân viên chỉ làm việc của hôm nay; admin xem lại được ngày khác
  const date = isAdmin && param && isValidDate(param) ? param : today;

  const nav = isAdmin && (
    <div className="flex items-center gap-2">
      <Link href={`/tasks?date=${addDays(date, -1)}`} className="btn-secondary" aria-label="Ngày trước">
        <ChevronLeft size={16} aria-hidden />
      </Link>
      <NavInput type="date" value={date} hrefPrefix="/tasks?date=" label="Chọn ngày" />
      <Link href={`/tasks?date=${addDays(date, 1)}`} className="btn-secondary" aria-label="Ngày sau">
        <ChevronRight size={16} aria-hidden />
      </Link>
      {date !== today && (
        <Link href="/tasks" className="btn-secondary">
          Hôm nay
        </Link>
      )}
    </div>
  );
  const title = formatDateLong(date);

  if (isAdmin) {
    // Kỳ (ngày / tuần / tháng) chứa ngày đang xem — để biết việc nào đã làm
    const periods = ADMIN_TASKS.map((t) => periodKey(t.period, date));
    const checks = await prisma.adminCheck.findMany({ where: { period: { in: [...new Set(periods)] } } });
    const items = ADMIN_TASKS.map((t, i) => {
      const check = checks.find((c) => c.taskKey === t.key && c.period === periods[i]);
      return {
        ...t,
        doneBy: check ? (check.userName === me.name ? "Bạn" : check.userName) : null,
        // Việc tuần / tháng có thể tick từ hôm khác → ghi kèm ngày
        doneAt: check
          ? t.period === "day"
            ? formatTimeVN(check.doneAt)
            : `${formatDate(dateVN(check.doneAt)).slice(0, 5)} ${formatTimeVN(check.doneAt)}`
          : null,
      };
    });
    return (
      <div className="space-y-5">
        <PageHeader title={title} subtitle={`Việc của chủ quán${date === today ? " · Hôm nay" : ""}`} actions={nav} />
        <AdminChecklist date={date} items={items} />
      </div>
    );
  }

  const branch = await getCurrentBranch();
  if (!branch) redirect("/choose-branch");
  const checklist = await getDayChecklist(date, branch.id);
  const items = checklist.map(({ task, check }) => ({
    taskId: task.id,
    title: task.title,
    description: task.description,
    doneBy: check ? (check.user.id === me.id ? "Bạn" : check.user.name) : null,
    doneAt: check ? formatTimeVN(check.doneAt) : null,
    canToggle: !check || check.user.id === me.id,
  }));
  return (
    <div className="space-y-5">
      <PageHeader title={title} subtitle={`${branch.name} · Hôm nay`} />
      {items.length === 0 ? (
        <p className="card text-center text-slate-500">Hôm nay chưa có việc nào cần làm.</p>
      ) : (
        <DailyChecklist date={date} items={items} editable />
      )}
    </div>
  );
}
