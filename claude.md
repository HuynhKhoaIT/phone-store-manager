# Phone Store Manager

Web app quản lý bán hàng cho cửa hàng điện thoại & phụ kiện nhiều chi nhánh. Nhân viên dùng trên máy tính/điện thoại tại quầy; chủ cửa hàng (admin) xem báo cáo. Toàn bộ giao diện là **tiếng Việt**, tiền tệ **VND**, múi giờ **Asia/Ho_Chi_Minh**.

## Công nghệ

- **Next.js 15** (App Router, Server Components, Server Actions) + **React 19** + TypeScript strict
- **Prisma 6** + **PostgreSQL** (production: Neon qua Vercel)
- **Tailwind CSS 4** (cấu hình trong `src/app/globals.css`, không có `tailwind.config`)
- Deploy: **Vercel**
- Không dùng thư viện auth/UI/chart bên ngoài — đăng nhập, biểu đồ đều tự viết.

## Lệnh

```bash
npm install          # postinstall tự chạy prisma generate
npm run db:local     # bật Postgres local (Windows/Mac/Linux, không cần Docker) — giữ cửa sổ này mở
npm run dev          # dev server ở cửa sổ khác (cần DATABASE_URL trong .env)
npm run db:push      # đồng bộ schema Prisma vào DB
npm run db:seed      # thêm dữ liệu mẫu (chỉ chạy với DB localhost; phần nào đã có dữ liệu thì bỏ qua)
npm run build        # prisma generate + prisma db push + next build (dùng trên Vercel)
npx tsc --noEmit     # kiểm tra kiểu
```

Biến môi trường (xem `.env.example`):

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Chuỗi kết nối Postgres |
| `AUTH_SECRET` | Chuỗi ngẫu nhiên dài để ký cookie đăng nhập. **Bắt buộc ở production**, thiếu thì app báo lỗi |
| `PUBLIC_API_ORIGINS` | (Tuỳ chọn) domain được gọi `/api/public`, cách nhau dấu phẩy. Không đặt = mọi domain |

Không có migration files: schema được đồng bộ bằng `prisma db push` trong lúc build. `db push` sẽ **dừng build** nếu thay đổi làm mất dữ liệu (xoá cột, đổi kiểu…) — khi đó cần tự xử lý dữ liệu trước, đừng thêm `--accept-data-loss` một cách tuỳ tiện.

## Chức năng

