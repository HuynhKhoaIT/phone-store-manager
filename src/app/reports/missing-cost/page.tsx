import Link from "next/link";
import { TriangleAlert, Wrench } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getBranches } from "@/lib/branch";
import { formatDate, formatVND, KIND_LABEL, todayVN } from "@/lib/format";
import { getPeriod, periodParams } from "@/lib/period";
import { saveRepairPrice, setTransactionCost } from "../../actions";
import { getRepairServiceNames, splitRepairName } from "@/lib/prices";
import { RepairPriceFields } from "@/components/RepairPriceFields";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { BranchFilter, DateRangeFilter, MonthNav } from "@/components/MonthNav";
import { ReportsTabs } from "@/components/ReportsTabs";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = {
  month?: string;
  from?: string;
  to?: string;
  branch?: string;
  kind?: string;
  q?: string;
  edit?: string;
  /** id đơn sửa chữa → popup thêm vào bảng giá sửa chữa (admin) */
  addRepair?: string;
  page?: string;
};

const KINDS = [
  { key: "", label: "Tất cả" },
  { key: "SALE", label: "Bán hàng" },
  { key: "REPAIR", label: "Sửa chữa" },
] as const;

/**
 * Giao dịch chưa có giá vốn (bán gõ tay, sản phẩm chưa nhập giá, sửa chữa gõ tay) — lãi của chúng đang tính bằng
 * cả doanh thu. Nhập giá vốn từng đơn để Dashboard / Báo cáo / Hoà vốn tính đúng. SIM / nạp card luôn có giá vốn.
 */
