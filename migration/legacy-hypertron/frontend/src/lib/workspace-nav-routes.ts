import type { HubBreadcrumb } from "@/components/dashboard/workspace-hub/workspace-hub-chrome";
import { isDemoRoute, withDemoPrefix } from "@/lib/demo-routes";
import { normalizeAppPathname } from "@/lib/workspace-hub-shell-routes";
import { isHubNavRoute } from "@/lib/hub-nav-routes";

export function isWorkspaceRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const base = normalizeAppPathname(pathname);
  if (!base.startsWith("/dashboard")) return false;
  return !isHubNavRoute(pathname);
}

export type WorkspaceLoadingVariant =
  | "overview"
  | "treasury"
  | "payments"
  | "generic";

const ROUTE_LABELS: Record<string, string> = {
  overview: "Overview",
  developers: "Developers",
  bridge: "Bridge",
  withdraw: "Withdraw",
  "payment-links": "Payment links",
  payments: "Payments",
  "secure-vault": "Secure Vault",
  "compliance-agent": "Compliance",
  "compliance-agent2": "Compliance",
  "compliance-analysis": "Risk Reports",
  rns: "Regulations",
  "document-vault": "Document Vault",
  settings: "Settings",
  onboarding: "Onboarding",
  "employee-management": "Contributors",
  workspace: "Workflows",
};

export function getWorkspaceLoadingVariant(pathname: string | null | undefined): WorkspaceLoadingVariant {
  const base = normalizeAppPathname(pathname);
  if (base.startsWith("/dashboard/overview")) return "overview";
  if (base.startsWith("/dashboard/withdraw")) return "treasury";
  if (base.startsWith("/dashboard/payment-links") || base.startsWith("/dashboard/payments")) {
    return "payments";
  }
  return "generic";
}

export function workspaceHubBreadcrumbs(currentPage: string, pathname?: string | null): HubBreadcrumb[] {
  const demo = isDemoRoute(pathname);
  return [
    { label: "Workspaces", href: withDemoPrefix("/dashboard", demo) },
    { label: "Overview", href: withDemoPrefix("/dashboard/overview", demo) },
    { label: currentPage, current: true },
  ];
}

export function getDefaultWorkspaceBreadcrumbs(pathname: string | null | undefined): HubBreadcrumb[] {
  const base = normalizeAppPathname(pathname);
  const segment = base.split("/").filter(Boolean).pop() ?? "Workspace";
  const label =
    ROUTE_LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return workspaceHubBreadcrumbs(label, pathname);
}
