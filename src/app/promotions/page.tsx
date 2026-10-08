import Link from "next/link";
import { ImageOff, Star } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getActiveBranches, getBranches } from "@/lib/branch";
import { formatDate, todayVN } from "@/lib/format";
import { CATEGORY_LABEL, CONDITION_LABEL, productPickLabel } from "@/lib/product-labels";
import {
  PROMOTION_STATUS_LABEL,
  PROMOTION_TYPE_BADGE,
  PROMOTION_TYPE_LABEL,
  discountText,
  matchesPromotion,
  promotionStatus,
  type PromotionStatus,
} from "@/lib/promotion-labels";
import { deletePromotion, savePromotion, togglePromotion } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { PromotionFields, type PromotionFormValue } from "@/components/PromotionFields";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { status?: string; q?: string; page?: string; edit?: string };

const STATUSES = ["RUNNING", "UPCOMING", "ENDED", "PAUSED"] as const;

const STATUS_BADGE: Record<PromotionStatus, string> = {
  RUNNING: "bg-green-100 text-green-800",
  UPCOMING: "bg-blue-100 text-blue-800",
  ENDED: "bg-slate-100 text-slate-500",
  PAUSED: "bg-amber-100 text-amber-800",
};

/** Điều kiện lọc DB theo trạng thái (ngày dạng YYYY-MM-DD so sánh chuỗi được). */
function statusWhere(status: PromotionStatus, today: string): Prisma.PromotionWhereInput {
  switch (status) {
    case "RUNNING":
      return { active: true, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] };
    case "UPCOMING":
      return { active: true, startDate: { gt: today } };
    case "ENDED":
      return { active: true, endDate: { lt: today } };
    case "PAUSED":
      return { active: false };
  }
}

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("promotions");
  const sp = await searchParams;
  const today = todayVN();
  const status = STATUSES.find((s) => s === sp.status) ?? "";
  const q = sp.q?.trim() ?? "";

  const where: Prisma.PromotionWhereInput = {
    ...(status && statusWhere(status, today)),
    ...(q && { title: { contains: q, mode: "insensitive" } }),
  };
  const [total, counts, products, brands, branches, activeBranches] = await Promise.all([
    prisma.promotion.count({ where }),
    Promise.all(STATUSES.map((s) => prisma.promotion.count({ where: statusWhere(s, today) }))),
    // Hàng đang bán: để chọn sản phẩm áp dụng + đếm số sản phẩm mỗi chương trình áp dụng
    prisma.product.findMany({
      where: { active: true, soldBranchId: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getBranches(),
    getActiveBranches(),
  ]);
  const paging = getPaging(total, sp.page);
  const [promotions, editing] = await Promise.all([
    prisma.promotion.findMany({
      where,
      // Thêm id để thứ tự cố định khi phân trang bằng take
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: paging.take,
    }),
    // Tìm riêng: chương trình đang sửa có thể không nằm trong trang đang xem
    sp.edit ? prisma.promotion.findUnique({ where: { id: Number(sp.edit) || 0 } }) : null,
  ]);

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const productOptions = products.map((p) => ({ id: p.id, label: productPickLabel(p) }));
  const backHref = pageHref("/promotions", { status, q })(paging.page);
  const editHref = (id: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}edit=${id}`;
  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, q, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/promotions?${s}` : "/promotions";
  };
  const tabs: [string, string][] = [
    ["", `Tất cả (${counts.reduce((a, b) => a + b, 0)})`],
    ...STATUSES.map((s, i): [string, string] => [s, `${PROMOTION_STATUS_LABEL[s]} (${counts[i]})`]),
  ];

  /** "iPhone, Android · Cũ 99% · Samsung" / "3 sản phẩm" / "Toàn bộ hàng hoá" */
  const scopeText = (p: PromotionFormValue) => {
    if (p.productIds.length) return `${p.productIds.length} sản phẩm chọn riêng`;
    const parts = [
      p.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(", "),
      p.conditions.map((c) => CONDITION_LABEL[c] ?? c).join(", "),
      p.brandIds.map((id) => brandName.get(id) ?? `#${id}`).join(", "),
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Toàn bộ hàng hoá";
  };

  const renderForm = (editing?: PromotionFormValue) => (
    <ActionForm
      action={savePromotion}
      submitLabel={editing ? "Lưu thay đổi" : "Tạo chương trình"}
      successMessage={editing ? "Đã lưu thay đổi." : "Đã tạo chương trình khuyến mãi."}
      className="grid gap-3 sm:grid-cols-2"
    >
      <PromotionFields
        promotion={editing}
        today={today}
        brands={brands.map((b) => ({ id: b.id, label: b.name }))}
        branches={activeBranches.map((b) => ({ id: b.id, label: b.name }))}
        products={productOptions}
      />
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chương trình khuyến mãi"
        subtitle="Giảm giá, quà tặng, trả góp 0%, thu cũ đổi mới — áp dụng tại quầy và trên web"
        actions={
          <FormDialog title="Tạo chương trình khuyến mãi" triggerLabel="Tạo chương trình">
            {renderForm()}
          </FormDialog>
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Sửa: ${editing.title}`} defaultOpen closeHref={backHref}>
          {renderForm(editing)}
        </FormDialog>
      )}

      <div className="card flex flex-wrap items-center gap-2 p-3 sm:p-3">
        <div className="inline-flex flex-wrap rounded-md bg-white p-0.5 ring-1 ring-slate-200">
          {tabs.map(([v, l]) => (
            <Link
              key={v}
              href={qs({ status: v })}
              className={`rounded px-3 py-1.5 text-sm ${status === v ? "bg-[#1677ff] font-medium text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <form action="/promotions" className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-1">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Tìm theo tên chương trình..." className="input min-w-0 flex-1 sm:max-w-xs" />
          <button className="btn-secondary">Tìm</button>
        </form>
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Chương trình</th>
              <th>Ưu đãi</th>
              <th>Áp dụng</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((p, i) => {
              const st = promotionStatus(p, today);
              const productCount = products.filter((x) => matchesPromotion(p, x)).length;
              const daysLeft =
                st === "RUNNING" && p.endDate
                  ? Math.round((Date.parse(p.endDate) - Date.parse(today)) / 86_400_000)
                  : null;
              return (
                <tr key={p.id} className={rowClass(paging, i)}>
                  <td data-title>
                    <Link href={editHref(p.id)} className="flex items-center gap-3 hover:text-[#1677ff]">
                      {p.bannerUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.bannerUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                          <ImageOff size={16} aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-medium">
                          {p.featured && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Nổi bật" />}
                          <span className="line-clamp-2">{p.title}</span>
                        </span>
                        <span className="block truncate text-xs font-normal text-slate-400">
                          {p.showOnWeb ? `/${p.slug}` : "Không hiện trên web"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td data-label="Ưu đãi">
                    <div>
                      <span className={`badge ${PROMOTION_TYPE_BADGE[p.type] ?? ""}`}>{PROMOTION_TYPE_LABEL[p.type] ?? p.type}</span>
                      <p className="mt-1 text-sm">
                        {p.type === "DISCOUNT" ? <b className="text-red-600">{discountText(p)}</b> : p.summary}
                      </p>
                    </div>
                  </td>
                  <td data-label="Áp dụng">
                    <div className="text-sm">
                      <p>{scopeText(p)}</p>
                      <p className="text-xs text-slate-500">
                        {productCount} sản phẩm đang bán ·{" "}
                        {p.branchIds.length
                          ? p.branchIds.map((id) => branchName.get(id) ?? `#${id}`).join(", ")
                          : "Mọi chi nhánh"}
                      </p>
                    </div>
                  </td>
                  <td data-label="Thời gian" className="whitespace-nowrap">
                    <div className="text-sm tabular-nums">
                      <p>
                        {formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : "không thời hạn"}
                      </p>
                      {daysLeft != null && (
                        <p className={`text-xs ${daysLeft <= 2 ? "text-red-600" : "text-slate-500"}`}>
                          {daysLeft === 0 ? "Kết thúc hôm nay" : `Còn ${daysLeft} ngày`}
                        </p>
                      )}
                    </div>
                  </td>
                  <td data-label="Trạng thái">
                    <span className={`badge ${STATUS_BADGE[st]}`}>{PROMOTION_STATUS_LABEL[st]}</span>
                  </td>
                  <td className="space-x-3 text-right whitespace-nowrap">
                    <Link href={editHref(p.id)} className="text-sm text-[#1677ff] hover:underline">
                      Sửa
                    </Link>
                    <ConfirmButton
                      action={togglePromotion.bind(null, p.id)}
                      message={p.active ? `Tạm dừng "${p.title}"?` : `Chạy lại "${p.title}"?`}
                      className="text-sm text-[#1677ff] hover:underline"
                    >
                      {p.active ? "Tạm dừng" : "Chạy lại"}
                    </ConfirmButton>
                    <ConfirmButton action={deletePromotion.bind(null, p.id)} message={`Xoá chương trình "${p.title}"?`}>
                      Xoá
                    </ConfirmButton>
                  </td>
                </tr>
              );
            })}
            {promotions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Chưa có chương trình khuyến mãi nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/promotions", { status, q })} />
    </div>
  );
}
