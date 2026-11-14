import Link from "next/link";
import { ArrowLeftRight, ArrowRight, PackagePlus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranches, getCurrentBranch } from "@/lib/branch";
import { isSingleUnit, productLabel } from "@/lib/product-labels";
import { RECEIPT_TYPE_LABEL, backfillReceipts, fundLabel, receiptTotal } from "@/lib/receipts";
import { formatDate, formatMonth, formatVND, isValidMonth, todayVN } from "@/lib/format";
import { addStockReceipt, deleteStockReceipt, updateStockReceipt } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DatePicker } from "@/components/DatePicker";
import { FormDialog } from "@/components/FormDialog";
import { FundSelect, fundValue } from "@/components/FundSelect";
import { MonthNav } from "@/components/MonthNav";
import { PageHeader } from "@/components/PageHeader";
import { ProductsTabs } from "@/components/ProductsTabs";
import { ReceiptLines } from "@/components/ReceiptLines";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { month?: string; type?: string; page?: string; edit?: string };

const FUND_BADGE: Record<string, string> = {
  STORE: "bg-slate-100 text-slate-700",
  INVESTOR: "bg-violet-100 text-violet-800",
};

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("products");
  const isAdmin = me.role === "ADMIN";
  const canCost = can(me, "cost-prices");
  // Nguồn tiền (quỹ cửa hàng / tiền người góp vốn) gắn với Sổ góp vốn → cần quyền Hoà vốn & góp vốn
  const canFund = can(me, "capital");
  const today = todayVN();
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);
  const type = sp.type === "IMPORT" || sp.type === "TRANSFER" ? sp.type : "";

  // Dòng phiếu cũ (mỗi dòng một phiếu) → gắn vào phiếu trước khi đọc
  await backfillReceipts();

  const where: Prisma.StockReceiptWhereInput = { date: { startsWith: month }, ...(type && { type }) };
  const [branches, current, all, products, investors] = await Promise.all([
    getActiveBranches(),
    getCurrentBranch(),
    // Bản gọn của cả tháng để tính tổng (không phụ thuộc trang đang xem)
    prisma.stockReceipt.findMany({
      where,
      select: {
        type: true,
        fundSource: true,
        investor: { select: { name: true } },
        items: { select: { quantity: true, unitCost: true } },
      },
    }),
    // Sản phẩm để chọn khi tạo phiếu (không gửi giá nhập xuống client)
    prisma.product.findMany({
      where: { active: true, soldBranchId: null },
      select: {
        id: true,
        category: true,
        name: true,
        variant: true,
        condition: true,
        code: true,
        ramGb: true,
        storageGb: true,
        ownerBranch: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    canFund
      ? prisma.investor.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
  ]);
  const paging = getPaging(all.length, sp.page);
  const [rows, editing] = await Promise.all([
    prisma.stockReceipt.findMany({
      where,
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        investor: { select: { name: true } },
        items: { select: { id: true, productName: true, quantity: true, unitCost: true }, orderBy: { id: "asc" } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: paging.take,
    }),
    canFund && sp.edit
      ? prisma.stockReceipt.findUnique({
          where: { id: Number(sp.edit) || 0 },
          include: { investor: { select: { name: true } } },
        })
      : null,
  ]);
  // Cùng một phụ kiện ở 2 quán là 2 dòng → ghi kèm tên quán để chọn đúng
  const options = products.map((p) => ({
    id: p.id,
    label: p.ownerBranch ? `${productLabel(p)} · ${p.ownerBranch.name}` : productLabel(p),
    single: isSingleUnit(p),
  }));
  const otherBranch = branches.find((b) => b.id !== current?.id);

  // Tổng tháng: số phiếu, số sản phẩm, tiền nhập theo nguồn tiền
  const totalQty = all.reduce((s, r) => s + r.items.reduce((q, i) => q + i.quantity, 0), 0);
  const imports = all.filter((r) => r.type === "IMPORT");
  const importValue = imports.reduce((s, r) => s + receiptTotal(r.items).total, 0);
  const byFund = new Map<string, number>();
  for (const r of imports) {
    const label = fundLabel(r);
    byFund.set(label, (byFund.get(label) ?? 0) + receiptTotal(r.items).total);
  }

  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { month, type, page: paging.page > 1 ? String(paging.page) : "", ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/products/receipts?${p}`;
  };
  const backHref = qs({});

  const branchSelect = (name: string, defaultValue?: number) => (
    <select name={name} required defaultValue={defaultValue} className="input">
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
  // Nhân viên không ghi được ngày tương lai (server kiểm tra)
  const dateField = (
    <div className="field">
      <span>Ngày *</span>
      <DatePicker name="date" value={today} label="Ngày phiếu" required />
    </div>
  );
  // Tiền nhập hàng từ đâu: quỹ cửa hàng hay tiền riêng của một người góp vốn (→ tự ghi Sổ góp vốn)
  const fundField = (defaultValue: string, keep?: { id: number; name: string }) => (
    <FundSelect
      investors={investors}
      defaultValue={defaultValue}
      keep={keep}
      hint="Tiền của người góp vốn sẽ tự ghi vào Sổ góp vốn (chi nhánh nhận hàng) bằng tổng tiền phiếu."
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hàng hoá"
        subtitle="Phiếu nhập hàng từ nhà cung cấp và chuyển hàng giữa chi nhánh"
        hideTitleOnMobile
        actions={
          <>
            <FormDialog
              title="Phiếu nhập hàng từ nhà cung cấp"
              triggerLabel="Nhập hàng"
              triggerIcon={<PackagePlus size={16} aria-hidden />}
            >
              <ActionForm
                action={addStockReceipt}
                submitLabel="Lưu phiếu nhập"
                successMessage="Đã lưu phiếu nhập hàng."
                className="grid gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="type" value="IMPORT" />
                {dateField}
                <label className="field">
                  <span>Nhập về chi nhánh *</span>
                  {branchSelect("toBranchId", current?.id)}
                </label>
                <label className="field">
                  <span>Nhà cung cấp</span>
                  <input name="supplier" className="input" placeholder="VD: Kho Hải Phòng" />
                </label>
                {canFund && fundField("STORE")}
                <ReceiptLines options={options} withCost={canCost} />
                {canCost && (
                  <p className="col-span-full -mt-1 text-xs text-slate-500">
                    Giá nhập sẽ cập nhật giá nhập của sản phẩm (để tính lãi và giá trị tồn kho).
                  </p>
                )}
                <label className="field sm:col-span-2">
                  <span>Ghi chú</span>
                  <input name="note" className="input" />
                </label>
                <p className="col-span-full text-xs text-slate-500">Người ghi phiếu: {me.name}</p>
              </ActionForm>
            </FormDialog>
            <FormDialog
              title="Phiếu chuyển hàng giữa chi nhánh"
              triggerLabel="Chuyển hàng"
              triggerVariant="secondary"
              triggerIcon={<ArrowLeftRight size={16} aria-hidden />}
            >
              <ActionForm
                action={addStockReceipt}
                submitLabel="Lưu phiếu chuyển"
                successMessage="Đã lưu phiếu chuyển hàng."
                className="grid gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="type" value="TRANSFER" />
                {dateField}
                <div className="hidden sm:block" />
                <label className="field">
                  <span>Lấy từ chi nhánh *</span>
                  {branchSelect("fromBranchId", otherBranch?.id)}
                </label>
                <label className="field">
                  <span>Chuyển về chi nhánh *</span>
                  {branchSelect("toBranchId", current?.id)}
                </label>
                <ReceiptLines options={options} withCost={false} />
                <label className="field sm:col-span-2">
                  <span>Ghi chú</span>
                  <input name="note" className="input" />
                </label>
              </ActionForm>
            </FormDialog>
          </>
        }
      />

      {editing && editing.type === "IMPORT" && (
        <FormDialog key={editing.id} title={`Phiếu nhập #${editing.id}`} defaultOpen closeHref={backHref}>
          <ActionForm
            action={updateStockReceipt}
            submitLabel="Lưu thay đổi"
            successMessage="Đã cập nhật phiếu nhập."
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={editing.id} />
            {fundField(
              fundValue(editing),
              editing.investorId && editing.investor ? { id: editing.investorId, name: editing.investor.name } : undefined,
            )}
            <label className="field">
              <span>Nhà cung cấp</span>
              <input name="supplier" defaultValue={editing.supplier ?? ""} className="input" />
            </label>
            <label className="field sm:col-span-2">
              <span>Ghi chú</span>
              <input name="note" defaultValue={editing.note ?? ""} className="input" />
            </label>
            <p className="col-span-full text-xs text-slate-500">
              Không sửa được hàng trong phiếu — ghi sai thì admin xoá phiếu (hoàn lại số lượng) rồi ghi lại.
            </p>
          </ActionForm>
        </FormDialog>
      )}

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
              href={qs({ type: v, page: "" })}
              className={`rounded px-3 py-1.5 text-sm ${type === v ? "bg-[#1677ff] font-medium text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <MonthNav path="/products/receipts" month={month} params={{ type }} />
        </div>
      </div>

      <div className="space-y-1 text-sm text-slate-500">
        <p>
          {formatMonth(month)} · {all.length} phiếu · {totalQty} sản phẩm
          {canCost && importValue > 0 && <> · Tổng tiền nhập {formatVND(importValue)}</>}
        </p>
        {canCost && canFund && importValue > 0 && (
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            {[...byFund].map(([label, amount]) => (
              <span key={label}>
                {label}: <b className="text-slate-700 tabular-nums">{formatVND(amount)}</b>
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Phiếu</th>
              <th>Hàng</th>
              <th>Từ / Đến</th>
              {canFund && <th>Tiền từ</th>}
              {canCost && <th className="text-right">Tổng tiền</th>}
              <th>Người ghi</th>
              <th>Ghi chú</th>
              {(isAdmin || canFund) && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const { total, missingCost } = receiptTotal(r.items);
              const qty = r.items.reduce((s, t) => s + t.quantity, 0);
              return (
                <tr key={r.id} className={rowClass(paging, i)}>
                  <td data-title className="whitespace-nowrap">
                    <span>
                      <span className="font-medium">#{r.id}</span> · {formatDate(r.date)}
                      <span
                        className={`badge ml-2 ${r.type === "IMPORT" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}
                      >
                        {RECEIPT_TYPE_LABEL[r.type]}
                      </span>
                    </span>
                  </td>
                  <td data-label={`Hàng (${qty})`} className="sm:min-w-64">
                    <ul className="space-y-0.5 text-sm">
                      {r.items.map((t) => (
                        <li key={t.id}>
                          {t.productName} <b className="tabular-nums">× {t.quantity}</b>
                          {canCost && r.type === "IMPORT" && (
                            <span className="text-xs text-slate-500 tabular-nums">
                              {" "}
                              · {t.unitCost != null ? formatVND(t.unitCost) : "chưa có giá nhập"}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td data-label="Từ / Đến" className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {r.type === "IMPORT" ? r.supplier || "Nhà cung cấp" : r.fromBranch?.name}
                      <ArrowRight size={14} className="text-slate-400" aria-hidden />
                      <b>{r.toBranch.name}</b>
                    </span>
                  </td>
                  {canFund && (
                    <td data-label="Tiền từ">
                      {r.type === "IMPORT" ? (
                        <span className={`badge ${FUND_BADGE[r.fundSource ?? ""] ?? "bg-amber-100 text-amber-800"}`}>
                          {fundLabel(r)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  )}
                  {canCost && (
                    <td data-label="Tổng tiền" className="text-right whitespace-nowrap tabular-nums">
                      {r.type === "IMPORT" && total > 0 ? (
                        <span>
                          <b>{formatVND(total)}</b>
                          {missingCost && <span className="block text-xs text-amber-700">thiếu giá nhập</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td data-label="Người ghi">{r.staffName}</td>
                  <td data-label="Ghi chú" className="text-slate-600">
                    {r.note}
                  </td>
                  {(isAdmin || canFund) && (
                    <td className="space-x-3 text-right whitespace-nowrap">
                      {canFund && r.type === "IMPORT" && (
                        <Link href={qs({ edit: String(r.id) })} className="text-sm text-[#1677ff] hover:underline">
                          Sửa
                        </Link>
                      )}
                      {isAdmin && (
                        <ConfirmButton
                          action={deleteStockReceipt.bind(null, r.id)}
                          message={`Xoá phiếu #${r.id} (${r.items.length} dòng)? Số lượng hàng sẽ được hoàn lại${r.fundSource === "INVESTOR" ? ", dòng góp vốn theo phiếu cũng bị xoá" : ""}.`}
                        >
                          Xoá
                        </ConfirmButton>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Chưa có phiếu nào trong tháng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/products/receipts", { month, type })} />
    </div>
  );
}
