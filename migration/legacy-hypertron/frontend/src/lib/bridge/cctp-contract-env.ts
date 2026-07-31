import type { BridgeChainId, CctpContracts, CctpNetworkMode } from "@/lib/bridge/cctp-config";

const BRIDGE_KIT_CHAIN_NAMES: Record<CctpNetworkMode, Record<BridgeChainId, string>> = {
  mainnet: {
    stellar: "Stellar",
    ethereum: "Ethereum",
    avalanche: "Avalanche",
    solana: "Solana",
  },
  testnet: {
    stellar: "Stellar_Testnet",
    ethereum: "Ethereum_Sepolia",
    avalanche: "Avalanche_Fuji",
    solana: "Solana_Devnet",
  },
};

function readContractEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${key}. Add public Circle CCTP contract IDs from frontend/.env.example (see https://developers.circle.com/cctp).`
    );
  }
  return value;
}

function prefixForMode(mode: CctpNetworkMode): string {
  return mode === "mainnet" ? "NEXT_PUBLIC_CCTP_MAINNET" : "NEXT_PUBLIC_CCTP_TESTNET";
}

export function loadCctpContractsFromEnv(mode: CctpNetworkMode): CctpContracts {
  const prefix = prefixForMode(mode);

  return {
    stellar: {
      tokenMessengerMinter: readContractEnv(`${prefix}_STELLAR_TOKEN_MESSENGER`),
      messageTransmitter: readContractEnv(`${prefix}_STELLAR_MESSAGE_TRANSMITTER`),
      cctpForwarder: readContractEnv(`${prefix}_STELLAR_FORWARDER`),
      usdcContract: readContractEnv(`${prefix}_STELLAR_USDC_CONTRACT`),
    },
    evm: {
      tokenMessenger: readContractEnv(`${prefix}_EVM_TOKEN_MESSENGER`) as `0x${string}`,
      messageTransmitter: readContractEnv(`${prefix}_EVM_MESSAGE_TRANSMITTER`) as `0x${string}`,
      usdc: readContractEnv(`${prefix}_EVM_USDC`) as `0x${string}`,
    },
    solana: {
      usdcMint: readContractEnv(`${prefix}_SOLANA_USDC_MINT`),
    },
    bridgeKitChainName: BRIDGE_KIT_CHAIN_NAMES[mode],
  };
}

export function readOptionalContractEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}
