/** Client-safe Privy app id (from dashboard). */
export function getPrivyAppId(): string | null {
  const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  return id && id.length > 0 ? id : null;
}

export function isPrivyConfigured(): boolean {
  return !!getPrivyAppId();
}
