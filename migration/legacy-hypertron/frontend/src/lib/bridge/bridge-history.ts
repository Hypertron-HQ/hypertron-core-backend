import type { BridgeChainId } from "@/lib/bridge/cctp-config";
import type { BridgeProgressEvent } from "@/lib/bridge/execute-usdc-bridge";

export type StoredBridgeRecord = {
  id: string;
  amount: string;
  asset: "USDC";
  fromChain: BridgeChainId;
  toChain: BridgeChainId;
  status: "completed" | "in_progress" | "failed";
  createdAt: string;
  steps: BridgeProgressEvent[];
};

const STORAGE_KEY = "hypertron-bridge-history-v1";

export function readBridgeHistory(): StoredBridgeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredBridgeRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendBridgeHistory(record: StoredBridgeRecord): StoredBridgeRecord[] {
  const next = [record, ...readBridgeHistory()].slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function formatBridgeTimeAgo(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
