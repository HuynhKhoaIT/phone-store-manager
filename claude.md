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
npm run build        # prisma generate + prisma db push + next build (dùng trên Vercel)
npx tsc --noEmit     # kiểm tra kiểu
```

Biến môi trường (xem `.env.example`):

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Chuỗi kết nối Postgres |
| `AUTH_SECRET` | Chuỗi ngẫu nhiên dài để ký cookie đăng nhập. **Bắt buộc ở production**, thiếu thì app báo lỗi |

Không có migration files: schema được đồng bộ bằng `prisma db push` trong lúc build. `db push` sẽ **dừng build** nếu thay đổi làm mất dữ liệu (xoá cột, đổi kiểu…) — khi đó cần tự xử lý dữ liệu trước, đừng thêm `--accept-data-loss` một cách tuỳ tiện.

## Chức năng

| Trang | Ai dùng | Mô tả |
|---|---|---|
| `/login` | — | Đăng nhập + **chọn chi nhánh làm việc**. Khi DB chưa có user nào, trang này thành form thiết lập lần đầu (tạo admin + chi nhánh đầu tiên) |
| `/choose-branch` | Tất cả | Đổi chi nhánh làm việc trong phiên |
| `/` | Tất cả | Trang chủ: lời chào, chi nhánh đang làm, danh sách chức năng dạng ô (kiểu app) |
| `/day/[date]` (`/day` chuyển về hôm nay) | Tất cả | Trang chính: checklist trong ngày, vào ca (giờ đi làm + tiền nhận đầu ca), nhập giao dịch, chốt ca (giờ ra về + tiền bàn giao, hiện chênh lệch) |
| `/prices` | Xem: tất cả · Sửa: admin | Bảng giá máy iPhone / Android / Phụ kiện, mới hoặc cũ 99%, kèm bảo hành mặc định |
| `/repair-prices` | Xem: tất cả · Sửa: admin | Bảng giá sửa chữa theo dịch vụ (thay pin, thay màn…) × dòng máy |
| `/warranty` | Tất cả | Tra cứu bảo hành theo SĐT / tên khách / tên sản phẩm |
| `/transfers` | Tất cả (xoá: admin) | Phiếu chuyển hàng giữa chi nhánh, vd "5 tai nghe ABC từ CN1 → CN2" |
| `/timesheet` | Tất cả (admin xem được của người khác) | Chấm công theo tháng: ngày, chi nhánh, giờ vào/ra, tổng giờ |
| `/dashboard` | Admin | Doanh thu tháng, so với tháng trước, biểu đồ theo ngày, TM/CK, theo chi nhánh/nhân viên, top sản phẩm |
| `/history` | Admin | Lịch tháng của chi nhánh hiện tại, đánh dấu ngày lệch tiền / ca chưa chốt |
| `/checklist` | Admin | Thiết lập việc cần làm hằng ngày (vệ sinh quán, đăng bài TikTok…), sắp xếp, áp dụng theo chi nhánh |
| `/users` | Admin | Tài khoản nhân viên, quyền, chi nhánh được làm |
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
- `kind`: `SALE` (bán hàng) | `REPAIR` (sửa chữa)
- `paymentMethod`: `CASH` (TM) | `TRANSFER` (CK). CK thì **bắt buộc** `bankAccount` (tài khoản nhận tiền).
- `warrantyMonths` 0–12. **> 0 thì bắt buộc tên + SĐT khách** (để tra cứu bảo hành). SĐT được lưu đã bỏ khoảng trắng/dấu chấm/gạch.
- Ngày hết bảo hành = ngày của ca + số tháng (`warrantyEnd` trong `lib/format.ts`, xử lý cuối tháng).
- Khi nhập, gõ tên sẽ gợi ý từ bảng giá; chọn đúng gợi ý thì tự điền giá + bảo hành (`TransactionFields.tsx`).

**Chi nhánh**
- Chi nhánh làm việc của phiên lưu trong cookie `branchId`, được chọn lúc đăng nhập. **Mọi ca/giao dịch/checklist ghi vào chi nhánh này** — server luôn lấy qua `getCurrentBranch()`, không tin `branchId` gửi từ form.
- `User.branches` (nhiều–nhiều): chi nhánh nhân viên được phép làm. **Danh sách rỗng = làm được mọi chi nhánh.** Admin luôn được vào mọi chi nhánh.
- Chọn chi nhánh không được phân công lúc đăng nhập → báo lỗi, **không** tự chuyển sang chi nhánh khác.
- Chi nhánh không bị xoá, chỉ ẩn (`active = false`) để giữ lịch sử. Báo cáo dùng `getBranches()` (gồm cả chi nhánh đã ẩn), còn form chọn dùng `getActiveBranches()`.

**Checklist** — `ChecklistTask` do admin tạo (`branchId` null = mọi chi nhánh). `ChecklistCheck` duy nhất theo (task, ngày, chi nhánh): mỗi việc tính một lần cho cả chi nhánh trong ngày, ghi lại ai tick và lúc nào. Nhân viên chỉ bỏ tick được việc do chính mình tick. Form chốt ca cảnh báo nếu checklist còn việc chưa xong. Việc đã ẩn vẫn hiện ở những ngày từng được tick.

**Phân quyền** (`ADMIN` | `STAFF`)
- Nhân viên chỉ thao tác trên **ngày hôm nay**, chỉ sửa **ca của mình**, không vào được `/dashboard`, `/history`, `/users`, `/branches`, `/checklist` (bị chuyển về trang bán hàng).
- Mọi server action **tự kiểm tra quyền** — không dựa vào việc ẩn nút trên giao diện.

## Cấu trúc code

```
prisma/schema.prisma        # Toàn bộ model, có comment tiếng Việt
src/middleware.ts           # Chưa có cookie session → chuyển /login (chỉ kiểm tra có cookie)
src/app/actions.ts          # TẤT CẢ server actions (mutation) — validate + kiểm tra quyền ở đây
src/app/layout.tsx          # Header: menu, chi nhánh hiện tại, user, đăng xuất
src/app/<route>/page.tsx    # Server components đọc DB trực tiếp qua prisma
src/app/day/[date]/ShiftCard.tsx
src/lib/auth.ts             # Hash mật khẩu (scrypt), cookie session ký HMAC, requireUser/requireAdmin
src/lib/branch.ts           # getCurrentBranch, getAllowedBranches, getActiveBranches, getBranches
src/lib/format.ts           # Tiền, ngày giờ VN, cộng ngày/tháng, warrantyEnd
src/lib/summary.ts          # summarize(): tổng / bán / sửa / TM / CK / theo tài khoản
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
- **Form**: dùng `<ActionForm action={...}>` — nó giữ nguyên dữ liệu khi lỗi, tự xoá trắng khi thành công, có `successMessage`, `confirmMessage`, `redirectTo`. Chế độ sửa dùng query `?edit=<id>`, điền sẵn bằng `defaultValue`, và đặt `key={editing?.id ?? "new"}` cho `ActionForm` để form dựng lại khi đổi bản ghi.
- **Nút xoá / thao tác nhanh**: `<ConfirmButton action={serverAction.bind(null, id)} message="...">`.
- Trang chỉ cho admin gọi `await requireAdmin()` ở đầu; trang chung gọi `await requireUser()`.
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

- Chạy `npm run db:local` (Postgres thật qua `embedded-postgres`, cổng 5433, đã ép **UTF8** — mặc định WIN1252 trên Windows sẽ lỗi khi lưu tiếng Việt). `.env`: `DATABASE_URL="postgresql://postgres:postgres@localhost:5433/phonestore"`, rồi `npm run db:push` lần đầu. Xoá thư mục `.local-db/` để làm lại DB từ đầu. (`prisma dev` không hỗ trợ Windows.)
- Thư mục dự án nằm trong OneDrive: `next build` ở local đôi khi lỗi `Invariant: no direct app page entry found for /_not-found` do OneDrive khoá file trong `.next` — xoá `.next` rồi build lại. Vercel không bị.
- Chưa có bộ test tự động trong repo. Các luồng chính đã được kiểm tra end-to-end bằng Playwright (thiết lập lần đầu, phân quyền, chi nhánh, vào ca, giao dịch, bảo hành, checklist, chốt ca, chấm công, dashboard, lịch sử).