| Trang | Ai dùng | Mô tả |
|---|---|---|
| `/login` | — | Đăng nhập + **chọn chi nhánh làm việc**. Khi DB chưa có user nào, trang này thành form thiết lập lần đầu (tạo admin + chi nhánh đầu tiên) |
| `/choose-branch` | Tất cả | Đổi chi nhánh làm việc trong phiên |
| `/` | Tất cả | Trang chủ: lời chào, chi nhánh đang làm, danh sách chức năng dạng ô (kiểu app) |
| `/day/[date]` (`/day` chuyển về hôm nay) | Tất cả | Trang chính: vào ca (giờ đi làm + tiền nhận đầu ca), nhập giao dịch, chốt ca (giờ ra về + tiền bàn giao, hiện chênh lệch; cảnh báo nếu checklist còn việc) |
| `/installments` | Tất cả (quyền `sell`; xoá lần thu: admin) | **Bán trả góp** qua công ty tài chính: form bán giống Bán hàng (`TransactionFields installment`) + công ty tài chính, số hợp đồng, khách trả trước. Danh sách Chờ thanh toán / Đã thanh toán đủ; **Ghi nhận thanh toán** khi công ty tài chính trả phần còn lại. Nhân viên phải đang trong ca (bán và ghi nhận đều vào ca đang mở) |
| `/tasks` | Tất cả (quyền `sell`) | **Việc cần làm**: nhân viên tick checklist hôm nay của chi nhánh; admin thấy **việc của chủ quán** (Hôm nay / Tuần này / Tháng này), xem lại được ngày khác qua `?date=` |
| `/products` (Hàng hoá, `/prices` cũ tự chuyển về) | Xem: tất cả · Sửa: admin | Tab **Danh sách hàng hoá**: thống kê (đang bán, đã bán tháng này, giá trị hàng; admin thấy giá trị theo giá nhập + lãi dự kiến) và bảng giá iPhone / Android / Phụ kiện: thương hiệu, RAM/bộ nhớ (điện thoại), mã sản phẩm (IMEI hoặc mã vạch), pin % (iPhone), mới/cũ, bảo hành mặc định, trạng thái Đang bán / Đã bán (tại chi nhánh nào) / Ngừng bán. Admin thấy giá nhập + lãi |
| `/posts`, `/posts/new`, `/posts/[id]` | Admin | **Tin tức** cho web: danh sách (Đã đăng / Hẹn giờ / Nháp, chuyên mục, tìm kiếm), trang soạn bài riêng (Markdown + Xem trước, chuyên mục Tin tức / Khuyến mãi / Mẹo hay, ảnh bìa, tóm tắt, ngày đăng — tương lai = hẹn giờ, nổi bật) |
| `/promotions` | Admin (quyền `promotions`) | **Chương trình khuyến mãi** (kiểu TGDĐ / CellphoneS): loại ưu đãi Giảm giá (% có trần / số tiền) · Quà tặng · Trả góp 0% · Thu cũ đổi mới · Khác; thời gian từ ngày – đến hết ngày (trống = không thời hạn); áp dụng theo loại hàng / tình trạng / thương hiệu hoặc chọn từng sản phẩm; chi nhánh; banner, thể lệ (Markdown), hiện web, nổi bật. Tab Đang diễn ra / Sắp diễn ra / Đã kết thúc / Tạm dừng |
| `/api/public/*` | Công khai (không đăng nhập) | API chỉ đọc cho web bán hàng (repo FE riêng `phone-store-shop`): `products`, `products/:slug`, `filters`, `branches`, `repair-prices`, `posts`, `posts/:slug`, `promotions`, `promotions/:slug`. Tài liệu: **`docs/public-api.md`**. **Không đổi tên trường / shape** — FE đang dùng |
| `/brands` | Admin | Danh mục thương hiệu để chọn khi nhập phụ kiện / Android |
| `/repair-prices` | Xem: tất cả · Sửa: admin | Bảng giá sửa chữa theo dịch vụ (thay pin, thay màn…) × dòng máy |
| `/warranty` | Tất cả | Tra cứu bảo hành theo SĐT / tên khách / tên sản phẩm |
| `/products/receipts` (`/transfers` cũ tự chuyển về) | Tất cả (xoá: admin) | Tab **Phiếu nhập / chuyển**: phiếu *Nhập từ NCC* (nhà cung cấp, chi nhánh nhận; admin nhập giá nhập/cái → tự cập nhật `Product.costPrice`) và phiếu *Chuyển chi nhánh*. Sản phẩm chọn từ danh sách hàng hoá (`ProductPicker`), chưa có trong danh sách thì lưu theo tên gõ. Phiếu cập nhật số lượng (xem **Số lượng & chi nhánh**) |
| `/timesheet` | Tất cả (admin xem được của người khác) | Chấm công theo tháng: ngày, chi nhánh, giờ vào/ra, tổng giờ |
| `/dashboard` | Admin | Doanh thu tháng, so với tháng trước, biểu đồ theo ngày, TM/CK, theo chi nhánh/nhân viên, top sản phẩm |
| `/reports` | Admin | **Báo cáo** lãi lỗ theo tháng: doanh thu − giá vốn (`Transaction.costPrice`) = lãi gộp; − **chi phí** (`Expense`: mặt bằng, lương, điện nước, linh kiện…, theo chi nhánh hoặc chung) = lãi ròng. Theo chi nhánh, 6 tháng gần đây, nhập/sửa/xoá chi phí. Xuất Excel (`/reports/export?type=transactions|expenses&month=`) dạng UTF-16LE + tab — Excel tiếng Việt mở CSV dấu phẩy bị dồn một cột |
| `/reports/break-even` | Admin | **Hoà vốn** từng chi nhánh: vốn góp (tổng `CapitalEntry` loại góp) so với lãi ròng cộng dồn từ `Branch.openedAt` (trống = ca đầu tiên). Tỉ lệ %, còn lại, dự kiến hoà vốn theo lãi ròng TB 90 ngày. Tính trong `src/lib/capital.ts` |
| `/reports/capital` | Admin | **Góp vốn**: người góp (`Investor`, không phải User) + sổ góp / rút (`CapitalEntry`, theo chi nhánh). Theo từng người: vốn góp, tỉ lệ ở từng chi nhánh, lãi được chia (lãi ròng chi nhánh × tỉ lệ), đã rút, % đã thu về, số dư. Tiền rút **không** phải chi phí |
| `/products/loans` | Quyền Hàng hoá (thanh toán, sửa, xoá: admin) | **Mượn hàng** giữa chi nhánh (`BranchLoan`): Đang mượn → Đã trả hàng, hoặc → Đã bán (quán mượn nợ quán cho mượn **giá nhập**) → Đã thanh toán. Bán qua trang Bán hàng một máy có `Product.ownerBranchId` ≠ chi nhánh của ca → `addTransaction` tự ghi / cập nhật dòng mượn; admin xoá giao dịch → dòng chưa thanh toán quay về "đang mượn". Số tiền = giá nhập nên chỉ admin thấy |
| `/customers`, `/customers/[phone]` | Admin | **Khách hàng**: không có bảng riêng, gom các giao dịch có `customerPhone` (`src/lib/customers.ts`). Danh sách phân trang 20 (`<Pagination>`), tìm SĐT / tên, sắp xếp; chi tiết: lịch sử mua / sửa, bảo hành, nút Gọi / Zalo |
| `/history` | Admin | Lịch tháng của chi nhánh hiện tại, đánh dấu ngày lệch tiền / ca chưa chốt |
| `/checklist` | Admin | Thiết lập việc cần làm hằng ngày (vệ sinh quán, đăng bài TikTok…), sắp xếp, áp dụng theo chi nhánh |
| `/users` | Admin | Tài khoản nhân viên, vai trò (Admin / Nhân viên), chi nhánh được làm |
| `/permissions` | Admin | **Phân quyền** riêng từng nhân viên: tick chức năng được dùng (xem mục Phân quyền) |
| `/branches` | Admin | Thêm / đổi tên / ẩn chi nhánh |
| `/account` | Tất cả | Đổi mật khẩu của mình |

