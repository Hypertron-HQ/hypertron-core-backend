import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "http://localhost:8001";
const BASE_URL = (process.env.COSMOS_AI_URL || process.env.NEXT_PUBLIC_COSMOS_AI_URL || DEFAULT_BASE_URL).replace(
  /\/$/,
  ""
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(input: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      await sleep(300 + i * 250);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Upstream request failed");
}

export function upstreamUrl(path: string): string {
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function proxyJson(path: string, body: unknown): Promise<Response> {
  return fetchWithRetry(upstreamUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
}

export async function forwardResponse(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    },
  });
}
