/**
 * Proxy helper: forward request to Cosmos AI RegIntel API.
 * COSMOS_AI_URL or NEXT_PUBLIC_COSMOS_AI_URL; default http://localhost:8001
 */
const DEFAULT_BASE = "http://localhost:8001";
const BASE =
  (process.env.COSMOS_AI_URL || process.env.NEXT_PUBLIC_COSMOS_AI_URL || DEFAULT_BASE).replace(
    /\/$/,
    ""
  );

export function getRegintelBase(): string {
  return BASE;
}

export async function proxyRegintel(
  path: string,
  init: RequestInit & { method?: string }
): Promise<Response> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  return res;
}
