import { safeReturnUrl } from "@/lib/launch-auth";

export const POST_LOGIN_REDIRECT_KEY = "hypertron_post_login_redirect";

export function setPostLoginRedirect(url?: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, safeReturnUrl(url));
  } catch {
    // ignore
  }
}

export function peekPostLoginRedirect(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    return raw ? safeReturnUrl(raw) : null;
  } catch {
    return null;
  }
}

export function consumePostLoginRedirect(): string | null {
  const url = peekPostLoginRedirect();
  if (typeof window === "undefined") return url;
  try {
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  } catch {
    // ignore
  }
  return url;
}
