import Link from "next/link";
import { BatteryMedium, Globe, Headphones, Smartphone, TabletSmartphone } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveBranches } from "@/lib/branch";
import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  STATUS_LABEL,
  capacityLabel,
  productStatus,
  type ProductStatus,
} from "@/lib/product-labels";
import { dateVN, formatDate, formatVND, todayVN } from "@/lib/format";
import { ProductsTabs } from "@/components/ProductsTabs";
import { deleteProduct, saveProduct } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { ProductFields } from "@/components/ProductFields";

type Search = { cat?: string; q?: string; cond?: string; edit?: string; status?: string; brand?: string };

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
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const sp = await searchParams;
  const cat = sp.cat && CATEGORY_LABEL[sp.cat] ? sp.cat : "";
  const cond = sp.cond === "NEW" || sp.cond === "USED" ? sp.cond : "";
  const q = sp.q?.trim() ?? "";
  // Nhân viên xem được "Đang bán" và "Đã bán"; "Ngừng bán" chỉ admin
  const statusOptions: ProductStatus[] = isAdmin ? ["AVAILABLE", "SOLD", "HIDDEN"] : ["AVAILABLE", "SOLD"];
  const status = statusOptions.find((s) => s === sp.status) ?? "AVAILABLE";

  const [branches, brands] = await Promise.all([
    getActiveBranches(),
    prisma.brand.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const brandId = brands.find((b) => b.id === Number(sp.brand))?.id;

  const where: Prisma.ProductWhereInput = {
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
  const [products, editing] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: { select: { name: true } }, soldBranch: { select: { name: true } } },
      orderBy: status === "SOLD" ? [{ soldAt: "desc" }] : [{ category: "asc" }, { name: "asc" }, { price: "asc" }],
    }),
    isAdmin && sp.edit ? prisma.product.findUnique({ where: { id: Number(sp.edit) } }) : null,
  ]);

  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = {
      cat,
      cond,
      q,
      status: status === "AVAILABLE" ? "" : status,
      brand: brandId ? String(brandId) : "",
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/products?${s}` : "/products";
  };
  const backHref = qs({});
  const today = todayVN();

  // Thống kê (theo bộ lọc loại hàng đang chọn)
  const catWhere: Prisma.ProductWhereInput = cat ? { category: cat } : {};
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`);
  const [availableAgg, withCostAgg, soldThisMonth] = await Promise.all([
    prisma.product.aggregate({ where: { ...STATUS_WHERE.AVAILABLE, ...catWhere }, _count: true, _sum: { price: true } }),
    // Lãi dự kiến chỉ tính trên hàng đã có giá nhập
    prisma.product.aggregate({
      where: { ...STATUS_WHERE.AVAILABLE, ...catWhere, costPrice: { not: null } },
      _count: true,
      _sum: { price: true, costPrice: true },
    }),
    prisma.product.count({ where: { ...catWhere, soldAt: { gte: monthStart } } }),
  ]);

  const formProps = { branches, brands };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hàng hoá"
        subtitle="Bảng giá điện thoại, phụ kiện và tình trạng hàng"
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

      <div className={`grid grid-cols-2 gap-3 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Stat label="Đang bán" value={`${availableAgg._count} sản phẩm`} />
        <Stat label="Đã bán tháng này" value={`${soldThisMonth} sản phẩm`} />
        <Stat label="Giá trị hàng (giá bán)" value={formatVND(availableAgg._sum.price ?? 0)} />
        {isAdmin && (
          <Stat
            label="Giá trị hàng (giá nhập)"
            value={formatVND(withCostAgg._sum.costPrice ?? 0)}
            sub={`Lãi dự kiến ${formatVND((withCostAgg._sum.price ?? 0) - (withCostAgg._sum.costPrice ?? 0))} · ${withCostAgg._count}/${availableAgg._count} có giá nhập`}
          />
        )}
      </div>

      {/* Bộ lọc */}
      <div className="card flex flex-wrap items-center gap-2 p-3 sm:p-3">
        <Segmented
          items={statusOptions.map((s) => [s === "AVAILABLE" ? "" : s, STATUS_LABEL[s]])}
          value={status === "AVAILABLE" ? "" : status}
          href={(v) => qs({ status: v })}
        />
        <Segmented
          items={[["", "Tất cả"], ...Object.entries(CATEGORY_LABEL)]}
          value={cat}
          href={(v) => qs({ cat: v })}
        />
        <Segmented
          items={[
            ["", "Mới + Cũ"],
            ["NEW", "Mới"],
            ["USED", "Cũ 99%"],
          ]}
          value={cond}
          href={(v) => qs({ cond: v })}
        />
        <form action="/products" className="flex w-full flex-wrap gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {cond && <input type="hidden" name="cond" value={cond} />}
          {status !== "AVAILABLE" && <input type="hidden" name="status" value={status} />}
          {brands.length > 0 && (
            <select name="brand" defaultValue={brandId ?? ""} aria-label="Thương hiệu" className="input w-auto">
              <option value="">Mọi thương hiệu</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm tên, mã / IMEI, thương hiệu..."
            className="input min-w-0 flex-1 sm:max-w-sm"
          />
          <button className="btn-secondary">Tìm</button>
        </form>
      </div>

      {/* Điện thoại: dạng thẻ */}
      <div className="space-y-2 sm:hidden">
        {products.map((p) => {
          const st = productStatus(p);
          return (
            <div key={p.id} className={`card p-3 ${st === "AVAILABLE" ? "" : "opacity-75"}`}>
              <div className="flex items-start justify-between gap-3">
                <CategoryIcon category={p.category} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-slate-600">
                    {[p.brand?.name, capacityLabel(p), p.variant, CATEGORY_LABEL[p.category]].filter(Boolean).join(" · ")}
                  </p>
                  {p.code && <p className="text-xs text-slate-500 tabular-nums">Mã {p.code}</p>}
                </div>
                <p className="shrink-0 text-lg font-bold text-[#1677ff] tabular-nums">{formatVND(p.price)}</p>
              </div>
              {isAdmin && p.costPrice != null && <ProfitLine cost={p.costPrice} price={p.price} />}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <ConditionBadge condition={p.condition} />
                {p.batteryHealth != null && <BatteryBadge value={p.batteryHealth} />}
                {p.warrantyMonths > 0 && <span className="badge bg-slate-100 text-slate-700">BH {p.warrantyMonths} tháng</span>}
                {st !== "AVAILABLE" && <StatusBadge status={st} branch={p.soldBranch?.name} soldAt={p.soldAt} today={today} />}
              </div>
              {p.note && <p className="mt-1 text-xs text-slate-500">{p.note}</p>}
              {isAdmin && (
                <div className="mt-2 space-x-4 text-right">
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
              {isAdmin && <th className="text-right">Giá nhập</th>}
              <th className="text-right">Giá bán</th>
              {isAdmin && <th className="text-right">Lãi</th>}
              <th>Bảo hành</th>
              <th>Trạng thái</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
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
                      {p.batteryHealth != null && <BatteryBadge value={p.batteryHealth} />}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {p.costPrice != null ? formatVND(p.costPrice) : "—"}
                    </td>
                  )}
                  <td className="text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                    {formatVND(p.price)}
                  </td>
                  {isAdmin && (
                    <td
                      className={`text-right whitespace-nowrap tabular-nums ${
                        p.costPrice == null ? "" : p.price - p.costPrice >= 0 ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {p.costPrice != null ? formatVND(p.price - p.costPrice) : "—"}
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
    </div>
  );
}

function Segmented({ items, value, href }: { items: string[][]; value: string; href: (v: string) => string }) {
  return (
    <div className="inline-flex rounded-md bg-white p-0.5 ring-1 ring-slate-200">
      {items.map(([v, l]) => (
        <Link
          key={v}
          href={href(v)}
          className={`rounded px-3 py-1.5 text-sm ${value === v ? "bg-[#1677ff] font-medium text-white" : "text-slate-600 hover:text-slate-900"}`}
        >
          {l}
        </Link>
      ))}
    </div>
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

function ProfitLine({ cost, price }: { cost: number; price: number }) {
  const profit = price - cost;
  return (
    <p className="mt-1 text-xs text-slate-500">
      Giá nhập {formatVND(cost)} · Lãi{" "}
      <b className={profit >= 0 ? "text-green-700" : "text-red-600"}>{formatVND(profit)}</b>
    </p>
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
