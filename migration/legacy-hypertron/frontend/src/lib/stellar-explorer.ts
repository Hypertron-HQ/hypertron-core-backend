/**
 * Stellar explorer URLs (StellarExpert). Use for mainnet (public) and testnet tx/account/contract links.
 */

import { StrKey } from "@stellar/stellar-sdk";

export const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

/** True when the address can be opened on StellarExpert (valid G… or C… StrKey). */
export function isValidExplorerAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  return (
    StrKey.isValidEd25519PublicKey(trimmed) || StrKey.isValidContract(trimmed)
  );
}

function explorerSegment(network: "testnet" | "public" = STELLAR_NETWORK): "testnet" | "public" {
  return network === "testnet" ? "testnet" : "public";
}

/** Full StellarExpert URL for a transaction. Returns empty string if txHash is null. */
export function getExplorerTxUrl(
  txHash: string | null | undefined,
  network: "testnet" | "public" = STELLAR_NETWORK,
): string {
  if (!txHash) return "";
  const seg = explorerSegment(network);
  return `https://stellar.expert/explorer/${seg}/tx/${txHash}`;
}

export function getExplorerAccountUrl(
  address: string,
  network: "testnet" | "public" = STELLAR_NETWORK,
): string {
  const seg = explorerSegment(network);
  return `https://stellar.expert/explorer/${seg}/account/${address}`;
}

export function getExplorerContractUrl(
  contractId: string,
  network: "testnet" | "public" = STELLAR_NETWORK,
): string {
  const seg = explorerSegment(network);
  return `https://stellar.expert/explorer/${seg}/contract/${contractId}`;
}

/** Account (G…) or Soroban contract (C…) on StellarExpert. */
export function getExplorerAddressUrl(
  address: string,
  network: "testnet" | "public" = STELLAR_NETWORK,
): string {
  if (address.startsWith("G")) return getExplorerAccountUrl(address, network);
  if (address.startsWith("C")) return getExplorerContractUrl(address, network);
  const seg = explorerSegment(network);
  return `https://stellar.expert/explorer/${seg}`;
}
