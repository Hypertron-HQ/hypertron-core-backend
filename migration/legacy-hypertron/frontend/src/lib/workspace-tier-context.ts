/**
 * Workspace product tier + business label for sidebar navigation.
 * Persisted in localStorage until backend exists.
 */
import { loadSavedTemplatesLocal } from "@/lib/my-templates-storage";

export const WORKSPACE_TIER_STORAGE_KEY = "hypertron_workspace_tier_v1";

export const WORKSPACE_TIER_UPDATED_EVENT = "workspace-tier-updated";

export type WorkspaceTierId = "tier-1" | "tier-2" | "tier-3";

export type WorkspaceTierState = {
  bundleId: WorkspaceTierId;
  /** Raw business name from onboarding */
  businessName: string;
  /** e.g. "Tier 2" */
  bundleName: string;
  /** After user clicks Import, tier nav appears in the sidebar */
  sidebarImported: boolean;
  updatedAt: string;
};

function isTierId(v: string): v is WorkspaceTierId {
  return v === "tier-1" || v === "tier-2" || v === "tier-3";
}

/** Saved template `bundleId` from onboarding (`tier-1` … `tier-3`). */
export function bundleIdToTierId(bundleId: string | undefined): WorkspaceTierId | null {
  if (!bundleId) return null;
  return isTierId(bundleId) ? bundleId : null;
}

export function getWorkspaceTierState(): WorkspaceTierState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_TIER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<WorkspaceTierState>;
    if (!o.bundleId || !isTierId(o.bundleId)) return null;
    return {
      bundleId: o.bundleId,
      businessName: typeof o.businessName === "string" ? o.businessName : "",
      bundleName: typeof o.bundleName === "string" ? o.bundleName : o.bundleId,
      sidebarImported: Boolean(o.sidebarImported),
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function setWorkspaceTierState(next: WorkspaceTierState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_TIER_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(WORKSPACE_TIER_UPDATED_EVENT));
}

/** Call when user picks a tier in Business Onboarding (resets import until they click Import again). */
export function persistTierFromOnboarding(input: {
  bundleId: string;
  businessName: string;
  bundleName: string;
}): void {
  const bundleId = isTierId(input.bundleId) ? input.bundleId : "tier-2";
  setWorkspaceTierState({
    bundleId,
    businessName: input.businessName.trim(),
    bundleName: input.bundleName.trim() || bundleId,
    sidebarImported: false,
    updatedAt: new Date().toISOString(),
  });
}

export function markWorkspaceSidebarImported(): void {
  const cur = getWorkspaceTierState();
  if (!cur) return;
  setWorkspaceTierState({ ...cur, sidebarImported: true, updatedAt: new Date().toISOString() });
}

/** If no tier file yet, infer from the most recently saved template (onboarding save). */
export function syncWorkspaceTierFromLatestTemplate(): void {
  if (typeof window === "undefined") return;
  if (getWorkspaceTierState()) return;
  const tpls = loadSavedTemplatesLocal();
  const latest = tpls[0];
  if (!latest?.bundleId || !isTierId(latest.bundleId)) return;
  setWorkspaceTierState({
    bundleId: latest.bundleId,
    businessName: (latest.businessName ?? "").trim(),
    bundleName: latest.bundleName?.trim() || latest.bundleId,
    sidebarImported: false,
    updatedAt: new Date().toISOString(),
  });
}

export type ProfileActiveTemplate = {
  id: string;
  name: string;
  bundleId: string;
  bundleName: string | null;
  businessName: string | null;
};

/**
 * Hydrate workspace tier state from the server `business profile` response.
 * When `activeTemplate` is present, sidebar import state matches the template saved in DB (login / new device).
 */
export function hydrateWorkspaceTierFromProfile(input: {
  selectedTier: string | null | undefined;
  selectedTierName: string | null | undefined;
  businessName: string | null | undefined;
  activeTemplateId?: string | null | undefined;
  activeTemplate?: ProfileActiveTemplate | null;
}): void {
  if (typeof window === "undefined") return;

  const tpl = input.activeTemplate;
  const tierFromActiveTpl = tpl?.bundleId ? bundleIdToTierId(tpl.bundleId) : null;
  const hasActive = Boolean(
    input.activeTemplateId &&
      tpl?.id &&
      tpl.id === input.activeTemplateId &&
      tierFromActiveTpl
  );

  const bundleId = hasActive ? tierFromActiveTpl! : bundleIdToTierId(input.selectedTier ?? undefined);
  if (!bundleId) return;

  const bundleName =
    hasActive && (tpl?.bundleName?.trim() ?? "")
      ? (tpl!.bundleName as string).trim()
      : (input.selectedTierName ?? "").trim() || bundleId;

  const businessName =
    hasActive && (tpl?.businessName?.trim() || tpl?.name?.trim())
      ? (tpl!.businessName ?? tpl!.name ?? "").trim()
      : (input.businessName ?? "").trim();

  const sidebarImported = Boolean(hasActive && bundleId);

  const current = getWorkspaceTierState();
  if (
    current &&
    current.bundleId === bundleId &&
    current.bundleName === bundleName &&
    current.businessName === businessName &&
    current.sidebarImported === sidebarImported
  ) {
    return;
  }

  setWorkspaceTierState({
    bundleId,
    businessName,
    bundleName,
    sidebarImported,
    updatedAt: new Date().toISOString(),
  });
}

export function workspaceSectionTitle(state: WorkspaceTierState): string {
  const name = state.businessName.trim() || "Business";
  const tier = state.bundleName.trim() || state.bundleId;
  return `${name} · ${tier}`;
}
