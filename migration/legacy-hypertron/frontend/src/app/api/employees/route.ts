import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { DB_UNAVAILABLE_MESSAGE, isPrismaConnectionError } from "@/lib/prisma-errors";
import { requireSessionWallet } from "@/lib/require-session-wallet";
import { isValidStellarAddress } from "@/lib/stellar-address";

const ALLOWED_STATUS = new Set(["active", "inactive", "on_leave", "pending", "offboarded"]);
const ALLOWED_PRIORITY = new Set(["low", "medium", "high"]);

function normalizeWalletAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return isValidStellarAddress(trimmed) ? trimmed : null;
}

async function resolveBusinessId(walletAddress: string): Promise<string | null> {
  const business = await db.business.findUnique({
    where: { walletAddress },
    select: { id: true },
  });
  return business?.id ?? null;
}

function normalizeStatus(raw: unknown): string {
  if (typeof raw !== "string") return "active";
  const s = raw.trim().toLowerCase();
  return ALLOWED_STATUS.has(s) ? s : "active";
}

function normalizePriority(raw: unknown): string {
  if (typeof raw !== "string") return "medium";
  const s = raw.trim().toLowerCase();
  return ALLOWED_PRIORITY.has(s) ? s : "medium";
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const businessId = await resolveBusinessId(walletAddress);
    if (!businessId) return NextResponse.json({ employees: [] });

    const rows = await db.businessEmployee.findMany({
      where: { businessId },
      orderBy: [{ createdAt: "asc" }],
    });

    return NextResponse.json({
      employees: rows.map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        name: e.name,
        email: e.email ?? null,
        walletAddress: e.walletAddress ?? null,
        role: e.role,
        department: e.department,
        status: e.status,
        priority: e.priority,
      })),
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employees GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim() || null : null;
    const employeeWallet = normalizeWalletAddress(body.employeeWalletAddress);
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const department = typeof body.department === "string" ? body.department.trim() : "";
    if (!name || !role || !department) {
      return NextResponse.json(
        { error: "name, role, and department are required" },
        { status: 400 }
      );
    }

    const businessId = await resolveBusinessId(walletAddress);
    if (!businessId) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
    }

    const existingCodes = await db.businessEmployee.findMany({
      where: { businessId },
      select: { employeeCode: true },
    });
    const maxCode = existingCodes.reduce((max, row) => {
      const match = row.employeeCode.match(/^EMP-(\d+)$/i);
      const n = match ? parseInt(match[1], 10) : NaN;
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 1000);
    const employeeCode = `EMP-${maxCode + 1}`;

    const created = await db.businessEmployee.create({
      data: {
        businessId,
        employeeCode,
        name,
        email,
        walletAddress: employeeWallet,
        role,
        department,
        status: normalizeStatus(body.status),
        priority: normalizePriority(body.priority),
      },
    });

    return NextResponse.json({
      employee: {
        id: created.id,
        employeeCode: created.employeeCode,
        name: created.name,
        email: created.email ?? null,
        walletAddress: created.walletAddress ?? null,
        role: created.role,
        department: created.department,
        status: created.status,
        priority: created.priority,
      },
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employees POST error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids[] required" }, { status: 400 });
    }

    const businessId = await resolveBusinessId(walletAddress);
    if (!businessId) return NextResponse.json({ deleted: 0 });

    const result = await db.businessEmployee.deleteMany({
      where: { businessId, id: { in: ids } },
    });
    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employees DELETE error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
