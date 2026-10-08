"use client";

import type { ComponentProps } from "react";

/** Ô chọn trong form lọc: chọn xong tự gửi form (không cần bấm nút Tìm). */
export function AutoSubmitSelect(props: Omit<ComponentProps<"select">, "onChange">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
