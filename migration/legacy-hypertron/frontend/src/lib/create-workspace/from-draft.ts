import type { WorkspaceCreatePayload } from "@/lib/create-workspace/types";

/** Minimal draft shape from the Create Workspace wizard (sessionStorage). */
export type WorkspaceDraftForCreate = {
  workspaceType: string;
  businessName: string;
  website: string;
  teamSize?: string;
  logoDataUrl: string;
  logoName: string;
  operationModules: string[];
  walletProvider?: string;
  supportedChains: string[];
  inviteMembers: Array<{
    email: string;
    nickname: string;
    role: string;
    permission: string;
  }>;
  integrations?: string[];
  complianceFrameworks?: string[];
  complianceMonitoring?: string[];
  dataResidency?: string;
  dataRetention?: string;
};

export function workspaceDraftToPayload(draft: WorkspaceDraftForCreate): WorkspaceCreatePayload {
  const invited = (draft.inviteMembers ?? []).filter(
    (m) => m.email.trim().length > 0 || m.nickname.trim().length > 0
  );

  return {
    workspaceType: draft.workspaceType,
    businessName: draft.businessName.trim(),
    website: draft.website.trim() || undefined,
    teamSize: draft.teamSize,
    logoDataUrl: draft.logoDataUrl.trim() || undefined,
    logoName: draft.logoName.trim() || undefined,
    operationModules: draft.operationModules ?? [],
    walletProvider: draft.walletProvider,
    supportedChains: draft.supportedChains ?? [],
    inviteMembers: invited.map((m) => ({
      email: m.email.trim(),
      nickname: m.nickname.trim(),
      role: m.role,
      permission: m.permission,
    })),
    integrations: draft.integrations ?? [],
    complianceFrameworks: draft.complianceFrameworks ?? [],
    complianceMonitoring: draft.complianceMonitoring ?? [],
    dataResidency: draft.dataResidency,
    dataRetention: draft.dataRetention,
  };
}
