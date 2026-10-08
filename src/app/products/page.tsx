import Link from "next/link";
import Form from "next/form";
import { BatteryMedium, Globe, Headphones, Search, Smartphone, TabletSmartphone } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranches, getCurrentBranch } from "@/lib/branch";
import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  STATUS_LABEL,
  capacityLabel,
  isSingleUnit,
  productStatus,
  type ProductStatus,
  sellingPrice,
} from "@/lib/product-labels";
import { dateVN, formatDate, formatVND, todayVN } from "@/lib/format";
import { ProductsTabs } from "@/components/ProductsTabs";
import { deleteProduct, saveProduct } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { ProductFields } from "@/components/ProductFields";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref } from "@/lib/paging";

type Search = { cat?: string; q?: string; cond?: string; edit?: string; status?: string; brand?: string; page?: string };

const STATUS_WHERE: Record<ProductStatus, Prisma.ProductWhereInput> = {
  AVAILABLE: { active: true, soldBranchId: null },
  SOLD: { soldBranchId: { not: null } },
  HIDDEN: { active: false, soldBranchId: null },
};

const STATUS_BADGE: Record<ProductStatus, string> = {
  AVAILABLE: "bg-green-100 text-green-800",
  SOLD: "bg-slate-200 text-slate-700",
  HIDDEN: "bg-slate-100 text-slate-500",
};

