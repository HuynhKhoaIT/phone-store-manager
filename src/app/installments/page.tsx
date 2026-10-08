import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCurrentBranch } from "@/lib/branch";
import { formatDate, formatVND, PAYMENT_LABEL, todayVN } from "@/lib/format";
import { getRecentBankAccounts, getSaleSuggestions } from "@/lib/prices";
import { getPaging, pageHref, rowClass } from "@/lib/paging";
import { addTransaction, deleteInstallmentPayment, recordInstallmentPayment } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { InstallmentPaymentFields } from "@/components/InstallmentPaymentFields";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { TransactionFields } from "@/components/TransactionFields";

type Search = { status?: string; q?: string; page?: string; pay?: string };

const STATUS_TABS = [
  { key: "", label: "Chờ thanh toán" },
  { key: "paid", label: "Đã thanh toán đủ" },
  { key: "all", label: "Tất cả" },
] as const;

/**
 * Bán trả góp qua công ty tài chính: khách trả trước tại quầy, công ty tài chính trả phần còn lại sau.
 * Doanh thu tính đủ giá bán vào ngày bán (như bán thường); tiền nhận sau cộng vào ca đang làm.
 */
export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAnyPermission("sell", "installments-manage");
  const isAdmin = me.role === "ADMIN";
  // Xoá lần thu ghi sai: quyền "Quản lý trả góp"
  const canManage = can(me, "installments-manage");
  const branch = await getCurrentBranch();
  if (!branch) redirect("/choose-branch");
  const sp = await searchParams;
  const status = sp.status === "paid" || sp.status === "all" ? sp.status : "";
  const q = sp.q?.trim() ?? "";
  const today = todayVN();

  const base: Prisma.TransactionWhereInput = { financeCompany: { not: null }, shift: { branchId: branch.id } };
  const where: Prisma.TransactionWhereInput = {
    ...base,
    ...(status === "" && { financePaidAt: null }),
    ...(status === "paid" && { financePaidAt: { not: null } }),
    ...(q && {
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q.replace(/[ .-]/g, "") } },
        { productName: { contains: q, mode: "insensitive" } },
        { financeCompany: { contains: q, mode: "insensitive" } },
        { financeContract: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [total, pending, paidThisMonth, myShift, bankAccounts] = await Promise.all([
    prisma.transaction.count({ where }),
    // Thống kê luôn trên toàn bộ đơn của chi nhánh (không theo trang / bộ lọc)
    prisma.transaction.findMany({
      where: { ...base, financePaidAt: null },
      select: { price: true, downPayment: true, financePayments: { select: { amount: true } } },
    }),
    prisma.transaction.count({
      where: { ...base, financePaidAt: { gte: new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`) } },
    }),
    // Chỉ nhân viên vào ca — bán / ghi nhận tiền vào ca đang mở hôm nay
    isAdmin
      ? null
      : prisma.shift.findFirst({
          where: { userId: me.id, branchId: branch.id, date: today, closedAt: null },
          orderBy: { id: "desc" },
        }),
    getRecentBankAccounts(),
  ]);
  const paging = getPaging(total, sp.page);
  const rows = await prisma.transaction.findMany({
    where,
    include: {
      shift: { select: { date: true, staffName: true } },
      financePayments: { orderBy: { createdAt: "asc" }, include: { shift: { select: { closedAt: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: paging.take,
  });
  const remainingOf = (t: { price: number; downPayment: number | null; financePayments: { amount: number }[] }) =>
    t.price - (t.downPayment ?? 0) - t.financePayments.reduce((s, p) => s + p.amount, 0);
  const pendingAmount = pending.reduce((s, t) => s + remainingOf(t), 0);

  // Ghi nhận tiền: nhân viên cần đang trong ca (tiền vào ca); admin ghi sổ
  const canCollect = isAdmin || !!myShift;
  const paying = sp.pay && canCollect ? rows.find((t) => t.id === Number(sp.pay) && !t.financePaidAt) : undefined;
  const filters = { status, q };
  const closeHref = pageHref("/installments", { ...filters, page: undefined })(paging.page);

  const suggestions = myShift ? await getSaleSuggestions(branch.id) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bán trả góp"
        subtitle={`${branch.name} · trả trước tại quầy, công ty tài chính trả phần còn lại`}
        actions={
          myShift && suggestions ? (
            <FormDialog title="Bán trả góp" triggerLabel="Bán trả góp">
              <ActionForm
                action={addTransaction}
                submitLabel="Lưu đơn trả góp"
                successMessage="Đã lưu đơn trả góp."
                className="grid gap-3 sm:grid-cols-2"
              >
                <TransactionFields
                  installment
                  shiftId={myShift.id}
                  bankAccounts={bankAccounts}
                  saleSuggestions={suggestions.saleSuggestions}
                  repairSuggestions={[]}
                  giftOptions={suggestions.giftOptions}
                />
              </ActionForm>
            </FormDialog>
          ) : (
            !isAdmin && (
              <Link href="/day" className="btn-secondary">
                Vào ca để bán trả góp
              </Link>
            )
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Chờ công ty tài chính trả" value={`${pending.length} đơn`} />
        <Stat label="Số tiền chờ thu" value={formatVND(pendingAmount)} tone="text-fuchsia-700" />
        <Stat label="Thanh toán đủ tháng này" value={`${paidThisMonth} đơn`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.key || "pending"}
            href={pageHref("/installments", { q, status: t.key })(1)}
            className={`rounded-md px-3 py-1 text-sm font-medium ring-1 ${
              status === t.key ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <Form action="/installments" className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="relative min-w-0 flex-1 sm:w-72">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Tìm khách, SĐT, máy, số hợp đồng..."
              aria-label="Tìm đơn trả góp"
              className="input pl-9"
            />
          </label>
          <button className="btn-secondary shrink-0">Tìm</button>
        </Form>
      </div>

      {paying && (
        <FormDialog key={paying.id} title="Ghi nhận công ty tài chính thanh toán" defaultOpen closeHref={closeHref}>
          <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium">{paying.productName}</p>
            <p className="text-slate-600">
              {paying.customerName} · {paying.customerPhone} · {paying.financeCompany}
              {paying.financeContract && ` · HĐ ${paying.financeContract}`}
            </p>
            <p className="mt-1">
              Còn lại: <b className="text-fuchsia-700 tabular-nums">{formatVND(remainingOf(paying))}</b>
            </p>
            {!isAdmin && <p className="mt-1 text-xs text-slate-500">Tiền sẽ cộng vào ca đang làm của bạn.</p>}
          </div>
          <ActionForm
            action={recordInstallmentPayment}
            submitLabel="Ghi nhận"
            successMessage="Đã ghi nhận thanh toán."
            className="grid gap-3 sm:grid-cols-2"
          >
            <InstallmentPaymentFields
              transactionId={paying.id}
              remaining={remainingOf(paying)}
              bankAccounts={bankAccounts}
            />
          </ActionForm>
        </FormDialog>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Sản phẩm</th>
              <th>Công ty tài chính</th>
              <th className="text-right">Giá bán</th>
              <th className="text-right">Trả trước</th>
              <th className="text-right">Còn lại</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const remaining = remainingOf(t);
              return (
                <tr key={t.id} className={rowClass(paging, i)}>
                  <td data-title>
                    <span>
                      <span className="block font-medium">{t.customerName}</span>
                      <span className="block text-xs font-normal text-slate-500 tabular-nums">
                        {t.customerPhone} · bán {formatDate(t.shift.date)} · {t.shift.staffName}
                      </span>
                    </span>
                  </td>
                  <td data-label="Sản phẩm">{t.productName}</td>
                  <td data-label="Công ty TC">
                    <span>
                      {t.financeCompany}
                      {t.financeContract && (
                        <span className="block text-xs text-slate-500 tabular-nums">HĐ {t.financeContract}</span>
                      )}
                    </span>
                  </td>
                  <td data-label="Giá bán" className="text-right whitespace-nowrap tabular-nums">
                    {formatVND(t.price)}
                  </td>
                  <td data-label="Trả trước" className="text-right whitespace-nowrap tabular-nums">
                    <span>
                      {formatVND(t.downPayment ?? 0)}
                      {(t.downPayment ?? 0) > 0 && (
                        <span className="ml-1 text-xs text-slate-500">{PAYMENT_LABEL[t.paymentMethod]}</span>
                      )}
                    </span>
                  </td>
                  <td data-label="Còn lại" className="text-right font-semibold whitespace-nowrap tabular-nums">
                    <span className={remaining > 0 ? "text-fuchsia-700" : "text-slate-400"}>{formatVND(remaining)}</span>
                  </td>
                  <td data-label="Trạng thái">
                    <span>
                      {t.financePaidAt ? (
                        <span className="badge bg-green-100 text-green-800">Đã thanh toán đủ</span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-800">Chờ cty TC trả</span>
                      )}
                      {t.financePayments.map((p) => (
                        <span key={p.id} className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <span className="tabular-nums">
                            {formatDate(p.date)} · {formatVND(p.amount)} {PAYMENT_LABEL[p.paymentMethod]} · {p.createdBy}
                          </span>
                          {canManage && !p.shift?.closedAt && (
                            <ConfirmButton
                              action={deleteInstallmentPayment.bind(null, p.id)}
                              message={`Xoá lần thu ${formatVND(p.amount)}?`}
                            >
                              Xoá
                            </ConfirmButton>
                          )}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {!t.financePaidAt && canCollect && (
                      <Link
                        href={pageHref("/installments", { ...filters, pay: t.id })(paging.page)}
                        scroll={false}
                        className="text-sm font-medium text-[#1677ff] hover:underline"
                      >
                        Ghi nhận thanh toán
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-slate-500">Không có đơn trả góp nào.</p>}
      </div>

      <Pagination paging={paging} href={pageHref("/installments", filters)} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
