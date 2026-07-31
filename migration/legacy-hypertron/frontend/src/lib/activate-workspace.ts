import { hydrateWorkspaceTierFromProfile } from "@/lib/workspace-tier-context";
import type { SavedTemplate } from "@/lib/my-templates-storage";

type ProfileResponse = {
  selectedTier?: string | null;
  selectedTierName?: string | null;
  name?: string;
  activeTemplateId?: string | null;
  activeTemplate?: {
    id: string;
    name: string;
    bundleId: string;
    bundleName: string | null;
    businessName: string | null;
  } | null;
};

/** Sets active template on the business profile and hydrates sidebar tier state. */
export async function activateWorkspace(template: SavedTemplate): Promise<boolean> {
  try {
    const res = await fetch("/api/business/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ activeTemplateId: template.id }),
    });
    if (!res.ok) {
      hydrateWorkspaceTierFromProfile({
        selectedTier: template.bundleId,
        selectedTierName: template.bundleName,
        businessName: template.businessName ?? template.name,
        activeTemplateId: template.id,
        activeTemplate: {
          id: template.id,
          name: template.name,
          bundleId: template.bundleId,
          bundleName: template.bundleName,
          businessName: template.businessName ?? null,
        },
      });
      return true;
    }
    const profile = (await res.json().catch(() => null)) as ProfileResponse | null;
    if (profile) {
      hydrateWorkspaceTierFromProfile({
        selectedTier: profile.selectedTier,
        selectedTierName: profile.selectedTierName,
        businessName: profile.name,
        activeTemplateId: profile.activeTemplateId,
        activeTemplate: profile.activeTemplate ?? {
          id: template.id,
          name: template.name,
          bundleId: template.bundleId,
          bundleName: template.bundleName,
          businessName: template.businessName ?? null,
        },
      });
    }
    return true;
  } catch {
    hydrateWorkspaceTierFromProfile({
      selectedTier: template.bundleId,
      selectedTierName: template.bundleName,
      businessName: template.businessName ?? template.name,
      activeTemplateId: template.id,
      activeTemplate: {
        id: template.id,
        name: template.name,
        bundleId: template.bundleId,
        bundleName: template.bundleName,
        businessName: template.businessName ?? null,
      },
    });
    return true;
  }
}
