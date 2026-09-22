import { env } from "cloudflare:workers";

export const ACCESS_COOKIE = "word_ledger_access";
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

const SESSION_MESSAGE = "word-ledger-family-session-v1";

export function getAccessCode(): string | null {
  const runtimeCode = (env as unknown as { ACCESS_CODE?: string }).ACCESS_CODE;
  const value = runtimeCode || process.env.ACCESS_CODE;
  return value?.trim().toUpperCase() || null;
}

export async function verifyAccessCode(candidate: string, secret: string): Promise<boolean> {
  const [candidateHash, secretHash] = await Promise.all([
    digest(candidate.trim().toUpperCase()),
    digest(secret.trim().toUpperCase()),
  ]);
  return constantTimeEqual(candidateHash, secretHash);
}

export async function createSessionToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret.trim().toUpperCase()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(SESSION_MESSAGE));
  return toHex(new Uint8Array(signature));
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const expected = await createSessionToken(secret);
  return constantTimeEqual(new TextEncoder().encode(token), new TextEncoder().encode(expected));
}

async function digest(value: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
