"use client";

import { Check, ChevronRight, ListChecks } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toggleAdminTask } from "@/app/actions";
import { ADMIN_PERIOD_LABELS, type AdminTask, type AdminTaskPeriod } from "@/lib/admin-tasks";

export type AdminChecklistItem = AdminTask & { doneBy: string | null; doneAt: string | null };

const PERIODS: AdminTaskPeriod[] = ["day", "week", "month"];

/** Checklist của chủ quán trên trang Bán hàng — danh sách cố định trong lib/admin-tasks.ts. */
export function AdminChecklist({ date, items }: { date: string; items: AdminChecklistItem[] }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(items, (state, key: string) =>
    state.map((it) =>
      it.key === key ? { ...it, doneBy: it.doneBy ? null : "Bạn", doneAt: it.doneBy ? null : "…" } : it,
    ),
  );
  const done = optimistic.filter((i) => i.doneBy).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  function toggle(item: AdminChecklistItem) {
    startTransition(async () => {
      setOptimistic(item.key);
      const res = await toggleAdminTask(item.key, date);
      if (res.error) alert(res.error);
    });
  }

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ListChecks size={18} className="text-green-600" aria-hidden /> Việc của chủ quán
        </h2>
        <span className={`text-sm font-semibold tabular-nums ${done === items.length ? "text-green-700" : "text-slate-600"}`}>
          {done}/{items.length}
        </span>
      </div>
      <div
        className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-4">
        {PERIODS.map((period) => {
          const group = optimistic.filter((it) => it.period === period);
          if (group.length === 0) return null;
          return (
            <div key={period}>
              <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {ADMIN_PERIOD_LABELS[period]} · {group.filter((i) => i.doneBy).length}/{group.length}
              </h3>
              <ul className="grid gap-1 sm:grid-cols-2">
                {group.map((it) => {
                  const isDone = !!it.doneBy;
                  return (
                    <li key={it.key} className="flex items-start gap-1 rounded-lg hover:bg-slate-50">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={isDone}
                          disabled={pending}
                          onChange={() => toggle(it)}
                          className="mt-0.5 size-5 shrink-0 accent-green-600"
                        />
                        <span className="min-w-0">
                          <span className={`block font-medium ${isDone ? "text-slate-400 line-through" : ""}`}>
                            {it.title}
                          </span>
                          <span className="block text-xs text-slate-500">{it.description}</span>
                          {isDone && (
                            <span className="flex items-center gap-1 text-xs text-green-700">
                              <Check size={12} aria-hidden /> {it.doneBy} · {it.doneAt}
                            </span>
                          )}
                        </span>
                      </label>
                      {it.href && (
                        <Link
                          href={it.href}
                          className="mt-1.5 flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                        >
                          Mở <ChevronRight size={14} aria-hidden />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
