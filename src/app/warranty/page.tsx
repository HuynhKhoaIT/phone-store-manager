import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDate, formatVND, KIND_LABEL, todayVN, warrantyEnd } from "@/lib/format";
import { Pagination } from "@/components/Pagination";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { WarrantyExchangeFields } from "@/components/WarrantyExchangeFields";
import { getCurrentBranch } from "@/lib/branch";
import { getRecentBankAccounts, getSaleSuggestions } from "@/lib/prices";
import { exchangeWarranty } from "../actions";
import { Repeat } from "lucide-react";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const me = await requirePermission("warranty");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const phone = q.replace(/[ .-]/g, "");

  const where: Prisma.TransactionWhereInput = {
    warrantyMonths: { gt: 0 },
    ...(q && {
      OR: [
        ...(/^\+?\d{3,}$/.test(phone) ? [{ customerPhone: { contains: phone } }] : []),
        { customerName: { contains: q, mode: "insensitive" as const } },
        { productName: { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };
  const total = await prisma.transaction.count({ where });
  const paging = getPaging(total, sp.page);
  const rows = await prisma.transaction.findMany({
    where,
    include: { shift: { include: { branch: true } }, exchanges: { select: { id: true } }, warrantyOf: { select: { productName: true } } },
    // Thêm id để thứ tự cố định khi phân trang bằng take
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: paging.take,
  });
  const today = todayVN();

  // Đổi bảo hành cần đang có ca mở hôm nay ở chi nhánh hiện tại (nhân viên: ca của mình)
  const canExchange = can(me, "warranty-exchange");
  const branch = canExchange ? await getCurrentBranch() : null;
  const openShift = branch
    ? await prisma.shift.findFirst({
        where: { date: today, branchId: branch.id, closedAt: null, ...(me.role === "ADMIN" ? {} : { userId: me.id }) },
        select: { id: true },
      })
    : null;
  const bankAccounts = openShift ? await getRecentBankAccounts() : [];
  const exchangeOptions = openShift
    ? (await getSaleSuggestions(branch!.id)).saleSuggestions
        .filter((s) => s.productId && (s.quantity ?? 1) > 0)
        .map((s) => ({ id: s.productId!, label: s.label, price: s.price }))
    : [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Tra cứu bảo hành</h1>

      <form action="/warranty" className="flex max-w-lg gap-2">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          inputMode="search"
          placeholder="Nhập số điện thoại hoặc tên khách hàng..."
          className="input"
        />
        <button className="btn-primary">Tìm</button>
      </form>

      <p className="text-sm text-slate-500">
        {q ? `Tìm thấy ${total} sản phẩm có bảo hành.` : `${total} sản phẩm có bảo hành, mới nhất trước:`}
      </p>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Sản phẩm / Dịch vụ</th>
              <th className="text-right">Giá</th>
              <th>Ngày mua</th>
              <th>Bảo hành</th>
              <th>Hết hạn</th>
              <th>Chi nhánh</th>
              {canExchange && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const end = warrantyEnd(t.shift.date, t.warrantyMonths);
              const valid = end >= today;
              return (
                <tr key={t.id} className={rowClass(paging, i)}>
                  <td data-title>
                    <div>
                      <div className="font-medium">{t.customerName}</div>
                      <div className="text-xs font-normal text-slate-500">{t.customerPhone}</div>
                    </div>
                  </td>
                  <td data-label="Sản phẩm">
                    <div>
                      {t.productName}
                      <div className="text-xs text-slate-400">{KIND_LABEL[t.kind]}</div>
                      {t.warrantyOf && <div className="text-xs text-amber-700">Máy đổi bảo hành cho {t.warrantyOf.productName}</div>}
                      {t.exchanges.length > 0 && <div className="text-xs text-amber-700">Đã đổi bảo hành {t.exchanges.length} lần</div>}
                    </div>
                  </td>
                  <td data-label="Giá" className="text-right whitespace-nowrap tabular-nums">
                    {formatVND(t.price)}
                  </td>
                  <td data-label="Ngày mua" className="whitespace-nowrap">
                    {can(me, "customers") ? (
                      <Link href={`/day/${t.shift.date}`} className="text-blue-600 hover:underline">
                        {formatDate(t.shift.date)}
                      </Link>
                    ) : (
                      formatDate(t.shift.date)
                    )}
                  </td>
                  <td data-label="Bảo hành" className="whitespace-nowrap">
                    {t.warrantyMonths} tháng
                  </td>
                  <td data-label="Hết hạn" className="whitespace-nowrap">
                    <div>
                      {formatDate(end)}
                      <div>
                        <span className={`badge ${valid ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>
                          {valid ? "Còn bảo hành" : "Hết hạn"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Chi nhánh" className="whitespace-nowrap">
                    {t.shift.branch.name}
                  </td>
                  {canExchange && (
                    <td>
                      {valid && openShift && t.exchanges.length === 0 && (
                        <FormDialog
                          title="Đổi bảo hành"
                          triggerLabel="Đổi máy"
                          triggerVariant="secondary"
                          triggerIcon={<Repeat size={14} aria-hidden />}
                        >
                          <ActionForm
                            action={exchangeWarranty}
                            submitLabel="Đổi bảo hành"
                            successMessage="Đã ghi nhận đổi bảo hành."
                            className="grid gap-3 sm:grid-cols-2"
                          >
                            <input type="hidden" name="originalId" value={t.id} />
                            <p className="text-sm text-slate-600 sm:col-span-2">
                              Khách <b>{t.customerName}</b> · {t.customerPhone}
                              <br />
                              Máy cũ: {t.productName} (hết hạn {formatDate(end)}). Đổi ngang giá thì 0 đ; lấy máy đắt hơn thì
                              khách bù chênh lệch. Giao dịch ghi vào ca đang mở, giá vốn máy mới tính là chi phí bảo hành.
                            </p>
                            <WarrantyExchangeFields
                              options={exchangeOptions}
                              originalPrice={t.price}
                              defaultWarranty={t.warrantyMonths}
                              bankAccounts={bankAccounts}
                            />
                            <label className="field sm:col-span-2">
                              <span>Lý do / lỗi máy cũ *</span>
                              <input name="reason" required className="input" placeholder="VD: lỗi màn hình, sạc không vào" />
                            </label>
                          </ActionForm>
                        </FormDialog>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Không tìm thấy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/warranty", { q })} />
    </div>
  );
}
