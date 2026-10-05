// Chạy Postgres ngay trên máy (không cần Docker) để dev local.
// Dữ liệu lưu trong thư mục .local-db/ — xoá thư mục này để làm lại từ đầu.
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import EmbeddedPostgres from "embedded-postgres";

const DATA_DIR = ".local-db";
const PORT = 5433;
const DB_NAME = "phonestore";
const URL = `postgresql://postgres:postgres@localhost:${PORT}/${DB_NAME}`;

// Đã có Postgres chạy ở cổng này (vd: cửa sổ khác chưa tắt) thì dùng luôn
const alreadyRunning = await new Promise((resolve) => {
  const sock = createConnection(PORT, "127.0.0.1");
  sock.once("connect", () => (sock.destroy(), resolve(true)));
  sock.once("error", () => resolve(false));
});
if (alreadyRunning) {
  console.log(`✔ Postgres đã đang chạy: ${URL}`);
  process.exit(0);
}

const isNew = !existsSync(DATA_DIR);
const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  // UTF8 bắt buộc để lưu tiếng Việt (mặc định trên Windows là WIN1252)
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (isNew) await pg.initialise();
await pg.start();
if (isNew) await pg.createDatabase(DB_NAME);

console.log(`\n✔ Postgres đang chạy: postgresql://postgres:postgres@localhost:${PORT}/${DB_NAME}`);
console.log("  Giữ cửa sổ này mở. Nhấn Ctrl+C để tắt.\n");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
