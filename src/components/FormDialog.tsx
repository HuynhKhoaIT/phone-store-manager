"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, X } from "lucide-react";

/** Hàm đóng popup đang chứa form — ActionForm dùng cho nút Huỷ. null = không nằm trong popup. */
const DialogContext = createContext<(() => void) | null>(null);
export const useDialogClose = () => useContext(DialogContext);

/**
 * Hộp thoại chứa form (kiểu Ant Design Modal). Trên điện thoại hiện toàn màn hình như một trang của app.
 * - Có `triggerLabel`: hiện nút chính để mở.
 * - `defaultOpen` + `closeHref`: dùng cho chế độ sửa (?edit=id) — mở sẵn, đóng thì quay về `closeHref`.
 * ActionForm bên trong tự đóng hộp thoại khi lưu thành công.
 */
export function FormDialog({
  title,
  triggerLabel,
  triggerVariant = "primary",
  triggerIcon,
  defaultOpen,
  closeHref,
  children,
}: {
  title: string;
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary";
  /** Icon trên nút mở (mặc định dấu +) */
  triggerIcon?: ReactNode;
  defaultOpen?: boolean;
  closeHref?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (defaultOpen && ref.current && !ref.current.open) ref.current.showModal();
  }, [defaultOpen]);

  return (
    <>
      {triggerLabel && (
        <button
          type="button"
          onClick={() => ref.current?.showModal()}
          className={`${triggerVariant === "primary" ? "btn-primary" : "btn-secondary"} inline-flex items-center gap-1.5`}
        >
          {triggerIcon ?? <Plus size={16} aria-hidden />}
          {triggerLabel}
        </button>
      )}
      <dialog
        ref={ref}
        aria-label={title}
        onClose={() => closeHref && router.push(closeHref)}
        // Bấm ra ngoài (vùng nền) thì đóng
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="form-dialog m-auto w-full max-w-2xl flex-col rounded-lg bg-white p-0 text-slate-900 shadow-2xl open:flex max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none"
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-slate-100 px-2 sm:h-auto sm:justify-between sm:px-5 sm:py-4">
          {/* Điện thoại: nút quay lại như app */}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Quay lại"
            className="flex size-10 items-center justify-center rounded-full text-slate-700 active:bg-slate-100 sm:hidden"
          >
            <ChevronLeft size={24} />
          </button>
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Đóng"
            className="hidden rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:block"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:max-h-[75vh] sm:px-5">
          <DialogContext.Provider value={() => ref.current?.close()}>{children}</DialogContext.Provider>
        </div>
      </dialog>
    </>
  );
}
