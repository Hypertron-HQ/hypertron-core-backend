import { PrivyClient } from "@privy-io/server-auth";
import { getPrivyAppId } from "@/lib/privy-config";

let client: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient | null {
  const appId = getPrivyAppId();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  if (!client) {
    client = new PrivyClient(appId, appSecret);
  }
  return client;
}

export function getPrivyAppSecret(): string | null {
  const s = process.env.PRIVY_APP_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}
