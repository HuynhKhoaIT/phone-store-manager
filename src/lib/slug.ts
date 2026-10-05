/** Chuỗi tiếng Việt → slug cho URL, vd "iPhone 13 Pro Max Xanh (Cũ)" → "iphone-13-pro-max-xanh-cu". */
export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
