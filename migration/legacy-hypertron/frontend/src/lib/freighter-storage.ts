/** Freighter extension state persisted in localStorage (wallet-session only). */

export const FREIGHTER_PUBLIC_KEY_STORAGE_KEY = "freighter_public_key";
export const FREIGHTER_DISCONNECTED_STORAGE_KEY = "freighter_disconnected";
export const FREIGHTER_STATE_EVENT = "freighter-state-changed";

export function clearFreighterLocalState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FREIGHTER_PUBLIC_KEY_STORAGE_KEY);
  localStorage.removeItem(FREIGHTER_DISCONNECTED_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(FREIGHTER_STATE_EVENT, { detail: { publicKey: null } }));
}
