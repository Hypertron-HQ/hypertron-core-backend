import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getBusinessForAppSession } from "@/lib/business-for-session";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";
import { parseWorkspaceCreatePayload } from "@/lib/create-workspace/parse-payload";
import { widgetsFromOperationModules } from "@/lib/create-workspace/build-template-widgets";
import {
  MAX_LOGO_DATA_URL_LENGTH,
  WORKSPACE_TYPE_LABELS,
  WORKSPACE_TYPE_TO_TIER,
} from "@/lib/create-workspace/constants";

/**
 * POST /api/workspace/create
 * Persists the Create Workspace wizard (replaces legacy business onboarding modal + PATCH profile for setup).
 */
export async function POST(req: NextRequest) {
  try {
    const resolved = await getBusinessForAppSession(req);
    if (resolved instanceof NextResponse) return resolved;

    const body = await req.json().catch(() => null);
    const parsed = parseWorkspaceCreatePayload(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const logoDataUrl =
      parsed.logoDataUrl && parsed.logoDataUrl.length > 0
        ? parsed.logoDataUrl.length <= MAX_LOGO_DATA_URL_LENGTH
          ? parsed.logoDataUrl
          : null
        : null;

    const tier =
      WORKSPACE_TYPE_TO_TIER[parsed.workspaceType] ?? WORKSPACE_TYPE_TO_TIER["web3-startup"];
    const workspaceTypeLabel =
      WORKSPACE_TYPE_LABELS[parsed.workspaceType] ?? parsed.workspaceType;
    const now = new Date();

    const complianceForm = {
      workspaceSetupVersion: 1,
      workspaceType: parsed.workspaceType,
      workspaceTypeLabel,
      website: parsed.website || null,
      teamSize: parsed.teamSize ?? null,
      logoDataUrl,
      logoName: parsed.logoName || null,
      walletProvider: parsed.walletProvider ?? null,
      supportedChains: parsed.supportedChains ?? [],
      integrations: parsed.integrations ?? [],
      inviteMembers: parsed.inviteMembers ?? [],
      complianceFrameworks: parsed.complianceFrameworks ?? [],
      complianceMonitoring: parsed.complianceMonitoring ?? [],
      dataResidency: parsed.dataResidency ?? null,
      dataRetention: parsed.dataRetention ?? null,
      createdAt: now.toISOString(),
    };

    const businessId = resolved.business.id;
    const widgets = widgetsFromOperationModules(parsed.operationModules);
    const templateName = `${parsed.businessName} · ${workspaceTypeLabel}`;

    const template = await db.businessTemplate.create({
      data: {
        businessId,
        name: templateName,
        businessName: parsed.businessName,
        bundleId: tier.id,
        bundleName: tier.name,
        description: `Workspace for ${workspaceTypeLabel}`,
        widgets: widgets as object[],
      },
    });

    await db.business.update({
      where: { id: businessId },
      data: {
        name: parsed.businessName,
        businessNature: parsed.workspaceType,
        selectedWidgets: parsed.operationModules,
        selectedTier: tier.id,
        selectedTierName: tier.name,
        selectedTierAt: now,
        activeTemplateId: template.id,
        activeTemplateAt: now,
        complianceForm,
        vaultType: parsed.walletProvider ? "external" : undefined,
      },
    });

    return NextResponse.json({
      businessId,
      templateId: template.id,
      activeTemplateId: template.id,
      selectedTier: tier.id,
      selectedTierName: tier.name,
      template: {
        id: template.id,
        name: template.name,
        businessName: template.businessName,
        savedAt: template.updatedAt.toISOString(),
        bundleId: template.bundleId,
        bundleName: template.bundleName,
        description: template.description,
        widgets,
      },
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Workspace create error:", e);
    const message =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? e.message
        : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
