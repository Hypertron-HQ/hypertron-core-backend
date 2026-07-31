import type { WorkspaceCreatePayload } from "@/lib/create-workspace/types";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean);
}

export function parseWorkspaceCreatePayload(body: unknown): WorkspaceCreatePayload | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid request body" };
  }
  const raw = body as Record<string, unknown>;

  const workspaceType =
    typeof raw.workspaceType === "string" ? raw.workspaceType.trim() : "";
  const businessName =
    typeof raw.businessName === "string" ? raw.businessName.trim() : "";

  if (!workspaceType) return { error: "workspaceType is required" };
  if (!businessName) return { error: "businessName is required" };

  const operationModules = asStringArray(raw.operationModules);
  if (operationModules.length === 0) {
    return { error: "At least one operation module is required" };
  }

  const inviteMembers = Array.isArray(raw.inviteMembers)
    ? raw.inviteMembers
        .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
        .map((m) => ({
          email: typeof m.email === "string" ? m.email.trim() : "",
          nickname: typeof m.nickname === "string" ? m.nickname.trim() : "",
          role: typeof m.role === "string" ? m.role.trim() : "",
          permission: typeof m.permission === "string" ? m.permission.trim() : "full-access",
        }))
    : [];

  return {
    workspaceType,
    businessName,
    website: typeof raw.website === "string" ? raw.website.trim() : "",
    teamSize: typeof raw.teamSize === "string" ? raw.teamSize.trim() : undefined,
    logoDataUrl: typeof raw.logoDataUrl === "string" ? raw.logoDataUrl.trim() : "",
    logoName: typeof raw.logoName === "string" ? raw.logoName.trim() : "",
    operationModules,
    walletProvider:
      typeof raw.walletProvider === "string" ? raw.walletProvider.trim() : undefined,
    supportedChains: asStringArray(raw.supportedChains),
    inviteMembers,
    integrations: asStringArray(raw.integrations),
    complianceFrameworks: asStringArray(raw.complianceFrameworks),
    complianceMonitoring: asStringArray(raw.complianceMonitoring),
    dataResidency: typeof raw.dataResidency === "string" ? raw.dataResidency.trim() : undefined,
    dataRetention: typeof raw.dataRetention === "string" ? raw.dataRetention.trim() : undefined,
  };
}
