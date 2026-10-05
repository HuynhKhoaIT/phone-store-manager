"use client";

import { useOptimistic, useTransition } from "react";
import { toggleChecklist } from "@/app/actions";

export type ChecklistItem = {
  taskId: number;
  title: string;
  description: string | null;
  doneBy: string | null;
  doneAt: string | null; // HH:mm
  canToggle: boolean;
};

export function DailyChecklist({ date, items, editable }: { date: string; items: ChecklistItem[]; editable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(items, (state, taskId: number) =>
    state.map((it) =>
      it.taskId === taskId ? { ...it, doneBy: it.doneBy ? null : "Bạn", doneAt: it.doneBy ? null : "…" } : it,
    ),
  );
  const done = optimistic.filter((i) => i.doneBy).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  function toggle(item: ChecklistItem) {
    startTransition(async () => {
      setOptimistic(item.taskId);
      const res = await toggleChecklist(item.taskId, date);
      if (res.error) alert(res.error);
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">✅ Việc cần làm trong ngày</h2>
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
      <ul className="grid gap-1 sm:grid-cols-2">
        {optimistic.map((it) => {
          const isDone = !!it.doneBy;
          const disabled = !editable || pending || (isDone && !it.canToggle);
          return (
            <li key={it.taskId}>
              <label
                className={`flex items-start gap-3 rounded-lg px-2 py-2 ${disabled ? "" : "cursor-pointer hover:bg-slate-50"}`}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={disabled}
                  onChange={() => toggle(it)}
                  className="mt-0.5 size-5 shrink-0 accent-green-600"
                />
                <span className="min-w-0">
                  <span className={`block font-medium ${isDone ? "text-slate-400 line-through" : ""}`}>{it.title}</span>
                  {it.description && <span className="block text-xs text-slate-500">{it.description}</span>}
                  {isDone && (
                    <span className="block text-xs text-green-700">
                      ✓ {it.doneBy} · {it.doneAt}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