export default async function MissingCostPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("cost-prices");
  // Sửa bảng giá sửa chữa luôn chỉ admin
  const isAdmin = me.role === "ADMIN";
  const sp = await searchParams;
  const period = getPeriod(sp, todayVN());
  const branches = await getBranches();
  const branchId = branches.find((b) => b.id === Number(sp.branch))?.id;
  const kind = sp.kind === "SALE" || sp.kind === "REPAIR" ? sp.kind : "";
  const q = sp.q?.trim() ?? "";

  const base: Prisma.TransactionWhereInput = {
    costPrice: null,
    kind: kind || { in: ["SALE", "REPAIR"] },
    shift: { date: { gte: period.from, lte: period.to }, ...(branchId && { branchId }) },
  };
  const where: Prisma.TransactionWhereInput = {
    ...base,
    ...(q && { productName: { contains: q, mode: "insensitive" } }),
  };
  const [agg, frequent] = await Promise.all([
    prisma.transaction.aggregate({ where, _count: true, _sum: { price: true } }),
    // Tên gõ tay bán lặp lại → nên thêm vào Hàng hoá để lần sau có sẵn giá nhập
    prisma.transaction.groupBy({
      by: ["productName"],
      where: { ...base, kind: "SALE", productId: null },
      _count: { _all: true },
      _sum: { price: true },
      having: { productName: { _count: { gt: 1 } } },
      orderBy: { _count: { productName: "desc" } },
      take: 10,
    }),
  ]);
  const paging = getPaging(agg._count, sp.page);
  const [rows, addRepair, editing] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        shift: { select: { date: true, branchId: true, staffName: true } },
        product: { select: { id: true, costPrice: true } },
      },
      orderBy: [{ shift: { date: "desc" } }, { id: "desc" }],
      take: paging.take,
    }),
    isAdmin && sp.addRepair
      ? prisma.transaction.findFirst({ where: { id: Number(sp.addRepair) || 0, kind: "REPAIR" } })
      : null,
    sp.edit
      ? prisma.transaction.findUnique({
          where: { id: Number(sp.edit) || 0 },
          include: {
            shift: { select: { date: true } },
            product: { select: { id: true, name: true, costPrice: true } },
          },
        })
      : null,
  ]);
  // Đơn khác của cùng sản phẩm cũng thiếu giá vốn — sẽ được điền theo nếu cập nhật giá nhập sản phẩm
  const siblings =
    editing?.product && editing.product.costPrice == null
      ? await prisma.transaction.count({ where: { productId: editing.product.id, costPrice: null, id: { not: editing.id } } })
      : 0;

  const keep = periodParams(period);
  const filters = { ...keep, branch: branchId ? String(branchId) : "", kind, q };
  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, page: paging.page > 1 ? String(paging.page) : "", ...patch }))
      if (v) p.set(k, v);
    return `/reports/missing-cost?${p}`;
  };
  const branchName = (id: number) => branches.find((b) => b.id === id)?.name ?? "?";
  const services = addRepair ? await getRepairServiceNames() : [];
  const repairPrefill = addRepair ? splitRepairName(addRepair.productName, services) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Thiếu giá vốn — ${period.label}`}
        subtitle="Đơn chưa có giá nhập: lãi đang tính bằng cả doanh thu. Nhập giá vốn để báo cáo đúng."
      />

      <ReportsTabs active="missing-cost" />

      {editing && editing.costPrice == null && (
        <FormDialog key={editing.id} title="Nhập giá vốn" defaultOpen closeHref={href({ edit: "" })}>
          <ActionForm action={setTransactionCost} submitLabel="Lưu giá vốn" successMessage="Đã lưu giá vốn." className="grid gap-3">
            <input type="hidden" name="id" value={editing.id} />
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium">{editing.productName}</p>
              <p className="text-slate-500">
                {KIND_LABEL[editing.kind]} · {formatDate(editing.shift.date)} · Giá tiền {formatVND(editing.price)}
              </p>
            </div>
            <label className="field">
              <span>{editing.kind === "REPAIR" ? "Giá vốn (linh kiện) *" : "Giá vốn *"}</span>
              <MoneyInput name="costPrice" required />
              <small className="text-slate-500">Chỉ áp dụng cho đơn này.</small>
            </label>
            {editing.product && editing.product.costPrice == null && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="updateProduct" value="1" defaultChecked className="mt-0.5" />
                <span>
                  Cập nhật giá nhập cho sản phẩm <b>{editing.product.name}</b>
                  {siblings > 0 && ` và ${siblings} đơn khác của sản phẩm này đang thiếu giá vốn`}
                </span>
              </label>
            )}
          </ActionForm>
        </FormDialog>
      )}

      {addRepair && repairPrefill && (
        <FormDialog key={addRepair.id} title="Thêm vào bảng giá sửa chữa" defaultOpen closeHref={href({ addRepair: "" })}>
          <ActionForm
            action={saveRepairPrice}
            submitLabel="Thêm vào bảng giá"
            successMessage="Đã thêm vào bảng giá sửa chữa."
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="transactionId" value={addRepair.id} />
            <p className="col-span-full rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Từ đơn <b className="text-slate-900">{addRepair.productName}</b> ({formatVND(addRepair.price)}). Nhập giá nhập
              thì đơn này cũng được điền giá vốn.
            </p>
            <RepairPriceFields
              services={services}
              service={repairPrefill.service}
              device={repairPrefill.device}
              rows={[{ variant: repairPrefill.variant, price: addRepair.price, costPrice: null, warranty: null, note: null }]}
            />
          </ActionForm>
        </FormDialog>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <MonthNav path="/reports/missing-cost" month={period.month} params={{ branch: branchId, kind }} />
        <BranchFilter path="/reports/missing-cost" keep={{ ...keep, ...(kind && { kind }) }} branchId={branchId} branches={branches} />
        <DateRangeFilter path="/reports/missing-cost" period={period} branchId={branchId} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-sm text-slate-500">Đơn thiếu giá vốn</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{agg._count}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">Doanh thu chưa rõ lãi</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatVND(agg._sum.price ?? 0)}</p>
        </div>
      </div>

      {frequent.length > 0 && (
        <section className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            <TriangleAlert size={16} className="mr-1 inline align-text-bottom" aria-hidden />
            Hàng gõ tay bán nhiều lần — nên thêm vào Hàng hoá (có giá nhập) để lần sau chọn từ danh sách:
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {frequent.map((f) => (
              <li key={f.productName}>
                <Link href={href({ q: f.productName, page: "" })} className="badge bg-white text-amber-900 ring-1 ring-amber-200 hover:ring-amber-400">
                  {f.productName} · {f._count._all} lần
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={href({ kind: k.key, page: "" })}
            className={`rounded-md px-3 py-1 text-sm font-medium ring-1 ${
              kind === k.key ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900"
            }`}
          >
            {k.label}
          </Link>
        ))}
        <form action="/reports/missing-cost" className="flex w-full gap-2 sm:ml-auto sm:w-auto sm:max-w-xs sm:flex-1">
          {Object.entries({ ...keep, branch: filters.branch, kind }).map(
            ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
          )}
          <input name="q" defaultValue={q} placeholder="Tìm tên sản phẩm / dịch vụ..." className="input" />
          <button className="btn-secondary">Tìm</button>
        </form>
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Sản phẩm / Dịch vụ</th>
              <th>Chi nhánh</th>
              <th className="text-right">Giá tiền</th>
              <th>Lý do</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id} className={rowClass(paging, i)}>
                <td data-label="Ngày" className="whitespace-nowrap tabular-nums">
                  {formatDate(t.shift.date)}
                </td>
                <td data-title className="font-medium">
                  {t.productName}
                  <div className="text-xs font-normal text-slate-500">
                    {KIND_LABEL[t.kind]} · {t.shift.staffName}
                  </div>
                </td>
                <td data-label="Chi nhánh">{branchName(t.shift.branchId)}</td>
                <td data-label="Giá tiền" className="text-right font-semibold whitespace-nowrap tabular-nums">
                  {formatVND(t.price)}
                </td>
                <td data-label="Lý do" className="text-slate-600">
                  {t.product ? "Sản phẩm chưa có giá nhập" : t.kind === "REPAIR" ? "Gõ tay / bảng giá chưa có giá nhập" : "Bán ngoài danh sách hàng hoá"}
                </td>
                <td className="space-x-3 text-right whitespace-nowrap">
                  <Link href={href({ edit: String(t.id) })} className="text-sm font-medium text-[#1677ff] hover:underline">
                    Nhập giá vốn
                  </Link>
                  {isAdmin && t.kind === "REPAIR" && (
                    <Link
                      href={href({ addRepair: String(t.id) })}
                      className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-[#1677ff]"
                      title="Thêm vào bảng giá sửa chữa"
                    >
                      <Wrench size={14} aria-hidden /> Thêm vào bảng giá
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Không có đơn nào thiếu giá vốn trong kỳ này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/reports/missing-cost", { ...keep, branch: filters.branch, kind, q })} />
    </div>
  );
}
