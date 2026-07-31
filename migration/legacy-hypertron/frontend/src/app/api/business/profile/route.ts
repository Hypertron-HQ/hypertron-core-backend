import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";
import { getBusinessForAppSession } from "@/lib/business-for-session";

const ALLOWED_TIER_IDS = new Set(["tier-1", "tier-2", "tier-3"]);

function normalizeTierId(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "") return null;
  return ALLOWED_TIER_IDS.has(trimmed) ? trimmed : undefined;
}

type BusinessRow = {
  id: string;
  name: string | null;
  email: string | null;
  businessNature: string | null;
  selectedWidgets: string[];
  selectedTier: string | null;
  selectedTierName: string | null;
  selectedTierAt: Date | null;
  receiveAddress: string | null;
  complianceForm: unknown;
  activeTemplateId: string | null;
  activeTemplateAt: Date | null;
};

type ActiveTemplatePayload = {
  id: string;
  name: string;
  bundleId: string;
  bundleName: string | null;
  businessName: string | null;
} | null;

async function resolveActiveTemplate(
  business: Pick<BusinessRow, "id" | "activeTemplateId">
): Promise<{ activeTemplateId: string | null; activeTemplate: ActiveTemplatePayload }> {
  if (!business.activeTemplateId) {
    return { activeTemplateId: null, activeTemplate: null };
  }
  const tpl = await db.businessTemplate.findFirst({
    where: { id: business.activeTemplateId, businessId: business.id },
    select: {
      id: true,
      name: true,
      bundleId: true,
      bundleName: true,
      businessName: true,
    },
  });
  if (!tpl) {
    await db.business
      .update({
        where: { id: business.id },
        data: { activeTemplateId: null, activeTemplateAt: null },
      })
      .catch(() => {});
    return { activeTemplateId: null, activeTemplate: null };
  }
  return {
    activeTemplateId: tpl.id,
    activeTemplate: {
      id: tpl.id,
      name: tpl.name,
      bundleId: tpl.bundleId,
      bundleName: tpl.bundleName ?? null,
      businessName: tpl.businessName ?? null,
    },
  };
}

function profileJson(
  business: BusinessRow,
  active: { activeTemplateId: string | null; activeTemplate: ActiveTemplatePayload }
) {
  return {
    businessId: business.id,
    name: business.name ?? "",
    email: business.email ?? "",
    businessNature: business.businessNature ?? "",
    selectedWidgets: business.selectedWidgets ?? [],
    selectedTier: business.selectedTier ?? null,
    selectedTierName: business.selectedTierName ?? null,
    selectedTierAt: business.selectedTierAt?.toISOString() ?? null,
    receiveAddress: business.receiveAddress ?? null,
    complianceForm: business.complianceForm ?? null,
    activeTemplateId: active.activeTemplateId,
    activeTemplateAt: business.activeTemplateAt?.toISOString() ?? null,
    activeTemplate: active.activeTemplate,
  };
}

/**
 * GET /api/business/profile
 * Authenticated session wallet only (no query/body trust).
 */
export async function GET(req: NextRequest) {
  try {
    const resolved = await getBusinessForAppSession(req);
    if (resolved instanceof NextResponse) return resolved;
    const { business } = resolved;

    const active = await resolveActiveTemplate(business);
    return NextResponse.json(profileJson(business as BusinessRow, active));
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Business profile GET: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Business profile GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/business/profile
 * Body: { name?, email?, activeTemplateId?: string | null, ... } — wallet from session only.
 */
export async function PATCH(req: NextRequest) {
  try {
    const resolved = await getBusinessForAppSession(req);
    if (resolved instanceof NextResponse) return resolved;
    let business = await db.business.findUnique({
      where: { id: resolved.business.id },
    });
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const businessNature = typeof body.businessNature === "string" ? body.businessNature.trim() : undefined;
    const selectedWidgets = Array.isArray(body.selectedWidgets)
      ? body.selectedWidgets.filter((w: unknown) => typeof w === "string")
      : undefined;
    const complianceForm = body.complianceForm !== undefined ? body.complianceForm : undefined;
    const selectedTier = normalizeTierId(body.selectedTier);
    const selectedTierName =
      body.selectedTierName === undefined
        ? undefined
        : body.selectedTierName === null
          ? null
          : typeof body.selectedTierName === "string"
            ? body.selectedTierName.trim() || null
            : undefined;

    let activeTemplateIdUpdate: string | null | undefined = undefined;
    if (body.activeTemplateId !== undefined) {
      if (body.activeTemplateId === null) {
        activeTemplateIdUpdate = null;
      } else if (typeof body.activeTemplateId === "string") {
        const tid = body.activeTemplateId.trim();
        activeTemplateIdUpdate = tid || null;
      }
    }

    const now = new Date();

    {
      const update: {
        name?: string | null;
        email?: string | null;
        businessNature?: string | null;
        selectedWidgets?: string[];
        complianceForm?: object | null;
        selectedTier?: string | null;
        selectedTierName?: string | null;
        selectedTierAt?: Date | null;
        activeTemplateId?: string | null;
        activeTemplateAt?: Date | null;
      } = {};
      if (name !== undefined) update.name = name || null;
      if (email !== undefined) update.email = email || null;
      if (businessNature !== undefined) update.businessNature = businessNature || null;
      if (selectedWidgets !== undefined) update.selectedWidgets = selectedWidgets;
      if (complianceForm !== undefined) update.complianceForm = complianceForm as object | null;
      if (selectedTier !== undefined) {
        update.selectedTier = selectedTier;
        update.selectedTierAt = selectedTier ? now : null;
      }
      if (selectedTierName !== undefined) update.selectedTierName = selectedTierName;

      if (activeTemplateIdUpdate !== undefined) {
        if (activeTemplateIdUpdate === null) {
          update.activeTemplateId = null;
          update.activeTemplateAt = null;
        } else {
          const tpl = await db.businessTemplate.findFirst({
            where: { id: activeTemplateIdUpdate, businessId: business.id },
          });
          if (!tpl) {
            return NextResponse.json({ error: "activeTemplateId not found for this business" }, { status: 400 });
          }
          update.activeTemplateId = tpl.id;
          update.activeTemplateAt = now;
        }
      }

      if (selectedTier !== undefined && business.activeTemplateId) {
        const existingTpl = await db.businessTemplate.findFirst({
          where: { id: business.activeTemplateId, businessId: business.id },
          select: { bundleId: true },
        });
        const tplTier = existingTpl ? normalizeTierId(existingTpl.bundleId) : undefined;
        if (tplTier !== undefined && selectedTier !== tplTier) {
          update.activeTemplateId = null;
          update.activeTemplateAt = null;
        }
      }

      if (Object.keys(update).length > 0) {
        business = await db.business.update({
          where: { id: business.id },
          data: update,
        });
      }
    }

    const full = await db.business.findUnique({
      where: { id: business.id },
      select: {
        id: true,
        name: true,
        email: true,
        businessNature: true,
        selectedWidgets: true,
        selectedTier: true,
        selectedTierName: true,
        selectedTierAt: true,
        receiveAddress: true,
        complianceForm: true,
        activeTemplateId: true,
        activeTemplateAt: true,
      },
    });
    if (!full) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    const active = await resolveActiveTemplate(full);
    return NextResponse.json(profileJson(full as BusinessRow, active));
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Business profile PATCH: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Business profile PATCH error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
