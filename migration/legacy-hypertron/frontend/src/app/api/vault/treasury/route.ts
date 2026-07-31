/**
 * Treasury Vault API: Create and manage business vaults.
 * 
 * POST /api/vault/treasury - Create a new vault (custodial or hybrid)
 * GET /api/vault/treasury?businessId=... - Get vault info and balance
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";
import {
  createVaultKeypair,
  fundVaultAccount,
  addUsdcTrustline,
  setupHybridMultisig,
  getVaultBalance,
  getHypertronSignerPublic,
  type VaultType,
} from "@/lib/vault";

export const dynamic = "force-dynamic";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

/**
 * GET /api/vault/treasury?businessId=...
 * Returns vault info and current balance.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");

    if (!businessId?.trim()) {
      return NextResponse.json({ error: "businessId query required" }, { status: 400 });
    }

    const bid = businessId.trim();
    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    const business = await db.business.findUnique({
      where: { id: bid },
      select: {
        id: true,
        name: true,
        vaultAddress: true,
        vaultType: true,
        vaultCreatedAt: true,
        vaultCoSigner: true,
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    if (!business.vaultAddress) {
      return NextResponse.json({
        hasVault: false,
        vaultAddress: null,
        vaultType: null,
        balance: null,
      });
    }

    const balance = await getVaultBalance(business.vaultAddress, STELLAR_NETWORK);

    const vaultBase = business.name?.trim() || "Hypertron";
    const vaultName = vaultBase.endsWith("Vault") ? vaultBase : `${vaultBase} Vault`;

    return NextResponse.json({
      hasVault: true,
      vaultAddress: business.vaultAddress,
      vaultType: business.vaultType,
      vaultName,
      vaultCoSigner: business.vaultCoSigner,
      vaultCreatedAt: business.vaultCreatedAt?.toISOString(),
      balance,
      network: STELLAR_NETWORK,
    });
  } catch (e) {
    console.error("Vault treasury GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/vault/treasury
 * Create a new vault for the business.
 * 
 * Body:
 * - businessId: string (required)
 * - vaultType: "custodial" | "hybrid" | "external" (default: "custodial")
 * - coSignerAddress: string (required for hybrid mode - user's Freighter address)
 * - externalAddress: string (required for external mode - user's own wallet)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      businessId,
      vaultType: vaultTypeRaw,
      coSignerAddress,
      externalAddress,
    } = body;

    const bid = typeof businessId === "string" ? businessId.trim() : "";
    if (!bid) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }

    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    const business = await db.business.findUnique({
      where: { id: bid },
      select: { id: true, vaultAddress: true },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    if (business.vaultAddress) {
      return NextResponse.json(
        { error: "Vault already exists for this business" },
        { status: 400 }
      );
    }

    const vaultType: VaultType =
      vaultTypeRaw === "hybrid" ? "hybrid" :
      vaultTypeRaw === "external" ? "external" : "custodial";

    if (vaultType === "external") {
      const extAddr = typeof externalAddress === "string" ? externalAddress.trim() : "";
      if (!extAddr || !extAddr.startsWith("G") || extAddr.length !== 56) {
        return NextResponse.json(
          { error: "Valid Stellar address (G...) required for external vault" },
          { status: 400 }
        );
      }

      await db.business.update({
        where: { id: bid },
        data: {
          vaultAddress: extAddr,
          vaultType: "external",
          vaultCreatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        vaultAddress: extAddr,
        vaultType: "external",
        message: "External vault configured. Payments will go directly to your wallet.",
      });
    }

    if (vaultType === "hybrid") {
      const coSigner = typeof coSignerAddress === "string" ? coSignerAddress.trim() : "";
      if (!coSigner || !coSigner.startsWith("G") || coSigner.length !== 56) {
        return NextResponse.json(
          { error: "Valid co-signer address (G...) required for hybrid vault" },
          { status: 400 }
        );
      }

      const hypertronSigner = getHypertronSignerPublic();
      if (!hypertronSigner) {
        return NextResponse.json(
          { error: "HYPERTRON_VAULT_SIGNER not configured on server" },
          { status: 500 }
        );
      }
    }

    const vaultResult = createVaultKeypair();
    if (!vaultResult.success) {
      return NextResponse.json({ error: vaultResult.error }, { status: 500 });
    }

    const { vaultAddress, vaultSecretEnc } = vaultResult;

    const fundResult = await fundVaultAccount(vaultAddress, STELLAR_NETWORK, "3");
    if (!fundResult.success) {
      return NextResponse.json(
        { error: "Failed to fund vault: " + fundResult.error },
        { status: 502 }
      );
    }

    const trustlineResult = await addUsdcTrustline(vaultSecretEnc, STELLAR_NETWORK);
    if (!trustlineResult.success) {
      console.warn("Failed to add USDC trustline:", trustlineResult.error);
    }

    if (vaultType === "hybrid") {
      const coSigner = (coSignerAddress as string).trim();
      const multisigResult = await setupHybridMultisig(vaultSecretEnc, coSigner, STELLAR_NETWORK);
      if (!multisigResult.success) {
        return NextResponse.json(
          { error: "Failed to setup multisig: " + multisigResult.error },
          { status: 502 }
        );
      }

      await db.business.update({
        where: { id: bid },
        data: {
          vaultAddress,
          vaultSecretEnc: null,
          vaultType: "hybrid",
          vaultCoSigner: coSigner,
          vaultCreatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        vaultAddress,
        vaultType: "hybrid",
        coSigner,
        hypertronSigner: getHypertronSignerPublic(),
        fundTxHash: fundResult.txHash,
        multisigTxHash: multisigResult.txHash,
        message: "Hybrid vault created. Withdrawals require your signature via Freighter.",
      });
    }

    await db.business.update({
      where: { id: bid },
      data: {
        vaultAddress,
        vaultSecretEnc,
        vaultType: "custodial",
        vaultCreatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      vaultAddress,
      vaultType: "custodial",
      fundTxHash: fundResult.txHash,
      trustlineTxHash: trustlineResult.success ? trustlineResult.txHash : null,
      message: "Custodial vault created. Hypertron manages withdrawals for you.",
    });
  } catch (e) {
    console.error("Vault treasury POST error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
