import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { assertServerOnly } from "../server/assert-server-only";

// Leave room for the cookie name and attributes below browsers' 4KB limit.
const MAX_COOKIE_VALUE_BYTES = 3800;

function cookieKey(purpose: string): Buffer {
  assertServerOnly("Spotify session encryption");
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Spotify authentication is not configured.");
  return Buffer.from(hkdfSync("sha256", secret, "vibeplay-cookie-v1", purpose, 32));
}

export function sealCookie(payload: unknown, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cookieKey(purpose), iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  if (Buffer.byteLength(value) > MAX_COOKIE_VALUE_BYTES) {
    throw new Error("Spotify session exceeds the supported cookie size.");
  }
  return value;
}

export function unsealCookie(value: string, purpose: string): unknown | null {
  const key = cookieKey(purpose);
  if (value.length > MAX_COOKIE_VALUE_BYTES || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const buffer = Buffer.from(value, "base64url");
    if (buffer.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return JSON.parse(Buffer.concat([
      decipher.update(buffer.subarray(28)), decipher.final(),
    ]).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export function secureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
