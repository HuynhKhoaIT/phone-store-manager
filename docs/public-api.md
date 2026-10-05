# API công khai cho web bán hàng

API chỉ đọc, **không cần đăng nhập**, trả JSON. Dùng cho trang web marketing / bán hàng online (repo FE riêng).

- Base URL: `https://<domain-app-quản-lý>/api/public` (local: `http://localhost:3000/api/public`)
- Chỉ trả sản phẩm admin đã bật **"Hiển thị trên web"** trong trang Hàng hoá và chưa "Ngừng bán".
- **Không bao giờ** trả: giá nhập, ghi chú nội bộ, chi nhánh đã bán, IMEI đầy đủ (chỉ có bản che `imeiMasked`).
- Dữ liệu được cache; khi admin sửa sản phẩm hoặc nhân viên bán máy, cache phía server được làm mới ngay. Header `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` → qua CDN có thể trễ tối đa ~1 phút.

## CORS

Biến môi trường `PUBLIC_API_ORIGINS` trên app quản lý (Vercel → Settings → Environment Variables):

```
PUBLIC_API_ORIGINS="https://shop.tencuahang.vn,http://localhost:3001"
```

Không đặt biến này = cho phép mọi domain (`*`). Nên đặt khi FE đã có domain chính thức.

## Endpoints

### `GET /products`

Danh sách sản phẩm, có lọc / sắp xếp / phân trang.

| Query | Ý nghĩa |
|---|---|
| `category` | `IPHONE` \| `ANDROID` \| `ACCESSORY` |
| `brand` | Tên thương hiệu, vd `Samsung`, `Apple` (không phân biệt hoa thường, có/không dấu) |
| `condition` | `NEW` (mới) \| `USED` (cũ 99%) |
| `q` | Tìm theo tên, cấu hình, màu, thương hiệu (không dấu cũng được) |
| `featured=1` | Chỉ sản phẩm nổi bật |
| `minPrice`, `maxPrice` | Lọc theo giá thực bán (`finalPrice`), đơn vị đồng |
| `includeSold=1` | Gồm cả máy đã bán (mặc định chỉ còn hàng) |
| `sort` | `featured` (mặc định: nổi bật → thứ tự → mới cập nhật) \| `newest` \| `price_asc` \| `price_desc` |
| `page`, `pageSize` | Mặc định `1`, `24` (tối đa 100) |

Trả về:

```json
{
  "items": [ /* PublicProduct */ ],
  "total": 42,
  "page": 1,
  "pageSize": 24,
  "totalPages": 2
}
```

### `GET /products/:slug`

Chi tiết một sản phẩm + tối đa 8 sản phẩm liên quan (cùng loại, còn hàng, giá gần nhất). Trả cả máy **đã bán** (`status: "SOLD"`) để link cũ không bị lỗi — FE nên hiện "Đã bán" và gợi ý `related`.

```json
{ "product": { /* PublicProduct */ }, "related": [ /* PublicProduct */ ] }
```

Không tìm thấy → `404 { "error": "Không tìm thấy sản phẩm" }`.

### `GET /filters`

Dữ liệu dựng bộ lọc (chỉ tính hàng còn bán):

```json
{
  "categories": [{ "value": "IPHONE", "label": "iPhone", "total": 12 }],
  "brands": [{ "name": "Apple", "total": 12 }, { "name": "Samsung", "total": 5 }],
  "conditions": [{ "value": "USED", "label": "Cũ 99%", "total": 9 }],
  "priceRange": { "min": 150000, "max": 32990000 },
  "total": 30
}
```

### `GET /branches`

Chi nhánh đang hoạt động, sắp theo `id`:

```json
{ "items": [{ "id": 1, "name": "Chi nhánh 1" }] }
```

### `GET /repair-prices`

Bảng giá sửa chữa (không có ghi chú nội bộ), sắp theo dịch vụ rồi dòng máy:

```json
{ "items": [{ "service": "Thay pin", "device": "iPhone 11", "price": 480000, "warranty": "6 tháng" }] }
```

### `GET /posts`

Bài viết **đã đăng** (bài nháp và bài hẹn giờ chưa tới giờ không có), mới nhất trước, **không kèm nội dung**.

| Query | Ý nghĩa |
|---|---|
| `category` | `NEWS` (Tin tức) \| `PROMOTION` (Khuyến mãi) \| `GUIDE` (Mẹo hay) |
| `q` | Tìm theo tiêu đề, tóm tắt |
| `featured=1` | Chỉ bài nổi bật |
| `page`, `pageSize` | Mặc định `1`, `12` (tối đa 50) |

