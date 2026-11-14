import Link from "next/link";
import type { CapitalSpend, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getActiveBranches, getBranches, getCurrentBranch } from "@/lib/branch";
import { SPEND_CATEGORIES } from "@/lib/capital-spend";
import { fundLabel } from "@/lib/receipts";
import { formatDate, formatVND, todayVN } from "@/lib/format";
import { getPaging, pageHref, rowClass } from "@/lib/paging";
import { deleteCapitalSpend, saveCapitalSpend } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DatePicker } from "@/components/DatePicker";
import { FormDialog } from "@/components/FormDialog";
import { FundSelect, fundValue } from "@/components/FundSelect";
import { MoneyInput } from "@/components/MoneyInput";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { ReportsTabs } from "@/components/ReportsTabs";
import { StatCard } from "@/components/StatCard";

type Search = { branch?: string; page?: string; edit?: string };

const FUND_BADGE: Record<string, string> = {
  STORE: "bg-slate-100 text-slate-700",
  INVESTOR: "bg-violet-100 text-violet-800",
};

/** Cộng tiền theo khoá, lớn trước */
function sumBy<T>(rows: T[], key: (r: T) => string, amount: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + amount(r));
  return [...m].sort((a, b) => b[1] - a[1]);
}

export default async function FixturesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("capital");
  const sp = await searchParams;
  const [branches, activeBranches, current, investors] = await Promise.all([
    getBranches(),
    getActiveBranches(),
    getCurrentBranch(),
    prisma.investor.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const branchId = branches.find((b) => b.id === Number(sp.branch))?.id;
  const where: Prisma.CapitalSpendWhereInput = branchId ? { branchId } : {};

  // Bản gọn của mọi khoản (theo bộ lọc) để tính tổng — không phụ thuộc trang đang xem
  const all = await prisma.capitalSpend.findMany({
    where,
    select: { branchId: true, category: true, amount: true, fundSource: true, investor: { select: { name: true } } },
  });
  const paging = getPaging(all.length, sp.page);
  const [rows, editing] = await Promise.all([
    prisma.capitalSpend.findMany({
      where,
      include: { branch: { select: { name: true } }, investor: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: paging.take,
    }),
    sp.edit
      ? prisma.capitalSpend.findUnique({ where: { id: Number(sp.edit) || 0 }, include: { investor: { select: { name: true } } } })
      : null,
  ]);

  const total = all.reduce((s, r) => s + r.amount, 0);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const byBranch = sumBy(all, (r) => branchName.get(r.branchId) ?? "—", (r) => r.amount);
  const byCategory = sumBy(all, (r) => SPEND_CATEGORIES[r.category] ?? r.category, (r) => r.amount);
  const byFund = sumBy(all, fundLabel, (r) => r.amount);

  const backHref = pageHref("/reports/fixtures", { branch: branchId })(paging.page);
  const editHref = (id: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}edit=${id}`;

  const spendForm = (s?: CapitalSpend & { investor: { name: string } | null }) => (
    <ActionForm
      action={saveCapitalSpend}
      submitLabel={s ? "Lưu thay đổi" : "Ghi khoản chi"}
      successMessage={s ? "Đã lưu." : "Đã ghi khoản chi."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="field">
        <span>Ngày *</span>
        <DatePicker name="date" value={s?.date ?? todayVN()} label="Ngày chi" required />
      </div>
      <label className="field">
        <span>Chi nhánh *</span>
        <select name="branchId" required defaultValue={s?.branchId ?? branchId ?? current?.id ?? ""} className="input">
          {(s ? branches : activeBranches).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Loại *</span>
        <select name="category" required defaultValue={s?.category ?? "CONSTRUCTION"} className="input">
          {Object.entries(SPEND_CATEGORIES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Số tiền *</span>
        <MoneyInput name="amount" required defaultValue={s?.amount} />
      </label>
      <label className="field sm:col-span-2">
        <span>Nội dung *</span>
        <input
          name="description"
          required
          defaultValue={s?.description ?? ""}
          className="input"
          placeholder="VD: Tủ kính trưng bày, sơn tường, bảng hiệu"
        />
      </label>
      <FundSelect
        investors={investors}
        defaultValue={s ? fundValue(s) : "STORE"}
        keep={s?.investorId && s.investor ? { id: s.investorId, name: s.investor.name } : undefined}
        hint="Tiền của người góp vốn sẽ tự ghi vào Sổ góp vốn của chi nhánh này."
      />
      <label className="field">
        <span>Ghi chú</span>
        <input name="note" defaultValue={s?.note ?? ""} className="input" placeholder="VD: Thợ anh Hùng, bảo hành 1 năm" />
      </label>
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo — Vật tư & xây dựng"
        subtitle="Tiền vốn chi cho xây dựng, decor, vật tư, thiết bị — đầu tư một lần, không trừ vào lãi tháng"
        actions={
          <FormDialog title="Ghi khoản vật tư / xây dựng" triggerLabel="Ghi khoản chi">
            {spendForm()}
          </FormDialog>
        }
      />

      {editing && (
        <FormDialog key={editing.id} title="Sửa khoản chi" defaultOpen closeHref={backHref}>
          {spendForm(editing)}
        </FormDialog>
      )}

      <ReportsTabs active="fixtures" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={branchId ? `Đã chi — ${branchName.get(branchId)}` : "Tổng đã chi"}
          value={formatVND(total)}
          sub={`${all.length} khoản`}
        />
        {byFund.slice(0, 3).map(([label, amount]) => (
          <StatCard key={label} label={label} value={formatVND(amount)} />
        ))}
      </div>

      {all.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["Theo loại", byCategory],
              ["Theo chi nhánh", byBranch],
            ] as const
          ).map(([title, list]) => (
            <section key={title} className="card space-y-2">
              <h2 className="text-sm font-semibold">{title}</h2>
              <ul className="space-y-1 text-sm">
                {list.map(([label, amount]) => (
                  <li key={label} className="flex justify-between gap-3">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-medium tabular-nums">{formatVND(amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Các khoản đã chi</h2>
          <form action="/reports/fixtures" className="flex gap-2">
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
                <th>Nội dung</th>
                <th>Ngày</th>
                <th>Chi nhánh</th>
                <th>Tiền từ</th>
                <th className="text-right">Số tiền</th>
                <th>Ghi chú</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={rowClass(paging, i)}>
                  <td data-title>
                    <span>
                      <span className="font-medium">{r.description}</span>
                      <span className="block text-xs text-slate-500">{SPEND_CATEGORIES[r.category] ?? r.category}</span>
                    </span>
                  </td>
                  <td data-label="Ngày" className="whitespace-nowrap">
                    {formatDate(r.date)}
                  </td>
                  <td data-label="Chi nhánh">{r.branch.name}</td>
                  <td data-label="Tiền từ">
                    <span className={`badge ${FUND_BADGE[r.fundSource ?? ""] ?? "bg-amber-100 text-amber-800"}`}>
                      {fundLabel(r)}
                    </span>
                  </td>
                  <td data-label="Số tiền" className="text-right font-semibold whitespace-nowrap tabular-nums">
                    {formatVND(r.amount)}
                  </td>
                  <td data-label="Ghi chú">
                    <span>
                      {r.note}
                      <span className="block text-xs text-slate-400">Ghi bởi {r.createdBy}</span>
                    </span>
                  </td>
                  <td className="space-x-3 text-right whitespace-nowrap">
                    <Link href={editHref(r.id)} className="text-sm text-[#1677ff] hover:underline">
                      Sửa
                    </Link>
                    <ConfirmButton
                      action={deleteCapitalSpend.bind(null, r.id)}
                      message={`Xoá khoản "${r.description}" ${formatVND(r.amount)}?${r.fundSource === "INVESTOR" ? " Dòng góp vốn theo khoản này cũng bị xoá." : ""}`}
                    >
                      Xoá
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Chưa ghi khoản nào. Bấm &quot;Ghi khoản chi&quot; để thêm tiền xây dựng, decor, vật tư...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paging={paging} href={pageHref("/reports/fixtures", { branch: branchId })} />
        <p className="text-xs text-slate-500">
          Chi phí hằng tháng (mặt bằng, lương, điện nước...) ghi ở tab Lãi lỗ. Mục này dành cho tiền đầu tư một lần, tính
          vào phần vốn đã dùng ở tab Tồn kho &amp; vốn.
        </p>
      </section>
    </div>
  );
}
