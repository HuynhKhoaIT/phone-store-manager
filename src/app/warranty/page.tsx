import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatVND, KIND_LABEL, todayVN, warrantyEnd } from "@/lib/format";

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
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
  const rows = await prisma.transaction.findMany({
    where,
    include: { shift: { include: { branch: true } } },
    orderBy: { createdAt: "desc" },
    take: q ? 200 : 30,
  });
  const today = todayVN();

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
        {q ? `Tìm thấy ${rows.length} sản phẩm có bảo hành.` : "30 sản phẩm bảo hành gần nhất:"}
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
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const end = warrantyEnd(t.shift.date, t.warrantyMonths);
              const valid = end >= today;
              return (
                <tr key={t.id}>
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
                    </div>
                  </td>
                  <td data-label="Giá" className="text-right whitespace-nowrap tabular-nums">
                    {formatVND(t.price)}
                  </td>
                  <td data-label="Ngày mua" className="whitespace-nowrap">
                    {me.role === "ADMIN" ? (
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
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Không tìm thấy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