export default async function PricesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("products");
  const isAdmin = me.role === "ADMIN";
  // Giá nhập + lãi: admin hoặc nhân viên có quyền "Giá nhập & lãi" (kế toán)
  const canCost = can(me, "cost-prices");
  // Nhân viên chỉ xem thông tin sản phẩm; thống kê (đang bán, đã bán, giá trị hàng) cần quyền riêng
  const showStats = can(me, "product-stats");
  const sp = await searchParams;
  const cat = sp.cat && CATEGORY_LABEL[sp.cat] ? sp.cat : "";
  const cond = sp.cond === "NEW" || sp.cond === "USED" ? sp.cond : "";
  const q = sp.q?.trim() ?? "";
  // Nhân viên xem được "Đang bán" và "Đã bán"; "Ngừng bán" chỉ admin
  const statusOptions: ProductStatus[] = isAdmin ? ["AVAILABLE", "SOLD", "HIDDEN"] : ["AVAILABLE", "SOLD"];
  const status = statusOptions.find((s) => s === sp.status) ?? "AVAILABLE";

  const [branches, brands, current] = await Promise.all([
    getActiveBranches(),
    prisma.brand.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getCurrentBranch(),
  ]);
  // iPhone không có thương hiệu riêng → bỏ lọc hãng khi chọn loại iPhone
  const brandId = cat === "IPHONE" ? undefined : brands.find((b) => b.id === Number(sp.brand))?.id;
  // Mỗi quán quản lý hàng riêng: chỉ xem hàng của quán đang làm (đổi quán ở "Đổi chi nhánh")
  const branchId = current?.id;
  // Hàng cũ chưa gắn chi nhánh vẫn hiện ở mọi quán để admin gắn
  const branchWhere: Prisma.ProductWhereInput = branchId ? { OR: [{ ownerBranchId: branchId }, { ownerBranchId: null }] } : {};

  const where: Prisma.ProductWhereInput = {
    AND: [branchWhere],
    ...STATUS_WHERE[status],
    ...(cat && { category: cat }),
    ...(cond && { condition: cond }),
    ...(brandId && { brandId }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { variant: { contains: q, mode: "insensitive" } },
        { note: { contains: q, mode: "insensitive" } },
        { code: { contains: q.replace(/\s/g, ""), mode: "insensitive" } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
  };
  const total = await prisma.product.count({ where });
  const paging = getPaging(total, sp.page);
  const [products, editing] = await Promise.all([
    // Lấy từ đầu tới hết trang hiện tại (điện thoại cộng dồn); thêm id để thứ tự cố định giữa các trang
    prisma.product.findMany({
      where,
      include: {
        brand: { select: { name: true } },
        soldBranch: { select: { name: true } },
        ownerBranch: { select: { name: true } },
      },
      orderBy:
        status === "SOLD"
          ? [{ soldAt: "desc" }, { id: "desc" }]
          : [{ category: "asc" }, { name: "asc" }, { price: "asc" }, { id: "asc" }],
      take: paging.take,
    }),
    isAdmin && sp.edit ? prisma.product.findUnique({ where: { id: Number(sp.edit) } }) : null,
  ]);

  const filters = {
    cat,
    cond,
    q,
    status: status === "AVAILABLE" ? "" : status,
    brand: brandId ? String(brandId) : "",
  };
  // Giữ trang hiện tại để đóng hộp sửa vẫn ở đúng trang
  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { ...filters, page: paging.page > 1 ? String(paging.page) : "", ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/products?${s}` : "/products";
  };
  const backHref = qs({});
  const today = todayVN();

  // Thống kê (theo chi nhánh + loại hàng đang chọn). Giá trị = giá × số lượng còn
  const catWhere: Prisma.ProductWhereInput = { AND: [branchWhere], ...(cat && { category: cat }) };
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`);
  const [stock, soldThisMonth] = showStats
    ? await Promise.all([
        prisma.product.findMany({
          where: { ...STATUS_WHERE.AVAILABLE, ...catWhere },
          select: { category: true, price: true, salePrice: true, costPrice: true, quantity: true },
        }),
        prisma.product.count({ where: { ...catWhere, soldAt: { gte: monthStart } } }),
      ])
    : [[], 0];
  const inStock = stock.filter((p) => p.quantity > 0);
  const withCost = inStock.filter((p) => p.costPrice != null);
  const availableAgg = {
    _count: inStock.reduce((s, p) => s + p.quantity, 0),
    _sum: { price: inStock.reduce((s, p) => s + sellingPrice(p) * p.quantity, 0) },
  };
  // Lãi dự kiến chỉ tính trên hàng đã có giá nhập
  const withCostAgg = {
    _count: withCost.reduce((s, p) => s + p.quantity, 0),
    _sum: {
      price: withCost.reduce((s, p) => s + sellingPrice(p) * p.quantity, 0),
      costPrice: withCost.reduce((s, p) => s + (p.costPrice ?? 0) * p.quantity, 0),
    },
  };

  const formProps = { branches, brands, defaultBranchId: branchId };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hàng hoá"
        subtitle="Bảng giá điện thoại, phụ kiện và tình trạng hàng"
        hideTitleOnMobile
        actions={
          isAdmin && (
            <FormDialog title="Thêm sản phẩm vào bảng giá" triggerLabel="Thêm sản phẩm">
              <ActionForm
                action={saveProduct}
                submitLabel="Thêm sản phẩm"
                successMessage="Đã thêm sản phẩm."
                className="grid gap-3 sm:grid-cols-2"
              >
                <ProductFields defaultCategory={cat || "IPHONE"} {...formProps} />
              </ActionForm>
            </FormDialog>
          )
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Sửa: ${editing.name}`} defaultOpen closeHref={backHref}>
          <ActionForm
            action={saveProduct}
            submitLabel="Lưu thay đổi"
            successMessage="Đã cập nhật bảng giá."
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={editing.id} />
            <ProductFields product={editing} defaultCategory={editing.category} {...formProps} />
          </ActionForm>
        </FormDialog>
      )}

      <ProductsTabs active="list" />

      {/* Điện thoại: một dải thống kê gọn; máy tính: các thẻ riêng */}
      {showStats && (
      <>
      <div className="card grid grid-cols-3 divide-x divide-slate-100 p-0 sm:hidden">
        <MiniStat label="Đang bán" value={String(availableAgg._count)} />
        <MiniStat label="Bán tháng này" value={String(soldThisMonth)} />
        <MiniStat label="Giá trị (bán)" value={compactVND(availableAgg._sum.price ?? 0)} />
        {canCost && (
          <p className="col-span-3 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            Giá nhập <b className="text-slate-700">{compactVND(withCostAgg._sum.costPrice ?? 0)}</b> · Lãi dự kiến{" "}
            <b className="text-green-700">
              {compactVND((withCostAgg._sum.price ?? 0) - (withCostAgg._sum.costPrice ?? 0))}
            </b>{" "}
            · {withCostAgg._count}/{availableAgg._count} có giá nhập
          </p>
        )}
      </div>
      <div className={`hidden grid-cols-2 gap-3 sm:grid ${canCost ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Stat label="Đang bán" value={`${availableAgg._count} sản phẩm`} />
        <Stat label="Đã bán tháng này" value={`${soldThisMonth} sản phẩm`} />
        <Stat label="Giá trị hàng (giá bán)" value={formatVND(availableAgg._sum.price ?? 0)} />
        {canCost && (
          <Stat
            label="Giá trị hàng (giá nhập)"
            value={formatVND(withCostAgg._sum.costPrice ?? 0)}
            sub={`Lãi dự kiến ${formatVND((withCostAgg._sum.price ?? 0) - (withCostAgg._sum.costPrice ?? 0))} · ${withCostAgg._count}/${availableAgg._count} có giá nhập`}
          />
        )}
      </div>
      </>
      )}

      {/* Tìm kiếm + hãng. Điện thoại: dính dưới thanh trên cùng khi cuộn */}
      <div className="sticky top-14 z-20 -mx-3 bg-[#f5f5f5] px-3 py-2 sm:static sm:mx-0 sm:rounded-lg sm:border sm:border-slate-200/70 sm:bg-white sm:p-3">
        {/* Chọn Loại / Hãng là lọc ngay; ô tìm thì Enter hoặc bấm Tìm */}
        <Form action="/products" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {cond && <input type="hidden" name="cond" value={cond} />}
          {status !== "AVAILABLE" && <input type="hidden" name="status" value={status} />}
          <div className="col-span-2 flex min-w-0 gap-2 sm:order-last sm:flex-1">
            <label className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Tìm tên, mã / IMEI..."
                aria-label="Tìm sản phẩm"
                className="input pl-9"
              />
            </label>
            <button className="btn-secondary shrink-0" aria-label="Tìm">
              <Search size={16} className="sm:hidden" aria-hidden />
              <span className="hidden sm:inline">Tìm</span>
            </button>
          </div>
          <AutoSubmitSelect name="cat" defaultValue={cat} aria-label="Loại" className="input sm:w-40">
            <option value="">Mọi loại</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </AutoSubmitSelect>
          {brands.length > 0 && cat !== "IPHONE" && (
            <AutoSubmitSelect name="brand" defaultValue={brandId ?? ""} aria-label="Thương hiệu" className="input sm:w-44">
              <option value="">Mọi thương hiệu</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </AutoSubmitSelect>
          )}
        </Form>
      </div>

      <p className="-mt-2 px-1 text-sm text-slate-500 sm:hidden">{total} sản phẩm</p>

      {/* Điện thoại: dạng thẻ */}
      <div className="space-y-2 sm:hidden">
        {products.map((p) => {
          const st = productStatus(p);
          return (
            <div key={p.id} className={`card p-3 ${st === "AVAILABLE" ? "" : "opacity-75"}`}>
              {/* Badge, ghi chú nằm thẳng cột với tên (không chui xuống dưới icon) để thẻ gọn hơn */}
              <div className="flex items-start gap-3">
                <CategoryIcon category={p.category} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 leading-snug font-semibold">{p.name}</p>
                    <PriceText product={p} className="shrink-0 font-bold text-[#1677ff]" />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {[p.brand?.name, capacityLabel(p), p.variant, !cat && CATEGORY_LABEL[p.category]]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(p.code || p.ownerBranch) && (
                    <p className="text-xs text-slate-500 tabular-nums">
                      {[p.code && `Mã ${p.code}`, p.ownerBranch && `Hàng của ${p.ownerBranch.name}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {canCost && p.costPrice != null && <ProfitLine cost={p.costPrice} price={sellingPrice(p)} />}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ConditionBadge condition={p.condition} />
                    {!isSingleUnit(p) && st === "AVAILABLE" && <QtyBadge value={p.quantity} />}
                    {p.batteryHealth != null && <BatteryBadge value={p.batteryHealth} />}
                    {p.warrantyMonths > 0 && (
                      <span className="badge bg-slate-100 text-slate-700">BH {p.warrantyMonths} tháng</span>
                    )}
                    {isAdmin && p.showOnWeb && <WebBadge />}
                    {st !== "AVAILABLE" && (
                      <StatusBadge status={st} branch={p.soldBranch?.name} soldAt={p.soldAt} today={today} />
                    )}
                  </div>
                  {p.note && <p className="mt-1 text-xs text-slate-500">{p.note}</p>}
                </div>
              </div>
              {isAdmin && (
                <div className="mt-3 flex justify-end gap-5 border-t border-slate-100 pt-2">
                  <Link href={qs({ edit: String(p.id) })} className="text-sm text-[#1677ff]">
                    Sửa
                  </Link>
                  <ConfirmButton action={deleteProduct.bind(null, p.id)} message={`Xoá "${p.name}" khỏi bảng giá?`}>
                    Xoá
                  </ConfirmButton>
                </div>
              )}
            </div>
          );
        })}
        {products.length === 0 && <p className="card text-center text-slate-500">Không có sản phẩm nào.</p>}
      </div>

      {/* Máy tính: bảng */}
      <div className="card hidden overflow-x-auto p-0 sm:block sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Cấu hình / màu</th>
              <th>Tình trạng</th>
              {canCost && <th className="text-right">Giá nhập</th>}
              <th className="text-right">Giá bán</th>
              {canCost && <th className="text-right">Lãi</th>}
              <th>Bảo hành</th>
              <th>Trạng thái</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {/* Máy tính chỉ hiện đúng trang hiện tại */}
            {products.slice(paging.start).map((p) => {
              const st = productStatus(p);
              return (
                <tr key={p.id} className={st === "AVAILABLE" ? "" : "text-slate-500"}>
                  <td>
                    <div className="flex items-start gap-3">
                      <CategoryIcon category={p.category} />
                      <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      {p.name}
                      {isAdmin && p.showOnWeb && <WebBadge />}
                    </div>
                    <div className="text-xs text-slate-500">
                      {[p.brand?.name, !cat && CATEGORY_LABEL[p.category]].filter(Boolean).join(" · ")}
                      {p.code && <span className="tabular-nums"> · Mã {p.code}</span>}
                      {p.ownerBranch && <span> · Hàng của {p.ownerBranch.name}</span>}
                    </div>
                    {p.note && <div className="text-xs text-slate-400">{p.note}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    {capacityLabel(p) && <div className="font-medium text-slate-800">{capacityLabel(p)}</div>}
                    {p.variant && <div className="text-slate-500">{p.variant}</div>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <ConditionBadge condition={p.condition} />
                      {!isSingleUnit(p) && st === "AVAILABLE" && <QtyBadge value={p.quantity} />}
                      {p.batteryHealth != null && <BatteryBadge value={p.batteryHealth} />}
                    </div>
                  </td>
                  {canCost && (
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {p.costPrice != null ? formatVND(p.costPrice) : "—"}
                    </td>
                  )}
                  <td className="text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                    <PriceText product={p} />
                  </td>
                  {canCost && (
                    <td
                      className={`text-right whitespace-nowrap tabular-nums ${
                        p.costPrice == null ? "" : sellingPrice(p) - p.costPrice >= 0 ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {p.costPrice != null ? formatVND(sellingPrice(p) - p.costPrice) : "—"}
                    </td>
                  )}
                  <td className="whitespace-nowrap">{p.warrantyMonths > 0 ? `${p.warrantyMonths} tháng` : "—"}</td>
                  <td>
                    <StatusBadge status={st} branch={p.soldBranch?.name} soldAt={p.soldAt} today={today} />
                  </td>
                  {isAdmin && (
                    <td className="space-x-3 text-right whitespace-nowrap">
                      <Link href={qs({ edit: String(p.id) })} className="text-sm text-[#1677ff] hover:underline">
                        Sửa
                      </Link>
                      <ConfirmButton action={deleteProduct.bind(null, p.id)} message={`Xoá "${p.name}" khỏi bảng giá?`}>
                        Xoá
                      </ConfirmButton>
                    </td>
                  )}
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Không có sản phẩm nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/products", filters)} />
    </div>
  );
}

/** Số lượng còn của hàng đếm được (phụ kiện...). Hết / âm thì tô đỏ để nhập thêm hoặc kiểm kho. */
function QtyBadge({ value }: { value: number }) {
  return (
    <span className={`badge tabular-nums ${value > 0 ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-700"}`}>
      {value > 0 ? `Còn ${value}` : value === 0 ? "Hết hàng" : `Âm ${-value} — cần kiểm kho`}
    </span>
  );
}

function ConditionBadge({ condition }: { condition: string }) {
  return (
    <span className={`badge ${condition === "USED" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
      {CONDITION_LABEL[condition]}
    </span>
  );
}

function BatteryBadge({ value }: { value: number }) {
  const tone = value >= 85 ? "bg-green-50 text-green-700" : value >= 80 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return (
    <span className={`badge inline-flex items-center gap-1 ${tone}`} title="Tình trạng pin">
      <BatteryMedium size={12} aria-hidden /> {value}%
    </span>
  );
}

function StatusBadge({
  status,
  branch,
  soldAt,
  today,
}: {
  status: ProductStatus;
  branch?: string;
  soldAt: Date | null;
  today: string;
}) {
  if (status !== "SOLD") return <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>;
  const date = soldAt ? dateVN(soldAt) : null;
  return (
    <span className="inline-flex flex-col">
      <span className={`badge ${STATUS_BADGE.SOLD}`}>Đã bán · {branch ?? "?"}</span>
      {date && <span className="mt-0.5 text-xs text-slate-400">{date === today ? "Hôm nay" : formatDate(date)}</span>}
    </span>
  );
}

/** Giá bán; có giá sale thì hiện giá sale + giá gốc gạch ngang */
function PriceText({
  product,
  className = "",
}: {
  product: { category: string; price: number; salePrice: number | null };
  className?: string;
}) {
  const sell = sellingPrice(product);
  if (sell === product.price) return <span className={`tabular-nums ${className}`}>{formatVND(product.price)}</span>;
  return (
    <span className={`flex flex-col items-end tabular-nums ${className}`}>
      <span className="text-red-600">{formatVND(sell)}</span>
      <s className="text-xs font-normal text-slate-400">{formatVND(product.price)}</s>
    </span>
  );
}

function ProfitLine({ cost, price }: { cost: number; price: number }) {
  const profit = price - cost;
  return (
    <p className="mt-1 text-xs text-slate-500">
      Giá nhập {formatVND(cost)} · Lãi{" "}
      <b className={profit >= 0 ? "text-green-700" : "text-red-600"}>{formatVND(profit)}</b>
    </p>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Tiền rút gọn cho ô hẹp trên điện thoại: 173,8 tr · 1,25 tỷ */
function compactVND(n: number) {
  const fmt = (v: number, digits: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: digits });
  if (Math.abs(n) >= 1e9) return `${fmt(n / 1e9, 2)} tỷ`;
  if (Math.abs(n) >= 1e6) return `${fmt(n / 1e6, 1)} tr`;
  return formatVND(n);
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

const CATEGORY_ICON = { IPHONE: Smartphone, ANDROID: TabletSmartphone, ACCESSORY: Headphones } as const;

function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICON[category as keyof typeof CATEGORY_ICON] ?? Smartphone;
  const tone =
    category === "IPHONE"
      ? "bg-slate-900 text-white"
      : category === "ANDROID"
        ? "bg-green-100 text-green-700"
        : "bg-amber-100 text-amber-700";
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${tone}`} aria-hidden>
      <Icon size={18} />
    </span>
  );
}

function WebBadge() {
  return (
    <span className="badge inline-flex items-center gap-0.5 bg-blue-50 text-[#1677ff]" title="Đang hiển thị trên web">
      <Globe size={11} aria-hidden /> Web
    </span>
  );
}
