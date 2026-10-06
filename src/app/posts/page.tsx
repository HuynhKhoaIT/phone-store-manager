import Link from "next/link";
import { ImageOff, PenLine, Star } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { dateTimeLocalVN, formatDate } from "@/lib/format";
import { POST_CATEGORY_LABEL, POST_STATUS_LABEL, postDisplayStatus, type PostDisplayStatus } from "@/lib/post-labels";
import { deletePost } from "../actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PageHeader } from "@/components/PageHeader";

type Search = { status?: string; category?: string; q?: string };

const STATUS_BADGE: Record<PostDisplayStatus, string> = {
  PUBLISHED: "bg-green-100 text-green-800",
  SCHEDULED: "bg-amber-100 text-amber-800",
  DRAFT: "bg-slate-100 text-slate-600",
};

export default async function PostsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("posts");
  const sp = await searchParams;
  const now = new Date();
  const status = (["PUBLISHED", "SCHEDULED", "DRAFT"] as const).find((s) => s === sp.status) ?? "";
  const category = sp.category && POST_CATEGORY_LABEL[sp.category] ? sp.category : "";
  const q = sp.q?.trim() ?? "";

  const statusWhere: Record<string, Prisma.PostWhereInput> = {
    PUBLISHED: { status: "PUBLISHED", OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
    SCHEDULED: { status: "PUBLISHED", publishedAt: { gt: now } },
    DRAFT: { status: "DRAFT" },
  };
  const where: Prisma.PostWhereInput = {
    ...(status && statusWhere[status]),
    ...(category && { category }),
    ...(q && { title: { contains: q, mode: "insensitive" } }),
  };
  const [posts, counts] = await Promise.all([
    prisma.post.findMany({
      where,
      include: { author: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
    Promise.all(
      (["PUBLISHED", "SCHEDULED", "DRAFT"] as const).map((s) => prisma.post.count({ where: statusWhere[s] })),
    ),
  ]);

  const qs = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, category, q, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/posts?${s}` : "/posts";
  };
  const tabs: [string, string][] = [
    ["", `Tất cả (${counts.reduce((a, b) => a + b, 0)})`],
    ["PUBLISHED", `Đã đăng (${counts[0]})`],
    ["SCHEDULED", `Hẹn giờ (${counts[1]})`],
    ["DRAFT", `Nháp (${counts[2]})`],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tin tức"
        subtitle="Bài viết hiển thị trên web bán hàng"
        actions={
          <Link href="/posts/new" className="btn-primary">
            <PenLine size={16} aria-hidden /> Viết bài
          </Link>
        }
      />

      <div className="card flex flex-wrap items-center gap-2 p-3 sm:p-3">
        <div className="inline-flex flex-wrap rounded-md bg-white p-0.5 ring-1 ring-slate-200">
          {tabs.map(([v, l]) => (
            <Link
              key={v}
              href={qs({ status: v })}
              className={`rounded px-3 py-1.5 text-sm ${status === v ? "bg-[#1677ff] font-medium text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <form action="/posts" className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-1">
          {status && <input type="hidden" name="status" value={status} />}
          <select name="category" defaultValue={category} aria-label="Chuyên mục" className="input w-auto">
            <option value="">Mọi chuyên mục</option>
            {Object.entries(POST_CATEGORY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={q} placeholder="Tìm theo tiêu đề..." className="input min-w-0 flex-1 sm:max-w-xs" />
          <button className="btn-secondary">Tìm</button>
        </form>
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Bài viết</th>
              <th>Chuyên mục</th>
              <th>Trạng thái</th>
              <th>Ngày đăng</th>
              <th>Tác giả</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => {
              const st = postDisplayStatus(p, now);
              return (
                <tr key={p.id}>
                  <td data-title>
                    <Link href={`/posts/${p.id}`} className="flex items-center gap-3 hover:text-[#1677ff]">
                      {p.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.coverImageUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                          <ImageOff size={16} aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-medium">
                          {p.featured && <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Nổi bật" />}
                          <span className="line-clamp-2">{p.title}</span>
                        </span>
                        <span className="block truncate text-xs font-normal text-slate-400">/{p.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td data-label="Chuyên mục">{POST_CATEGORY_LABEL[p.category]}</td>
                  <td data-label="Trạng thái">
                    <span className={`badge ${STATUS_BADGE[st]}`}>{POST_STATUS_LABEL[st]}</span>
                  </td>
                  <td data-label="Ngày đăng" className="whitespace-nowrap">
                    {p.publishedAt && st !== "DRAFT" ? (
                      <span>
                        {formatDate(dateTimeLocalVN(p.publishedAt).slice(0, 10))}
                        <span className="text-xs text-slate-400"> {dateTimeLocalVN(p.publishedAt).slice(11)}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="Tác giả">{p.author?.name ?? "—"}</td>
                  <td className="space-x-3 text-right whitespace-nowrap">
                    <Link href={`/posts/${p.id}`} className="text-sm text-[#1677ff] hover:underline">
                      Sửa
                    </Link>
                    <ConfirmButton action={deletePost.bind(null, p.id)} message={`Xoá bài "${p.title}"?`}>
                      Xoá
                    </ConfirmButton>
                  </td>
                </tr>
              );
            })}
            {posts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Chưa có bài viết nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
