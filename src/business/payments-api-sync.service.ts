/**
 * One-way, non-blocking push of MerchantSettings to hypertron-api.
 * Failures are logged only — API keeps env destination fallback.
 */

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PaymentsApiSyncService {
  private readonly logger = new Logger(PaymentsApiSyncService.name);

  pushMerchantSettings(input: {
    businessId: string;
    walletAddress: string;
    receiveAddress?: string | null;
  }): void {
    const base = process.env.PAYMENTS_API_URL?.trim();
    const token = process.env.INTERNAL_SERVICE_TOKEN?.trim();
    if (!base || !token) {
      this.logger.debug(
        'PAYMENTS_API_URL or INTERNAL_SERVICE_TOKEN unset — skip merchant sync',
      );
      return;
    }

    const url = `${base.replace(/\/$/, '')}/internal/merchant-settings`;
    void fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': token,
      },
      body: JSON.stringify({
        businessId: input.businessId,
        walletAddress: input.walletAddress,
        receiveAddress: input.receiveAddress ?? null,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          this.logger.warn(
            { status: res.status, text: text.slice(0, 200) },
            'MerchantSettings push to payments API failed',
          );
        }
      })
      .catch((err: unknown) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'MerchantSettings push to payments API errored',
        );
      });
  }
}
