"use client";

import { useTransition } from "react";
import type { ActionResult } from "@/app/actions";

export function ConfirmButton({
  action,
  message,
  children,
  className = "text-sm text-red-600 hover:underline",
  noConfirm,
  disabled,
}: {
  action: () => Promise<ActionResult>;
  message: string;
  children: React.ReactNode;
  className?: string;
  noConfirm?: boolean;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending || disabled}
      className={className}
      onClick={() => {
        if (!noConfirm && !confirm(message)) return;
        startTransition(async () => {
          const res = await action();
          if (res.error) alert(res.error);
        });
      }}
    >
      {children}
    </button>
  );
}
