/**
 * HttpOnly cookie session for Privy-authenticated users (HMAC-signed, Edge-safe).
 * Payload: { u: appUserId, p: privyDid, exp: unix seconds }
 */

import { NextRequest, NextResponse } from "next/server";

export const PRIVY_SESSION_COOKIE = "ht_privy";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

function encoder(): TextEncoder {
  return new TextEncoder();
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder().encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function base64urlToBytes(b64url: string): Uint8Array | null {
  try {
    const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function createPrivySessionToken(
  appUserId: string,
  privyId: string,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_MAX_AGE_SEC;
  const payloadB64 = base64urlEncode(
    encoder().encode(JSON.stringify({ u: appUserId, p: privyId, exp }))
  );
  const sig = await hmacSha256(secret, payloadB64);
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

export async function parsePrivySessionToken(
  token: string,
  secret: string
): Promise<{ appUserId: string; privyId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = await hmacSha256(secret, payloadB64);
  const sigBytes = base64urlToBytes(sigB64);
  if (!sigBytes || !timingSafeEqual(expectedSig, sigBytes)) return null;

  const payloadBytes = base64urlToBytes(payloadB64);
  if (!payloadBytes) return null;

  let parsed: { u?: unknown; p?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      u?: unknown;
      p?: unknown;
      exp?: unknown;
    };
  } catch {
    return null;
  }

  if (typeof parsed.u !== "string" || typeof parsed.p !== "string" || typeof parsed.exp !== "number") {
    return null;
  }
  const skew = 60;
  if (parsed.exp < Math.floor(Date.now() / 1000) - skew) return null;

  return { appUserId: parsed.u.trim(), privyId: parsed.p.trim() };
}

export function readPrivySessionCookie(req: NextRequest): string | null {
  return req.cookies.get(PRIVY_SESSION_COOKIE)?.value ?? null;
}

export async function getPrivySessionFromRequest(
  req: NextRequest,
  secret: string
): Promise<{ appUserId: string; privyId: string } | null> {
  const raw = readPrivySessionCookie(req);
  if (!raw) return null;
  return parsePrivySessionToken(raw, secret);
}

export function appendPrivySessionCookie(res: NextResponse, token: string): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(PRIVY_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearPrivySessionCookie(res: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(PRIVY_SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
