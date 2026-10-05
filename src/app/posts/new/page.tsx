import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { dateTimeLocalVN } from "@/lib/format";
import { savePost } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { PostEditorFields } from "@/components/PostEditorFields";

export default async function NewPostPage() {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Viết bài mới"
        actions={
          <Link href="/posts" className="btn-secondary">
            <ArrowLeft size={16} aria-hidden /> Danh sách bài viết
          </Link>
        }
      />
      <ActionForm
        action={savePost}
        submitLabel="Lưu bài viết"
        successMessage="Đã lưu bài viết."
        redirectTo="/posts"
        className="card grid gap-4"
      >
        <PostEditorFields defaultPublishedAt={dateTimeLocalVN(new Date())} />
      </ActionForm>
    </div>
  );
}