Giao diện (`src/components/AppShell.tsx`, danh sách menu dùng chung ở `src/lib/nav.ts`):
- **Máy tính (lg+)**: kiểu Ant Design Pro — Sider tối bên trái (thu gọn chỉ còn icon, trạng thái lưu cookie `sider`), Header trắng (nút thu gọn, breadcrumb, chi nhánh, menu tài khoản: Tài khoản / Đổi chi nhánh / Đăng xuất), Footer.
- **Điện thoại**: kiểu app — không có sidebar. Trang chủ `/` là danh sách chức năng; các trang khác có thanh trên cùng: nút **Quay lại** (về trang trước trong app, mở thẳng link thì về trang chủ), tên trang, **logo** (bấm về trang chủ).
- Thêm trang mới: khai báo trong `STAFF_LINKS` / `ADMIN_LINKS` ở `src/lib/nav.ts` (href, match, label, description, icon, màu) — sidebar, trang chủ và breadcrumb tự cập nhật.
- Icon: dùng **lucide-react** (SVG), không dùng emoji.
- Khi bấm menu có thanh tiến trình mỏng ở đầu trang.

## Nghiệp vụ quan trọng

**Ca làm việc (`Shift`)** — mỗi lần nhân viên vào ca tạo một `Shift` gắn với `date`, chi nhánh và user. Giao dịch luôn thuộc về một ca. Chốt ca thì ca bị khoá (không thêm/xoá giao dịch); chỉ admin "Mở lại ca" được.
- *Tiền mặt phải có* = `openingCash` + tổng giao dịch tiền mặt của ca.
- *Chênh lệch* = `handoverCash` − tiền mặt phải có (âm = thiếu).

**Giao dịch (`Transaction`)**
- `kind`: `SALE` (bán hàng) | `REPAIR` (sửa chữa) | `SIM` (bán SIM)
- **Bán SIM**: chọn số + đấu nối vẫn làm trên app nhà mạng (không có API công khai), ở đây chỉ ghi nhận `simCarrier`, `simNumber` (10 số), `simSerial`, `simPlanPrice`. `price` = giá SIM + giá gói cước, `productName` = "SIM <nhà mạng> <số>". Không bảo hành / quà tặng / trả góp; doanh thu tính vào nhóm Bán hàng
- `paymentMethod`: `CASH` (TM) | `TRANSFER` (CK). CK thì **bắt buộc** `bankAccount` (tài khoản nhận tiền).
- `warrantyMonths` 0–12. **> 0 thì bắt buộc tên + SĐT khách** (để tra cứu bảo hành). SĐT được lưu đã bỏ khoảng trắng/dấu chấm/gạch.
- Ngày hết bảo hành = ngày của ca + số tháng (`warrantyEnd` trong `lib/format.ts`, xử lý cuối tháng).
- Khi nhập, gõ tên sẽ gợi ý từ bảng giá; chọn đúng gợi ý thì tự điền giá + bảo hành (`TransactionFields.tsx`).

