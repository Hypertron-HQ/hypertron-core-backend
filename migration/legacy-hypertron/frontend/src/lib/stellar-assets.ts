import type { StellarNetwork } from "@/lib/stellar-payment";

export type PaymentAssetCode = "USDC" | "EURC" | "XLM";

/** Brand logos from CoinGecko (aligned with dashboard wallet charts). */
export const STELLAR_LOGO_URL =
  "https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350";

export const USDC_LOGO_URL =
  "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694";

export const EURC_LOGO_URL =
  "https://coin-images.coingecko.com/coins/images/26045/large/EURC.png?1769615705";

/** Circle USDC on Stellar (official issuers). */
/** @see https://developers.circle.com/stablecoins/usdc-contract-addresses */
export const CIRCLE_USDC_ISSUER: Record<StellarNetwork, string> = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  public: "GA5ZSEJYB37JXL5HIFDVCFZZA5TQA3UOXMZHERO4V54CV2PMIUDVONV",
};

/** Circle EURC on Stellar (classic asset issuers). */
/** @see https://developers.circle.com/stablecoins/eurc-contract-addresses */
export const CIRCLE_EURC_ISSUER: Record<StellarNetwork, string> = {
  testnet: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
  public: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
};

export const USDC_ASSET_CODE = "USDC";
export const EURC_ASSET_CODE = "EURC";

export const PAYMENT_ASSET_CODES: PaymentAssetCode[] = ["USDC", "EURC", "XLM"];

export function getUsdcIssuer(network: StellarNetwork): string {
  const fromEnv =
    network === "public"
      ? process.env.NEXT_PUBLIC_USDC_ISSUER_MAINNET?.trim()
      : process.env.NEXT_PUBLIC_USDC_ISSUER_TESTNET?.trim();
  return fromEnv || CIRCLE_USDC_ISSUER[network];
}

function parseClassicAssetEnv(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const dash = value.indexOf("-");
  if (dash <= 0) return null;
  return value.slice(dash + 1).trim() || null;
}

export function getEurcIssuer(network: StellarNetwork): string {
  const fromEnv =
    network === "public"
      ? parseClassicAssetEnv(process.env.NEXT_PUBLIC_CCTP_MAINNET_EURC) ??
        process.env.NEXT_PUBLIC_EURC_ISSUER_MAINNET?.trim()
      : parseClassicAssetEnv(process.env.NEXT_PUBLIC_CCTP_TESTNET_EURC) ??
        process.env.NEXT_PUBLIC_EURC_ISSUER_TESTNET?.trim();
  return fromEnv || CIRCLE_EURC_ISSUER[network];
}

export function getClassicAssetIssuer(code: PaymentAssetCode, network: StellarNetwork): string {
  if (code === "EURC") return getEurcIssuer(network);
  return getUsdcIssuer(network);
}

export function normalizePaymentAssetCode(raw: unknown): PaymentAssetCode {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (v === "XLM") return "XLM";
  if (v === "EURC") return "EURC";
  return "USDC";
}

export function paymentAssetLogo(code: PaymentAssetCode): string {
  if (code === "XLM") return STELLAR_LOGO_URL;
  if (code === "EURC") return EURC_LOGO_URL;
  return USDC_LOGO_URL;
}

export function paymentAssetDecimals(code: PaymentAssetCode): number {
  return 7;
}

export function normalizePaymentAmount(amount: string, code: PaymentAssetCode): string {
  const n = parseFloat(amount.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return "0.0000000";
  return n.toFixed(paymentAssetDecimals(code));
}
