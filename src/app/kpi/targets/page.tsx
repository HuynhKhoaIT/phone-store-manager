import Link from "next/link";
import { Copy, LayoutTemplate, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { addMonths, formatMonth, isValidMonth, todayVN } from "@/lib/format";
import { formatMetric, metricInfo, requiredMetrics, type MetricKey } from "@/lib/kpi-metrics";
import { getBonusConfig, getTargetTemplates, suggestTargets } from "@/lib/kpi";
import {
  applyKpiTargetTemplate,
  copyKpiTargets,
  deleteKpiTargetTemplate,
  saveKpiTargetTemplate,
  saveKpiTargets,
} from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { KpiTabs } from "../parts";
import { TargetRows, type RowValue } from "./rows";

type Search = { month?: string; edit?: string; tpl?: string; applyTpl?: string; editTpl?: string; newTpl?: string };

/**
 * Đặt chỉ tiêu KPI theo tháng cho từng nhân viên (popup `?edit=<userId>`, `&tpl=` điền từ mẫu), chép từ tháng trước,
 * mẫu bộ chỉ tiêu (áp cho nhiều người `?applyTpl=`, sửa `?editTpl=`, thêm `?newTpl=1`).
 * Cảnh báo khi thiếu chỉ tiêu mà cấu hình thưởng cần. Không ai tự đặt chỉ tiêu cho mình (trừ admin).
 */
export default async function KpiTargetsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("kpi");
  const isAdmin = me.role === "ADMIN";
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : todayVN().slice(0, 7);

  const [staff, targets, config, templates] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STAFF", active: true },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.kpiTarget.findMany({ where: { month }, orderBy: { id: "asc" } }),
    getBonusConfig(month),
    getTargetTemplates(),
  ]);
  const canSetFor = (userId: number) => isAdmin || userId !== me.id;
  const closeHref = `/kpi/targets?month=${month}`;

  // Chỉ tiêu cấu hình thưởng cần — thiếu thì phần thưởng đó (và các phần "cần đạt phần 1") không bao giờ đạt
  const required = requiredMetrics(config);
  const firstPart = config.partsEnabled ? config.parts[0] : undefined;
  const missingIn = (metrics: MetricKey[]) => [...required.keys()].filter((m) => !metrics.includes(m));
  const missingText = (missing: MetricKey[]) =>
    `Thiếu chỉ tiêu ${missing.map((m) => `"${metricInfo(m)?.label}"`).join(", ")} mà cấu hình thưởng cần — ${
      firstPart?.conditions.some((c) => c.type === "METRIC_PCT" && c.metric && missing.includes(c.metric))
        ? "không đạt được phần 1 nên sẽ không có thưởng theo phần."
        : `không đạt được phần ${[...new Set(missing.flatMap((m) => required.get(m) ?? []))].map((n) => `"${n}"`).join(", ")}.`
    }`;

  const editing = staff.find((s) => s.id === Number(sp.edit) && canSetFor(s.id));
  const fromTemplate = editing ? templates.find((t) => t.id === Number(sp.tpl)) : undefined;
  const applying = templates.find((t) => t.id === Number(sp.applyTpl));
  const editingTpl = templates.find((t) => t.id === Number(sp.editTpl));
  const creatingTpl = sp.newTpl === "1";

  // Form đặt chỉ tiêu một nhân viên: điền từ mẫu (nếu chọn) > chỉ tiêu đã có > gợi ý TB 3 tháng × % của cấu hình,
  // bật sẵn chỉ tiêu mặc định của cấu hình (có lịch sử thì chỉ bật chỉ tiêu có số; chưa có lịch sử thì bật hết để nhập tay)
  const suggestion = editing ? (await suggestTargets([editing.id], month, config.targetGrowthPct)).get(editing.id) : null;
  let editValues: Partial<Record<MetricKey, RowValue>> = {};
  if (editing) {
    const mine = targets.filter((t) => t.userId === editing.id);
    if (fromTemplate) for (const t of fromTemplate.targets) editValues[t.metric] = { ...t, active: true };
    else if (mine.length)
      for (const t of mine) editValues[t.metric as MetricKey] = { target: t.target, weight: t.weight, active: t.active };
    else
      editValues = Object.fromEntries(
        Object.entries(config.targetWeights).map(([k, w]) => {
          const hint = suggestion?.[k as MetricKey];
          return [k, { target: hint, weight: w, active: hint != null || !suggestion }];
        }),
      );
  }
  const templateValues = (t?: (typeof templates)[number]) =>
    Object.fromEntries((t?.targets ?? []).map((x) => [x.metric, { ...x, active: true }])) as Partial<Record<MetricKey, RowValue>>;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Chỉ tiêu KPI — ${formatMonth(month)}`}
        subtitle="Mục tiêu từng nhân viên trong tháng; % hoàn thành tính theo trọng số"
        actions={
          <ConfirmButton
            action={copyKpiTargets.bind(null, month)}
            message={`Chép chỉ tiêu ${formatMonth(addMonths(month, -1))} sang ${formatMonth(month)} cho những nhân viên tháng này chưa có chỉ tiêu?`}
            className="btn-secondary inline-flex items-center gap-1.5"
          >
            <Copy size={16} aria-hidden /> Chép từ tháng trước
          </ConfirmButton>
        }
      />
      <KpiTabs active="targets" month={month} />
      <MonthNav path="/kpi/targets" month={month} />

      <section className="card">
        {staff.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có tài khoản nhân viên nào.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Chỉ tiêu</th>
                <th>Cập nhật</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const mine = targets.filter((t) => t.userId === s.id);
                const missing = mine.length ? missingIn(mine.filter((t) => t.active).map((t) => t.metric as MetricKey)) : [];
                return (
                  <tr key={s.id}>
                    <td data-title>
                      <Link href={`/kpi/staff/${s.id}?month=${month}`} className="font-medium text-[#1677ff] hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td data-label="Chỉ tiêu">
                      <div>
                        {mine.length === 0 ? (
                          <span className="text-sm text-slate-400">Chưa đặt</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {mine.map((t) => {
                              const info = metricInfo(t.metric);
                              return (
                                <span
                                  key={t.id}
                                  className={`badge ${t.active ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-400 line-through"}`}
                                >
                                  {info?.label ?? t.metric}: {formatMetric(t.target, info?.unit ?? "")} ×{t.weight}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {missing.length > 0 && (
                          <p className="mt-1.5 flex items-start gap-1 text-left text-xs text-red-600">
                            <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
                            <span>{missingText(missing)}</span>
                          </p>
                        )}
                      </div>
                    </td>
                    <td data-label="Cập nhật" className="text-sm text-slate-500">
                      {mine[0]?.updatedBy ?? "—"}
                    </td>
                    <td className="text-right">
                      {canSetFor(s.id) ? (
                        <Link href={`${closeHref}&edit=${s.id}`} className="btn-secondary">
                          {mine.length ? "Sửa" : "Đặt chỉ tiêu"}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">Không tự đặt cho mình</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Chỉ tiêu tính trên giao dịch của các ca nhân viên đó trực, gộp mọi chi nhánh. Đơn huỷ (admin xoá) tự trừ ra; SIM,
          nạp card, đổi bảo hành không tính. Lợi nhuận gộp chỉ tính các đơn đã có giá vốn.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Mẫu chỉ tiêu</h2>
            <p className="text-sm text-slate-500">
              Áp một bộ chỉ tiêu cho nhiều nhân viên cùng lúc, hoặc chọn "Điền từ mẫu" khi đặt chỉ tiêu từng người. Số liệu mẫu là
              ví dụ — sửa theo thực tế quán.
            </p>
          </div>
          <Link href={`${closeHref}&newTpl=1`} className="btn-secondary inline-flex items-center gap-1.5">
            <LayoutTemplate size={16} aria-hidden /> Thêm mẫu
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const missing = missingIn(t.targets.map((x) => x.metric));
            return (
              <article key={t.id} className="card flex flex-col gap-2">
                <h3 className="font-semibold">{t.name}</h3>
                {t.description && <p className="text-sm text-slate-600">{t.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {t.targets.map((x) => {
                    const info = metricInfo(x.metric);
                    return (
                      <span key={x.metric} className="badge bg-blue-50 text-blue-800">
                        {info?.label}: {formatMetric(x.target, info?.unit ?? "")} ×{x.weight}
                      </span>
                    );
                  })}
                </div>
                {missing.length > 0 && (
                  <p className="flex items-start gap-1 text-xs text-red-600">
                    <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
                    <span>{missingText(missing)}</span>
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <Link href={`${closeHref}&applyTpl=${t.id}`} className="btn-primary py-1 text-sm">
                    Áp dụng
                  </Link>
                  <Link href={`${closeHref}&editTpl=${t.id}`} className="btn-secondary py-1 text-sm">
                    Sửa
                  </Link>
                  <ConfirmButton
                    action={deleteKpiTargetTemplate.bind(null, t.id)}
                    message={`Xoá mẫu "${t.name}"?`}
                    className="ml-auto text-sm text-red-600 hover:underline"
                  >
                    Xoá
                  </ConfirmButton>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {editing && (
        <FormDialog
          key={`${editing.id}-${month}-${fromTemplate?.id ?? ""}`}
          title={`Chỉ tiêu ${formatMonth(month)} — ${editing.name}`}
          defaultOpen
          closeHref={closeHref}
        >
          <ActionForm action={saveKpiTargets} submitLabel="Lưu chỉ tiêu" successMessage="Đã lưu chỉ tiêu KPI." className="space-y-4">
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="userId" value={editing.id} />
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-slate-500">Điền từ mẫu:</span>
              {templates.map((t) => (
                <Link
                  key={t.id}
                  href={`${closeHref}&edit=${editing.id}&tpl=${t.id}`}
                  replace
                  className={`rounded border px-2 py-0.5 ${
                    fromTemplate?.id === t.id ? "border-[#1677ff] bg-blue-50 text-[#1677ff]" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {t.name}
                </Link>
              ))}
            </div>
            <p className="text-sm text-slate-500">
              Tick để bật chỉ tiêu. Bỏ tick nhưng vẫn giữ mục tiêu = tạm tắt; xoá trắng mục tiêu = bỏ hẳn. Trọng số 1–10.{" "}
              {fromTemplate
                ? `Đang điền từ mẫu "${fromTemplate.name}" — sửa nếu cần rồi Lưu.`
                : suggestion
                  ? `Gợi ý = trung bình 3 tháng trước × ${config.targetGrowthPct}% (lãi gộp = trung bình).`
                  : "Chưa có lịch sử 3 tháng trước để gợi ý — nhập theo kỳ vọng của quán hoặc điền từ mẫu."}
            </p>
            <TargetRows values={editValues} hints={suggestion} required={required} />
            {staff.filter((s) => s.id !== editing.id && canSetFor(s.id)).length > 0 && (
              <fieldset className="rounded-md border border-slate-200 p-3">
                <legend className="px-1 text-sm font-medium text-slate-700">Áp dụng cùng chỉ tiêu cho</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {staff
                    .filter((s) => s.id !== editing.id && canSetFor(s.id))
                    .map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="alsoUserIds" value={s.id} className="size-4" />
                        {s.name}
                      </label>
                    ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Chỉ tiêu tháng này của những người được tick sẽ bị thay bằng bộ trên.</p>
              </fieldset>
            )}
          </ActionForm>
        </FormDialog>
      )}

      {applying && (
        <FormDialog key={`apply-${applying.id}`} title={`Áp dụng mẫu "${applying.name}" — ${formatMonth(month)}`} defaultOpen closeHref={closeHref}>
          <ActionForm action={applyKpiTargetTemplate} submitLabel="Áp dụng" successMessage="Đã áp dụng mẫu chỉ tiêu." className="space-y-4">
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="templateId" value={applying.id} />
            <div className="flex flex-wrap gap-1.5">
              {applying.targets.map((x) => {
                const info = metricInfo(x.metric);
                return (
                  <span key={x.metric} className="badge bg-blue-50 text-blue-800">
                    {info?.label}: {formatMetric(x.target, info?.unit ?? "")} ×{x.weight}
                  </span>
                );
              })}
            </div>
            <fieldset className="rounded-md border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-700">Áp dụng cho</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {staff
                  .filter((s) => canSetFor(s.id))
                  .map((s) => {
                    const has = targets.some((t) => t.userId === s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="userIds" value={s.id} defaultChecked={!has} className="size-4" />
                        {s.name}
                        {has && <span className="text-xs text-slate-400">(đã có chỉ tiêu)</span>}
                      </label>
                    );
                  })}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Chỉ tiêu {formatMonth(month)} của người được tick sẽ bị thay bằng mẫu. Muốn chỉnh riêng từng người thì bấm Sửa ở
                bảng sau khi áp dụng.
              </p>
            </fieldset>
          </ActionForm>
        </FormDialog>
      )}

      {(editingTpl || creatingTpl) && (
        <FormDialog
          key={`tpl-${editingTpl?.id ?? "new"}`}
          title={editingTpl ? `Sửa mẫu "${editingTpl.name}"` : "Thêm mẫu chỉ tiêu"}
          defaultOpen
          closeHref={closeHref}
        >
          <ActionForm
            action={saveKpiTargetTemplate}
            submitLabel={editingTpl ? "Lưu mẫu" : "Thêm mẫu"}
            successMessage={editingTpl ? "Đã lưu mẫu." : "Đã thêm mẫu."}
            className="space-y-4"
          >
            {editingTpl && <input type="hidden" name="id" value={editingTpl.id} />}
            <label className="field">
              <span>Tên mẫu *</span>
              <input
                name="name"
                required
                maxLength={60}
                defaultValue={editingTpl?.name ?? ""}
                className="input"
                placeholder="VD: Bán hàng – chi nhánh 2"
              />
            </label>
            <label className="field">
              <span>Dùng cho ai / khi nào</span>
              <textarea name="description" rows={2} defaultValue={editingTpl?.description ?? ""} className="input" />
            </label>
            <TargetRows
              values={
                editingTpl
                  ? templateValues(editingTpl)
                  : (Object.fromEntries(
                      Object.entries(config.targetWeights).map(([k, w]) => [k, { weight: w, active: true }]),
                    ) as Partial<Record<MetricKey, RowValue>>)
              }
              required={required}
            />
          </ActionForm>
        </FormDialog>
      )}
    </div>
  );
}