**Bán trả góp** (`Transaction.financeCompany` ≠ null, `InstallmentPayment`)
- Doanh thu tính **đủ giá bán** vào ngày bán như bán thường (Dashboard / Báo cáo / lãi không đổi).
- Tiền vào ca lúc bán chỉ là `downPayment` (theo `paymentMethod`); phần còn lại `price − downPayment` công ty tài chính trả sau → `InstallmentPayment` gắn với **ca đang mở** của nhân viên ghi nhận (admin ghi nhận thì `shiftId` null). `summarize(txs, collected)` tính TM / CK theo tiền thực nhận, `financed` = phần chờ công ty tài chính.
- Thu đủ thì đặt `financePaidAt`. Xoá giao dịch trả góp đã có lần thu bị chặn; xoá lần thu (admin) khi ca nhận tiền đã chốt thì phải mở lại ca.

**Sản phẩm trong bảng giá (`Product`)**
- Trạng thái suy ra từ `active` + `soldBranchId` (`productStatus()` trong `src/lib/product-labels.ts`): Đang bán / Đã bán / Ngừng bán.
- `code`: IMEI (điện thoại) hoặc mã vạch / mã riêng (phụ kiện), không trùng nhau. **Điện thoại có mã = một máy cụ thể** (`isSingleUnit`): bán qua giao dịch (chọn đúng gợi ý) thì tự đánh dấu Đã bán tại chi nhánh của ca và biến khỏi gợi ý; admin xoá giao dịch thì máy trở lại Đang bán. Phụ kiện có mã không tự đánh dấu.
- `costPrice` (giá nhập) **chỉ admin thấy**; không được đưa vào dữ liệu gửi xuống client của nhân viên (gợi ý giá không chứa giá nhập). Khi bán, giá nhập được chụp vào `Transaction.costPrice` → Dashboard tính **Lợi nhuận** trên các giao dịch có giá nhập.
- `ramGb` / `storageGb` (điện thoại, chọn từ `RAM_OPTIONS` / `STORAGE_OPTIONS`), `batteryHealth` (chỉ iPhone, 1–100). Tên khi bán = `productLabel()`, vd "iPhone 13 Pro Max 6/128GB Xanh (Cũ) - Mã 3567…" → tra bảo hành theo IMEI được.

**Số lượng & chi nhánh của hàng hoá** (`src/lib/stock.ts`)
- Mỗi quán quản lý nguồn hàng riêng: `Product.ownerBranchId` (bắt buộc khi lưu) + `Product.quantity`. Cùng một phụ kiện ở 2 quán là 2 dòng (`branchTwin` tìm / tạo dòng tương ứng). Trang Hàng hoá chỉ hiện hàng của quán đang làm (lọc theo Loại / Thương hiệu, chọn là lọc ngay); hàng cũ chưa gắn chi nhánh hiện ở mọi quán.
- Máy có IMEI (`isSingleUnit`) luôn SL 1, theo dõi bằng Đang bán / Đã bán. Hàng khác: bán qua trang Bán hàng trừ 1, quà tặng trừ đúng SL, phiếu nhập cộng, phiếu chuyển trừ quán gửi / cộng quán nhận (máy IMEI thì đổi `ownerBranchId`). Xoá giao dịch / phiếu thì hoàn lại. SL có thể âm (không chặn bán) — danh sách hiện đỏ "cần kiểm kho".
- **Quà tặng kèm** (`TransactionGift`): khi bán, chọn phụ kiện của cửa hàng + SL, giá 0 đ. Giá nhập quà chụp vào `Transaction.giftCost` và cộng vào giá vốn trong `profitOf` → Dashboard / Báo cáo / Hoà vốn / xuất Excel tự trừ.
- Bán hoặc tặng hàng của quán khác → `consumeBorrowed` ghi sổ Mượn hàng (dùng dòng "đang mượn" có sẵn, tách nếu chỉ dùng một phần). Gợi ý trang Bán hàng ghi "(hàng <quán>)" để nhân viên biết.

