import type { NextRequest } from "next/server";

export const DEMO_COMPLIANCE_HEADER = "x-hypertron-demo";

export function demoComplianceHeaders(isDemo: boolean): HeadersInit | undefined {
  if (!isDemo) return undefined;
  return { [DEMO_COMPLIANCE_HEADER]: "1" };
}

export function isDemoComplianceApiRequest(req: NextRequest): boolean {
  if (req.headers.get(DEMO_COMPLIANCE_HEADER) === "1") return true;
  const referer = req.headers.get("referer") ?? "";
  return referer.includes("/demo/");
}
