"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import { toast } from "./Toaster";
import { useDialogClose } from "./FormDialog";

/**
 * Form gọi server action. Giữ nguyên dữ liệu khi lỗi, tự xoá trắng khi thành công.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  confirmMessage,
  extraButtons,
  successMessage,
  redirectTo,
  submitAlign = "end",
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  confirmMessage?: string;
  extraButtons?: ReactNode;
  successMessage?: string;
  /** Chuyển trang sau khi lưu thành công (vd: thoát chế độ sửa). */
  redirectTo?: string;
  /** Vị trí nút lưu: mặc định bên phải (kiểu footer antd Modal); "start" cho form không phải lưu (đăng nhập) */
  submitAlign?: "start" | "end";
}) {
  const router = useRouter();
  const closeDialog = useDialogClose();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmMessage && !confirm(confirmMessage)) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      let res: ActionResult;
      try {
        res = await action(fd);
      } catch (e) {
        // redirect() của Next.js cũng ném lỗi — để framework xử lý
        if (String((e as { digest?: string })?.digest).startsWith("NEXT_")) throw e;
        console.error(e);
        res = { error: "Có lỗi xảy ra, vui lòng thử lại." };
      }
      if (res?.error) setError(res.error);
      else {
        setError(null);
        setSeq((s) => s + 1);
        toast(successMessage ?? "Đã lưu thay đổi.");
        // Nằm trong FormDialog thì đóng hộp thoại; nếu có closeHref, dialog sẽ tự điều hướng
        const dialog = form.closest("dialog");
        if (dialog?.open) dialog.close();
        else if (redirectTo) router.push(redirectTo);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <div key={seq} className="contents">
        {children}
      </div>
      {error && (
        <p role="alert" className="col-span-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {closeDialog ? (
        // Trong popup: chân popup kiểu antd [Huỷ] [Lưu] bên phải, dính đáy khi cuộn.
        // Điện thoại (popup toàn màn hình): thanh nút ghim đáy màn hình kiểu app — nút to, chia đôi.
        // Chừa chỗ cho thanh này: .form-dialog:has(.dialog-footer) trong globals.css
        <div className="dialog-footer z-10 col-span-full flex items-center gap-2 border-t border-slate-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:[&>button]:h-12 max-sm:[&>button]:flex-1 max-sm:[&>button]:text-base sm:sticky sm:bottom-0 sm:-mx-5 sm:-mb-4 sm:justify-end sm:px-5 sm:pb-3">
          <button type="button" onClick={closeDialog} className="btn-secondary">
            Huỷ
          </button>
          {extraButtons}
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Đang lưu..." : submitLabel}
          </button>
        </div>
      ) : (
        // Ngoài popup: điện thoại nút rộng hết khung (kiểu app); máy tính theo submitAlign
        <div
          className={`col-span-full flex flex-wrap items-center gap-2 max-sm:[&>button]:h-12 max-sm:[&>button]:flex-1 max-sm:[&>button]:text-base ${submitAlign === "end" ? "justify-end" : ""}`}
        >
          {submitAlign === "end" && extraButtons}
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Đang lưu..." : submitLabel}
          </button>
          {submitAlign === "start" && extraButtons}
        </div>
      )}
    </form>
  );
}
