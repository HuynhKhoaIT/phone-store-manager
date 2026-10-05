import { NextResponse, type NextRequest } from "next/server";

// Chỉ kiểm tra có cookie hay không; chữ ký và quyền được kiểm tra lại ở server (lib/auth.ts).
export function middleware(req: NextRequest) {
  if (!req.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // /api/public: API chỉ đọc cho web marketing, không cần đăng nhập
  matcher: ["/((?!login|api/public|_next/static|_next/image|favicon.ico).*)"],
};
