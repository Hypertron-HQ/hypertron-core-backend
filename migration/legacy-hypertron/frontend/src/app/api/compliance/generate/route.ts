import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";
import { requireSessionWallet } from "@/lib/require-session-wallet";

/** Optional compliance form payload (from request body or DB complianceForm). */
interface ComplianceFormPayload {
  businessName?: string;
  basedOutOf?: string;
  businessType?: string;
  geographies?: string;
  products?: string;
  monthlyTransactions?: string;
  avgTransactionValueUsd?: string;
  opsHourlyRateUsd?: string;
  complianceHourlyRateUsd?: string;
  platformCostUsdMonth?: string;
  constraints?: string;
}

/** Python API base URL (e.g. http://localhost:8001). When set, we proxy to Python RegIntel /profile + /analyze. */
const COMPLIANCE_PYTHON_API_URL = process.env.COSMOS_AI_URL?.trim() || process.env.COMPLIANCE_PYTHON_API_URL?.trim() || "";

/**
 * POST /api/compliance/generate
 * Body: { ...ComplianceFormPayload } (wallet from session; form fields optional; if omitted, use saved profile)
 * Uses OpenAI to generate a regulatory & compliance checklist for the business.
 * Returns { items: { id: string, text: string }[] }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const body = await req.json().catch(() => ({}));

    let business: { id: string; name: string | null; email: string | null; businessNature: string | null; complianceForm?: unknown } | null = null;
    try {
      business = await db.business.findUnique({
        where: { walletAddress },
        select: { id: true, name: true, email: true, businessNature: true, complianceForm: true },
      });
    } catch (dbErr) {
      console.error("Compliance generate: DB read error", dbErr);
      // Continue without saved profile; use body only
    }

    const savedForm = (business?.complianceForm != null && typeof business.complianceForm === "object")
      ? (business.complianceForm as ComplianceFormPayload)
      : null;
    const form: ComplianceFormPayload = {
      businessName: body.businessName ?? savedForm?.businessName ?? business?.name ?? "",
      basedOutOf: body.basedOutOf ?? savedForm?.basedOutOf ?? "",
      businessType: body.businessType ?? savedForm?.businessType ?? body.businessNature ?? savedForm?.businessType ?? business?.businessNature ?? "",
      geographies: body.geographies ?? savedForm?.geographies ?? "",
      products: body.products ?? savedForm?.products ?? "",
      monthlyTransactions: body.monthlyTransactions ?? savedForm?.monthlyTransactions ?? "",
      avgTransactionValueUsd: body.avgTransactionValueUsd ?? savedForm?.avgTransactionValueUsd ?? "",
      opsHourlyRateUsd: body.opsHourlyRateUsd ?? savedForm?.opsHourlyRateUsd ?? "",
      complianceHourlyRateUsd: body.complianceHourlyRateUsd ?? savedForm?.complianceHourlyRateUsd ?? "",
      platformCostUsdMonth: body.platformCostUsdMonth ?? savedForm?.platformCostUsdMonth ?? "",
      constraints: body.constraints ?? savedForm?.constraints ?? "",
    };

    // If Python backend (e.g. localhost:8001) is configured, proxy to simple compliance checklist API
    if (COMPLIANCE_PYTHON_API_URL) {
      const base = COMPLIANCE_PYTHON_API_URL.replace(/\/$/, "");
      const payload = {
        walletAddress: walletAddress,
        businessName: form.businessName || undefined,
        email: body.email ?? undefined,
        basedOutOf: form.basedOutOf || undefined,
        businessType: form.businessType || undefined,
        geographies: form.geographies || undefined,
        products: form.products || undefined,
        monthlyTransactions: form.monthlyTransactions || undefined,
        avgTransactionValueUsd: form.avgTransactionValueUsd || undefined,
        opsHourlyRateUsd: form.opsHourlyRateUsd || undefined,
        complianceHourlyRateUsd: form.complianceHourlyRateUsd || undefined,
        platformCostUsdMonth: form.platformCostUsdMonth || undefined,
        constraints: form.constraints || undefined,
      };
      try {
        const res = await fetch(`${base}/api/compliance/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error("Compliance checklist API error:", res.status, errText);
          let errMsg = "Python compliance API failed.";
          try {
            const errJson = JSON.parse(errText);
            if (errJson.detail) errMsg = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
          } catch {
            if (errText) errMsg = errText.slice(0, 200);
          }
          return NextResponse.json(
            { error: errMsg },
            { status: 502 }
          );
        }
        const data = (await res.json()) as { items?: Array<{ id: string; text: string }> };
        const items = data?.items ?? [];
        if (items.length === 0) {
          return NextResponse.json(
            { error: "Python API returned no checklist items." },
            { status: 502 }
          );
        }
        return NextResponse.json({ items });
      } catch (e) {
        console.error("Compliance Python proxy error:", e);
        return NextResponse.json(
          { error: "Could not reach Python compliance API at " + base + ". Is it running on port 8001?" },
          { status: 502 }
        );
      }
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured. Set it in .env to generate compliance checklists." },
        { status: 503 }
      );
    }

    const parts: string[] = [];
    if (form.businessName) parts.push(`Business name: ${form.businessName}`);
    if (form.basedOutOf) parts.push(`Based out of: ${form.basedOutOf}`);
    if (form.businessType) parts.push(`Type / sector: ${form.businessType}`);
    if (form.geographies) parts.push(`Geographical location(s): ${form.geographies}`);
    if (form.products) parts.push(`Products / services: ${form.products}`);
    if (form.monthlyTransactions) parts.push(`Monthly transactions (volume): ${form.monthlyTransactions}`);
    if (form.avgTransactionValueUsd) parts.push(`Average transaction value (USD): ${form.avgTransactionValueUsd}`);
    if (form.opsHourlyRateUsd) parts.push(`Ops hourly rate (USD): ${form.opsHourlyRateUsd}`);
    if (form.complianceHourlyRateUsd) parts.push(`Compliance hourly rate (USD): ${form.complianceHourlyRateUsd}`);
    if (form.platformCostUsdMonth) parts.push(`Platform cost (USD/month): ${form.platformCostUsdMonth}`);
    if (form.constraints) parts.push(`Constraints / requirements: ${form.constraints}`);
    const context = parts.length > 0 ? parts.join(". ") : "General business (no additional details provided).";

    const systemPrompt = `You are a regulatory and compliance advisor. Given a business profile, produce a concise checklist of regulatory and compliance actions the business should take to operate in a legally compliant manner in their jurisdictions and sector. Output only a JSON array of strings, each string being one actionable item (e.g. "Register for data protection authority if processing EU personal data"). No other text. Example: ["Item one", "Item two"]`;
    const userPrompt = `Business profile: ${context}. Generate a professional, actionable regulatory and compliance checklist (8–15 items) for this business to become fully legally compliant. Consider geography, sector, transaction volume, and any constraints. Return only a JSON array of strings.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI error:", res.status, err);
      return NextResponse.json(
        { error: "Failed to generate checklist. Please try again." },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    let list: string[] = [];
    try {
      const parsed = JSON.parse(content) as unknown;
      list = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      const lines = content.split("\n").map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
      list = lines.slice(0, 20);
    }

    const items = list.slice(0, 20).map((text, i) => ({
      id: `item-${Date.now()}-${i}`,
      text,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Compliance generate: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Compliance generate error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
