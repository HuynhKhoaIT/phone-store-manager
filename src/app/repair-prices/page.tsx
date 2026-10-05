import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatVND } from "@/lib/format";
import { deleteRepairPrice, saveRepairPrice } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MoneyInput } from "@/components/MoneyInput";

const COMMON_SERVICES = ["Thay pin", "Thay màn hình", "Ép kính", "Thay mặt lưng", "Thay chân sạc", "Thay camera", "Thay loa"];

type Search = { service?: string; q?: string; edit?: string };

export default async function RepairPricesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const isAdmin = me.role === "ADMIN";
  const sp = await searchParams;
  const service = sp.service ?? "";
  const q = sp.q?.trim() ?? "";

  const where: Prisma.RepairPriceWhereInput = {
    ...(service && { service }),
    ...(q && {
      OR: [
        { device: { contains: q, mode: "insensitive" } },
        { service: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const [rows, services, editing] = await Promise.all([
    prisma.repairPrice.findMany({ where, orderBy: [{ service: "asc" }, { device: "asc" }] }),
    prisma.repairPrice.findMany({ select: { service: true }, distinct: ["service"], orderBy: { service: "asc" } }),
    isAdmin && sp.edit ? prisma.repairPrice.findUnique({ where: { id: Number(sp.edit) } }) : null,
  ]);
  const serviceNames = services.map((s) => s.service);
  const suggestions = [...new Set([...serviceNames, ...COMMON_SERVICES])];

  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.service, [...(groups.get(r.service) ?? []), r]);

  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ service, q, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/repair-prices?${s}` : "/repair-prices";
  };
  const backHref = qs({});

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Bảng giá sửa chữa</h1>

      {isAdmin && (
        <details open={!!editing} className="card">
          <summary className="cursor-pointer font-semibold">
            {editing ? `Sửa: ${editing.service} ${editing.device}` : "+ Thêm giá sửa chữa"}
          </summary>
          <ActionForm
            key={editing?.id ?? "new"}
            action={saveRepairPrice}
            submitLabel={editing ? "Lưu thay đổi" : "Thêm"}
            successMessage={editing ? undefined : "Đã thêm."}
            redirectTo={editing ? backHref : undefined}
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
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
              <span>Dịch vụ *</span>
              <input
                name="service"
                required
                list="repair-services"
                defaultValue={editing?.service ?? service}
                className="input"
                placeholder="VD: Thay pin"
              />
              <datalist id="repair-services">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Dòng máy *</span>
              <input name="device" required defaultValue={editing?.device} className="input" placeholder="VD: iPhone 11" />
            </label>
            <label className="field">
              <span>Giá *</span>
              <MoneyInput name="price" required defaultValue={editing?.price} />
            </label>
            <label className="field">
              <span>Bảo hành</span>
              <input name="warranty" defaultValue={editing?.warranty ?? ""} className="input" placeholder="VD: 6 tháng" />
            </label>
            <label className="field">
              <span>Ghi chú</span>
              <input name="note" defaultValue={editing?.note ?? ""} className="input" placeholder="VD: linh kiện zin" />
            </label>
          </ActionForm>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {["", ...serviceNames].map((s) => (
          <Link
            key={s}
            href={qs({ service: s })}
            className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${
              service === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900"
            }`}
          >
            {s || "Tất cả"}
          </Link>
        ))}
        <form action="/repair-prices" className="flex w-full gap-2 sm:w-auto sm:flex-1 sm:max-w-xs">
          {service && <input type="hidden" name="service" value={service} />}
          <input name="q" defaultValue={q} placeholder="Tìm dòng máy..." className="input" />
          <button className="btn-secondary">Tìm</button>
        </form>
      </div>

      {groups.size === 0 && <p className="card text-center text-slate-500">Chưa có giá sửa chữa nào.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {[...groups].map(([name, items]) => (
          <section key={name} className="card p-0 sm:p-0">
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">{name}</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Dòng máy</th>
                    <th className="text-right">Giá</th>
                    <th>Bảo hành</th>
                    <th>Ghi chú</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.device}</td>
                      <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatVND(r.price)}</td>
                      <td className="whitespace-nowrap">{r.warranty ?? "—"}</td>
                      <td className="text-slate-600">{r.note}</td>
                      {isAdmin && (
                        <td className="space-x-3 text-right whitespace-nowrap">
                          <Link href={qs({ edit: String(r.id) })} className="text-sm text-blue-600 hover:underline">
                            Sửa
                          </Link>
                          <ConfirmButton
                            action={deleteRepairPrice.bind(null, r.id)}
                            message={`Xoá giá "${r.service} ${r.device}"?`}
                          >
                            Xoá
                          </ConfirmButton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
