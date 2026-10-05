import { Marked, type Tokens } from "marked";

/**
 * Markdown → HTML cho bài viết. Dùng chung cho xem trước (client) và API công khai (server).
 * An toàn khi FE chèn thẳng HTML: không cho HTML nhúng tay, chỉ cho link http(s)/mailto/tel/đường dẫn tương đối.
 */
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const md = new Marked({ gfm: true, breaks: true });
md.use({
  renderer: {
    // HTML viết tay trong bài → hiện thành chữ, không chạy
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    link(token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      if (!SAFE_URL.test(token.href)) return text;
      const external = /^https?:\/\//i.test(token.href);
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<a href="${escapeHtml(token.href)}"${title}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    },
    image(token: Tokens.Image) {
      if (!/^(https?:\/\/|\/)/i.test(token.href)) return escapeHtml(token.text);
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}"${title} loading="lazy" />`;
    },
  },
});

export function renderMarkdown(markdown: string): string {
  return md.parse(markdown, { async: false }) as string;
}

/** Bỏ ký hiệu Markdown để lấy đoạn văn bản thuần (làm tóm tắt). */
export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
