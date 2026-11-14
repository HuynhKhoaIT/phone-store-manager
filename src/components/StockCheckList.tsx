"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, PackageSearch, Search } from "lucide-react";
import { setStockCheckItem } from "@/app/actions";
import { CATEGORY_LABEL } from "@/lib/product-labels";

export type StockCheckItemData = {
  productId: number;
  label: string;
  category: string;
  /** null = máy có IMEI (luôn 1 chiếc, không theo dõi bằng số lượng) */
  quantity: number | null;
  isLow: boolean;
  status: "OK" | "SHORT" | null;
  checkedBy: string | null;
  checkedAt: string | null; // HH:mm
  canEdit: boolean;
};

type StatusFilter = "" | "UNCHECKED" | "OK" | "SHORT";

/** Đối chiếu từng sản phẩm của chi nhánh: nhân viên so hàng thực tế với bảng giá rồi chọn Đủ / Thiếu. */
export function StockCheckList({ date, items }: { date: string; items: StockCheckItemData[] }) {
  const [optimistic, setOptimistic] = useOptimistic(items, (state, action: { productId: number; status: "OK" | "SHORT" }) =>
    state.map((it) =>
      it.productId !== action.productId
        ? it
        : it.status === action.status
          ? { ...it, status: null, checkedBy: null, checkedAt: null }
          : { ...it, status: action.status, checkedBy: "Bạn", checkedAt: "…" },
    ),
  );
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const done = optimistic.filter((it) => it.status).length;
  const short = optimistic.filter((it) => it.status === "SHORT").length;
  const pct = optimistic.length ? Math.round((done / optimistic.length) * 100) : 0;
  const categories = [...new Set(items.map((it) => it.category))];

  const needle = q.trim().toLowerCase();
  const shown = optimistic.filter(
    (it) =>
      (!cat || it.category === cat) &&
      (!statusFilter || (statusFilter === "UNCHECKED" ? !it.status : it.status === statusFilter)) &&
      (!needle || it.label.toLowerCase().includes(needle)),
  );

  function mark(it: StockCheckItemData, status: "OK" | "SHORT") {
    if (!it.canEdit || pending) return;
    startTransition(async () => {
      setOptimistic({ productId: it.productId, status });
      const res = await setStockCheckItem(it.productId, date, status);
      if (res.error) alert(res.error);
    });
  }

  return (
    <section className="space-y-3">
      <div className="card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <PackageSearch size={18} className="text-amber-600" aria-hidden /> Đối chiếu hàng hoá
          </h2>
          <span className="text-sm font-semibold tabular-nums text-slate-600">
            {done}/{optimistic.length}
            {short > 0 && <span className="ml-2 text-red-600">· Thiếu {short}</span>}
          </span>
        </div>
        <div
          className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all ${short > 0 ? "bg-amber-500" : "bg-green-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm sản phẩm..." className="input pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="Tất cả" active={!cat} onClick={() => setCat("")} />
          {categories.map((c) => (
            <FilterChip key={c} label={CATEGORY_LABEL[c] ?? c} active={cat === c} onClick={() => setCat(cat === c ? "" : c)} />
          ))}
          <span className="mx-1 self-center text-slate-300">|</span>
          <FilterChip
            label="Chưa kiểm tra"
            active={statusFilter === "UNCHECKED"}
            onClick={() => setStatusFilter(statusFilter === "UNCHECKED" ? "" : "UNCHECKED")}
          />
          <FilterChip label="Đủ" tone="green" active={statusFilter === "OK"} onClick={() => setStatusFilter(statusFilter === "OK" ? "" : "OK")} />
          <FilterChip
            label="Thiếu"
            tone="red"
            active={statusFilter === "SHORT"}
            onClick={() => setStatusFilter(statusFilter === "SHORT" ? "" : "SHORT")}
          />
        </div>
      </div>

      <div className="card p-0 sm:p-0">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-slate-500">Không có sản phẩm nào khớp.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((it) => (
              <li key={it.productId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {it.label}
                    {it.isLow && <span className="badge ml-2 bg-amber-100 text-amber-800">Sắp hết</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {it.quantity == null ? "1 máy" : `Hệ thống ghi: còn ${it.quantity}`}
                    {it.checkedBy && (
                      <span className={`ml-2 inline-flex items-center gap-1 ${it.status === "SHORT" ? "text-red-600" : "text-green-700"}`}>
                        <Check size={11} aria-hidden /> {it.checkedBy} · {it.checkedAt}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={!it.canEdit || pending}
                    onClick={() => mark(it, "OK")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                      it.status === "OK" ? "bg-green-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-green-50"
                    }`}
                  >
                    Đủ
                  </button>
                  <button
                    type="button"
                    disabled={!it.canEdit || pending}
                    onClick={() => mark(it, "SHORT")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                      it.status === "SHORT" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-red-50"
                    }`}
                  >
                    Thiếu
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "green" | "red";
}) {
  const activeClass = tone === "green" ? "bg-green-600 text-white" : tone === "red" ? "bg-red-600 text-white" : "bg-blue-600 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? activeClass : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
    >
      {label}
    </button>
  );
}
