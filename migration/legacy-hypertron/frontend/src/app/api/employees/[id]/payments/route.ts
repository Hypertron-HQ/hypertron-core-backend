import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { DB_UNAVAILABLE_MESSAGE, isPrismaConnectionError } from "@/lib/prisma-errors";
import { sendPayout } from "@/lib/payout-server";
import { requireSessionWallet } from "@/lib/require-session-wallet";
import { isValidStellarAddress } from "@/lib/stellar-address";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

function normalizeAmount(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const n = Number.parseFloat(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(7);
}

async function resolveBusinessId(walletAddress: string): Promise<string | null> {
  const business = await db.business.findUnique({
    where: { walletAddress },
    select: { id: true },
  });
  return business?.id ?? null;
}

async function resolveEmployee(employeeId: string, businessId: string) {
  return db.businessEmployee.findFirst({
    where: { id: employeeId, businessId },
    select: {
      id: true,
      businessId: true,
      walletAddress: true,
    },
  });
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
    if (!businessId) return NextResponse.json({ payments: [], totals: { paidXlm: "0.0000000", count: 0 } });

    const employee = await resolveEmployee(id, businessId);
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const payments = await db.businessEmployeePayment.findMany({
      where: { employeeId: employee.id, businessId },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    const paidTotal = payments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + Number.parseFloat(p.amountXlm || "0"), 0);

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        amountXlm: p.amountXlm,
        note: p.note ?? null,
        status: p.status,
        payoutTxHash: p.payoutTxHash ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      totals: {
        paidXlm: paidTotal.toFixed(7),
        count: payments.length,
      },
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employee payments GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const walletAddress = session;

    const body = await req.json().catch(() => ({}));
    const amountXlm = normalizeAmount(body.amountXlm);
    if (!amountXlm) {
      return NextResponse.json({ error: "Valid amountXlm required (> 0)" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim() : "";

    const businessId = await resolveBusinessId(walletAddress);
    if (!businessId) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const employee = await resolveEmployee(id, businessId);
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    let status = "completed";
    let payoutTxHash: string | null = null;
    let failureReason: string | null = null;
    const recipient = employee.walletAddress?.trim() ?? "";
    if (recipient && isValidStellarAddress(recipient)) {
      const payout = await sendPayout(recipient, amountXlm, STELLAR_NETWORK);
      if (payout.success) {
        payoutTxHash = payout.txHash;
      } else {
        status = "failed";
        failureReason = payout.error;
      }
    }

    const created = await db.businessEmployeePayment.create({
      data: {
        businessId,
        employeeId: employee.id,
        amountXlm,
        note: note || failureReason || null,
        status,
        payoutTxHash,
      },
    });

    return NextResponse.json({
      payment: {
        id: created.id,
        amountXlm: created.amountXlm,
        note: created.note ?? null,
        status: created.status,
        payoutTxHash: created.payoutTxHash ?? null,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Employee payments POST error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
