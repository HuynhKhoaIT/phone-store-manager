import Link from "next/link";
import { Hammer, PackagePlus, TriangleAlert } from "lucide-react";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { expectedProfit, getInventoryReport, type StockValue } from "@/lib/inventory";
import { formatVND } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ReportsTabs } from "@/components/ReportsTabs";
import { StatCard } from "@/components/StatCard";

const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const pctOf = (part: number, whole: number) => (whole > 0 ? fmtPct((part / whole) * 100) : "—");

/** Các ô số liệu tồn kho dùng chung cho bảng theo chi nhánh / theo loại */
function StockCells({ v }: { v: StockValue }) {
  return (
    <>
      <td data-label="Số lượng" className="text-right tabular-nums">
        {v.qty}
      </td>
      <td data-label="Tiền hàng (giá nhập)" className="text-right font-semibold whitespace-nowrap tabular-nums">
        {formatVND(v.cost)}
      </td>
      <td data-label="Theo giá bán" className="text-right whitespace-nowrap tabular-nums">
        {formatVND(v.retail)}
      </td>
      <td data-label="Lãi dự kiến" className="text-right whitespace-nowrap text-green-700 tabular-nums">
        {formatVND(expectedProfit(v))}
      </td>
      <td data-label="Thiếu giá nhập" className="text-right whitespace-nowrap">
        {v.missingCostItems > 0 ? (
          <span className="text-amber-700">
            {v.missingCostItems} mặt hàng ({v.missingCostQty} SP)
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    </>
  );
}

/** Vốn góp còn lại chia thành: tiền hàng tồn, vật tư / decor / xây dựng, phần còn lại (tiền mặt, tài khoản...) */
function CapitalBreakdown({ net, stock, fixtures }: { net: number; stock: number; fixtures: number }) {
  const rest = net - stock - fixtures;
  const parts = [
    { label: "Tiền hàng tồn kho (giá nhập)", amount: stock, color: "bg-[#1677ff]" },
    { label: "Vật tư, decor, xây dựng", amount: fixtures, color: "bg-amber-500" },
    {
      label: rest >= 0 ? "Còn lại: tiền mặt, tài khoản, chi phí đã chi…" : "Dùng vượt vốn góp (lấy từ lãi bán hàng)",
      amount: rest,
      color: rest >= 0 ? "bg-slate-300" : "bg-red-400",
    },
  ];
  // Thanh chia theo tổng tiền đã dùng nếu vượt vốn góp, không thì theo vốn góp
  const scale = Math.max(net, stock + fixtures, 1);
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Vốn góp đang nằm ở đâu</h2>
        <p className="text-sm text-slate-500">
          Vốn góp còn lại (góp − rút) <b className="text-lg text-slate-900 tabular-nums">{formatVND(net)}</b>
        </p>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {parts
          .filter((p) => p.amount > 0)
          .map((p) => (
            <div key={p.label} className={p.color} style={{ width: `${(p.amount / scale) * 100}%` }} />
          ))}
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.label} className="flex items-start gap-2">
            <span className={`mt-1.5 size-2.5 shrink-0 rounded-sm ${p.color}`} aria-hidden />
            <span>
              <span className="text-slate-600">{p.label}</span>
              <span className={`block font-semibold tabular-nums ${p.amount < 0 ? "text-red-600" : "text-slate-900"}`}>
                {formatVND(Math.abs(p.amount))}
                <span className="ml-1 text-xs font-normal text-slate-500">{pctOf(Math.abs(p.amount), net)}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function InventoryReportPage() {
  const me = await requireAnyPermission("capital", "cost-prices");
  const showCapital = can(me, "capital");
  const { total, branches, unassigned, categories, funding, capital, fixtures } = await getInventoryReport();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo — Tồn kho & vốn"
        subtitle="Cửa hàng đang giữ bao nhiêu tiền hàng, đã chi bao nhiêu cho xây dựng, so với vốn góp"
        actions={
          <>
            {showCapital && (
              <Link href="/reports/fixtures" className="btn-secondary">
                <Hammer size={16} aria-hidden /> Vật tư & xây dựng
              </Link>
            )}
            <Link href="/products/receipts" className="btn-secondary">
              <PackagePlus size={16} aria-hidden /> Phiếu nhập hàng
            </Link>
          </>
        }
      />

      <ReportsTabs active="inventory" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label="Tiền hàng tồn kho (giá nhập)"
          value={formatVND(total.cost)}
          sub={`${total.qty} sản phẩm${total.missingCostQty > 0 ? ` · ${total.missingCostQty} SP chưa có giá nhập` : ""}`}
        />
        <StatCard label="Giá trị theo giá bán" value={formatVND(total.retail)} />
        <StatCard
          label="Lãi dự kiến nếu bán hết"
          value={formatVND(expectedProfit(total))}
          amount={expectedProfit(total)}
          profit
          sub={total.missingCostQty > 0 ? "Chỉ tính hàng đã có giá nhập" : undefined}
        />
      </div>

      {showCapital &&
        (capital.net > 0 ? (
          <CapitalBreakdown net={capital.net} stock={total.cost} fixtures={fixtures} />
        ) : (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Chưa ghi vốn góp nên chưa so sánh được.{" "}
            <Link href="/reports/capital" className="font-medium underline">
              Ghi ở Sổ góp vốn
            </Link>
          </p>
        ))}

      {(total.missingCostItems > 0 || total.negativeItems > 0) && (
        <div className="space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {total.missingCostItems > 0 && (
            <p>
              <TriangleAlert size={16} className="mr-1 inline align-text-bottom" aria-hidden />
              {total.missingCostItems} mặt hàng ({total.missingCostQty} sản phẩm) chưa có giá nhập nên{" "}
              <b>chưa cộng vào tiền hàng tồn</b> — nhập giá nhập ở{" "}
              <Link href="/products" className="font-medium underline">
                Hàng hoá
              </Link>{" "}
              hoặc qua phiếu nhập.
            </p>
          )}
          {total.negativeItems > 0 && (
            <p>
              <TriangleAlert size={16} className="mr-1 inline align-text-bottom" aria-hidden />
              {total.negativeItems} mặt hàng có số lượng âm (không tính giá trị) —{" "}
              <Link href="/stock-check" className="font-medium underline">
                cần kiểm kho
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {showCapital && (
        <section className="space-y-2">
          <h2 className="font-semibold">Vốn theo chi nhánh</h2>
          <div className="card overflow-x-auto p-0 sm:p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Chi nhánh</th>
                  <th className="text-right">Vốn góp còn lại</th>
                  <th className="text-right">Hàng tồn</th>
                  <th className="text-right">Vật tư & xây dựng</th>
                  <th className="text-right">Còn lại</th>
                  <th className="text-right">Đã dùng</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...branches.map((b) => ({
                    key: String(b.id),
                    name: b.name + (b.active ? "" : " (đã ẩn)"),
                    net: b.contributed - b.withdrawn,
                    stock: b.stock.cost,
                    fixtures: b.fixtures,
                    total: false,
                  })),
                  { key: "total", name: "Tổng cửa hàng", net: capital.net, stock: total.cost, fixtures, total: true },
                ].map((r) => {
                  const rest = r.net - r.stock - r.fixtures;
                  return (
                    <tr key={r.key} className={r.total ? "bg-slate-50 font-semibold" : ""}>
                      <td data-title className={r.total ? "" : "font-medium"}>
                        {r.name}
                      </td>
                      <td data-label="Vốn góp còn lại" className="text-right whitespace-nowrap tabular-nums">
                        {r.net !== 0 ? formatVND(r.net) : <span className="font-normal text-slate-400">Chưa ghi</span>}
                      </td>
                      <td data-label="Hàng tồn" className="text-right whitespace-nowrap tabular-nums">
                        {formatVND(r.stock)}
                      </td>
                      <td data-label="Vật tư & xây dựng" className="text-right whitespace-nowrap tabular-nums">
                        {formatVND(r.fixtures)}
                      </td>
                      <td
                        data-label="Còn lại"
                        className={`text-right whitespace-nowrap tabular-nums ${rest < 0 ? "text-red-600" : ""}`}
                      >
                        {formatVND(rest)}
                      </td>
                      <td data-label="Đã dùng" className="text-right tabular-nums">
                        {pctOf(r.stock + r.fixtures, r.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {unassigned && (
            <p className="text-xs text-amber-700">
              {formatVND(unassigned.cost)} tiền hàng chưa gắn chi nhánh nên chỉ tính vào tổng — gắn chi nhánh ở Hàng hoá.
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Tồn kho theo chi nhánh</h2>
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Chi nhánh</th>
                <th className="text-right">SL</th>
                <th className="text-right">Tiền hàng (giá nhập)</th>
                <th className="text-right">Theo giá bán</th>
                <th className="text-right">Lãi dự kiến</th>
                <th className="text-right">Thiếu giá nhập</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className={b.active ? "" : "opacity-70"}>
                  <td data-title className="font-medium">
                    {b.name}
                    {!b.active && <span className="ml-1 text-xs font-normal text-slate-500">(đã ẩn)</span>}
                  </td>
                  <StockCells v={b.stock} />
                </tr>
              ))}
              {unassigned && (
                <tr>
                  <td data-title className="text-slate-600 italic">
                    Chưa gắn chi nhánh
                  </td>
                  <StockCells v={unassigned} />
                </tr>
              )}
              <tr className="bg-slate-50 font-semibold">
                <td data-title>Tổng cửa hàng</td>
                <StockCells v={total} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-semibold">Theo loại hàng</h2>
          <div className="card overflow-x-auto p-0 sm:p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Loại</th>
                  <th className="text-right">SL</th>
                  <th className="text-right">Giá nhập</th>
                  <th className="text-right">Giá bán</th>
                  <th className="text-right">Lãi dự kiến</th>
                  <th className="text-right">Thiếu giá nhập</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.key}>
                    <td data-title className="font-medium">
                      {c.label}
                    </td>
                    <StockCells v={c.stock} />
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      Chưa có hàng tồn.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {showCapital && (
          <section className="space-y-2">
            <h2 className="font-semibold">Tiền đã nhập hàng theo nguồn</h2>
            <div className="card overflow-x-auto p-0 sm:p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tiền từ</th>
                    <th className="text-right">Số phiếu</th>
                    <th className="text-right">Tổng tiền nhập</th>
                  </tr>
                </thead>
                <tbody>
                  {funding.map((f) => (
                    <tr key={f.label}>
                      <td data-title className="font-medium">
                        {f.label}
                      </td>
                      <td data-label="Số phiếu" className="text-right tabular-nums">
                        {f.receipts}
                      </td>
                      <td data-label="Tổng tiền nhập" className="text-right whitespace-nowrap tabular-nums">
                        {formatVND(f.amount)}
                      </td>
                    </tr>
                  ))}
                  {funding.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-500">
                        Chưa có phiếu nhập hàng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              Cộng dồn mọi phiếu nhập từ trước tới nay (giá nhập × số lượng). Tiền riêng của người góp vốn đã tự ghi
              vào Sổ góp vốn.
            </p>
          </section>
        )}
      </div>

      <div className="card text-sm text-slate-600">
        <p className="mb-1 font-semibold text-slate-800">Cách tính</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Chỉ tính hàng <b>Đang bán</b> còn số lượng, theo chi nhánh đang quản lý hàng. <b>Tiền hàng tồn</b> = giá
            nhập hiện tại × số lượng còn; hàng chưa có giá nhập không được cộng. <b>Theo giá bán</b> lấy giá khuyến mãi
            nếu có.
          </li>
          {showCapital && (
            <li>
              <b>Vốn góp còn lại</b> = tổng tiền góp − đã rút (Sổ góp vốn) = <b>hàng tồn</b> + <b>vật tư, decor, xây
              dựng</b> (tab Vật tư &amp; xây dựng, tính theo số tiền đã chi, không khấu hao) + <b>phần còn lại</b> (tiền
              mặt, tài khoản, chi phí tháng đã chi, lỗ…). Phần còn lại âm nghĩa là đã dùng nhiều hơn vốn góp — lãi bán
              hàng đã được quay vòng vào hàng / xây dựng.
            </li>
          )}
          <li>Hàng gõ tay trong phiếu (không có trong Hàng hoá) không cộng vào tồn kho.</li>
        </ul>
      </div>
    </div>
  );
}
