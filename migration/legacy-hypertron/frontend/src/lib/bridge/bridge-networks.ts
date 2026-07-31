import type { BridgeChainId } from "@/lib/bridge/cctp-config";
import { BRIDGE_CHAIN_LABELS } from "@/lib/bridge/cctp-config";

export type BridgeNetworkMeta = {
  id: BridgeChainId;
  label: string;
  short: string;
  color: string;
  icon?: string;
};

export const BRIDGE_NETWORKS: BridgeNetworkMeta[] = [
  {
    id: "ethereum",
    label: "Ethereum",
    short: "E",
    color: "#627EEA",
    icon: "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
  },
  {
    id: "avalanche",
    label: "Avalanche",
    short: "A",
    color: "#E84142",
    icon: "https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  },
  {
    id: "solana",
    label: "Solana",
    short: "S",
    color: "#9945FF",
    icon: "https://coin-images.coingecko.com/coins/images/4128/small/solana.png",
  },
  {
    id: "stellar",
    label: "Stellar",
    short: "X",
    color: "#14B6E7",
    icon: "https://coin-images.coingecko.com/coins/images/100/small/fmpFRHHQ_400x400.jpg?1735231350",
  },
];

export function bridgeNetworkById(id: BridgeChainId): BridgeNetworkMeta {
  return BRIDGE_NETWORKS.find((n) => n.id === id) ?? {
    id,
    label: BRIDGE_CHAIN_LABELS[id],
    short: id.slice(0, 1).toUpperCase(),
    color: "#64748b",
  };
}

export function formatBridgeAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

export const USDC_ASSET_META = {
  id: "USDC" as const,
  label: "USDC",
  color: "#2775CA",
  icon: "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png",
};
