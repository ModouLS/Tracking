import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { verifyPassword } from "./password";

export { hashPassword, verifyPassword } from "./password";

/**
 * Minimal, dependency-free admin auth (§3.2).
 * - Passwords hashed with scrypt + per-user salt.
 * - Sessions are stateless signed cookies (HMAC-SHA256) — no session table needed for the MVP.
 *
 * Production hardening noted in the design (§2 security): add 2FA, rate limiting,
 * CAPTCHA, and HTTPS-only enforcement at the edge/WAF.
 */

const COOKIE_NAME = "kinsing_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

function secret(): string {
  return process.env.SESSION_SECRET || "insecure-dev-secret";
}

// ---- session token (signed cookie) ----

export interface SessionUser {
  username: string;
  role: string;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function createToken(user: SessionUser): string {
  const body = JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL_MS });
  const b64 = Buffer.from(body).toString("base64url");
  return `${b64}.${sign(b64)}`;
}

function verifyToken(token: string): SessionUser | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = sign(b64);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return null;
  try {
    const data = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { username: data.username, role: data.role };
  } catch {
    return null;
  }
}

// ---- request helpers ----

export async function login(username: string, password: string): Promise<SessionUser | null> {
  const row = getDb()
    .prepare(`SELECT username, password_hash, role FROM users WHERE username = ?`)
    .get(username) as { username: string; password_hash: string; role: string } | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  const user: SessionUser = { username: row.username, role: row.role };
  const jar = await cookies();
  jar.set(COOKIE_NAME, createToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return user;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
