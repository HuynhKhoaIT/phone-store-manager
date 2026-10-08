import { ArrowRight, Globe, MapPin, Phone, PiggyBank } from "lucide-react";
import Link from "next/link";
import type { Branch } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { saveBranch } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { formatDate, formatVND } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ edit?: string; page?: string }> }) {
  await requireAdmin();
  const { edit, page } = await searchParams;
  const paging = getPaging(await prisma.branch.count(), page);
  const [branches, editing] = await Promise.all([
    prisma.branch.findMany({
      orderBy: [{ active: "desc" }, { id: "asc" }],
      include: {
        staff: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
        _count: { select: { shifts: true } },
      },
      take: paging.take,
    }),
    // Tìm riêng: chi nhánh đang sửa có thể không nằm trong trang đang xem
    edit ? prisma.branch.findUnique({ where: { id: Number(edit) || 0 } }) : null,
  ]);
  const backHref = pageHref("/branches", {})(paging.page);
  const editHref = (id: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}edit=${id}`;
  // Vốn góp mỗi chi nhánh lấy từ sổ vốn (Báo cáo › Góp vốn)
  const capital = await prisma.capitalEntry.groupBy({
    by: ["branchId"],
    where: { type: "CONTRIBUTE" },
    _sum: { amount: true },
  });
  const investmentOf = (id: number) => capital.find((c) => c.branchId === id)?._sum.amount ?? 0;
  const unassigned = await prisma.user.findMany({
    where: { active: true, role: "STAFF", branches: { none: {} } },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  const renderForm = (editing?: Branch) => (
    <ActionForm
      action={saveBranch}
      submitLabel={editing ? "Lưu thay đổi" : "Thêm chi nhánh"}
      successMessage={editing ? "Đã lưu thay đổi." : "Đã thêm chi nhánh."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <label className="field sm:col-span-2">
        <span>Tên chi nhánh *</span>
        <input name="name" required defaultValue={editing?.name} className="input" placeholder="VD: Chi nhánh 3" />
      </label>
      <label className="field">
        <span>Bắt đầu tính hoà vốn từ</span>
        <input name="openedAt" type="date" defaultValue={editing?.openedAt ?? ""} className="input" />
        <small className="text-slate-500">Để trống = từ ca làm việc đầu tiên. Vốn góp ghi ở Báo cáo › Góp vốn.</small>
      </label>
      <fieldset className="col-span-full grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-slate-700">
          <Globe size={16} className="text-[#1677ff]" aria-hidden /> Hiển thị trên web bán hàng
        </legend>
        <label className="col-span-full flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showOnWeb"
            defaultChecked={editing?.showOnWeb ?? true}
            className="size-4 accent-[#1677ff]"
          />
          Hiện cửa hàng này trên web (địa chỉ, hotline, bản đồ)
        </label>
        <label className="field sm:col-span-2">
          <span>Địa chỉ</span>
          <input name="address" defaultValue={editing?.address ?? ""} className="input" placeholder="VD: Thôn Tân Hy, Xã Vạn Tường, Quảng Ngãi" />
        </label>
        <label className="field">
          <span>Hotline</span>
          <input name="phone" type="tel" inputMode="tel" defaultValue={editing?.phone ?? ""} className="input" placeholder="VD: 0869 950 090" />
        </label>
        <label className="field">
          <span>Zalo</span>
          <input name="zalo" defaultValue={editing?.zalo ?? ""} className="input" placeholder="Số Zalo hoặc link zalo.me" />
          <small className="text-slate-500">Để trống = dùng hotline. Số Zalo phải bật cho người lạ tìm qua SĐT.</small>
        </label>
        <label className="field">
          <span>Facebook</span>
          <input name="facebookUrl" type="url" defaultValue={editing?.facebookUrl ?? ""} className="input" placeholder="https://facebook.com/..." />
        </label>
        <label className="field">
          <span>TikTok</span>
          <input name="tiktokUrl" type="url" defaultValue={editing?.tiktokUrl ?? ""} className="input" placeholder="https://www.tiktok.com/@..." />
        </label>
        <label className="field sm:col-span-2">
          <span>Vị trí Google Maps</span>
          <input name="mapUrl" type="url" defaultValue={editing?.mapUrl ?? ""} className="input" placeholder="Dán link từ Google Maps" />
          <small className="text-slate-500">
            Mở Google Maps trên máy tính, tìm cửa hàng, copy link trên thanh địa chỉ (có dạng …/@15.12,108.80…) để bản đồ
            trên web đúng vị trí. Để trống = tìm theo địa chỉ.
          </small>
        </label>
        <label className="field">
          <span>Giờ mở cửa</span>
          <input name="openingHours" defaultValue={editing?.openingHours ?? ""} className="input" placeholder="VD: 7:30 – 21:30 hằng ngày" />
        </label>
        <label className="field">
          <span>Thứ tự trên web</span>
          <input name="webSortOrder" type="number" defaultValue={editing?.webSortOrder ?? 0} className="input" />
          <small className="text-slate-500">Số nhỏ hiện trước. Cửa hàng đầu tiên = hotline / Zalo chính của web.</small>
        </label>
      </fieldset>
      {editing && (
        <label className="field">
          <span>Trạng thái</span>
          <select name="active" defaultValue={String(editing.active)} className="input">
            <option value="true">Đang hoạt động</option>
            <option value="false">Ngừng hoạt động (ẩn)</option>
          </select>
        </label>
      )}
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chi nhánh"
        subtitle="Thêm, đổi tên hoặc ẩn chi nhánh"
        actions={
          true && (
            <FormDialog title="Thêm chi nhánh" triggerLabel="Thêm chi nhánh">
              {renderForm()}
            </FormDialog>
          )
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Sửa: ${editing.name}`} defaultOpen closeHref={backHref}>
          {renderForm(editing)}
        </FormDialog>
      )}


      <div className="grid gap-3 md:grid-cols-2">
        {branches.map((b, i) => (
          <section key={b.id} className={`card ${b.active ? "" : "opacity-60"} ${rowClass(paging, i)}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">
                  <MapPin size={18} className="mr-1 inline text-[#1677ff]" aria-hidden />
                  {b.name}
                  {!b.active && <span className="badge ml-2 bg-slate-100 align-middle text-slate-500">Ngừng hoạt động</span>}
                </h2>
                <p className="text-sm text-slate-500">{b._count.shifts} ca làm việc đã ghi nhận</p>
                {(b.address || b.phone) && (
                  <p className="mt-1 text-sm text-slate-600">
                    {b.phone && (
                      <span className="mr-3 whitespace-nowrap">
                        <Phone size={14} className="mr-1 inline align-text-bottom text-slate-400" aria-hidden />
                        {b.phone}
                      </span>
                    )}
                    {b.address}
                  </p>
                )}
                <p className="mt-1 text-xs">
                  {b.showOnWeb ? (
                    <span className="badge bg-blue-50 text-blue-700">Hiện trên web · thứ tự {b.webSortOrder}</span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-500">Ẩn trên web</span>
                  )}
                </p>
                {(investmentOf(b.id) > 0 || b.openedAt) && (
                  <p className="mt-1 text-sm text-slate-600">
                    <PiggyBank size={14} className="mr-1 inline align-text-bottom text-slate-400" aria-hidden />
                    Vốn góp {formatVND(investmentOf(b.id))}
                    {b.openedAt && ` · tính từ ${formatDate(b.openedAt)}`} ·{" "}
                    <Link href="/reports/break-even" className="text-blue-600 hover:underline">
                      Xem hoà vốn
                    </Link>
                  </p>
                )}
              </div>
              <Link href={editHref(b.id)} className="text-sm text-blue-600 hover:underline">
                Sửa
              </Link>
            </div>
            <div className="mt-3 text-sm">
              <p className="font-medium text-slate-600">Nhân viên được phân công:</p>
              {b.staff.length > 0 ? (
                <p className="mt-1">{b.staff.map((s) => s.name).join(", ")}</p>
              ) : (
                <p className="mt-1 text-slate-400">Chưa có</p>
              )}
              <Link href={`/users?branch=${b.id}`} className="mt-2 inline-block text-blue-600 hover:underline">
                Xem / phân công nhân viên <ArrowRight size={14} className="inline" aria-hidden />
              </Link>
            </div>
          </section>
        ))}
      </div>

      <Pagination paging={paging} href={pageHref("/branches", {})} />

      {unassigned.length > 0 && (
        <p className="text-sm text-slate-500">
          Nhân viên làm được ở <b>mọi chi nhánh</b> (chưa giới hạn): {unassigned.map((u) => u.name).join(", ")}
        </p>
      )}
    </div>
  );
}
