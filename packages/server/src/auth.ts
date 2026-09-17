import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "./db/index.ts";
import { accounts, sessions } from "./db/schema.ts";

const SESSION_DAYS = 30;
const KEY_LENGTH = 64;
const LOGIN_WINDOW_MS = 10 * 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await deriveKey(password, Buffer.from(salt, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash usado quando o usuário não existe, para a resposta demorar o mesmo e não revelar quais contas existem. */
const dummyHash = hashPassword("usuario-inexistente");

export async function verifyPasswordOrDummy(password: string, stored: string | undefined): Promise<boolean> {
  const ok = await verifyPassword(password, stored ?? (await dummyHash));
  return stored !== undefined && ok;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(accountId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db()
    .insert(sessions)
    .values({ tokenHash: hashToken(token), accountId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) });
  return token;
}

export async function deleteSession(token: string) {
  await db().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function accountFromToken(token: unknown): Promise<{ id: number; username: string } | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  const [row] = await db()
    .select({ id: accounts.id, username: accounts.username })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** "Bearer <token>" → token. */
export function bearerToken(header: string | null | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

// Limite simples de tentativas de login por usuário (em memória), contra força bruta.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function allowLoginAttempt(username: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(username);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(username, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= LOGIN_MAX_ATTEMPTS;
}

export function clearLoginAttempts(username: string) {
  loginAttempts.delete(username);
}
