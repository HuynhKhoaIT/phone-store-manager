import Link from "next/link";
import type { RepairPrice } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatVND } from "@/lib/format";
import { deleteRepairGroup, saveRepairPrice } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { RepairPriceFields } from "@/components/RepairPriceFields";
import { COMMON_REPAIR_SERVICES } from "@/lib/prices";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { service?: string; q?: string; edit?: string; view?: string; page?: string };

/** Một dịch vụ × dòng máy với các loại linh kiện (giá thấp → cao) */
type Group = { service: string; device: string; items: RepairPrice[] };

export default async function RepairPricesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("repair-prices");
  const isAdmin = me.role === "ADMIN";
  const canCost = can(me, "cost-prices");
  const sp = await searchParams;
  const service = sp.service ?? "";
  const q = sp.q?.trim() ?? "";

  const [all, services, editing, viewing] = await Promise.all([
    // Lấy hết rồi gom theo dòng máy (bảng giá sửa chữa nhỏ) — phân trang theo dòng máy, không theo từng loại
    prisma.repairPrice.findMany({
      where: service ? { service } : {},
      orderBy: [{ service: "asc" }, { device: "asc" }, { price: "asc" }, { id: "asc" }],
    }),
    prisma.repairPrice.findMany({ select: { service: true }, distinct: ["service"], orderBy: { service: "asc" } }),
    isAdmin && sp.edit ? prisma.repairPrice.findUnique({ where: { id: Number(sp.edit) || 0 } }) : null,
    sp.view ? prisma.repairPrice.findUnique({ where: { id: Number(sp.view) || 0 } }) : null,
  ]);
  // Sửa / xem theo nhóm: mọi loại linh kiện của cùng dịch vụ × dòng máy
  const groupRows = async (r: RepairPrice | null) =>
    r
      ? prisma.repairPrice.findMany({
          where: { service: r.service, device: r.device },
          orderBy: [{ price: "asc" }, { id: "asc" }],
        })
      : null;
  const [editGroup, viewGroup] = await Promise.all([groupRows(editing), groupRows(viewing)]);
  const serviceNames = services.map((s) => s.service);
  const suggestions = [...new Set([...serviceNames, ...COMMON_REPAIR_SERVICES])];

  const byKey = new Map<string, Group>();
  for (const r of all) {
    const key = `${r.service}|${r.device}`;
    const g = byKey.get(key) ?? { service: r.service, device: r.device, items: [] };
    g.items.push(r);
    byKey.set(key, g);
  }
  // Tìm theo dòng máy / dịch vụ / tên loại — khớp một loại thì hiện cả dòng máy
  const needle = q.toLowerCase();
  const groups = [...byKey.values()].filter(
    (g) =>
      !needle ||
      `${g.service} ${g.device}`.toLowerCase().includes(needle) ||
      g.items.some((r) => r.variant?.toLowerCase().includes(needle)),
  );
  const paging = getPaging(groups.length, sp.page);
  // Giữ chỉ số trong danh sách phẳng để biết dòng nào thuộc trang trước (ẩn trên máy tính)
  const sections = new Map<string, { g: Group; i: number }[]>();
  groups.slice(0, paging.take).forEach((g, i) => sections.set(g.service, [...(sections.get(g.service) ?? []), { g, i }]));

  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    // Giữ trang hiện tại để đóng hộp sửa vẫn ở đúng trang
    const page = paging.page > 1 ? String(paging.page) : "";
    for (const [k, v] of Object.entries({ service, q, page, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/repair-prices?${s}` : "/repair-prices";
  };
  const backHref = qs({});

  const renderForm = (group?: RepairPrice[]) => (
    <ActionForm
      action={saveRepairPrice}
      submitLabel={group ? "Lưu thay đổi" : "Thêm"}
      successMessage={group ? "Đã lưu thay đổi." : "Đã thêm."}
      className="grid gap-3 sm:grid-cols-2"
    >
      {group && <input type="hidden" name="groupOf" value={group[0].id} />}
      <RepairPriceFields
        services={suggestions}
        service={group?.[0].service ?? service}
        device={group?.[0].device}
        rows={group}
        editing={!!group}
      />
    </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bảng giá sửa chữa"
        subtitle="Thay pin, thay màn hình, ép kính... theo dòng máy"
        actions={
          isAdmin && (
            <FormDialog title="Thêm giá sửa chữa" triggerLabel="Thêm giá">
              {renderForm()}
            </FormDialog>
          )
        }
      />

      {editing && editGroup && (
        <FormDialog key={editing.id} title={`Sửa: ${editing.service} ${editing.device}`} defaultOpen closeHref={backHref}>
          {renderForm(editGroup)}
        </FormDialog>
      )}

      {viewing && viewGroup && (
        <FormDialog key={`v${viewing.id}`} title={`${viewing.service} ${viewing.device}`} defaultOpen closeHref={backHref}>
          <div className="space-y-2">
            {viewGroup.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{r.variant || "Tiêu chuẩn"}</p>
                  <p className="text-right font-semibold tabular-nums">{priceText(r.price)}</p>
                </div>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                  {canCost && (
                    <>
                      <dt className="text-slate-500">Giá nhập</dt>
                      <dd className="text-right tabular-nums">{r.costPrice != null ? formatVND(r.costPrice) : "—"}</dd>
                      <dt className="text-slate-500">Lãi</dt>
                      <dd className="text-right tabular-nums">
                        <Profit price={r.price} cost={r.costPrice} />
                      </dd>
                    </>
                  )}
                  <dt className="text-slate-500">Bảo hành</dt>
                  <dd className="text-right">{r.warranty ?? "—"}</dd>
                  {r.note && (
                    <>
                      <dt className="text-slate-500">Ghi chú</dt>
                      <dd className="text-right text-slate-600">{r.note}</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
            {isAdmin && (
              <div className="flex justify-end pt-1">
                <Link href={qs({ edit: String(viewing.id) })} className="btn-primary">
                  Sửa giá
                </Link>
              </div>
            )}
          </div>
        </FormDialog>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {["", ...serviceNames].map((s) => (
          <Link
            key={s}
            href={qs({ service: s, page: "" })}
            className={`rounded-md px-3 py-1 text-sm font-medium ring-1 ${
              service === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900"
            }`}
          >
            {s || "Tất cả"}
          </Link>
        ))}
        <form action="/repair-prices" className="flex w-full gap-2 sm:w-auto sm:flex-1 sm:max-w-xs">
          {service && <input type="hidden" name="service" value={service} />}
          <input name="q" defaultValue={q} placeholder="Tìm dòng máy, loại linh kiện..." className="input" />
          <button className="btn-secondary">Tìm</button>
        </form>
      </div>

      {sections.size === 0 && <p className="card text-center text-slate-500">Chưa có giá sửa chữa nào.</p>}

      <div className="grid gap-4">
        {[...sections].map(([name, items]) => (
          // Nhóm chỉ gồm dòng của trang trước thì ẩn cả khối trên máy tính
          <section
            key={name}
            className={`card p-0 sm:p-0 ${items.every(({ i }) => i < paging.start) ? "sm:hidden" : ""}`}
          >
            <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">{name}</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Dòng máy</th>
                    <th>Loại linh kiện & giá sửa</th>
                    <th>Bảo hành</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ g, i }) => {
                    const first = g.items[0];
                    const warranties = [...new Set(g.items.map((r) => r.warranty).filter(Boolean))];
                    return (
                      <tr key={first.id} className={rowClass(paging, i)}>
                        <td data-title className="font-medium whitespace-nowrap">
                          <Link href={qs({ view: String(first.id) })} className="hover:text-[#1677ff]">
                            {g.device}
                          </Link>
                        </td>
                        <td data-label={g.items.length > 1 ? `${g.items.length} loại` : "Giá sửa"}>
                          {/* Một mức giá: chỉ giá; nhiều loại: mỗi loại một chip tên + giá */}
                          {g.items.length === 1 && !first.variant ? (
                            <span className="font-semibold tabular-nums">{priceText(first.price)}</span>
                          ) : (
                            <span className="flex flex-wrap justify-end gap-1.5 sm:justify-start">
                              {g.items.map((r) => (
                                <span key={r.id} className="badge bg-slate-100 whitespace-nowrap text-slate-700">
                                  {r.variant || "Tiêu chuẩn"} ·{" "}
                                  <b className="font-semibold text-slate-900 tabular-nums">{priceText(r.price)}</b>
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td data-label="Bảo hành" className="whitespace-nowrap">
                          {warranties.length ? warranties.join(" / ") : "—"}
                        </td>
                        <td className="space-x-3 text-right whitespace-nowrap">
                          <Link href={qs({ view: String(first.id) })} className="text-sm text-[#1677ff] hover:underline">
                            Chi tiết
                          </Link>
                          {isAdmin && (
                            <>
                              <Link href={qs({ edit: String(first.id) })} className="text-sm text-[#1677ff] hover:underline">
                                Sửa
                              </Link>
                              <ConfirmButton
                                action={deleteRepairGroup.bind(null, first.id)}
                                message={`Xoá giá "${g.service} ${g.device}"${g.items.length > 1 ? ` (${g.items.length} loại)` : ""}?`}
                              >
                                Xoá
                              </ConfirmButton>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <Pagination paging={paging} href={pageHref("/repair-prices", { service, q })} />
    </div>
  );
}

const priceText = (n: number) => (n > 0 ? formatVND(n) : "Liên hệ");

function Profit({ price, cost }: { price: number; cost: number | null }) {
  if (cost == null || price <= 0) return <>—</>;
  const p = price - cost;
  return <span className={p >= 0 ? "text-green-700" : "text-red-600"}>{formatVND(p)}</span>;
}
