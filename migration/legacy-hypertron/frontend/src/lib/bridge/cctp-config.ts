import { Asset } from "@stellar/stellar-sdk";
import { Blockchain } from "@circle-fin/adapter-solana";
import type { StellarNetwork } from "@/lib/stellar-payment";
import { getUsdcIssuer } from "@/lib/stellar-assets";
import { loadCctpContractsFromEnv, readOptionalContractEnv } from "@/lib/bridge/cctp-contract-env";

export type BridgeChainId = "stellar" | "ethereum" | "avalanche" | "solana";

export type CctpNetworkMode = "mainnet" | "testnet";

export function getCctpNetworkMode(): CctpNetworkMode {
  const stellarNetwork = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet").trim();
  return stellarNetwork === "public" ? "mainnet" : "testnet";
}

export function stellarNetworkFromMode(mode: CctpNetworkMode): StellarNetwork {
  return mode === "mainnet" ? "public" : "testnet";
}

export function getStellarNetworkPassphrase(mode: CctpNetworkMode): string {
  return mode === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";
}

export function getStellarRpcUrl(mode: CctpNetworkMode): string {
  return mode === "mainnet"
    ? "https://soroban-mainnet.stellar.org"
    : "https://soroban-testnet.stellar.org";
}

export function getIrisApiBaseUrl(mode: CctpNetworkMode): string {
  return mode === "mainnet"
    ? "https://iris-api.circle.com"
    : "https://iris-api-sandbox.circle.com";
}

/** Circle CCTP domain IDs — same on mainnet and testnet per chain. */
export const CCTP_DOMAIN: Record<BridgeChainId, number> = {
  ethereum: 0,
  avalanche: 1,
  solana: 5,
  stellar: 27,
};

export type CctpContracts = {
  stellar: {
    tokenMessengerMinter: string;
    messageTransmitter: string;
    cctpForwarder: string;
    usdcContract: string;
  };
  evm: {
    tokenMessenger: `0x${string}`;
    messageTransmitter: `0x${string}`;
    usdc: `0x${string}`;
  };
  solana: {
    usdcMint: string;
  };
  bridgeKitChainName: Record<BridgeChainId, string>;
};

const contractCache: Partial<Record<CctpNetworkMode, CctpContracts>> = {};

export function getCctpContracts(mode: CctpNetworkMode = getCctpNetworkMode()): CctpContracts {
  if (!contractCache[mode]) {
    contractCache[mode] = loadCctpContractsFromEnv(mode);
  }
  return contractCache[mode]!;
}

export function resolveStellarUsdcContractId(mode: CctpNetworkMode): string {
  const legacyOverride =
    mode === "mainnet"
      ? process.env.NEXT_PUBLIC_STELLAR_USDC_CONTRACT_MAINNET?.trim()
      : process.env.NEXT_PUBLIC_STELLAR_USDC_CONTRACT_TESTNET?.trim();
  if (legacyOverride) return legacyOverride;

  try {
    return getCctpContracts(mode).stellar.usdcContract;
  } catch {
    const network = stellarNetworkFromMode(mode);
    const asset = new Asset("USDC", getUsdcIssuer(network));
    return asset.contractId(getStellarNetworkPassphrase(mode));
  }
}

export const BRIDGE_CHAIN_LABELS: Record<BridgeChainId, string> = {
  stellar: "Stellar",
  ethereum: "Ethereum",
  avalanche: "Avalanche",
  solana: "Solana",
};

export const SUPPORTED_BRIDGE_CHAINS: BridgeChainId[] = [
  "stellar",
  "ethereum",
  "avalanche",
  "solana",
];

export function isEvmBridgeChain(chain: BridgeChainId): boolean {
  return chain === "ethereum" || chain === "avalanche";
}

export function routeUsesStellar(from: BridgeChainId, to: BridgeChainId): boolean {
  return from === "stellar" || to === "stellar";
}

/** Stellar chain metadata for Circle adapter calls (SDK exports omit CCTP on Stellar). */
export function getStellarCctpChainDefinition(mode: CctpNetworkMode = getCctpNetworkMode()) {
  const contracts = getCctpContracts(mode);
  const isMainnet = mode === "mainnet";

  return {
    type: "stellar" as const,
    chain: isMainnet ? Blockchain.Stellar : Blockchain.Stellar_Testnet,
    name: contracts.bridgeKitChainName.stellar,
    title: isMainnet ? "Stellar Mainnet" : "Stellar Test Network",
    nativeCurrency: {
      name: "Stellar Lumens",
      symbol: "XLM",
      decimals: 7,
    },
    isTestnet: !isMainnet,
    explorerUrl: isMainnet
      ? "https://stellar.expert/explorer/public/tx/{hash}"
      : "https://stellar.expert/explorer/testnet/tx/{hash}",
    rpcEndpoints: [getStellarRpcUrl(mode)] as const,
    eurcAddress:
      readOptionalContractEnv(isMainnet ? "NEXT_PUBLIC_CCTP_MAINNET_EURC" : "NEXT_PUBLIC_CCTP_TESTNET_EURC") ??
      null,
    usdcAddress: contracts.stellar.usdcContract,
    usdtAddress: null,
    cctp: {
      domain: CCTP_DOMAIN.stellar,
      contracts: {
        v2: {
          type: "split" as const,
          tokenMessenger: contracts.stellar.tokenMessengerMinter,
          messageTransmitter: contracts.stellar.messageTransmitter,
          confirmations: 1,
          fastConfirmations: 1,
        },
      },
      forwarderSupported: {
        source: true,
        destination: true,
      },
    },
  };
}
