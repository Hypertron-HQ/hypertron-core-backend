/**
 * Private settlement (hash memos, relayer, PoolManager commits).
 * Enabled for testnet beta when PoolManager contract ID is configured.
 *
 * TODO(production-privacy): audit + mainnet deploy before removing beta warnings.
 */

/** Testnet PoolManager from contracts/deploy — used when env is unset (demo/local). */
export const DEFAULT_TESTNET_POOLMANAGER_CONTRACT_ID =
  "CDSOHQQNPLBEMH6WBC6646IH4TJ4SYWLICP6XWJTB7CARWGWPMCPHJAS";

export function getPoolManagerContractId(): string {
  return (
    process.env.NEXT_PUBLIC_POOLMANAGER_CONTRACT_ID?.trim() ||
    process.env.POOLMANAGER_CONTRACT_ID?.trim() ||
    DEFAULT_TESTNET_POOLMANAGER_CONTRACT_ID
  );
}

export function isPoolManagerConfigured(): boolean {
  return getPoolManagerContractId().length > 0;
}

export function isPrivateSettlementEnabled(): boolean {
  const explicit = process.env.NEXT_PUBLIC_ENABLE_PRIVATE_SETTLEMENT?.trim().toLowerCase();
  if (explicit === "false") return false;
  if (explicit === "true") return true;
  return isPoolManagerConfigured();
}

export function isPrivacyBeta(): boolean {
  return isPrivateSettlementEnabled();
}

export function getPoolExplorerContractUrl(network?: "testnet" | "public"): string {
  const net =
    network ??
    ((process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public");
  const base =
    net === "testnet"
      ? "https://stellar.expert/explorer/testnet/contract"
      : "https://stellar.expert/explorer/public/contract";
  return `${base}/${getPoolManagerContractId()}`;
}
