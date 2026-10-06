import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import Link from "next/link";
import type { ChecklistTask } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getActiveBranches } from "@/lib/branch";
import { todayVN } from "@/lib/format";
import { deleteChecklistTask, moveChecklistTask, saveChecklistTask } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

const SUGGESTIONS = ["Chấm công", "Vệ sinh quán", "Kiểm tra hàng hoá", "Tưới cây", "Đăng bài Facebook", "Đăng bài TikTok", "Chốt ngày"];

export default async function ChecklistPage({ searchParams }: { searchParams: Promise<{ edit?: string; page?: string }> }) {
  await requirePermission("checklist");
  const { edit, page } = await searchParams;
  const today = todayVN();
  const [tasks, branches, todayChecks] = await Promise.all([
    prisma.checklistTask.findMany({
      include: { branch: { select: { name: true } } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    getActiveBranches(),
    prisma.checklistCheck.findMany({ where: { date: today }, select: { taskId: true, branchId: true } }),
  ]);
  const editing = tasks.find((t) => t.id === Number(edit));
  const existingTitles = new Set(tasks.map((t) => t.title.toLowerCase()));
  // Lấy đủ danh sách (cần cho tiến độ + nút lên/xuống theo thứ tự chung), chỉ cắt khi hiển thị
  const paging = getPaging(tasks.length, page);
  const shownTasks = tasks.slice(0, paging.take);
  const backHref = pageHref("/checklist", {})(paging.page);
  const editHref = (id: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}edit=${id}`;

  // Tiến độ hôm nay theo chi nhánh
  const progress = branches.map((b) => {
    const applicable = tasks.filter((t) => t.active && (t.branchId === null || t.branchId === b.id));
    const done = applicable.filter((t) => todayChecks.some((c) => c.taskId === t.id && c.branchId === b.id)).length;
    return { branch: b, done, total: applicable.length };
  });

  const renderForm = (editing?: ChecklistTask) => (
    <ActionForm
      action={saveChecklistTask}
      submitLabel={editing ? "Lưu thay đổi" : "Thêm công việc"}
      successMessage={editing ? "Đã lưu thay đổi." : "Đã thêm công việc."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <label className="field">
        <span>Tên công việc *</span>
        <input
          name="title"
          required
          list="task-suggestions"
          defaultValue={editing?.title}
          className="input"
          placeholder="VD: Vệ sinh quán"
        />
        <datalist id="task-suggestions">
          {SUGGESTIONS.filter((s) => !existingTitles.has(s.toLowerCase())).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Hướng dẫn / ghi chú</span>
        <input
          name="description"
          defaultValue={editing?.description ?? ""}
          className="input"
          placeholder="VD: trước 9h sáng"
        />
      </label>
      <label className="field">
        <span>Áp dụng cho</span>
        <select name="branchId" defaultValue={editing?.branchId ?? ""} className="input">
          <option value="">Tất cả chi nhánh</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {editing && (
        <label className="field">
          <span>Trạng thái</span>
          <select name="active" defaultValue={String(editing.active)} className="input">
            <option value="true">Đang áp dụng</option>
            <option value="false">Tạm ẩn</option>
          </select>
        </label>
      )}
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Checklist công việc"
        subtitle="Việc nhân viên cần làm mỗi ngày"
        actions={
          true && (
            <FormDialog title="Thêm công việc" triggerLabel="Thêm công việc">
              {renderForm()}
            </FormDialog>
          )
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Sửa: ${editing.title}`} defaultOpen closeHref={backHref}>
          {renderForm(editing)}
        </FormDialog>
      )}


      <div className="card p-0 sm:p-0">
        {tasks.length === 0 ? (
          <p className="p-6 text-center text-slate-500">
            Chưa có công việc nào. Gợi ý: {SUGGESTIONS.join(", ")}.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shownTasks.map((t, i) => (
              <li
                key={t.id}
                className={`flex items-center gap-3 px-4 py-3 ${t.active ? "" : "opacity-50"} ${rowClass(paging, i)}`}
              >
                <div className="flex flex-col">
                  <ConfirmButton
                    action={moveChecklistTask.bind(null, t.id, -1)}
                    message=""
                    className="text-xs text-slate-400 hover:text-slate-900 disabled:invisible"
                    noConfirm
                    disabled={i === 0}
                  >
                    <ChevronUp size={14} aria-label="Lên" />
                  </ConfirmButton>
                  <ConfirmButton
                    action={moveChecklistTask.bind(null, t.id, 1)}
                    message=""
                    className="text-xs text-slate-400 hover:text-slate-900 disabled:invisible"
                    noConfirm
                    disabled={i === tasks.length - 1}
                  >
                    <ChevronDown size={14} aria-label="Xuống" />
                  </ConfirmButton>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t.title}
                    {!t.active && <span className="badge ml-2 bg-slate-100 text-slate-500">Tạm ẩn</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.branch ? t.branch.name : "Tất cả chi nhánh"}
                    {t.description && ` · ${t.description}`}
                  </p>
                </div>
                <Link href={editHref(t.id)} className="text-sm text-blue-600 hover:underline">
                  Sửa
                </Link>
                <ConfirmButton
                  action={deleteChecklistTask.bind(null, t.id)}
                  message={`Xoá "${t.title}"? Lịch sử đã tick của việc này cũng bị xoá. (Muốn giữ lịch sử thì chọn Sửa → Tạm ẩn)`}
                >
                  Xoá
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination paging={paging} href={pageHref("/checklist", {})} />
    </div>
  );
}