**Web marketing / API công khai** (`src/lib/public-api.ts`, `src/app/api/public/**`)
- Chỉ sản phẩm `showOnWeb = true` và `active` mới ra API; máy đã bán chỉ hiện khi `includeSold=1` hoặc mở theo slug.
- **Giá "Liên hệ"**: `RepairPrice.price = 0` (admin để trống giá) hoặc `Product.priceOnRequest` (ô "Web hiện Liên hệ thay giá") → API trả giá 0, web hiện "Liên hệ". Giá thật của sản phẩm vẫn dùng nội bộ khi bán.
- `toPublic()` là **chỗ duy nhất** quyết định trường nào được công khai — không trả `costPrice`, `note`, `code` đầy đủ, `soldBranch`. Thêm trường mới vào API thì sửa ở đây, và cân nhắc có nhạy cảm không.
- `slug` không đặt `@unique` ở DB (để `prisma db push` lúc build Vercel không dừng vì cảnh báo); `saveProduct` tự đảm bảo không trùng (thêm `-2`, `-3`...).
- Cache bằng tag `prices` → mọi action sửa sản phẩm / thương hiệu / bán máy phải `revalidateTag(TAGS.prices)`.
- CORS: env `PUBLIC_API_ORIGINS` (không đặt = `*`). Middleware bỏ qua `/api/public`.
- Repo FE riêng `phone-store-shop` **chỉ gọi API** (env `ADMIN_API_URL`), không đọc DB. Đổi tên trường `PublicProduct` hoặc shape `{ items: [...] }` của `branches` / `repair-prices` thì phải báo bên đó. FE không có đặt hàng / thanh toán (chỉ nút liên hệ Zalo / gọi).
- Tin tức: nội dung lưu Markdown, chuyển HTML bằng `src/lib/markdown.ts` (marked) — **chặn HTML viết tay và link không an toàn** vì FE chèn `contentHtml` trực tiếp. Bài hẹn giờ: cache chứa mọi bài PUBLISHED, lọc `publishedAt <= now` lúc gọi API nên tự hiện đúng giờ. Cache tag `posts`.

**Chương trình khuyến mãi (`Promotion`)** — logic thuần ở `src/lib/promotion-labels.ts` (dùng được ở client), loader cache tag `promotions` ở `src/lib/promotions.ts`.
- Trạng thái suy ra từ `active` + `startDate` / `endDate` so với `todayVN()` (`promotionStatus`) — lọc lúc dùng, không lọc trong cache, để tự bắt đầu / kết thúc đúng ngày.
- Phạm vi (`matchesPromotion`): có `productIds` thì chỉ các sản phẩm đó; không thì `categories` ∧ `conditions` ∧ `brandIds` (mảng trống = không giới hạn). `branchIds` trống = mọi chi nhánh.
- Chỉ loại `DISCOUNT` đổi giá: trừ trên giá bán tại quầy (`sellingPrice`) / `finalPrice` web, giảm % làm tròn 1.000 đ, có trần `maxDiscount`; nhiều chương trình thì lấy **mức giảm cao nhất, không cộng dồn** (`promotionsFor`).
- Trang Bán hàng: `getSaleSuggestions(branchId)` trả giá đã giảm + `promo` (tên ưu đãi), form hiện "Khuyến mãi: …"; trang `/day` hôm nay có thẻ "Khuyến mãi đang chạy". Giá vẫn là số nhân viên nhập — không ép.
- Web: chỉ chương trình `showOnWeb`; giảm giá riêng chi nhánh **không** trừ vào giá web, chỉ hiện trong `product.promotions`. `getPublicProducts()` ghép sản phẩm (cache `prices`) + khuyến mãi (cache `promotions`) lúc gọi.

**Chi nhánh**
- Chi nhánh làm việc của phiên lưu trong cookie `branchId`, được chọn lúc đăng nhập. **Mọi ca/giao dịch/checklist ghi vào chi nhánh này** — server luôn lấy qua `getCurrentBranch()`, không tin `branchId` gửi từ form.
- `User.branches` (nhiều–nhiều): chi nhánh nhân viên được phép làm. **Danh sách rỗng = làm được mọi chi nhánh.** Admin luôn được vào mọi chi nhánh.
- Chọn chi nhánh không được phân công lúc đăng nhập → báo lỗi, **không** tự chuyển sang chi nhánh khác.
- **Thông tin cửa hàng trên web** (sửa ở `/branches`, mục "Hiển thị trên web bán hàng"): địa chỉ, hotline, Zalo (số hoặc link), Facebook, TikTok, link Google Maps, giờ mở cửa, hiện / ẩn, thứ tự. API `/api/public/branches` (`getWebBranches`) trả cửa hàng đang hoạt động + bật hiện, theo thứ tự; cửa hàng đầu tiên = hotline / Zalo chính của web. Link Maps có toạ độ (`@lat,lng`) thì bản đồ nhúng đúng chỗ, không thì tìm theo địa chỉ.
- Chi nhánh không bị xoá, chỉ ẩn (`active = false`) để giữ lịch sử. Báo cáo dùng `getBranches()` (gồm cả chi nhánh đã ẩn), còn form chọn dùng `getActiveBranches()`.

