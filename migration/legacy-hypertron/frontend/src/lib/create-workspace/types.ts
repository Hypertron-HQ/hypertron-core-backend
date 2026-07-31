export type WorkspaceCreatePayload = {
  workspaceType: string;
  businessName: string;
  website?: string;
  teamSize?: string;
  logoDataUrl?: string;
  logoName?: string;
  operationModules: string[];
  walletProvider?: string;
  supportedChains?: string[];
  inviteMembers?: Array<{
    email?: string;
    nickname?: string;
    role?: string;
    permission?: string;
  }>;
  integrations?: string[];
  complianceFrameworks?: string[];
  complianceMonitoring?: string[];
  dataResidency?: string;
  dataRetention?: string;
};
