import type { RegulatorySource } from "@/lib/compliance/jurisdiction-knowledge-base";

export type SourceStatus = {
  sourceType: "website" | "document" | "notes" | "regulatory_source";
  name: string;
  status: "Processed" | "Failed" | "Unsupported" | "available" | "used" | "skipped" | "failed";
  detail?: string;
  extractedChars: number;
  providedBy?: "user" | "hypertron";
  authorityType?: RegulatorySource["authorityType"];
  description?: string;
};

export type ComplianceResult = {
  modelSource: "openai" | "heuristic";
  summary: string;
  complianceHealth: { score: number; status: "Critical" | "At Risk" | "On Track"; rationale: string };
  requiredLicenses: Array<{
    name: string;
    jurisdiction: string;
    priority: "P0" | "P1" | "P2";
    reason: string;
    confidence: "high" | "medium" | "low";
  }>;
  requiredDocuments: Array<{
    name: string;
    owner: "founder" | "legal" | "compliance" | "engineering";
    priority: "P0" | "P1" | "P2";
    reason: string;
  }>;
  actionItems: Array<{
    title: string;
    owner: "founder" | "legal" | "compliance" | "engineering";
    priority: "P0" | "P1" | "P2";
    details: string;
  }>;
  timeline: Array<{ phase: string; weeks: string; goals: string[] }>;
  risks: Array<{ risk: string; severity: "high" | "medium" | "low"; mitigation: string }>;
  sourceStatuses: SourceStatus[];
  disclaimers: string[];
};

export type PendingComplianceRequest = {
  country: string;
  companyName: string;
  companyDescription: string;
  companyDetails: string;
  businessModel: string;
  notes: string;
  companyWebsiteUrl: string;
  websites: string[];
  regulatorySources: RegulatorySource[];
  files: File[];
};

export type ComplianceRunContext = {
  country: string;
  companyName?: string;
  companyDescription?: string;
  companyDetails: string;
  businessModel: string;
  notes: string;
  companyWebsiteUrl?: string;
  websites: string[];
  regulatorySources?: RegulatorySource[];
  sourceStatuses: SourceStatus[];
};

export type DetailStep = {
  step: number;
  title: string;
  details: string;
  owner?: string | null;
  requiredDocuments: string[];
  estimatedTimeline: string;
  submissionLink?: string | null;
};

export type DetailLink = {
  title: string;
  url: string;
  purpose: string;
  authority?: string | null;
};

export type ComplianceDetailPlan = {
  modelSource: "openai" | "heuristic";
  section: string;
  itemTitle: string;
  whyItMatters: string;
  eligibilityChecks: string[];
  requiredDocuments: string[];
  stepByStep: DetailStep[];
  submissionLinks: DetailLink[];
  automationSuggestions: string[];
  warnings: string[];
  sources: DetailLink[];
  disclaimer: string;
};

let pendingRequest: PendingComplianceRequest | null = null;
let latestResultMemory: ComplianceResult | null = null;
let latestContextMemory: ComplianceRunContext | null = null;

const RESULT_STORAGE_KEY = "compliance_agent_latest_result";
const CONTEXT_STORAGE_KEY = "compliance_agent_latest_context";

export function setPendingComplianceRequest(req: PendingComplianceRequest): void {
  pendingRequest = req;
}

export function getPendingComplianceRequest(): PendingComplianceRequest | null {
  return pendingRequest;
}

export function clearPendingComplianceRequest(): void {
  pendingRequest = null;
}

export function normalizeComplianceResult(payload: unknown): ComplianceResult {
  const raw = (payload ?? {}) as Record<string, unknown>;
  return {
    modelSource: (raw.modelSource ?? raw.model_source ?? "heuristic") as "openai" | "heuristic",
    summary: String(raw.summary ?? ""),
    complianceHealth: (raw.complianceHealth ??
      raw.compliance_health ??
      { score: 0, status: "Critical", rationale: "No health summary returned." }) as ComplianceResult["complianceHealth"],
    requiredLicenses: (raw.requiredLicenses ?? raw.required_licenses ?? []) as ComplianceResult["requiredLicenses"],
    requiredDocuments: (raw.requiredDocuments ??
      raw.required_documents ??
      []) as ComplianceResult["requiredDocuments"],
    actionItems: (raw.actionItems ?? raw.action_items ?? []) as ComplianceResult["actionItems"],
    timeline: (raw.timeline ?? []) as ComplianceResult["timeline"],
    risks: (raw.risks ?? []) as ComplianceResult["risks"],
    sourceStatuses: (raw.sourceStatuses ?? raw.source_statuses ?? []) as SourceStatus[],
    disclaimers: (raw.disclaimers ?? []) as string[],
  };
}

export function normalizeComplianceDetailPlan(payload: unknown): ComplianceDetailPlan {
  const raw = (payload ?? {}) as Record<string, unknown>;
  return {
    modelSource: (raw.modelSource ?? raw.model_source ?? "heuristic") as "openai" | "heuristic",
    section: String(raw.section ?? ""),
    itemTitle: String(raw.itemTitle ?? raw.item_title ?? ""),
    whyItMatters: String(raw.whyItMatters ?? raw.why_it_matters ?? ""),
    eligibilityChecks: (raw.eligibilityChecks ?? raw.eligibility_checks ?? []) as string[],
    requiredDocuments: (raw.requiredDocuments ?? raw.required_documents ?? []) as string[],
    stepByStep: (raw.stepByStep ?? raw.step_by_step ?? []) as DetailStep[],
    submissionLinks: (raw.submissionLinks ?? raw.submission_links ?? []) as DetailLink[],
    automationSuggestions: (raw.automationSuggestions ?? raw.automation_suggestions ?? []) as string[],
    warnings: (raw.warnings ?? []) as string[],
    sources: (raw.sources ?? []) as DetailLink[],
    disclaimer: String(raw.disclaimer ?? ""),
  };
}

export function setLatestComplianceResult(result: ComplianceResult): void {
  latestResultMemory = result;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(result));
  }
}

export function getLatestComplianceResult(): ComplianceResult | null {
  if (latestResultMemory) return latestResultMemory;
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(RESULT_STORAGE_KEY);
  if (!raw) return null;
  try {
    latestResultMemory = normalizeComplianceResult(JSON.parse(raw));
    return latestResultMemory;
  } catch {
    return null;
  }
}

export function clearLatestComplianceResult(): void {
  latestResultMemory = null;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(RESULT_STORAGE_KEY);
  }
}

export function setLatestComplianceContext(context: ComplianceRunContext): void {
  latestContextMemory = context;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
  }
}

export function getLatestComplianceContext(): ComplianceRunContext | null {
  if (latestContextMemory) return latestContextMemory;
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(CONTEXT_STORAGE_KEY);
  if (!raw) return null;
  try {
    latestContextMemory = JSON.parse(raw) as ComplianceRunContext;
    return latestContextMemory;
  } catch {
    return null;
  }
}

export function clearLatestComplianceContext(): void {
  latestContextMemory = null;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(CONTEXT_STORAGE_KEY);
  }
}
