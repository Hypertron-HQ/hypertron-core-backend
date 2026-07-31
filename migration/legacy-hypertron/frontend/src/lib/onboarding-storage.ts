export type OnboardingData = {
  name: string;
  email: string;
  businessNature: string;
  selectedWidgets: string[];
  importFileName?: string;
};

const ONBOARDING_STORAGE_KEY = "onboarding_completed";
const ONBOARDING_DATA_KEY = "onboarding_data";

function normalizeWalletAddress(walletAddress?: string): string | null {
  if (!walletAddress) return null;
  const trimmed = walletAddress.trim().toUpperCase();
  return trimmed.length === 56 && trimmed.startsWith("G") ? trimmed : null;
}

function onboardingCompletedKey(walletAddress?: string): string {
  const normalized = normalizeWalletAddress(walletAddress);
  return normalized ? `${ONBOARDING_STORAGE_KEY}:${normalized}` : ONBOARDING_STORAGE_KEY;
}

function onboardingDataKey(walletAddress?: string): string {
  const normalized = normalizeWalletAddress(walletAddress);
  return normalized ? `${ONBOARDING_DATA_KEY}:${normalized}` : ONBOARDING_DATA_KEY;
}

export function getOnboardingCompleted(walletAddress?: string): boolean {
  if (typeof window === "undefined") return true;
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (normalizedWallet) {
    return localStorage.getItem(onboardingCompletedKey(normalizedWallet)) === "true";
  }
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
}

export function setOnboardingCompleted(data?: OnboardingData, walletAddress?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(onboardingCompletedKey(walletAddress), "true");
  if (data) {
    try {
      localStorage.setItem(onboardingDataKey(walletAddress), JSON.stringify(data));
    } catch {
      // ignore
    }
  }
}

export function getOnboardingData(walletAddress?: string): OnboardingData | null {
  if (typeof window === "undefined") return null;
  try {
    const scopedRaw = localStorage.getItem(onboardingDataKey(walletAddress));
    const raw = scopedRaw ?? localStorage.getItem(ONBOARDING_DATA_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as OnboardingData;
    return data && typeof data.name === "string" ? data : null;
  } catch {
    return null;
  }
}
