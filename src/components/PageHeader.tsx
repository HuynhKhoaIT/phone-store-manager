import type { ReactNode } from "react";

/** Đầu trang thống nhất: tiêu đề + mô tả bên trái, nút hành động bên phải. */
export function PageHeader({
  title,
  subtitle,
  actions,
  hideTitleOnMobile,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Điện thoại: thanh trên cùng đã hiện tên trang → ẩn để khỏi lặp, nhường chỗ cho nội dung */
  hideTitleOnMobile?: boolean;
}) {
  if (hideTitleOnMobile && !actions) return <Title title={title} subtitle={subtitle} className="hidden lg:block" />;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <Title title={title} subtitle={subtitle} className={hideTitleOnMobile ? "hidden lg:block" : ""} />
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function Title({ title, subtitle, className }: { title: ReactNode; subtitle?: ReactNode; className: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}
