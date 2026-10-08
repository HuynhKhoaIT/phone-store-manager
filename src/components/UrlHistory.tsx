"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Nhớ URL trước đó trong app (gồm cả query) — để popup sửa (`?edit=`) đóng bằng "quay lại" khi vừa mở từ
 * chính trang danh sách, thay vì thêm một mục lịch sử mới (bấm Quay lại sẽ mở lại popup).
 */
let current: string | null = null;
let previous: string | null = null;

export const previousUrl = () => previous;

export function UrlHistory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname;
    if (url === current) return;
    previous = current;
    current = url;
  }, [pathname, search]);
  return null;
}
