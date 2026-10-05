import Link from "next/link";
import { ArrowLeftRight, ArrowRight, ChevronLeft, ChevronRight, PackagePlus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveBranches, getCurrentBranch } from "@/lib/branch";
import { productLabel } from "@/lib/product-labels";
import { addMonths, formatDate, formatMonth, formatVND, isValidMonth, todayVN } from "@/lib/format";
import { addStockTransfer, deleteStockTransfer } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { NavInput } from "@/components/NavInput";
import { PageHeader } from "@/components/PageHeader";
import { ProductPicker } from "@/components/ProductPicker";
import { ProductsTabs } from "@/components/ProductsTabs";

type Search = { month?: string; type?: string };

const TYPE_LABEL: Record<string, string> = { IMPORT: "Nhập từ NCC", TRANSFER: "Chuyển chi nhánh" };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const today = todayVN();
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);
  const type = sp.type === "IMPORT" || sp.type === "TRANSFER" ? sp.type : "";

  const where: Prisma.StockTransferWhereInput = { date: { startsWith: month }, ...(type && { type }) };
  const [branches, current, rows, products] = await Promise.all([
    getActiveBranches(),
    getCurrentBranch(),
    prisma.stockTransfer.findMany({
      where,
      include: { fromBranch: true, toBranch: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    // Sản phẩm để chọn khi tạo phiếu (không gửi giá nhập xuống client)
    prisma.product.findMany({
      where: { active: true, soldBranchId: null },
      select: { id: true, name: true, variant: true, condition: true, code: true, ramGb: true, storageGb: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const options = products.map((p) => ({ id: p.id, label: productLabel(p) }));
  const otherBranch = branches.find((b) => b.id !== current?.id);
  const totalQty = rows.reduce((s, t) => s + t.quantity, 0);
  const importValue = rows.reduce((s, t) => s + (t.type === "IMPORT" && t.unitCost != null ? t.unitCost * t.quantity : 0), 0);

  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ month, type, ...patch })) if (v) p.set(k, v);
    return `/products/receipts?${p}`;
  };

  const branchSelect = (name: string, defaultValue?: number) => (
    <select name={name} required defaultValue={defaultValue} className="input">
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
  const common = (
    <>
      <label className="field sm:col-span-2">
        <span>Sản phẩm *</span>
        <ProductPicker options={options} required />
      </label>
      <label className="field">
        <span>Số lượng *</span>
        <input name="quantity" type="number" min={1} defaultValue={1} required className="input" />
      </label>
      <label className="field">
        <span>Ngày *</span>
        <input name="date" type="date" required defaultValue={today} max={isAdmin ? undefined : today} className="input" />
      </label>
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hàng hoá"
        subtitle="Phiếu nhập hàng từ nhà cung cấp và chuyển hàng giữa chi nhánh"
        actions={
          <>
            <FormDialog
              title="Nhập hàng từ nhà cung cấp"
              triggerLabel="Nhập hàng"
              triggerIcon={<PackagePlus size={16} aria-hidden />}
            >
              <ActionForm
                action={addStockTransfer}
                submitLabel="Lưu phiếu nhập"
                successMessage="Đã lưu phiếu nhập hàng."
                className="grid gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="type" value="IMPORT" />
                {common}
                <label className="field">
                  <span>Nhập về chi nhánh *</span>
                  {branchSelect("toBranchId", current?.id)}
                </label>
                <label className="field">
                  <span>Nhà cung cấp</span>
                  <input name="supplier" className="input" placeholder="VD: Kho Hải Phòng" />
                </label>
                {isAdmin && (
                  <label className="field">
                    <span>Giá nhập / cái</span>
                    <MoneyInput name="unitCost" />
                    <small className="text-slate-500">Sẽ cập nhật giá nhập của sản phẩm (để tính lãi).</small>
                  </label>
                )}
                <label className="field sm:col-span-2">
                  <span>Ghi chú</span>
                  <input name="note" className="input" />
                </label>
              </ActionForm>
            </FormDialog>
            <FormDialog
              title="Chuyển hàng giữa chi nhánh"
              triggerLabel="Chuyển hàng"
              triggerVariant="secondary"
              triggerIcon={<ArrowLeftRight size={16} aria-hidden />}
            >
              <ActionForm
                action={addStockTransfer}
                submitLabel="Lưu phiếu chuyển"
                successMessage="Đã lưu phiếu chuyển hàng."
                className="grid gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="type" value="TRANSFER" />
                {common}
                <label className="field">
                  <span>Lấy từ chi nhánh *</span>
                  {branchSelect("fromBranchId", otherBranch?.id)}
                </label>
                <label className="field">
                  <span>Chuyển về chi nhánh *</span>
                  {branchSelect("toBranchId", current?.id)}
                </label>
                <label className="field sm:col-span-2">
                  <span>Ghi chú</span>
                  <input name="note" className="input" />
                </label>
              </ActionForm>
            </FormDialog>
          </>
        }
      />

      <ProductsTabs active="receipts" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md bg-white p-0.5 ring-1 ring-slate-200">
          {[
            ["", "Tất cả"],
            ["IMPORT", "Nhập từ NCC"],
            ["TRANSFER", "Chuyển chi nhánh"],
          ].map(([v, l]) => (
            <Link
              key={v}
              href={qs({ type: v })}
              className={`rounded px-3 py-1.5 text-sm ${type === v ? "bg-[#1677ff] font-medium text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={qs({ month: addMonths(month, -1) })} className="btn-secondary" aria-label="Tháng trước">
            <ChevronLeft size={16} aria-hidden />
          </Link>
          <NavInput
            type="month"
            value={month}
            hrefPrefix="/products/receipts?month="
            hrefSuffix={type ? `&type=${type}` : ""}
            label="Chọn tháng"
          />
          <Link href={qs({ month: addMonths(month, 1) })} className="btn-secondary" aria-label="Tháng sau">
            <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {formatMonth(month)} · {rows.length} phiếu · {totalQty} sản phẩm
        {isAdmin && importValue > 0 && <> · Tổng tiền nhập {formatVND(importValue)}</>}
      </p>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Loại phiếu</th>
              <th>Ngày</th>
              <th className="text-right">SL</th>
              <th>Từ / Đến</th>
              {isAdmin && <th className="text-right">Giá nhập</th>}
              <th>Người ghi</th>
              <th>Ghi chú</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td data-title className="font-medium">
                  {t.productName}
                </td>
                <td data-label="Loại phiếu">
                  <span
                    className={`badge ${t.type === "IMPORT" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}
                  >
                    {TYPE_LABEL[t.type]}
                  </span>
                </td>
                <td data-label="Ngày" className="whitespace-nowrap">
                  {formatDate(t.date)}
                </td>
                <td data-label="Số lượng" className="text-right font-semibold tabular-nums">
                  {t.quantity}
                </td>
                <td data-label="Từ / Đến" className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {t.type === "IMPORT" ? t.supplier || "Nhà cung cấp" : t.fromBranch?.name}
                    <ArrowRight size={14} className="text-slate-400" aria-hidden />
                    <b>{t.toBranch.name}</b>
                  </span>
                </td>
                {isAdmin && (
                  <td data-label="Giá nhập" className="text-right whitespace-nowrap tabular-nums">
                    {t.unitCost != null ? (
                      <span>
                        {formatVND(t.unitCost)}
                        {t.quantity > 1 && (
                          <span className="block text-xs text-slate-500">= {formatVND(t.unitCost * t.quantity)}</span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td data-label="Người ghi">{t.staffName}</td>
                <td data-label="Ghi chú" className="text-slate-600">
                  {t.note}
                </td>
                {isAdmin && (
                  <td>
                    <ConfirmButton action={deleteStockTransfer.bind(null, t.id)} message="Xoá phiếu này?">
                      Xoá
                    </ConfirmButton>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Chưa có phiếu nào trong tháng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
