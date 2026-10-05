import { getVisiblePosts, preflight, publicHeaders, queryPosts } from "@/lib/public-api";

function int(v: string | null) {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/**
 * GET /api/public/posts — bài viết đã đăng, mới nhất trước (không kèm nội dung).
 * ?category=NEWS|PROMOTION|GUIDE &q= &featured=1 &page=1 &pageSize=12
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const result = queryPosts(await getVisiblePosts(), {
    category: sp.get("category") ?? undefined,
    q: sp.get("q") ?? undefined,
    featured: sp.get("featured") === "1",
    page: int(sp.get("page")),
    pageSize: int(sp.get("pageSize")),
  });
  return Response.json(result, { headers: publicHeaders(req.headers.get("origin")) });
}

export const OPTIONS = preflight;
