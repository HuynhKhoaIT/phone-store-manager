"use client";

import { useRouter } from "next/navigation";

/** Ô chọn ngày / tháng, chọn xong thì chuyển trang. */
export function NavInput({
  type,
  value,
  hrefPrefix,
  hrefSuffix = "",
  label,
}: {
  type: "date" | "month";
  value: string;
  hrefPrefix: string;
  hrefSuffix?: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <input
      key={value}
      type={type}
      aria-label={label}
      defaultValue={value}
      onChange={(e) => e.target.value && router.push(`${hrefPrefix}${e.target.value}${hrefSuffix}`)}
      className="input w-auto"
    />
  );
}
