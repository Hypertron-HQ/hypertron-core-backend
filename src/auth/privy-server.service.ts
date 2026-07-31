import { Injectable } from '@nestjs/common';
import { PrivyClient } from '@privy-io/server-auth';

@Injectable()
export class PrivyServerService {
  private client: PrivyClient | null = null;

  getClient(): PrivyClient | null {
    const appId = (
      process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID
    )?.trim();
    const appSecret = process.env.PRIVY_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      return null;
    }

    if (!this.client) {
      this.client = new PrivyClient(appId, appSecret);
    }

    return this.client;
  }
}
