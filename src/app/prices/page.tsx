import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABEL, CONDITION_LABEL } from "@/lib/prices";
import { formatVND } from "@/lib/format";
import { deleteProduct, saveProduct } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MoneyInput } from "@/components/MoneyInput";

type Search = { cat?: string; q?: string; cond?: string; edit?: string; hidden?: string };

export default async function PricesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const sp = await searchParams;
  const cat = sp.cat && CATEGORY_LABEL[sp.cat] ? sp.cat : "";
  const cond = sp.cond === "NEW" || sp.cond === "USED" ? sp.cond : "";
  const q = sp.q?.trim() ?? "";
  const showHidden = isAdmin && sp.hidden === "1";

  const where: Prisma.ProductWhereInput = {
    ...(cat && { category: cat }),
    ...(cond && { condition: cond }),
    ...(!showHidden && { active: true }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { variant: { contains: q, mode: "insensitive" } },
        { note: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const [products, editing] = await Promise.all([
    prisma.product.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }, { price: "asc" }] }),
    isAdmin && sp.edit ? prisma.product.findUnique({ where: { id: Number(sp.edit) } }) : null,
  ]);

  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { cat, cond, q, hidden: showHidden ? "1" : "", ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/prices?${s}` : "/prices";
  };
  const backHref = qs({});

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Bảng giá</h1>

      {isAdmin && (
        <details open={!!editing} className="card">
          <summary className="cursor-pointer font-semibold">
            {editing ? `Sửa: ${editing.name}` : "+ Thêm sản phẩm vào bảng giá"}
          </summary>
          <ActionForm
            key={editing?.id ?? "new"}
            action={saveProduct}
            submitLabel={editing ? "Lưu thay đổi" : "Thêm sản phẩm"}
            successMessage={editing ? undefined : "Đã thêm sản phẩm."}
            redirectTo={editing ? backHref : undefined}
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            extraButtons={
              editing && (
                <Link href={backHref} className="btn-secondary">
                  Huỷ
                </Link>
              )
            }
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="field">
              <span>Loại *</span>
              <select name="category" defaultValue={editing?.category ?? (cat || "IPHONE")} className="input">
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tên sản phẩm *</span>
              <input name="name" required defaultValue={editing?.name} className="input" placeholder="VD: iPhone 13 Pro Max" />
            </label>
            <label className="field">
              <span>Phiên bản / màu</span>
              <input name="variant" defaultValue={editing?.variant ?? ""} className="input" placeholder="VD: 128GB - Xanh" />
            </label>
            <label className="field">
              <span>Tình trạng</span>
              <select name="condition" defaultValue={editing?.condition ?? "NEW"} className="input">
                <option value="NEW">Mới</option>
                <option value="USED">Cũ 99%</option>
              </select>
            </label>
            <label className="field">
              <span>Giá bán *</span>
              <MoneyInput name="price" required defaultValue={editing?.price} />
            </label>
            <label className="field">
              <span>Bảo hành mặc định</span>
              <select name="warrantyMonths" defaultValue={editing?.warrantyMonths ?? 0} className="input">
                {Array.from({ length: 13 }, (_, m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "Không bảo hành" : `${m} tháng`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Hiển thị</span>
              <select name="active" defaultValue={String(editing?.active ?? true)} className="input">
                <option value="true">Đang bán</option>
                <option value="false">Ẩn (ngừng bán)</option>
              </select>
            </label>
            <label className="field">
              <span>Ghi chú</span>
              <input name="note" defaultValue={editing?.note ?? ""} className="input" placeholder="VD: pin 90%, máy zin" />
            </label>
          </ActionForm>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {[["", "Tất cả"], ...Object.entries(CATEGORY_LABEL)].map(([v, l]) => (
            <Link
              key={v}
              href={qs({ cat: v })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${cat === v ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <div className="inline-flex rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {[["", "Mới + Cũ"], ["NEW", "Mới"], ["USED", "Cũ 99%"]].map(([v, l]) => (
            <Link
              key={v}
              href={qs({ cond: v })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${cond === v ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <form action="/prices" className="flex w-full gap-2 sm:w-auto sm:flex-1 sm:max-w-xs">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {cond && <input type="hidden" name="cond" value={cond} />}
          <input name="q" defaultValue={q} placeholder="Tìm tên máy, dung lượng..." className="input" />
          <button className="btn-secondary">Tìm</button>
        </form>
        {isAdmin && (
          <Link href={qs({ hidden: showHidden ? "" : "1" })} className="text-sm text-slate-500 hover:underline">
            {showHidden ? "Ẩn sản phẩm ngừng bán" : "Hiện cả sản phẩm ngừng bán"}
          </Link>
        )}
      </div>

      {/* Điện thoại: dạng thẻ */}
      <div className="space-y-2 sm:hidden">
        {products.map((p) => (
          <div key={p.id} className={`card p-3 ${p.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-slate-600">
                  {[p.variant, CATEGORY_LABEL[p.category]].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="shrink-0 text-lg font-bold text-blue-700 tabular-nums">{formatVND(p.price)}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`badge ${p.condition === "USED" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}
              >
                {CONDITION_LABEL[p.condition]}
              </span>
              {p.warrantyMonths > 0 && <span className="badge bg-slate-100 text-slate-700">BH {p.warrantyMonths} tháng</span>}
              {!p.active && <span className="badge bg-slate-100 text-slate-500">Ngừng bán</span>}
              {p.note && <span className="text-slate-600">{p.note}</span>}
              {isAdmin && (
                <span className="ml-auto space-x-3">
                  <Link href={qs({ edit: String(p.id) })} className="text-sm text-blue-600">
                    Sửa
                  </Link>
                  <ConfirmButton action={deleteProduct.bind(null, p.id)} message={`Xoá "${p.name}" khỏi bảng giá?`}>
                    Xoá
                  </ConfirmButton>
                </span>
              )}
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="card text-center text-slate-500">Không có sản phẩm nào.</p>}
      </div>

      <div className="card hidden overflow-x-auto p-0 sm:block sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Phiên bản</th>
              <th>Tình trạng</th>
              <th className="text-right">Giá bán</th>
              <th>Bảo hành</th>
              <th>Ghi chú</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={p.active ? "" : "text-slate-400"}>
                <td>
                  <span className="font-medium">{p.name}</span>
                  {!cat && <span className="ml-2 text-xs text-slate-400">{CATEGORY_LABEL[p.category]}</span>}
                  {!p.active && <span className="ml-2 text-xs">(ngừng bán)</span>}
                </td>
                <td>{p.variant}</td>
                <td>
                  <span
                    className={`badge ${p.condition === "USED" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}
                  >
                    {CONDITION_LABEL[p.condition]}
                  </span>
                </td>
                <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatVND(p.price)}</td>
                <td className="whitespace-nowrap">{p.warrantyMonths > 0 ? `${p.warrantyMonths} tháng` : "—"}</td>
                <td className="text-slate-600">{p.note}</td>
                {isAdmin && (
                  <td className="space-x-3 text-right whitespace-nowrap">
                    <Link href={qs({ edit: String(p.id) })} className="text-sm text-blue-600 hover:underline">
                      Sửa
                    </Link>
                    <ConfirmButton action={deleteProduct.bind(null, p.id)} message={`Xoá "${p.name}" khỏi bảng giá?`}>
                      Xoá
                    </ConfirmButton>
                  </td>
                )}
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
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
