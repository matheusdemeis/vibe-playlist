import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { assertServerOnly } from "../server/assert-server-only";

type Receipt = { playlistId: string; ownerId: string; fingerprint: string; expiresAt: number };
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getSaveSigningKey(): Buffer {
  assertServerOnly("playlist recovery");
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Spotify server configuration is missing.");
  return createHmac("sha256", secret).update("vibeplay:playlist-recovery:v1").digest();
}

export function fingerprintPlaylist(input: {
  name: string; description: string; isPublic: boolean; trackUris: string[];
}): string {
  return createHash("sha256").update(JSON.stringify([
    input.name, input.description, input.isPublic, input.trackUris,
  ])).digest("hex");
}

export function createSaveReceipt(input: Omit<Receipt, "expiresAt">, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: Date.now() + RECEIPT_TTL_MS })).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

export function readSaveReceipt(token: string, ownerId: string, fingerprint: string, key: Buffer): Receipt | null {
  if (token.length > 2000) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = createHmac("sha256", key).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Receipt;
    if (data.ownerId !== ownerId || data.fingerprint !== fingerprint ||
        !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() ||
        typeof data.playlistId !== "string" || !/^[A-Za-z0-9]{22}$/.test(data.playlistId)) return null;
    return data;
  } catch { return null; }
}
