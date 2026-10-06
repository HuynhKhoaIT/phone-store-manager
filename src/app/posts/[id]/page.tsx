import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { dateTimeLocalVN } from "@/lib/format";
import { POST_STATUS_LABEL, postDisplayStatus } from "@/lib/post-labels";
import { savePost } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { PostEditorFields } from "@/components/PostEditorFields";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("posts");
  const post = await prisma.post.findUnique({ where: { id: Number((await params).id) || 0 } });
  if (!post) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sửa bài viết"
        subtitle={`${POST_STATUS_LABEL[postDisplayStatus(post)]} · /${post.slug}`}
        actions={
          <Link href="/posts" className="btn-secondary">
            <ArrowLeft size={16} aria-hidden /> Danh sách bài viết
          </Link>
        }
      />
      <ActionForm
        action={savePost}
        submitLabel="Lưu thay đổi"
        successMessage="Đã lưu bài viết."
        redirectTo="/posts"
        className="card grid gap-4"
      >
        <PostEditorFields
          post={{
            id: post.id,
            title: post.title,
            slug: post.slug,
            category: post.category,
            status: post.status,
            excerpt: post.excerpt,
            content: post.content,
            coverImageUrl: post.coverImageUrl,
            featured: post.featured,
            publishedAtLocal: post.publishedAt ? dateTimeLocalVN(post.publishedAt) : "",
          }}
          defaultPublishedAt={dateTimeLocalVN(new Date())}
        />
      </ActionForm>
    </div>
  );
}
