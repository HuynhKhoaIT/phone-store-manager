import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatMonth, isValidMonth, todayVN } from "@/lib/format";
import { getUnclassifiedSales, loadKpiMonth } from "@/lib/kpi";
import { saveKpiReview } from "../../../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { StaffKpiView } from "../../parts";

/** KPI chi tiết một nhân viên trong tháng (quản lý xem) — phân loại được đơn bán gõ tay */
export default async function StaffKpiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await requirePermission("kpi");
  const userId = Number((await params).id) || 0;
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : todayVN().slice(0, 7);

  const [data, unclassified] = await Promise.all([loadKpiMonth(month, { userId }), getUnclassifiedSales(month, userId)]);
  // Chỉ tài khoản nhân viên mới có KPI
  const kpi = data.staff[0];
  if (!kpi) notFound();
  // Không tự đặt chỉ tiêu cho mình (trừ admin)
  const canSet = me.role === "ADMIN" || me.id !== userId;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`KPI ${kpi.user.name} — ${formatMonth(month)}`}
        subtitle={
          <Link href={`/kpi?month=${month}`} className="text-[#1677ff] hover:underline">
            ← Tổng quan KPI
          </Link>
        }
      />
      <MonthNav path={`/kpi/staff/${userId}`} month={month} />
      <StaffKpiView
        kpi={kpi}
        config={data.bonusConfig}
        canCost={can(me, "cost-prices")}
        unclassified={unclassified}
        reviewForm={
          canSet && (
            <FormDialog
              title={`Đánh giá ${kpi.user.name} — ${formatMonth(month)}`}
              triggerLabel={kpi.facts.review ? "Sửa đánh giá" : "Đánh giá"}
              triggerVariant="secondary"
            >
              <ActionForm action={saveKpiReview} submitLabel="Lưu đánh giá" successMessage="Đã lưu đánh giá." className="space-y-3">
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="userId" value={userId} />
                <div className="flex gap-4">
                  {[
                    ["PASS", "Đạt"],
                    ["FAIL", "Không đạt"],
                  ].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-1.5 text-sm font-medium">
                      <input
                        type="radio"
                        name="result"
                        value={value}
                        required
                        defaultChecked={kpi.facts.review ? kpi.facts.review.passed === (value === "PASS") : false}
                        className="size-4"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="field">
                  <span>Nhận xét (bắt buộc khi Không đạt)</span>
                  <textarea name="note" rows={3} defaultValue={kpi.facts.review?.note ?? ""} className="input" />
                </label>
              </ActionForm>
            </FormDialog>
          )
        }
        emptyAction={
          canSet && (
            <Link href={`/kpi/targets?month=${month}&edit=${userId}`} className="btn-primary">
              Đặt chỉ tiêu
            </Link>
          )
        }
      />
    </div>
  );
}
