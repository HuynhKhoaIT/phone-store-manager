import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { TAGS } from "./cache";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

export type Role = "ADMIN" | "STAFF";
export type SessionUser = { id: number; name: string; username: string; role: Role };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Thiếu biến môi trường AUTH_SECRET");
  return "dev-secret-change-me";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function createSession(userId: number) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(exp),
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Thông tin user theo id — cache giữa các request, xoá cache khi sửa tài khoản (tag users). */
const findSessionUser = unstable_cache(
  (id: number) =>
    prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, username: true, role: true, active: true },
    }),
  ["session-user"],
  { tags: [TAGS.users] },
);

/** Người dùng đang đăng nhập (hoặc null). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;

  const user = await findSessionUser(Number(id));
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, username: user.username, role: user.role as Role };
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
