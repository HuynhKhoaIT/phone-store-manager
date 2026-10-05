import Link from "next/link";
import type { Brand } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { saveBrand } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const { edit } = await searchParams;
  const brands = await prisma.brand.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  const editing = brands.find((b) => b.id === Number(edit));

  const renderForm = (editing?: Brand) => (
    <ActionForm
      action={saveBrand}
      submitLabel={editing ? "Lưu thay đổi" : "Thêm thương hiệu"}
      successMessage={editing ? "Đã lưu thay đổi." : "Đã thêm thương hiệu."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <label className="field">
        <span>Tên thương hiệu *</span>
        <input name="name" required defaultValue={editing?.name} className="input" placeholder="VD: Samsung, Anker, Baseus" />
      </label>
      <label className="field">
        <span>Trạng thái</span>
        <select name="active" defaultValue={String(editing?.active ?? true)} className="input">
          <option value="true">Đang dùng</option>
          <option value="false">Ẩn (không hiện khi chọn)</option>
        </select>
      </label>
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thương hiệu"
        subtitle="Danh mục thương hiệu để chọn khi nhập phụ kiện, máy Android"
        actions={
          <FormDialog title="Thêm thương hiệu" triggerLabel="Thêm thương hiệu">
            {renderForm()}
          </FormDialog>
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Sửa: ${editing.name}`} defaultOpen closeHref="/brands">
          {renderForm(editing)}
        </FormDialog>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Thương hiệu</th>
              <th className="text-right">Số sản phẩm</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className={b.active ? "" : "text-slate-400"}>
                <td data-title className="font-medium">
                  {b.name}
                </td>
                <td data-label="Số sản phẩm" className="text-right tabular-nums">
                  <Link href={`/products?brand=${b.id}`} className="text-[#1677ff] hover:underline">
                    {b._count.products}
                  </Link>
                </td>
                <td data-label="Trạng thái">
                  <span className={`badge ${b.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}`}>
                    {b.active ? "Đang dùng" : "Đã ẩn"}
                  </span>
                </td>
                <td className="text-right">
                  <Link href={`/brands?edit=${b.id}`} className="text-sm text-[#1677ff] hover:underline">
                    Sửa
                  </Link>
                </td>
              </tr>
            ))}
            {brands.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  Chưa có thương hiệu nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
