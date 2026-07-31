/**
 * HttpOnly cookie session for dashboard APIs (HMAC-signed payload, Edge-safe).
 * Payload: { w: Stellar G-address, exp: unix seconds }
 */

import { NextRequest, NextResponse } from "next/server";

export const DASHBOARD_SESSION_COOKIE = "ht_dashboard";
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

/** Build `payloadB64.sigB64` where sig is HMAC-SHA256(secret, payloadB64) as base64url bytes. */
export async function createDashboardSessionToken(walletAddress: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_MAX_AGE_SEC;
  const payloadB64 = base64urlEncode(
    encoder().encode(JSON.stringify({ w: walletAddress, exp }))
  );
  const sig = await hmacSha256(secret, payloadB64);
  const sigB64 = base64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
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

export async function parseDashboardSessionToken(
  token: string,
  secret: string
): Promise<{ walletAddress: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  const expectedSig = await hmacSha256(secret, payloadB64);
  const sigBytes = base64urlToBytes(sigB64);
  if (!sigBytes) return null;
  if (!timingSafeEqual(expectedSig, sigBytes)) return null;

  const payloadBytes = base64urlToBytes(payloadB64);
  if (!payloadBytes) return null;
  let jsonStr: string;
  try {
    jsonStr = new TextDecoder().decode(payloadBytes);
  } catch {
    return null;
  }

  let parsed: { w?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(jsonStr) as { w?: unknown; exp?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.w !== "string" || typeof parsed.exp !== "number") return null;
  const w = parsed.w.trim();
  if (w.length !== 56 || !w.startsWith("G")) return null;
  const skew = 60;
  if (parsed.exp < Math.floor(Date.now() / 1000) - skew) return null;
  return { walletAddress: w };
}

export function readDashboardSessionCookie(req: NextRequest): string | null {
  return req.cookies.get(DASHBOARD_SESSION_COOKIE)?.value ?? null;
}

export async function getDashboardWalletFromRequest(
  req: NextRequest,
  secret: string
): Promise<string | null> {
  const raw = readDashboardSessionCookie(req);
  if (!raw) return null;
  const parsed = await parseDashboardSessionToken(raw, secret);
  return parsed?.walletAddress ?? null;
}

export function appendDashboardSessionCookie(res: NextResponse, token: string): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(DASHBOARD_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearDashboardSessionCookie(res: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(DASHBOARD_SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
