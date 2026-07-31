import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { DB_UNAVAILABLE_MESSAGE, isPrismaConnectionError } from "@/lib/prisma-errors";
import { requireSessionWallet } from "@/lib/require-session-wallet";
import { isValidStellarAddress } from "@/lib/stellar-address";

const ALLOWED_STATUS = new Set(["active", "inactive", "on_leave", "pending", "offboarded"]);
const ALLOWED_PRIORITY = new Set(["low", "medium", "high"]);

async function resolveBusinessId(walletAddress: string): Promise<string | null> {
  const business = await db.business.findUnique({
    where: { walletAddress },
    select: { id: true },
  });
  return business?.id ?? null;
}

function normalizeWalletAddress(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isValidStellarAddress(trimmed)) return trimmed;
  return null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const businessId = await resolveBusinessId(walletAddress);
    if (!businessId) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const employee = await db.businessEmployee.findFirst({
      where: { id, businessId },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        walletAddress: true,
        role: true,
        department: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    return NextResponse.json({
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        email: employee.email ?? null,
        walletAddress: employee.walletAddress ?? null,
        role: employee.role,
        department: employee.department,
        status: employee.status,
        priority: employee.priority,
        createdAt: employee.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employee GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const body = await req.json().catch(() => ({}));
    const businessId = await resolveBusinessId(walletAddress);
    if (!businessId) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const current = await db.businessEmployee.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!current) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const update: {
      name?: string;
      email?: string | null;
      walletAddress?: string | null;
      role?: string;
      department?: string;
      status?: string;
      priority?: string;
    } = {};
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (body.email !== undefined) {
      if (typeof body.email === "string") update.email = body.email.trim() || null;
      else if (body.email === null) update.email = null;
    }
    const normalizedWallet = normalizeWalletAddress(body.employeeWalletAddress);
    if (normalizedWallet !== undefined) {
      update.walletAddress = normalizedWallet;
    }
    if (typeof body.role === "string" && body.role.trim()) update.role = body.role.trim();
    if (typeof body.department === "string" && body.department.trim()) {
      update.department = body.department.trim();
    }
    if (typeof body.status === "string") {
      const s = body.status.trim().toLowerCase();
      if (ALLOWED_STATUS.has(s)) update.status = s;
    }
    if (typeof body.priority === "string") {
      const p = body.priority.trim().toLowerCase();
      if (ALLOWED_PRIORITY.has(p)) update.priority = p;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.businessEmployee.update({
      where: { id: current.id },
      data: update,
    });

    return NextResponse.json({
      employee: {
        id: updated.id,
        employeeCode: updated.employeeCode,
        name: updated.name,
        email: updated.email ?? null,
        walletAddress: updated.walletAddress ?? null,
        role: updated.role,
        department: updated.department,
        status: updated.status,
        priority: updated.priority,
      },
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employee PATCH error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const businessId = await resolveBusinessId(walletAddress);
    if (!businessId) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const current = await db.businessEmployee.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!current) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    await db.businessEmployee.delete({ where: { id: current.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employee DELETE error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
