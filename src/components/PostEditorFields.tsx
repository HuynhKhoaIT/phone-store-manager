"use client";

import { useMemo, useRef, useState } from "react";
import { Bold, Heading2, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { POST_CATEGORY_LABEL } from "@/lib/post-labels";

export type PostFormValue = {
  id: number;
  title: string;
  slug: string;
  category: string;
  status: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  featured: boolean;
  /** "YYYY-MM-DDTHH:mm" theo giờ Việt Nam */
  publishedAtLocal: string;
};

type Tool = { label: string; icon: typeof Bold; before: string; after?: string; placeholder: string; block?: boolean };

const TOOLS: Tool[] = [
  { label: "In đậm", icon: Bold, before: "**", after: "**", placeholder: "chữ đậm" },
  { label: "In nghiêng", icon: Italic, before: "_", after: "_", placeholder: "chữ nghiêng" },
  { label: "Tiêu đề", icon: Heading2, before: "## ", placeholder: "Tiêu đề mục", block: true },
  { label: "Danh sách", icon: List, before: "- ", placeholder: "Ý thứ nhất", block: true },
  { label: "Danh sách số", icon: ListOrdered, before: "1. ", placeholder: "Bước thứ nhất", block: true },
  { label: "Trích dẫn", icon: Quote, before: "> ", placeholder: "Trích dẫn", block: true },
  { label: "Chèn link", icon: Link2, before: "[", after: "](https://)", placeholder: "chữ hiển thị" },
  { label: "Chèn ảnh", icon: ImageIcon, before: "![", after: "](https://)", placeholder: "mô tả ảnh" },
];

/** Các ô soạn bài viết (Markdown + xem trước). */
export function PostEditorFields({ post, defaultPublishedAt }: { post?: PostFormValue; defaultPublishedAt: string }) {
  const [content, setContent] = useState(post?.content ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [cover, setCover] = useState(post?.coverImageUrl ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const html = useMemo(() => (tab === "preview" ? renderMarkdown(content) : ""), [tab, content]);
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  function apply(t: Tool) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const selected = content.slice(a, b) || t.placeholder;
    const needsNewline = t.block && a > 0 && content[a - 1] !== "\n";
    const insert = `${needsNewline ? "\n" : ""}${t.before}${selected}${t.after ?? ""}`;
    const next = content.slice(0, a) + insert + content.slice(b);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const start = a + insert.length - selected.length - (t.after?.length ?? 0);
      el.setSelectionRange(start, start + selected.length);
    });
  }

  return (
    <div className="col-span-full grid gap-5 lg:grid-cols-[1fr_320px]">
      {/* Cột chính */}
      <div className="min-w-0 space-y-4">
        {post && <input type="hidden" name="id" value={post.id} />}
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={post?.title}
          placeholder="Tiêu đề bài viết"
          aria-label="Tiêu đề"
          className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-2xl font-semibold outline-none placeholder:text-slate-300 focus:border-[#1677ff]"
        />

        <div className="rounded-lg border border-slate-300 bg-white focus-within:border-[#1677ff] focus-within:ring-2 focus-within:ring-[#1677ff]/15">
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-1.5">
            <div className="mr-2 inline-flex rounded-md bg-slate-100 p-0.5 text-sm">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded px-3 py-1 ${tab === t ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}
                >
                  {t === "write" ? "Viết" : "Xem trước"}
                </button>
              ))}
            </div>
            {tab === "write" &&
              TOOLS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => apply(t)}
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <t.icon size={16} />
                </button>
              ))}
            <span className="ml-auto text-xs text-slate-400">{words} chữ</span>
          </div>
          <textarea
            ref={ref}
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"Viết nội dung bằng Markdown...\n\n## Tiêu đề mục\nNội dung, **in đậm**, [link](https://...)\n- gạch đầu dòng"}
            className={`block min-h-[420px] w-full resize-y rounded-b-lg border-0 bg-transparent px-4 py-3 font-mono text-sm leading-relaxed outline-none ${tab === "write" ? "" : "hidden"}`}
          />
          {tab === "preview" && (
            <div className="min-h-[420px] px-4 py-3">
              {content.trim() ? (
                <div className="post-content" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <p className="text-sm text-slate-400">Chưa có nội dung.</p>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Hỗ trợ Markdown: <code>## Tiêu đề</code>, <code>**đậm**</code>, <code>_nghiêng_</code>, <code>- danh sách</code>,{" "}
          <code>[chữ](link)</code>, <code>![mô tả](link ảnh)</code>. HTML viết tay sẽ không được chạy.
        </p>
      </div>

      {/* Cột phụ: xuất bản */}
      <aside className="space-y-4">
        <section className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">Xuất bản</h3>
          <label className="field">
            <span>Trạng thái</span>
            <select name="status" defaultValue={post?.status ?? "DRAFT"} className="input">
              <option value="DRAFT">Nháp (chưa hiện trên web)</option>
              <option value="PUBLISHED">Đăng</option>
            </select>
          </label>
          <label className="field">
            <span>Ngày đăng</span>
            <input
              name="publishedAt"
              type="datetime-local"
              defaultValue={post?.publishedAtLocal || defaultPublishedAt}
              className="input"
            />
            <small className="text-slate-500">Chọn ngày giờ trong tương lai để hẹn giờ đăng.</small>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="featured" defaultChecked={post?.featured} className="size-4 accent-[#1677ff]" />
            Bài nổi bật
          </label>
        </section>

        <section className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">Thông tin</h3>
          <label className="field">
            <span>Chuyên mục</span>
            <select name="category" defaultValue={post?.category ?? "NEWS"} className="input">
              {Object.entries(POST_CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Đường dẫn (slug)</span>
            <input name="slug" defaultValue={post?.slug} maxLength={80} className="input" placeholder="Tự tạo từ tiêu đề" />
          </label>
          <label className="field">
            <span>Ảnh bìa (link)</span>
            <input
              name="coverImageUrl"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              className="input"
              placeholder="https://..."
            />
          </label>
          {/^https?:\/\//i.test(cover) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="Ảnh bìa" className="aspect-video w-full rounded-md border border-slate-200 object-cover" />
          )}
          <label className="field">
            <span>Tóm tắt</span>
            <textarea
              name="excerpt"
              rows={3}
              maxLength={300}
              defaultValue={post?.excerpt ?? ""}
              className="input h-auto py-2"
              placeholder="1–2 câu hiện ở danh sách bài viết (để trống: lấy đầu bài)"
            />
          </label>
        </section>
      </aside>
    </div>
  );
}
