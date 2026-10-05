import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveBranches, getCurrentBranch } from "@/lib/branch";
import { addMonths, formatDate, formatMonth, isValidMonth, todayVN } from "@/lib/format";
import { addStockTransfer, deleteStockTransfer } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { NavInput } from "@/components/NavInput";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const today = todayVN();
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);

  const [branches, current, transfers] = await Promise.all([
    getActiveBranches(),
    getCurrentBranch(),
    prisma.stockTransfer.findMany({
      where: { date: { startsWith: month } },
      include: { fromBranch: true, toBranch: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const otherBranch = branches.find((b) => b.id !== current?.id);
  const totalQty = transfers.reduce((s, t) => s + t.quantity, 0);

  const renderForm = () => (
    <ActionForm
      action={addStockTransfer}
      submitLabel="Lưu phiếu"
      successMessage="Đã lưu phiếu nhập hàng."
      className="grid gap-3 sm:grid-cols-2"
    >
      <label className="field">
        <span>Ngày *</span>
        <input name="date" type="date" required defaultValue={today} max={isAdmin ? undefined : today} className="input" />
      </label>
      <label className="field">
        <span>Lấy từ *</span>
        <select name="fromBranchId" defaultValue={otherBranch?.id} className="input">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Nhập về *</span>
        <select name="toBranchId" defaultValue={current?.id} className="input">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Sản phẩm *</span>
        <input name="productName" required className="input" placeholder="VD: Tai nghe ABC" />
      </label>
      <label className="field">
        <span>Số lượng *</span>
        <input name="quantity" type="number" min={1} defaultValue={1} required className="input" />
      </label>
      <label className="field sm:col-span-2 lg:col-span-3">
        <span>Ghi chú</span>
        <input name="note" className="input" />
      </label>
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhập hàng giữa chi nhánh"
        subtitle="Ghi lại hàng chuyển giữa các chi nhánh"
        actions={
          true && (
            <FormDialog title="Ghi phiếu nhập hàng" triggerLabel="Ghi phiếu nhập">
              {renderForm()}
            </FormDialog>
          )
        }
      />


      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {formatMonth(month)} · {transfers.length} phiếu · {totalQty} sản phẩm
        </h2>
        <div className="flex items-center gap-2">
          <Link href={`/transfers?month=${addMonths(month, -1)}`} className="btn-secondary" aria-label="Tháng trước">
            <ChevronLeft size={16} aria-hidden />
          </Link>
          <NavInput type="month" value={month} hrefPrefix="/transfers?month=" label="Chọn tháng" />
          <Link href={`/transfers?month=${addMonths(month, 1)}`} className="btn-secondary" aria-label="Tháng sau">
            <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Ngày</th>
              <th className="text-right">SL</th>
              <th>Từ / Đến</th>
              <th>Người ghi</th>
              <th>Ghi chú</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td data-title className="font-medium">
                  {t.productName}
                </td>
                <td data-label="Ngày" className="whitespace-nowrap">
                  {formatDate(t.date)}
                </td>
                <td data-label="Số lượng" className="text-right font-semibold tabular-nums">
                  {t.quantity}
                </td>
                <td data-label="Từ / Đến" className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {t.fromBranch.name} <ArrowRight size={14} className="text-slate-400" aria-hidden />{" "}
                    <b>{t.toBranch.name}</b>
                  </span>
                </td>
                <td data-label="Người ghi">{t.staffName}</td>
                <td data-label="Ghi chú" className="text-slate-600">
                  {t.note}
                </td>
                {isAdmin && (
                  <td>
                    <ConfirmButton action={deleteStockTransfer.bind(null, t.id)} message="Xoá phiếu nhập hàng này?">
                      Xoá
                    </ConfirmButton>
                  </td>
                )}
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Chưa có phiếu nhập hàng nào trong tháng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