**Checklist** — `ChecklistTask` do admin tạo (`branchId` null = mọi chi nhánh). `ChecklistCheck` duy nhất theo (task, ngày, chi nhánh): mỗi việc tính một lần cho cả chi nhánh trong ngày, ghi lại ai tick và lúc nào. Nhân viên chỉ bỏ tick được việc do chính mình tick. Form chốt ca cảnh báo nếu checklist còn việc chưa xong. Việc đã ẩn vẫn hiện ở những ngày từng được tick.

**Việc của chủ quán** — ở trang `/tasks`, admin không thấy checklist nhân viên mà thấy danh sách **cố định trong code** `src/lib/admin-tasks.ts` (`ADMIN_TASKS`, chia Hôm nay / Tuần này / Tháng này; không thiết lập ở `/checklist`). Tick lưu ở `AdminCheck` theo (`taskKey`, kỳ), tính chung cả cửa hàng, không theo chi nhánh. Đừng đổi `key` của việc đã có (mất lịch sử tick).

**Phân quyền** (`ADMIN` | `STAFF`)
- **Chỉ nhân viên vào ca.** Admin không có ca; admin xem và quản lý ca của nhân viên (thêm giao dịch vào ca đang mở, mở lại ca đã chốt).
- **Chỉ admin được xoá giao dịch** (`deleteTransaction`); nhân viên nhập sai thì báo admin.
- Nhân viên chỉ thao tác trên **ngày hôm nay**, chỉ sửa **ca của mình**.
- **Quyền riêng từng nhân viên** (`User.permissions`, danh sách khoá trong `src/lib/permissions.ts`, admin sửa ở `/permissions`). Admin bỏ qua, luôn toàn quyền. Mỗi quyền = một mục menu: `sell`, `products`, `repair-prices`, `warranty`, `timesheet` (mặc định bật — giống nhân viên trước khi có phân quyền) và `dashboard`, `history`, `posts`, `promotions`, `checklist`, `brands` (mặc định tắt). Thiếu quyền → menu ẩn, trang chuyển về trang chủ, server action trả lỗi.
  - Trang: `await requirePermission("key")`; server action: `can(me, "key")`; menu: trường `permission` trong `src/lib/nav.ts` (không đặt = chỉ admin).
  - `history` cho phép xem `/day/<ngày khác>` (chỉ xem); vào ca / giao dịch / tick checklist cần `sell`.
  - Luôn chỉ admin: `/users`, `/permissions`, `/branches`, sửa bảng giá & giá sửa chữa, xem giá nhập, xoá giao dịch, mở lại ca, xoá phiếu nhập — tránh nhân viên tự nâng quyền / thấy giá nhập.
  - Thêm quyền mới: thêm vào `PERMISSIONS`, gắn `permission` cho menu, kiểm tra ở trang + action. Tài khoản cũ không tự có quyền mới.
- Mọi server action **tự kiểm tra quyền** — không dựa vào việc ẩn nút trên giao diện.

## Cấu trúc code

```
prisma/schema.prisma        # Toàn bộ model, có comment tiếng Việt
src/middleware.ts           # Chưa có cookie session → chuyển /login (chỉ kiểm tra có cookie)
src/app/actions.ts          # TẤT CẢ server actions (mutation) — validate + kiểm tra quyền ở đây
src/app/layout.tsx          # Header: menu, chi nhánh hiện tại, user, đăng xuất
src/app/<route>/page.tsx    # Server components đọc DB trực tiếp qua prisma
src/app/day/[date]/ShiftCard.tsx
src/lib/auth.ts             # Hash mật khẩu (scrypt), cookie session ký HMAC, requireUser/requireAdmin/requirePermission
src/lib/permissions.ts      # Danh sách quyền nhân viên, can()
src/lib/branch.ts           # getCurrentBranch, getAllowedBranches, getActiveBranches, getBranches
src/lib/format.ts           # Tiền, ngày giờ VN, cộng ngày/tháng, warrantyEnd
src/lib/summary.ts          # summarize(): tổng / bán / sửa / TM / CK (tiền thực nhận, gồm tiền trả góp thu trong ca) / theo tài khoản
src/lib/prices.ts           # Nhãn loại máy, gợi ý giá khi nhập giao dịch
src/lib/checklist.ts        # getDayChecklist()
src/lib/cache.ts            # Tag cache (branches, users, prices)
src/lib/nav.ts              # Danh sách menu + breadcrumb
src/lib/ui.ts               # Hằng số dùng chung server/client (cookie sider)
scripts/local-db.mjs        # Postgres local (embedded-postgres), dữ liệu trong .local-db/
vercel.json                 # regions: sin1 (Singapore) — phải cùng vùng với database
src/components/             # Client components dùng chung
```

