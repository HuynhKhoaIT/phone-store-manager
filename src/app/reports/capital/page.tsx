import Link from "next/link";
import type { CapitalEntry, Investor, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getActiveBranches, getBranches } from "@/lib/branch";
import { CAPITAL_TYPE_LABEL, getCapitalReport } from "@/lib/capital";
import { formatDate, formatVND } from "@/lib/format";
import { getPaging, pageHref, rowClass } from "@/lib/paging";
import { deleteCapitalEntry, saveCapitalEntry, saveInvestor } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { ReportsTabs } from "@/components/ReportsTabs";
import { StatCard } from "@/components/StatCard";

type Search = { investor?: string; branch?: string; page?: string; edit?: string; editInvestor?: string };

const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

export default async function CapitalPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("capital");
  const sp = await searchParams;
  const [report, branches, activeBranches] = await Promise.all([getCapitalReport(), getBranches(), getActiveBranches()]);
  const { investors, total, today } = report;
  const investorId = investors.find((i) => i.id === Number(sp.investor))?.id;
  const branchId = branches.find((b) => b.id === Number(sp.branch))?.id;

  // Sổ vốn (có lọc theo người / chi nhánh), phân trang
  const where: Prisma.CapitalEntryWhereInput = { ...(investorId && { investorId }), ...(branchId && { branchId }) };
  const paging = getPaging(await prisma.capitalEntry.count({ where }), sp.page);
  const [entries, editing, editingInvestor] = await Promise.all([
    prisma.capitalEntry.findMany({
      where,
      include: { investor: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: paging.take,
    }),
    sp.edit ? prisma.capitalEntry.findUnique({ where: { id: Number(sp.edit) || 0 } }) : null,
    sp.editInvestor ? prisma.investor.findUnique({ where: { id: Number(sp.editInvestor) || 0 } }) : null,
  ]);

  const filters = { investor: investorId, branch: branchId };
  const backHref = pageHref("/reports/capital", filters)(paging.page);
  const withParam = (k: string, v: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}${k}=${v}`;
  const activeInvestors = investors.filter((i) => i.active || i.id === editing?.investorId);

  const investorForm = (inv?: Investor) => (
    <ActionForm
      action={saveInvestor}
      submitLabel={inv ? "Lưu thay đổi" : "Thêm người góp vốn"}
      successMessage={inv ? "Đã lưu." : "Đã thêm người góp vốn."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {inv && <input type="hidden" name="id" value={inv.id} />}
      <label className="field">
        <span>Họ tên *</span>
        <input name="name" required defaultValue={inv?.name} className="input" />
      </label>
      <label className="field">
        <span>Số điện thoại</span>
        <input name="phone" type="tel" defaultValue={inv?.phone ?? ""} className="input" />
      </label>
      <label className="field col-span-full">
        <span>Ghi chú</span>
        <input name="note" defaultValue={inv?.note ?? ""} className="input" />
      </label>
      {inv && (
        <label className="field">
          <span>Trạng thái</span>
          <select name="active" defaultValue={String(inv.active)} className="input">
            <option value="true">Đang góp vốn</option>
            <option value="false">Đã rút hết (ẩn khỏi form)</option>
          </select>
        </label>
      )}
    </ActionForm>
  );

  const entryForm = (e?: CapitalEntry) => (
    <ActionForm
      action={saveCapitalEntry}
      submitLabel={e ? "Lưu thay đổi" : "Ghi vào sổ"}
      successMessage={e ? "Đã lưu." : "Đã ghi vào sổ vốn."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {e && <input type="hidden" name="id" value={e.id} />}
      <label className="field">
        <span>Loại *</span>
        <select name="type" defaultValue={e?.type ?? "CONTRIBUTE"} className="input">
          {Object.entries(CAPITAL_TYPE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Ngày *</span>
        <input name="date" type="date" required defaultValue={e?.date ?? today} className="input" />
      </label>
      <label className="field">
        <span>Người góp vốn *</span>
        <select name="investorId" required defaultValue={e?.investorId ?? investorId ?? ""} className="input">
          <option value="" disabled>
            Chọn người...
          </option>
          {activeInvestors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Chi nhánh *</span>
        <select name="branchId" required defaultValue={e?.branchId ?? branchId ?? ""} className="input">
          <option value="" disabled>
            Chọn chi nhánh...
          </option>
          {(e ? branches : activeBranches).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Số tiền *</span>
        <MoneyInput name="amount" required defaultValue={e?.amount} />
      </label>
      <label className="field">
        <span>Ghi chú</span>
        <input name="note" defaultValue={e?.note ?? ""} className="input" placeholder="VD: Chia lãi quý 3" />
      </label>
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo — Góp vốn"
        subtitle="Ai góp bao nhiêu, được chia lãi bao nhiêu, đã rút bao nhiêu"
        actions={
          <>
            <FormDialog title="Thêm người góp vốn" triggerLabel="Thêm người góp" triggerVariant="secondary">
              {investorForm()}
            </FormDialog>
            {investors.length > 0 && (
              <FormDialog title="Ghi góp vốn / rút tiền" triggerLabel="Ghi góp / rút">
                {entryForm()}
              </FormDialog>
            )}
          </>
        }
      />

      {editing && (
        <FormDialog key={`e${editing.id}`} title="Sửa dòng sổ vốn" defaultOpen closeHref={backHref}>
          {entryForm(editing)}
        </FormDialog>
      )}
      {editingInvestor && (
        <FormDialog key={`i${editingInvestor.id}`} title={`Sửa: ${editingInvestor.name}`} defaultOpen closeHref={backHref}>
          {investorForm(editingInvestor)}
        </FormDialog>
      )}

      <ReportsTabs active="capital" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tổng vốn góp" value={formatVND(total.investment)} />
        <StatCard label="Lãi ròng cộng dồn" value={formatVND(total.net)} amount={total.net} profit />
        <StatCard label="Tổng đã rút" value={formatVND(total.withdrawn)} />
        <StatCard label="Người góp vốn" value={String(investors.filter((i) => i.contributed > 0).length)} />
      </div>

      {/* Báo cáo theo từng người */}
      <section className="space-y-2">
        <h2 className="font-semibold">Theo từng người</h2>
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Người góp vốn</th>
                <th className="text-right">Vốn góp</th>
                <th className="text-right">Lãi được chia</th>
                <th className="text-right">Đã rút</th>
                <th className="text-right">Đã thu về</th>
                <th className="text-right">Số dư</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {investors.map((i) => (
                <tr key={i.id} className={i.active ? "" : "text-slate-400"}>
                  <td data-title>
                    <span>
                      <Link href={`/reports/capital?investor=${i.id}`} className="font-medium hover:text-[#1677ff]">
                        {i.name}
                      </Link>
                      {/* Tỉ lệ góp ở từng chi nhánh */}
                      <span className="block text-xs font-normal text-slate-500">
                        {i.perBranch.length > 0
                          ? i.perBranch
                              .filter((b) => b.contributed > 0)
                              .map((b) => `${b.branchName} ${fmtPct(b.share * 100)}`)
                              .join(" · ")
                          : "Chưa góp"}
                      </span>
                    </span>
                  </td>
                  <td data-label="Vốn góp" className="text-right whitespace-nowrap tabular-nums">
                    {formatVND(i.contributed)}
                  </td>
                  <td
                    data-label="Lãi được chia"
                    className={`text-right whitespace-nowrap tabular-nums ${i.profitShare < 0 ? "text-red-600" : "text-green-700"}`}
                  >
                    {formatVND(i.profitShare)}
                  </td>
                  <td data-label="Đã rút" className="text-right whitespace-nowrap tabular-nums">
                    {formatVND(i.withdrawn)}
                  </td>
                  <td data-label="Đã thu về" className="text-right whitespace-nowrap">
                    <span>
                      <span className="tabular-nums">
                        {i.contributed > 0 ? fmtPct((i.withdrawn / i.contributed) * 100) : "—"}
                      </span>
                      {i.contributed > 0 && (
                        <span className="block text-xs text-slate-500">
                          {i.unrecovered > 0 ? `còn ${formatVND(i.unrecovered)}` : "đã thu đủ vốn"}
                        </span>
                      )}
                    </span>
                  </td>
                  <td
                    data-label="Số dư"
                    className={`text-right font-semibold whitespace-nowrap tabular-nums ${i.balance < 0 ? "text-red-600" : ""}`}
                  >
                    {formatVND(i.balance)}
                  </td>
                  <td className="text-right">
                    <Link href={withParam("editInvestor", i.id)} className="text-sm text-[#1677ff] hover:underline">
                      Sửa
                    </Link>
                  </td>
                </tr>
              ))}
              {investors.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Chưa có người góp vốn. Bấm &quot;Thêm người góp&quot; để bắt đầu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Lãi được chia = lãi ròng cộng dồn của chi nhánh × tỉ lệ vốn góp ở chi nhánh đó. Đã thu về = đã rút ÷ vốn góp. Số
          dư = vốn góp + lãi được chia − đã rút.
        </p>
      </section>

      {/* Sổ vốn */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Sổ góp / rút</h2>
          <form action="/reports/capital" className="flex flex-wrap gap-2">
            <select name="investor" defaultValue={investorId ?? ""} aria-label="Người góp vốn" className="input w-auto">
              <option value="">Tất cả người góp</option>
              {investors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <select name="branch" defaultValue={branchId ?? ""} aria-label="Chi nhánh" className="input w-auto">
              <option value="">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary">Lọc</button>
          </form>
        </div>
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Người góp vốn</th>
                <th>Ngày</th>
                <th>Loại</th>
                <th className="text-right">Số tiền</th>
                <th>Chi nhánh</th>
                <th>Ghi chú</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr key={e.id} className={rowClass(paging, idx)}>
                  <td data-title className="font-medium">
                    {e.investor.name}
                  </td>
                  <td data-label="Ngày" className="whitespace-nowrap">
                    {formatDate(e.date)}
                  </td>
                  <td data-label="Loại">
                    <span
                      className={`badge ${e.type === "CONTRIBUTE" ? "bg-blue-50 text-blue-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      {CAPITAL_TYPE_LABEL[e.type]}
                    </span>
                  </td>
                  <td
                    data-label="Số tiền"
                    className={`text-right font-medium whitespace-nowrap tabular-nums ${e.type === "WITHDRAW" ? "text-amber-700" : ""}`}
                  >
                    {e.type === "WITHDRAW" ? "−" : "+"}
                    {formatVND(e.amount)}
                  </td>
                  <td data-label="Chi nhánh">{e.branch.name}</td>
                  <td data-label="Ghi chú">
                    <span>
                      {e.note}
                      <span className="block text-xs text-slate-400">Ghi bởi {e.createdBy}</span>
                    </span>
                  </td>
                  <td className="space-x-3 text-right whitespace-nowrap">
                    <Link href={withParam("edit", e.id)} className="text-sm text-[#1677ff] hover:underline">
                      Sửa
                    </Link>
                    <ConfirmButton
                      action={deleteCapitalEntry.bind(null, e.id)}
                      message={`Xoá dòng ${CAPITAL_TYPE_LABEL[e.type].toLowerCase()} ${formatVND(e.amount)} của ${e.investor.name}?`}
                    >
                      Xoá
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Chưa có dòng nào trong sổ vốn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paging={paging} href={pageHref("/reports/capital", filters)} />
      </section>
    </div>
  );
}
