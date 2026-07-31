/** Whether the signed-in business finished workspace setup (Create Workspace flow). */
export function isWorkspaceSetupComplete(profile: {
  name?: string | null;
  selectedTier?: string | null;
  activeTemplateId?: string | null;
  complianceForm?: unknown;
} | null): boolean {
  if (!profile) return false;
  const nameOk = typeof profile.name === "string" && profile.name.trim().length > 0;
  if (!nameOk) return false;

  const form =
    profile.complianceForm && typeof profile.complianceForm === "object"
      ? (profile.complianceForm as { workspaceSetupVersion?: number })
      : null;
  if (form?.workspaceSetupVersion === 1) return true;

  if (typeof profile.activeTemplateId === "string" && profile.activeTemplateId.trim()) {
    return true;
  }
  if (typeof profile.selectedTier === "string" && profile.selectedTier.trim()) {
    return true;
  }
  return false;
}
