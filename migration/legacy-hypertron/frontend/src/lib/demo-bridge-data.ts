export type BridgeNetworkId =
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "base"
  | "stellar";

export type BridgeAssetId = "USDC" | "USDT" | "ETH";

export type BridgeStatus = "completed" | "in_progress" | "failed";

export type BridgeNetwork = {
  id: BridgeNetworkId;
  label: string;
  short: string;
  color: string;
  icon?: string;
};

export type BridgeAsset = {
  id: BridgeAssetId;
  label: string;
  color: string;
  icon?: string;
};

/** Token logos served from the CoinGecko image CDN. */
export const BRIDGE_ASSETS: Record<BridgeAssetId, BridgeAsset> = {
  USDC: {
    id: "USDC",
    label: "USDC",
    color: "#2775CA",
    icon: "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png",
  },
  USDT: {
    id: "USDT",
    label: "USDT",
    color: "#26A17B",
    icon: "https://coin-images.coingecko.com/coins/images/325/small/Tether.png",
  },
  ETH: {
    id: "ETH",
    label: "ETH",
    color: "#627EEA",
    icon: "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
  },
};

export const BRIDGE_SOURCE_NETWORKS: BridgeNetwork[] = [
  {
    id: "ethereum",
    label: "Ethereum",
    short: "E",
    color: "#627EEA",
    icon: "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
  },
  {
    id: "polygon",
    label: "Polygon",
    short: "P",
    color: "#8247E5",
    icon: "https://coin-images.coingecko.com/coins/images/4713/small/polygon.png",
  },
  {
    id: "arbitrum",
    label: "Arbitrum",
    short: "A",
    color: "#28A0F0",
    icon: "https://coin-images.coingecko.com/coins/images/16547/small/arb.jpg",
  },
  {
    id: "optimism",
    label: "Optimism",
    short: "O",
    color: "#FF0420",
    icon: "https://coin-images.coingecko.com/coins/images/25244/small/Optimism.png",
  },
  {
    id: "base",
    label: "Base",
    short: "B",
    color: "#0052FF",
    icon: "https://coin-images.coingecko.com/coins/images/31199/small/59302ba8-022e-45a4-8d00-e29fe2ee768c-removebg-preview.png?1696530026",
  },
];

export const BRIDGE_DEST_NETWORK: BridgeNetwork = {
  id: "stellar",
  label: "Stellar Network",
  short: "S",
  color: "#14B6E7",
  icon: "https://coin-images.coingecko.com/coins/images/100/small/fmpFRHHQ_400x400.jpg?1735231350",
};

export type BridgeKpi = {
  label: string;
  value: string;
  sub: string;
  icon: "volume" | "time" | "networks" | "success";
};

export const BRIDGE_KPIS: BridgeKpi[] = [
  { label: "Total Bridged", value: "$48,250", sub: "Across all networks", icon: "volume" },
  { label: "Avg. Time", value: "3.2 min", sub: "Per completed transfer", icon: "time" },
  { label: "Networks", value: "11", sub: "Supported source chains", icon: "networks" },
  { label: "Success Rate", value: "99.8%", sub: "Last 30 days", icon: "success" },
];

export type BridgeRecentItem = {
  id: string;
  amount: string;
  asset: BridgeAssetId;
  fromNetwork: BridgeNetworkId;
  status: BridgeStatus;
  timeAgo: string;
};

export const BRIDGE_RECENT: BridgeRecentItem[] = [
  {
    id: "1",
    amount: "500.00",
    asset: "USDC",
    fromNetwork: "ethereum",
    status: "completed",
    timeAgo: "2 mins ago",
  },
  {
    id: "2",
    amount: "1,200.00",
    asset: "USDC",
    fromNetwork: "polygon",
    status: "in_progress",
    timeAgo: "15 mins ago",
  },
  {
    id: "3",
    amount: "250.00",
    asset: "USDT",
    fromNetwork: "arbitrum",
    status: "completed",
    timeAgo: "1 hour ago",
  },
  {
    id: "4",
    amount: "75.00",
    asset: "USDC",
    fromNetwork: "optimism",
    status: "failed",
    timeAgo: "3 hours ago",
  },
];

export const BRIDGE_DEMO_BALANCES = {
  sourceUsdc: 1245.5,
  destUsdc: 2450.75,
  stellarAddress: "GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890EFGHI",
};

export const BRIDGE_FEE_RATE = 0.0025;
export const BRIDGE_RECEIVE_RATE = 0.9975;

export function formatBridgeAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

export function computeBridgeReceive(sendAmount: number): {
  fee: number;
  receive: number;
} {
  if (!Number.isFinite(sendAmount) || sendAmount <= 0) {
    return { fee: 0, receive: 0 };
  }
  const fee = Math.round(sendAmount * BRIDGE_FEE_RATE * 100) / 100;
  const receive = Math.round((sendAmount - fee) * BRIDGE_RECEIVE_RATE * 100) / 100;
  return { fee, receive };
}

export function networkById(id: BridgeNetworkId): BridgeNetwork | undefined {
  if (id === "stellar") return BRIDGE_DEST_NETWORK;
  return BRIDGE_SOURCE_NETWORKS.find((n) => n.id === id);
}
