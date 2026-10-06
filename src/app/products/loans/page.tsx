import Link from "next/link";
import { ArrowRight, Handshake } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getActiveBranches, getBranches, getCurrentBranch } from "@/lib/branch";
import { productLabel } from "@/lib/product-labels";
import { LOAN_STATE_BADGE, LOAN_STATE_LABEL, loanState, type LoanState } from "@/lib/loans";
import { dateVN, formatDate, formatVND, todayVN } from "@/lib/format";
import { getPaging, pageHref, rowClass } from "@/lib/paging";
import { deleteLoan, saveLoan, setLoanStatus } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { ProductPicker } from "@/components/ProductPicker";
import { ProductsTabs } from "@/components/ProductsTabs";

type Search = { tab?: string; page?: string; edit?: string };

/** Bộ lọc trạng thái. "open" (mặc định) = việc còn dở: đang mượn + đã bán chưa thanh toán */
const TABS: Record<string, { label: string; where: Prisma.BranchLoanWhereInput }> = {
  open: { label: "Chưa xong", where: { OR: [{ status: "BORROWED" }, { status: "SOLD", paidAt: null }] } },
  BORROWED: { label: "Đang mượn", where: { status: "BORROWED" } },
  UNPAID: { label: "Chưa thanh toán", where: { status: "SOLD", paidAt: null } },
  PAID: { label: "Đã thanh toán", where: { status: "SOLD", paidAt: { not: null } } },
  RETURNED: { label: "Đã trả hàng", where: { status: "RETURNED" } },
  all: { label: "Tất cả", where: {} },
};