## Quy ước khi viết code

- **Ngày** lưu dạng chuỗi `YYYY-MM-DD`, **giờ vào/ra** dạng `HH:mm`, theo giờ Việt Nam. Lấy "hôm nay" bằng `todayVN()` / `nowTimeVN()` — **không** dùng `new Date().toISOString()` (server Vercel chạy UTC, sẽ lệch ngày trước 7h sáng). Lọc theo tháng dùng `date: { startsWith: "YYYY-MM" }`.
- **Tiền** là `Int` (đồng), không có số lẻ. Hiển thị bằng `formatVND()`. Ô nhập tiền dùng `<MoneyInput>` (tự thêm dấu chấm, gửi chuỗi chữ số qua input ẩn).
- **Mutation**: thêm server action vào `src/app/actions.ts`, trả về `ActionResult` (`{ error?: string }`, thông báo tiếng Việt), gọi `revalidatePath` cho trang liên quan. Thứ tự: `getSessionUser()` → kiểm tra quyền → validate → ghi DB.
- **Form thêm/sửa luôn nằm trong popup** `<FormDialog>` (kiểu antd Modal; trên điện thoại toàn màn hình). Nút "Thêm..." đặt ở `actions` của `<PageHeader>`. Chế độ sửa dùng query `?edit=<id>`: render `<FormDialog key={editing.id} defaultOpen closeHref={...}>`, đóng popup thì quay về `closeHref`. Không dùng `<details>` để ẩn/hiện form.
- Bên trong popup dùng `<ActionForm action={...}>`: giữ nguyên dữ liệu khi lỗi, khi thành công thì xoá trắng form, **đóng popup** và hiện **toast** `successMessage` (`src/components/Toaster.tsx`, gọi `toast()` từ client).
- Mọi trang bắt đầu bằng `<PageHeader title subtitle actions>`.
- **Bảng trên điện thoại tự thành danh sách thẻ** (CSS trong `globals.css`): mỗi `<td>` cần `data-label="..."`, ô tiêu đề của thẻ dùng `data-title`; ô có nhiều phần tử con thì bọc trong một thẻ.
- Bo góc theo antd 5: ô nhập/nút `rounded-md` (6px), thẻ/popup `rounded-lg` (8px), badge `rounded` (4px). Màu chính `#1677ff`.
- **Khoảng thời gian Dashboard / Báo cáo / xuất Excel**: `getPeriod()` trong `src/lib/period.ts` — `?month=` hoặc `?from=&to=` (ưu tiên khoảng ngày, tối đa 366 ngày). Kỳ so sánh = tháng trước hoặc cùng số ngày liền trước. Lọc DB bằng `date: { gte: from, lte: to }`; giữ tham số qua link bằng `periodParams()`.
- **Chọn ngày / tháng**: dùng `<DatePicker>` / `<NavInput type="month">` (lịch tiếng Việt), không dùng `<input type="date|month">` của trình duyệt (hiện theo ngôn ngữ trình duyệt, thường kiểu Mỹ).
- **Phân trang mọi bảng / danh sách: 20 dòng** (`src/lib/paging.ts` + `<Pagination>`). Cùng tham số `?page=`: máy tính hiện đúng 20 dòng của trang (dãy số trang), điện thoại hiện cộng dồn và có nút **"Xem thêm"**. Vì vậy lấy dữ liệu từ đầu: `count` → `getPaging(total, sp.page)` → `findMany({ take: paging.take })` (không `skip`), mỗi dòng gắn `rowClass(paging, i)` (ẩn dòng trang trước trên máy tính). `orderBy` phải có `id` làm khoá phụ để thứ tự ổn định. Số liệu thống kê luôn tính trên toàn bộ dữ liệu, không trên trang. Không phân trang: bảng tổng hợp / top 10 / lịch tháng.
- **Nút xoá / thao tác nhanh**: `<ConfirmButton action={serverAction.bind(null, id)} message="...">`.
- Trang chỉ cho admin gọi `await requireAdmin()` ở đầu; trang theo quyền gọi `await requirePermission("key")`; trang chung gọi `await requireUser()`.
- Giữ class tiện ích trong `globals.css` (`card`, `input`, `field`, `btn-primary`, `btn-secondary`, `table`, `badge`) thay vì lặp chuỗi Tailwind dài.
- Bảng dài trên mobile: bọc `overflow-x-auto`; trang nhân viên hay xem trên điện thoại (như `/prices`) có thêm dạng thẻ `sm:hidden`.
- Màu biểu đồ: `--series-sale` (xanh) và `--series-repair` (cam) trong `globals.css`.

