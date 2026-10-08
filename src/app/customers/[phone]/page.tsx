import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatPhone } from "@/lib/customers";
import { formatDate, formatVND, KIND_LABEL, PAYMENT_LABEL, todayVN, warrantyEnd } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ phone: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission("customers");
  const phone = decodeURIComponent((await params).phone);
  const sp = await searchParams;
  const txs = await prisma.transaction.findMany({
    where: { customerPhone: phone },
    include: { shift: { select: { date: true, staffName: true, branch: { select: { name: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (txs.length === 0) notFound();

  const today = todayVN();
  const name = txs.find((t) => t.customerName)?.customerName ?? "(chưa có tên)";
  // Tên từng được ghi khác nhau qua các lần (gõ tắt, sai chính tả...) — hiện để admin biết
  const otherNames = [...new Set(txs.map((t) => t.customerName).filter((n): n is string => !!n && n !== name))];
  const total = txs.reduce((s, t) => s + t.price, 0);
  const dates = txs.map((t) => t.shift.date).sort();
  const rows = txs.map((t) => {
    const end = t.warrantyMonths > 0 ? warrantyEnd(t.shift.date, t.warrantyMonths) : null;
    return { ...t, end, valid: end != null && end >= today };
  });
  const activeWarranties = rows.filter((r) => r.valid).length;
  // Số liệu ở trên tính từ mọi giao dịch; chỉ bảng lịch sử là phân trang
  const paging = getPaging(rows.length, sp.page);
  const shown = rows.slice(0, paging.take);
  // Zalo nhận số dạng 0xxxxxxxxx; số +84 đổi về 0
  const zaloPhone = phone.replace(/^\+84/, "0");

  return (
    <div className="space-y-5">
      <PageHeader
        title={name}
        subtitle={
          <>
            <span className="tabular-nums">{formatPhone(phone)}</span>
            {otherNames.length > 0 && <> · Tên khác: {otherNames.join(", ")}</>}
          </>
        }
        actions={
          <>
            <Link href="/customers" className="btn-secondary">
              <ArrowLeft size={16} aria-hidden /> Danh sách
            </Link>
            <a href={`tel:${phone}`} className="btn-secondary">
              <Phone size={16} aria-hidden /> Gọi
            </a>
            <a href={`https://zalo.me/${zaloPhone}`} target="_blank" rel="noreferrer" className="btn-primary">
              <MessageCircle size={16} aria-hidden /> Zalo
            </a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tổng chi tiêu" value={formatVND(total)} />
        <Stat
          label="Số lần"
          value={String(txs.length)}
          sub={`${txs.filter((t) => t.kind === "SALE").length} mua · ${txs.filter((t) => t.kind === "REPAIR").length} sửa`}
        />
        <Stat label="Khách từ" value={formatDate(dates[0])} sub={`Gần nhất ${formatDate(dates.at(-1)!)}`} />
        <Stat label="Còn bảo hành" value={`${activeWarranties} sản phẩm`} />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Lịch sử mua hàng / sửa chữa</h2>
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Sản phẩm / Dịch vụ</th>
                <th>Ngày</th>
                <th className="text-right">Giá</th>
                <th>Bảo hành</th>
                <th>Chi nhánh</th>
                <th>Nhân viên</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t, i) => (
                <tr key={t.id} className={rowClass(paging, i)}>
                  <td data-title>
                    <span>
                      <span className="block font-medium">{t.productName}</span>
                      <span className="block text-xs font-normal text-slate-500">
                        {KIND_LABEL[t.kind]} · {PAYMENT_LABEL[t.paymentMethod]}
                        {t.note && ` · ${t.note}`}
                      </span>
                    </span>
                  </td>
                  <td data-label="Ngày" className="whitespace-nowrap">
                    <Link href={`/day/${t.shift.date}`} className="text-[#1677ff] hover:underline">
                      {formatDate(t.shift.date)}
                    </Link>
                  </td>
                  <td data-label="Giá" className="text-right whitespace-nowrap tabular-nums">
                    {formatVND(t.price)}
                  </td>
                  <td data-label="Bảo hành" className="whitespace-nowrap">
                    {t.end ? (
                      <span>
                        <span className={`badge ${t.valid ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>
                          {t.valid ? "Còn" : "Hết"} · {t.warrantyMonths} tháng
                        </span>
                        <span className="block text-xs text-slate-500">đến {formatDate(t.end)}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td data-label="Chi nhánh" className="whitespace-nowrap">
                    {t.shift.branch.name}
                  </td>
                  <td data-label="Nhân viên" className="whitespace-nowrap">
                    {t.shift.staffName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination paging={paging} href={pageHref(`/customers/${encodeURIComponent(phone)}`, {})} />
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
