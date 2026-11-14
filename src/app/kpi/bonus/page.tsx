import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatMonth, isValidMonth, todayVN } from "@/lib/format";
import { getBonusConfig, getKpiTemplates, toBonusConfig } from "@/lib/kpi";
import { describeConfig } from "@/lib/kpi-metrics";
import { deleteKpiTemplate, saveKpiBonusConfig, saveKpiTemplate } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { KpiTabs } from "../parts";
import { BonusConfigFields } from "./fields";

type Search = { month?: string; template?: string; editTemplate?: string; newTemplate?: string };

/**
 * Cấu hình thưởng: A (theo phần, cộng dồn) + B / C theo từng nhóm hàng, có trần tổng, kèm chỉ tiêu mặc định.
 * Mỗi lần lưu áp dụng từ tháng đang chọn trở đi, cho tới tháng có cấu hình mới hơn — các tháng trước giữ nguyên.
 * Mẫu cấu hình (Quán mới mở, Mùa cao điểm...): "Dùng mẫu" điền vào form (`?template=`), admin xem lại rồi Lưu;
 * sửa / thêm mẫu trong popup (`?editTemplate=` / `?newTemplate=1`).
 */
export default async function KpiBonusPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : todayVN().slice(0, 7);
  const [config, history, templates] = await Promise.all([
    getBonusConfig(month),
    prisma.kpiBonusConfig.findMany({ orderBy: { fromMonth: "desc" }, take: 24 }),
    getKpiTemplates(),
  ]);
  const base = `/kpi/bonus?month=${month}`;
  const using = templates.find((t) => t.id === Number(sp.template));
  const editing = templates.find((t) => t.id === Number(sp.editTemplate));
  const creating = sp.newTemplate === "1";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cấu hình thưởng KPI"
        subtitle="Thưởng theo phần (cộng dồn), hoa hồng doanh số, thưởng theo lợi nhuận — có mức tối đa"
        actions={
          <Link href={`${base}&newTemplate=1`} className="btn-secondary inline-flex items-center gap-1.5">
            <LayoutTemplate size={16} aria-hidden /> Thêm mẫu
          </Link>
        }
      />
      <KpiTabs active="bonus" month={month} />
      <MonthNav path="/kpi/bonus" month={month} />

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Mẫu cấu hình</h2>
          <p className="text-sm text-slate-500">
            Chọn mẫu phù hợp từng thời điểm → kiểm tra trong form bên dưới → Lưu để áp dụng từ {formatMonth(month)}. Sửa mẫu
            không làm đổi các tháng đã lưu.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <article
              key={t.id}
              className={`card flex flex-col gap-2 ${using?.id === t.id ? "ring-2 ring-[#1677ff]" : ""}`}
            >
              <h3 className="font-semibold">{t.name}</h3>
              {t.description && <p className="text-sm text-slate-600">{t.description}</p>}
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer text-[#1677ff]">Chi tiết</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {describeConfig(t.config).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <Link href={`${base}&template=${t.id}#config`} className="btn-primary py-1 text-sm">
                  Dùng mẫu này
                </Link>
                <Link href={`${base}&editTemplate=${t.id}`} className="btn-secondary py-1 text-sm">
                  Sửa
                </Link>
                <ConfirmButton action={deleteKpiTemplate.bind(null, t.id)} message={`Xoá mẫu "${t.name}"?`} className="ml-auto text-sm text-red-600 hover:underline">
                  Xoá
                </ConfirmButton>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section id="config" className="card scroll-mt-20 lg:col-span-2">
          <h2 className="mb-1 font-semibold">Cách thưởng áp dụng cho {formatMonth(month)}</h2>
          {using ? (
            <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Đang điền từ mẫu <b>{using.name}</b> — kiểm tra, sửa nếu cần rồi bấm Lưu để áp dụng từ {formatMonth(month)}.{" "}
              <Link href={base} className="font-medium underline">
                Bỏ
              </Link>
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              {config.fromMonth ? `Đang dùng cấu hình từ ${formatMonth(config.fromMonth)}.` : "Chưa cấu hình — đang dùng mặc định."}{" "}
              Lưu sẽ áp dụng từ {formatMonth(month)} trở đi. Tổng thưởng = các phần đạt được + B / C, không vượt mức tối đa.
            </p>
          )}
          <ActionForm
            key={`${month}-${using?.id ?? "current"}`}
            action={saveKpiBonusConfig}
            submitLabel={`Lưu, áp dụng từ ${formatMonth(month)}`}
            successMessage="Đã lưu cấu hình thưởng."
            redirectTo={base}
            className="space-y-5"
          >
            <input type="hidden" name="fromMonth" value={month} />
            <BonusConfigFields config={using?.config ?? config} />
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Lịch sử cấu hình</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa lưu lần nào.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <p className="font-medium">Từ {formatMonth(h.fromMonth)}</p>
                  {describeConfig(toBonusConfig(h)).map((line) => (
                    <p key={line} className="text-slate-600">
                      {line}
                    </p>
                  ))}
                  <p className="text-xs text-slate-400">{h.updatedBy}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(editing || creating) && (
        <FormDialog
          key={editing?.id ?? "new"}
          title={editing ? `Sửa mẫu "${editing.name}"` : "Thêm mẫu cấu hình"}
          defaultOpen
          closeHref={base}
        >
          <ActionForm
            action={saveKpiTemplate}
            submitLabel={editing ? "Lưu mẫu" : "Thêm mẫu"}
            successMessage={editing ? "Đã lưu mẫu." : "Đã thêm mẫu."}
            className="space-y-5"
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}
            {!editing && (
              <p className="text-sm text-slate-500">Bắt đầu từ cấu hình của {formatMonth(month)} — sửa lại cho mẫu mới.</p>
            )}
            <label className="field">
              <span>Tên mẫu *</span>
              <input name="name" required maxLength={60} defaultValue={editing?.name ?? ""} className="input" placeholder="VD: Khai trương chi nhánh 2" />
            </label>
            <label className="field">
              <span>Dùng khi nào</span>
              <textarea name="description" rows={2} defaultValue={editing?.description ?? ""} className="input" />
            </label>
            <BonusConfigFields config={editing?.config ?? config} />
          </ActionForm>
        </FormDialog>
      )}
    </div>
  );
}
