/** Session flag set after valid invite code on the home Launch flow. */
export const INVITE_VERIFIED_KEY = "hypertron_invite_verified";

export const LAUNCH_QUERY_PARAM = "launch";
export const WALLET_LAUNCH_QUERY_PARAM = "wallet";

export function safeReturnUrl(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.includes("://")) return fallback;
  return raw;
}

type HomeLaunchPathOptions = {
  /** Open Launch dialog on the wallet sign-in step (legacy /session/wallet links). */
  wallet?: boolean;
};

/** Home URL that opens the Launch invite + sign-in dialog. */
export function homeLaunchPath(returnUrl?: string, options?: HomeLaunchPathOptions): string {
  const params = new URLSearchParams({ [LAUNCH_QUERY_PARAM]: "1" });
  if (returnUrl?.trim()) {
    params.set("returnUrl", safeReturnUrl(returnUrl.trim()));
  }
  if (options?.wallet) {
    params.set(WALLET_LAUNCH_QUERY_PARAM, "1");
  }
  return `/?${params.toString()}`;
}

export function isInviteVerifiedInSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(INVITE_VERIFIED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Clear launch-flow session flags after sign-out. */
export function clearLaunchSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(INVITE_VERIFIED_KEY);
  } catch {
    // ignore
  }
}

/** Where users land after signing out — homepage, not the login modal. */
export const POST_SIGN_OUT_PATH = "/";
