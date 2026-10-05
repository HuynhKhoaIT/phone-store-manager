"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import { toast } from "./Toaster";

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
}) {
  const router = useRouter();
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

      <div className="col-span-full flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Đang lưu..." : submitLabel}
        </button>
        {extraButtons}
      </div>
    </form>
  );
}
