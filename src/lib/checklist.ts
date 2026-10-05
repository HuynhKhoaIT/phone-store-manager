import { prisma } from "./db";

/** Danh sách việc của một ngày tại chi nhánh, kèm thông tin ai đã làm. */
export async function getDayChecklist(date: string, branchId: number) {
  const [tasks, checks] = await Promise.all([
    prisma.checklistTask.findMany({
      where: {
        OR: [{ branchId: null }, { branchId }],
        // Việc đã ẩn vẫn hiện ở những ngày từng được làm
        AND: [{ OR: [{ active: true }, { checks: { some: { date, branchId } } }] }],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.checklistCheck.findMany({
      where: { date, branchId },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);
  const byTask = new Map(checks.map((c) => [c.taskId, c]));
  return tasks.map((t) => ({ task: t, check: byTask.get(t.id) ?? null }));
}
