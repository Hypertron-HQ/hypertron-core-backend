/** Workspace type id → product tier (matches Business Onboarding bundles). */
export const WORKSPACE_TYPE_TO_TIER: Record<string, { id: string; name: string }> = {
  "web3-startup": { id: "tier-1", name: "Tier 1" },
  other: { id: "tier-1", name: "Tier 1" },
  dao: { id: "tier-2", name: "Tier 2" },
  agency: { id: "tier-2", name: "Tier 2" },
  "service-company": { id: "tier-2", name: "Tier 2" },
  foundation: { id: "tier-3", name: "Tier 3" },
  infrastructure: { id: "tier-3", name: "Tier 3" },
  enterprise: { id: "tier-3", name: "Tier 3" },
};

export const OPERATION_MODULE_LABELS: Record<string, string> = {
  treasury: "Treasury",
  payments: "Payments",
  "contributor-management": "Contributor Management",
  "compliance-monitoring": "Compliance Monitoring",
  "regulations-feed": "Regulations Feed",
  "risk-reports": "Risk Reports",
  "client-operations": "Client Operations",
  "agency-operations": "Agency Operations",
  "workflow-automation": "Workflow Automation",
};

export const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  "web3-startup": "Web3 Startup / Protocol",
  dao: "DAO",
  agency: "Agency",
  foundation: "Foundation / Ecosystem",
  infrastructure: "Infrastructure Provider",
  "service-company": "Service Company",
  enterprise: "Enterprise Team",
  other: "Other",
};

export const MAX_LOGO_DATA_URL_LENGTH = 600_000;
