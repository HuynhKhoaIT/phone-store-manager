import { getVisiblePosts, preflight, publicHeaders, toSummary } from "@/lib/public-api";

/** GET /api/public/posts/:slug — một bài viết (kèm contentHtml) + tối đa 4 bài cùng chuyên mục. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = publicHeaders(req.headers.get("origin"));
  const all = await getVisiblePosts();
  const post = all.find((p) => p.slug === slug);
  if (!post) return Response.json({ error: "Không tìm thấy bài viết" }, { status: 404, headers });
  const related = all.filter((p) => p.id !== post.id && p.category === post.category).slice(0, 4).map(toSummary);
  return Response.json({ post, related }, { headers });
}

export const OPTIONS = preflight;