## Hiệu năng

- **Server và DB phải cùng vùng.** `vercel.json` đặt function ở `sin1` (Singapore); database cũng phải ở Singapore. Lệch vùng (vd Mỹ ↔ Singapore) làm mỗi truy vấn tốn ~200 ms.
- **Cache dữ liệu ít đổi** bằng `unstable_cache` với tag trong `src/lib/cache.ts`: user đăng nhập (`findSessionUser`), danh sách chi nhánh, chi nhánh được phân công, gợi ý bảng giá. Server action sửa dữ liệu nào thì **phải gọi `revalidateTag(TAGS.xxx)`** tương ứng, nếu không giao diện sẽ hiện dữ liệu cũ. Hàm cache trả về JSON nên chỉ `select` các trường không phải `Date`.
- Hàm dùng nhiều lần trong một request (`getSessionUser`, `getAllowedBranches`, `getCurrentBranch`) bọc bằng `React.cache`.
- **Không đặt `loading.tsx` ở `src/app/`** (Suspense ở root): đã gặp lỗi kết quả server action thỉnh thoảng không được cập nhật lên màn hình. Phản hồi khi chuyển trang dùng thanh tiến trình trong `AppShell`.

## Deploy lên Vercel

1. Đẩy repo lên GitHub → **Vercel → Add New Project** → import repo (Framework tự nhận Next.js).
2. Trong project Vercel: **Storage → Create Database → Neon (Postgres)** → Connect. Vercel tự thêm `DATABASE_URL`.
3. **Settings → Environment Variables**: thêm `AUTH_SECRET` (tạo bằng `openssl rand -base64 32`).
4. Deploy. Lệnh build tự tạo bảng (`prisma db push`).
5. Mở web → trang thiết lập lần đầu → tạo tài khoản admin + chi nhánh đầu tiên. Sau đó thêm chi nhánh, nhân viên, bảng giá, checklist trong menu **Quản lý**.

## Chạy / test ở máy local (Windows)

- **Dữ liệu mẫu:** `npm run db:seed` (`scripts/seed-demo.mjs`) — giữ nguyên dữ liệu đã có, chỉ thêm vào bảng còn trống: chi nhánh thứ 2, nhân viên `lan` / `nam` (mật khẩu `123456`), thương hiệu, ~22 sản phẩm (không có ảnh — để web hiện ảnh mặc định), giá sửa chữa, checklist, ca + giao dịch 30 ngày (hôm nay có ca đang mở), phiếu nhập/chuyển, 6 bài viết. Script từ chối chạy nếu `DATABASE_URL` không phải localhost. Seed ghi thẳng DB nên cache của server dev đang chạy có thể cũ tới 5 phút (`CACHE_SECONDS`) — khởi động lại `npm run dev` để thấy ngay.
- Chạy `npm run db:local` (Postgres thật qua `embedded-postgres`, cổng 5433, đã ép **UTF8** — mặc định WIN1252 trên Windows sẽ lỗi khi lưu tiếng Việt). `.env`: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/phonestore"`, rồi `npm run db:push` lần đầu. Xoá thư mục `.local-db/` để làm lại DB từ đầu. (`prisma dev` không hỗ trợ Windows.)
- Thư mục dự án nằm trong OneDrive: `next build` ở local đôi khi lỗi `Invariant: no direct app page entry found for /_not-found` do OneDrive khoá file trong `.next` — xoá `.next` rồi build lại. Vercel không bị.
- Chưa có bộ test tự động trong repo. Các luồng chính đã được kiểm tra end-to-end bằng Playwright (thiết lập lần đầu, phân quyền, chi nhánh, vào ca, giao dịch, bảo hành, checklist, chốt ca, chấm công, dashboard, lịch sử).
