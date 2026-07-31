import { NextRequest, NextResponse } from "next/server";
import { isDemoComplianceApiRequest } from "@/lib/demo-compliance-api";
import { requireSessionWallet } from "@/lib/require-session-wallet";

const DEFAULT_BASE = "http://localhost:8001";

function resolveBackendBase(): string | null {
  const raw = (process.env.COSMOS_AI_URL || process.env.NEXT_PUBLIC_COSMOS_AI_URL || "").trim();
  if (raw) return raw.replace(/\/$/, "");
  // On Vercel, localhost is wrong — require an explicit backend URL.
  if (process.env.VERCEL === "1") return null;
  return DEFAULT_BASE;
}

export async function POST(req: NextRequest) {
  const BASE = resolveBackendBase();
  if (!BASE) {
    return NextResponse.json(
      {
        error:
          "Compliance Agent backend URL is not configured. Set COSMOS_AI_URL in the Vercel project (e.g. https://your-service.onrender.com).",
      },
      { status: 503 }
    );
  }

  try {
    if (!isDemoComplianceApiRequest(req)) {
      const session = await requireSessionWallet(req);
      if (session instanceof NextResponse) return session;
    }

    const incoming = await req.formData();
    const outbound = new FormData();

    const companyName = String(incoming.get("companyName") || "").trim();
    const companyDescription = String(incoming.get("companyDescription") || "").trim();
    const companyDetails = String(incoming.get("companyDetails") || "").trim();
    const country = String(incoming.get("country") || "").trim();
    const businessModel = String(incoming.get("businessModel") || "").trim();
    const notes = String(incoming.get("notes") || "").trim();
    const companyWebsiteUrl = String(incoming.get("companyWebsiteUrl") || "").trim();
    const websites = String(incoming.get("websites") || "").trim();
    const regulatorySources = String(incoming.get("regulatorySources") || "").trim();

    if (companyName) outbound.append("company_name", companyName);
    if (companyDescription) outbound.append("company_description", companyDescription);
    outbound.append("company_details", companyDetails);
    outbound.append("country", country);
    outbound.append("business_model", businessModel);
    if (notes) outbound.append("notes", notes);
    if (companyWebsiteUrl) outbound.append("company_website_url", companyWebsiteUrl);
    if (websites) outbound.append("websites", websites);
    if (regulatorySources) outbound.append("regulatory_sources", regulatorySources);

    const fileEntries = incoming.getAll("files");
    for (const file of fileEntries) {
      if (file instanceof File) {
        outbound.append("files", file, file.name);
      }
    }

    const response = await fetch(`${BASE}/api/compliance-agent/analyze`, {
      method: "POST",
      body: outbound,
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Compliance agent proxy error:", error);
    return NextResponse.json(
      {
        error:
          "Could not reach Compliance Agent backend. Ensure ai-analyzer is running on port 8001.",
      },
      { status: 502 }
    );
  }
}
