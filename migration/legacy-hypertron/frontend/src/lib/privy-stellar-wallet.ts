/** Helpers for Privy embedded Stellar wallets (extended chain / Tier 2). */

export type PrivyStellarWalletInfo = {
  address: string;
  id: string | null;
  publicKey: string | null;
};

type LinkedAccountLike = {
  type?: string;
  address?: string;
  id?: string | null;
  public_key?: string;
  publicKey?: string;
  chain_type?: string;
  chainType?: string;
  wallet_client_type?: string;
  walletClientType?: string;
};

function readChainType(account: LinkedAccountLike): string | null {
  const v = account.chainType ?? account.chain_type;
  return typeof v === "string" ? v : null;
}

function readWalletClientType(account: LinkedAccountLike): string | null {
  const v = account.walletClientType ?? account.wallet_client_type;
  return typeof v === "string" ? v : null;
}

export function isValidStellarGAddress(address: string): boolean {
  const a = address.trim();
  return a.length === 56 && a.startsWith("G");
}

/** Find the user's Privy-managed Stellar embedded wallet in linked accounts. */
export function findPrivyStellarWallet(
  user: { linkedAccounts?: LinkedAccountLike[] } | null | undefined
): PrivyStellarWalletInfo | null {
  if (!user?.linkedAccounts?.length) return null;

  for (const account of user.linkedAccounts) {
    if (account.type !== "wallet") continue;
    if (readWalletClientType(account) !== "privy") continue;
    if (readChainType(account) !== "stellar") continue;

    const address = typeof account.address === "string" ? account.address.trim() : "";
    if (!isValidStellarGAddress(address)) continue;

    const publicKey =
      typeof account.publicKey === "string"
        ? account.publicKey
        : typeof account.public_key === "string"
          ? account.public_key
          : null;

    return {
      address,
      id: typeof account.id === "string" ? account.id : null,
      publicKey,
    };
  }

  return null;
}
