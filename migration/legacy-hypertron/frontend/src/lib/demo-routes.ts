export const DEMO_ROUTE_PREFIX = "/demo";
export const DEMO_SANDBOX_OVERVIEW_PATH = `${DEMO_ROUTE_PREFIX}/dashboard/overview`;

export function isDemoRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const base = pathname.split("?")[0] ?? pathname;
  return base === DEMO_ROUTE_PREFIX || base.startsWith(`${DEMO_ROUTE_PREFIX}/`);
}

/** Strip `/demo` so route matchers can reuse dashboard logic. */
export function stripDemoPrefix(pathname: string): string {
  const base = pathname.split("?")[0] ?? pathname;
  if (!base.startsWith(DEMO_ROUTE_PREFIX)) return base;
  const rest = base.slice(DEMO_ROUTE_PREFIX.length);
  return rest || "/dashboard";
}

/** Prefix an app path when rendering inside the demo shell. */
export function withDemoPrefix(path: string, isDemo: boolean): string {
  if (!isDemo) return path;
  if (path.startsWith(DEMO_ROUTE_PREFIX)) return path;
  if (path === "/") return `${DEMO_ROUTE_PREFIX}/dashboard/overview`;
  return `${DEMO_ROUTE_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}
