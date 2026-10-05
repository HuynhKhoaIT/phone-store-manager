import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl">🔍</p>
      <h1 className="mt-4 text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-slate-500">Đường dẫn không đúng hoặc trang đã bị xoá.</p>
      <Link href="/" className="btn-primary mt-6 inline-block">
        Về trang bán hàng
      </Link>
    </div>
  );
}
