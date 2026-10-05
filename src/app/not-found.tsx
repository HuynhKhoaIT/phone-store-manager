import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <SearchX size={56} strokeWidth={1.5} className="mx-auto text-slate-300" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-slate-500">Đường dẫn không đúng hoặc trang đã bị xoá.</p>
      <Link href="/" className="btn-primary mt-6 inline-block">
        Về trang chủ
      </Link>
    </div>
  );
}
