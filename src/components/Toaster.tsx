"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";

type Toast = { id: number; message: string; type: "success" | "error" };

const EVENT = "app:toast";

/** Hiện thông báo nổi góc trên (gọi được từ mọi client component). */
export function toast(message: string, type: Toast["type"] = "success") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { message, type } = (e as CustomEvent<Omit<Toast, "id">>).detail;
      const id = ++seq;
      setToasts((list) => [...list, { id, message, type }]);
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="toast-in flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm text-slate-800 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_3px_6px_-4px_rgba(0,0,0,0.12),0_9px_28px_8px_rgba(0,0,0,0.05)]"
        >
          {t.type === "success" ? (
            <CircleCheck size={18} className="shrink-0 text-green-600" aria-hidden />
          ) : (
            <CircleX size={18} className="shrink-0 text-red-600" aria-hidden />
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}