export default async function LoansPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("products");
  const isAdmin = me.role === "ADMIN";
  const today = todayVN();
  const sp = await searchParams;
  const tab = TABS[sp.tab ?? ""] ? sp.tab! : "open";
  const where = TABS[tab].where;

  const [branches, activeBranches, current, products, unpaid, borrowedCount] = await Promise.all([
    getBranches(),
    getActiveBranches(),
    getCurrentBranch(),
    // Sản phẩm để chọn khi ghi mượn (không gửi giá nhập xuống client)
    prisma.product.findMany({
      where: { active: true, soldBranchId: null },
      select: {
        id: true,
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
    // Công nợ: đã bán mà chưa trả tiền cho quán cho mượn
    prisma.branchLoan.findMany({
      where: { status: "SOLD", paidAt: null },
      select: { lenderBranchId: true, borrowerBranchId: true, amount: true },
    }),
    prisma.branchLoan.groupBy({
      by: ["lenderBranchId", "borrowerBranchId"],
      where: { status: "BORROWED" },
      _count: true,
    }),
  ]);
  const paging = getPaging(await prisma.branchLoan.count({ where }), sp.page);
  const [loans, editing] = await Promise.all([
    prisma.branchLoan.findMany({
      where,
      include: { lenderBranch: { select: { name: true } }, borrowerBranch: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: paging.take,
    }),
    isAdmin && sp.edit ? prisma.branchLoan.findUnique({ where: { id: Number(sp.edit) || 0 } }) : null,
  ]);

  const branchName = (id: number) => branches.find((b) => b.id === id)?.name ?? "?";
  // Gom công nợ theo cặp quán: quán mượn → quán cho mượn, rồi bù trừ hai chiều cho ra số phải trả thật
  const pairs = new Map<string, { from: number; to: number; amount: number; count: number }>();
  for (const l of unpaid) {
    const [a, b] = [l.borrowerBranchId, l.lenderBranchId].sort((x, y) => x - y);
    const key = `${a}-${b}`;
    const p = pairs.get(key) ?? { from: a, to: b, amount: 0, count: 0 };
    // amount > 0: quán a nợ quán b; < 0: quán b nợ quán a
    p.amount += l.borrowerBranchId === a ? l.amount : -l.amount;
    p.count++;
    pairs.set(key, p);
  }
  const debts = [...pairs.values()].map((p) =>
    p.amount >= 0 ? p : { ...p, from: p.to, to: p.from, amount: -p.amount },
  );

  // Cùng một phụ kiện ở 2 quán là 2 dòng → ghi kèm tên quán để chọn đúng
  const options = products.map((p) => ({
    id: p.id,
    label: p.ownerBranch ? `${productLabel(p)} · ${p.ownerBranch.name}` : productLabel(p),
  }));
  const otherBranch = activeBranches.find((b) => b.id !== current?.id);
  const listHref = pageHref("/products/loans", { tab: tab === "open" ? "" : tab });
  const backHref = listHref(paging.page);
  const editHref = (id: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}edit=${id}`;
  const branchSelect = (name: string, defaultValue?: number) => (
    <select name={name} required defaultValue={defaultValue} className="input">
      {activeBranches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hàng hoá"
        subtitle="Mượn hàng giữa chi nhánh và thanh toán lại cho nhau"
        hideTitleOnMobile
        actions={
          <FormDialog
            title="Ghi mượn hàng"
            triggerLabel="Ghi mượn hàng"
            triggerIcon={<Handshake size={16} aria-hidden />}
          >
            <ActionForm
              action={saveLoan}
              submitLabel="Lưu"
              successMessage="Đã ghi mượn hàng."
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="field sm:col-span-2">
                <span>Sản phẩm *</span>
                <ProductPicker options={options} required />
              </label>
              <label className="field">
                <span>Mượn của chi nhánh *</span>
                {branchSelect("lenderBranchId", otherBranch?.id)}
              </label>
              <label className="field">
                <span>Chi nhánh mượn *</span>
                {branchSelect("borrowerBranchId", current?.id)}
              </label>
              <label className="field">
                <span>Số lượng *</span>
                <input name="quantity" type="number" min={1} defaultValue={1} required className="input" />
              </label>
              <label className="field">
                <span>Ngày mượn *</span>
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today}
                  max={isAdmin ? undefined : today}
                  className="input"
                />
              </label>
              <label className="field sm:col-span-2">
                <span>Ghi chú</span>
                <input name="note" className="input" />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">
                Bán qua trang Bán hàng thì tự chuyển sang &quot;Đã bán&quot;. Số tiền phải trả = giá nhập × số lượng.
              </p>
            </ActionForm>
          </FormDialog>
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Sửa: ${editing.productName}`} defaultOpen closeHref={backHref}>
          <ActionForm
            action={saveLoan}
            submitLabel="Lưu"
            successMessage="Đã lưu."
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={editing.id} />
            <label className="field">
              <span>Số tiền phải trả</span>
              <MoneyInput name="amount" defaultValue={editing.amount} />
            </label>
            <label className="field">
              <span>Ghi chú</span>
              <input name="note" defaultValue={editing.note ?? ""} className="input" />
            </label>
          </ActionForm>
        </FormDialog>
      )}

      <ProductsTabs active="loans" />

      {/* Tổng kết: ai đang nợ ai (chỉ admin thấy số tiền vì đó là giá nhập) */}
      {(debts.length > 0 || borrowedCount.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {debts
            .filter((d) => d.amount > 0 || !isAdmin)
            .map((d) => (
              <div
                key={`${d.from}-${d.to}`}
                className="card flex items-center gap-3 border-amber-200 bg-amber-50/50 p-3 sm:p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                    <b className="text-slate-900">{branchName(d.from)}</b>
                    <ArrowRight size={14} aria-hidden /> cần trả <b className="text-slate-900">{branchName(d.to)}</b>
                  </p>
                  {isAdmin ? (
                    <p className="mt-0.5 text-xl font-bold text-amber-800 tabular-nums">{formatVND(d.amount)}</p>
                  ) : (
                    <p className="mt-0.5 text-sm text-slate-600">{d.count} món đã bán chưa thanh toán</p>
                  )}
                </div>
                <Link href="/products/loans?tab=UNPAID" className="shrink-0 text-sm text-[#1677ff] hover:underline">
                  Xem
                </Link>
              </div>
            ))}
          {borrowedCount.map((g) => (
            <div key={`b${g.lenderBranchId}-${g.borrowerBranchId}`} className="card p-3 sm:p-4">
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                <b className="text-slate-900">{branchName(g.borrowerBranchId)}</b> đang mượn của{" "}
                <b className="text-slate-900">{branchName(g.lenderBranchId)}</b>
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{g._count} món</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {Object.entries(TABS).map(([k, t]) => (
          <Link
            key={k}
            href={k === "open" ? "/products/loans" : `/products/loans?tab=${k}`}
            className={`rounded-md px-3 py-1 text-sm font-medium ring-1 ${
              tab === k
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Mượn</th>
              <th>Ngày mượn</th>
              <th>Trạng thái</th>
              {isAdmin && <th className="text-right">Phải trả</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l, i) => {
              const state: LoanState = loanState(l);
              return (
                <tr key={l.id} className={rowClass(paging, i)}>
                  <td data-title>
                    <span>
                      <span className="block font-medium">
                        {l.productName}
                        {l.quantity > 1 && <span className="font-normal text-slate-500"> × {l.quantity}</span>}
                      </span>
                      {l.note && <span className="block text-xs font-normal text-slate-500">{l.note}</span>}
                    </span>
                  </td>
                  <td data-label="Mượn" className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {l.lenderBranch.name} <ArrowRight size={14} className="text-slate-400" aria-hidden />{" "}
                      {l.borrowerBranch.name}
                    </span>
                  </td>
                  <td data-label="Ngày mượn" className="whitespace-nowrap">
                    {formatDate(l.date)}
                  </td>
                  <td data-label="Trạng thái">
                    <span>
                      <span className={`badge ${LOAN_STATE_BADGE[state]}`}>{LOAN_STATE_LABEL[state]}</span>
                      <span className="block text-xs text-slate-500">
                        {state === "RETURNED" && l.returnedDate && `Trả ngày ${formatDate(l.returnedDate)}`}
                        {(state === "UNPAID" || state === "PAID") && l.soldDate && `Bán ngày ${formatDate(l.soldDate)}`}
                        {state === "PAID" &&
                          l.paidAt &&
                          ` · TT ${formatDate(dateVN(l.paidAt))}${l.paidBy ? ` (${l.paidBy})` : ""}`}
                      </span>
                    </span>
                  </td>
                  {isAdmin && (
                    <td data-label="Phải trả" className="text-right whitespace-nowrap tabular-nums">
                      {state === "RETURNED" ? (
                        <span className="text-slate-400">—</span>
                      ) : l.amount > 0 ? (
                        formatVND(l.amount)
                      ) : (
                        <span className="text-amber-700">Chưa có giá nhập</span>
                      )}
                    </td>
                  )}
                  <td className="text-right whitespace-nowrap">
                    <span className="inline-flex flex-wrap justify-end gap-x-3 gap-y-1">
                      {state === "BORROWED" && (
                        <>
                          <ConfirmButton
                            action={setLoanStatus.bind(null, l.id, "return")}
                            message={`Đã trả "${l.productName}" về ${l.lenderBranch.name}?`}
                            className="text-sm text-[#1677ff] hover:underline"
                          >
                            Đã trả hàng
                          </ConfirmButton>
                          <ConfirmButton
                            action={setLoanStatus.bind(null, l.id, "sold")}
                            message={`"${l.productName}" đã bán? (Bán qua trang Bán hàng thì không cần bấm — hệ thống tự cập nhật.)`}
                            className="text-sm text-[#1677ff] hover:underline"
                          >
                            Đã bán
                          </ConfirmButton>
                        </>
                      )}
                      {isAdmin && state === "UNPAID" && (
                        <ConfirmButton
                          action={setLoanStatus.bind(null, l.id, "paid")}
                          message={`${l.borrowerBranch.name} đã trả ${formatVND(l.amount)} cho ${l.lenderBranch.name}?`}
                          className="text-sm font-medium text-green-700 hover:underline"
                        >
                          Đã thanh toán
                        </ConfirmButton>
                      )}
                      {isAdmin && state === "PAID" && (
                        <ConfirmButton
                          action={setLoanStatus.bind(null, l.id, "unpaid")}
                          message="Bỏ đánh dấu đã thanh toán?"
                          className="text-sm text-slate-500 hover:underline"
                        >
                          Bỏ thanh toán
                        </ConfirmButton>
                      )}
                      {isAdmin && (
                        <>
                          <Link href={editHref(l.id)} className="text-sm text-[#1677ff] hover:underline">
                            Sửa
                          </Link>
                          <ConfirmButton
                            action={deleteLoan.bind(null, l.id)}
                            message={`Xoá dòng mượn "${l.productName}"?`}
                          >
                            Xoá
                          </ConfirmButton>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {loans.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="py-8 text-center text-slate-500">
                  {tab === "open" ? "Không có hàng nào đang mượn hay chưa thanh toán." : "Không có dòng nào."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={listHref} />
    </div>
  );
}
