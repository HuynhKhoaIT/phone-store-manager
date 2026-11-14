import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatMonth, isValidMonth, todayVN } from "@/lib/format";
import { loadKpiMonth } from "@/lib/kpi";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { StaffKpiView } from "../kpi/parts";

/** KPI của nhân viên đang đăng nhập: chỉ thấy của mình; lãi gộp chỉ hiện số tiền khi có quyền "Giá nhập & lãi". */
export default async function MyKpiPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requirePermission("kpi-self");
  // Admin không có ca nên không có KPI
  if (me.role === "ADMIN") redirect("/kpi");
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : todayVN().slice(0, 7);
  const data = await loadKpiMonth(month, { userId: me.id });

  return (
    <div className="space-y-5">
      <PageHeader title={`KPI của tôi — ${formatMonth(month)}`} subtitle="Chỉ tiêu, tiến độ và thưởng dự kiến (chưa chốt)" hideTitleOnMobile />
      <MonthNav path="/my-kpi" month={month} />
      <StaffKpiView kpi={data.staff[0]} config={data.bonusConfig} canCost={can(me, "cost-prices")} />
    </div>
  );
}