```json
{ "items": [ /* PublicPostSummary */ ], "total": 8, "page": 1, "pageSize": 12, "totalPages": 1 }
```

### `GET /posts/:slug`

Một bài viết kèm nội dung + tối đa 4 bài cùng chuyên mục. Bài nháp / chưa tới giờ đăng → `404`.

```json
{ "post": { /* PublicPost */ }, "related": [ /* PublicPostSummary */ ] }
```

```ts
type PublicPostSummary = {
  id: number;
  slug: string;
  title: string;
  category: "NEWS" | "PROMOTION" | "GUIDE";
  categoryLabel: string;      // "Khuyến mãi"
  excerpt: string;            // tóm tắt (để trống thì lấy ~180 ký tự đầu bài)
  coverImageUrl: string | null;
  featured: boolean;
  author: string | null;
  readingMinutes: number;     // phút đọc ước tính
  publishedAt: string;        // ISO 8601
  updatedAt: string;
};

type PublicPost = PublicPostSummary & {
  content: string;            // Markdown gốc
  contentHtml: string;        // HTML đã làm sạch — chèn trực tiếp được (dangerouslySetInnerHTML)
};
```

`contentHtml` không chứa HTML viết tay (bị chuyển thành chữ), chỉ có link `http(s)`, `mailto:`, `tel:` hoặc đường dẫn tương đối; link ngoài có `target="_blank" rel="noopener noreferrer"`. FE tự tạo CSS cho nội dung (thẻ `h2`, `h3`, `p`, `ul`, `ol`, `blockquote`, `img`, `a`, `table`, `code`).

## Kiểu `PublicProduct`

```ts
type PublicProduct = {
  id: number;
  slug: string;              // dùng làm URL trang chi tiết
  name: string;              // "iPhone 13 Pro Max"
  title: string;             // "iPhone 13 Pro Max 6/128GB Xanh (Cũ)"
  category: "IPHONE" | "ANDROID" | "ACCESSORY";
  categoryLabel: string;     // "iPhone"
  brand: string | null;      // iPhone luôn là "Apple"
  condition: "NEW" | "USED";
  conditionLabel: string;    // "Mới" | "Cũ 99%"
  ramGb: number | null;
  storageGb: number | null;  // 1TB = 1024
  capacity: string | null;   // "6/128GB"
  color: string | null;
  batteryHealth: number | null; // % pin (iPhone)
  warrantyMonths: number;
  price: number;             // giá niêm yết (đồng)
  salePrice: number | null;  // giá khuyến mãi nếu có
  finalPrice: number;        // giá thực bán = salePrice ?? price
  discountPercent: number;   // 0 nếu không giảm
  status: "AVAILABLE" | "SOLD";
  featured: boolean;
  sortOrder: number;
  images: string[];          // link ảnh, ảnh đầu là ảnh đại diện
  thumbnail: string | null;  // = images[0]
  description: string | null;
  imeiMasked: string | null; // "3567•••••••2345" (điện thoại có IMEI)
  updatedAt: string;         // ISO 8601
};
```

## Ví dụ

```ts
const API = process.env.NEXT_PUBLIC_STORE_API ?? "http://localhost:3000/api/public";

const { items } = await fetch(`${API}/products?category=IPHONE&sort=price_asc`).then((r) => r.json());
const { product, related } = await fetch(`${API}/products/iphone-13-pro-max-6-128gb-xanh-cu`).then((r) => r.json());
```

## Nhập dữ liệu (phía cửa hàng)

**Bài viết:** Trang quản lý → **Quản lý → Tin tức** → **Viết bài**. Viết nội dung bằng Markdown (có tab Xem trước), chọn chuyên mục, ảnh bìa, tóm tắt; Trạng thái **Đăng** + ngày đăng (ngày tương lai = hẹn giờ). Bài **Nháp** không bao giờ ra API.

**Sản phẩm:** Trang quản lý → **Hàng hoá** → Thêm / Sửa sản phẩm → bật **"Hiển thị trên web"**, rồi điền: giá khuyến mãi, sản phẩm nổi bật, thứ tự hiển thị, link ảnh (mỗi dòng 1 link), mô tả, đường dẫn (để trống sẽ tự tạo từ tên). Sản phẩm đang hiện trên web có nhãn **Web** trong danh sách.
