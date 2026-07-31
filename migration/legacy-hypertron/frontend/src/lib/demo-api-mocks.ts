import {
  fallbackBalance,
  fallbackBusiness,
  fallbackDashboardStats,
  fallbackEvents,
  fallbackPaymentLinks,
  fallbackWithdrawals,
} from "@/data/fallback";

const DEMO_TEMPLATES = {
  templates: [
    {
      id: "demo-ws-hypertron",
      name: "Hypertron Demo",
      businessName: "Hypertron",
      bundleId: "tier-2",
      bundleName: "Tier 2",
      savedAt: new Date().toISOString(),
      widgets: ["compliance", "document-vault", "ai-assistant", "employee-mgmt"],
    },
    {
      id: "demo-ws-northwind",
      name: "Northwind Agency",
      businessName: "Northwind Agency",
      bundleId: "tier-2",
      bundleName: "Tier 2",
      savedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      widgets: ["compliance", "employee-mgmt"],
    },
  ],
};

const DEMO_VAULT = {
  hasVault: true,
  vaultAddress: "GDEMO6M6QY7E5R4Q4QY7E5R4Q4QY7E5R4Q4QY7E5R4Q4QY7E5R4QA",
  vaultType: "hybrid" as const,
  vaultName: "Hypertron Vault",
  vaultCoSigner: fallbackBusiness.walletAddress,
  vaultCreatedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
  balance: {
    xlm: "1,240.50",
    usdc: "8,450.00",
    xlmRaw: 1240.5,
    usdcRaw: 8450,
  },
  network: "testnet",
};

const DEMO_PROFILE = {
  businessId: fallbackBusiness.businessId,
  name: fallbackBusiness.name,
  email: fallbackBusiness.email,
  receiveAddress: fallbackBusiness.receiveAddress,
  walletAddress: fallbackBusiness.walletAddress,
  selectedWidgets: fallbackBusiness.selectedWidgets,
  activeTemplate: DEMO_TEMPLATES.templates[0],
};

const DEMO_EVENTS = {
  events: [
    ...fallbackEvents.map((e, i) => ({
      ...e,
      currency: "USDC",
      purpose: e.workflowStage,
      clientName: ["Northwind", "Stacked Labs", "Acme Vendor"][i] ?? "Client",
      createdAt: e.paidAt ?? new Date().toISOString(),
    })),
    {
      linkId: "plink_demo_004",
      businessId: fallbackBusiness.businessId,
      amount: "1200.00",
      currency: "USDC",
      purpose: "Enterprise onboarding",
      clientName: "Vertex DAO",
      workflowStage: "open",
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      linkId: "plink_demo_005",
      businessId: fallbackBusiness.businessId,
      amount: "340.00",
      currency: "USDC",
      purpose: "Compliance review",
      clientName: "Atlas Labs",
      paidAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Return a mocked Response for demo dashboard API calls, or null to use the network. */
export function mockDemoApiFetch(input: RequestInfo | URL, init?: RequestInit): Response | null {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const method = (init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")).toUpperCase();

  if (url.includes("/api/auth/me")) {
    return jsonResponse({
      auth: "privy",
      user: {
        id: "demo-user",
        privyId: "did:privy:demo",
        email: fallbackBusiness.email,
        name: fallbackBusiness.name,
      },
      stellarAddress: fallbackBusiness.walletAddress,
    });
  }

  if (url.includes("/api/auth/logout") && method === "POST") {
    return jsonResponse({ ok: true });
  }

  if (url.includes("/api/business/profile")) {
    if (method === "GET" || method === "POST" || method === "PATCH") {
      return jsonResponse(DEMO_PROFILE);
    }
  }

  if (url.includes("/api/templates")) {
    return jsonResponse(DEMO_TEMPLATES);
  }

  if (url.includes("/api/dashboard-stats")) {
    return jsonResponse({ businessId: fallbackBusiness.businessId, ...fallbackDashboardStats });
  }

  if (url.includes("/api/vault/treasury/withdraw")) {
    if (method === "POST") {
      return jsonResponse({ mode: "custodial", amount: "100", currency: "USDC", txHash: "demo_tx_hash" });
    }
    return jsonResponse({ ok: true, withdrawalId: "wd_demo_new" });
  }

  if (url.includes("/api/vault/treasury")) {
    return jsonResponse(DEMO_VAULT);
  }

  if (url.includes("/api/events")) {
    return jsonResponse(DEMO_EVENTS);
  }

  if (url.includes("/api/withdraw")) {
    return jsonResponse({ withdrawals: fallbackWithdrawals });
  }

  if (url.includes("/api/balance")) {
    return jsonResponse({
      businessId: fallbackBusiness.businessId,
      ...fallbackBalance,
      virtualBalanceUsdc: "8450.00",
    });
  }

  if (url.includes("/api/payment-link?")) {
    return jsonResponse({ links: fallbackPaymentLinks });
  }

  if (url.includes("/api/payment-link") && method === "POST") {
    return jsonResponse({
      id: "plink_demo_new",
      url: `${typeof window !== "undefined" ? window.location.origin : ""}/pay/plink_demo_new`,
    });
  }

  if (url.includes("/api/payment-send")) {
    if (method === "GET") {
      return jsonResponse({
        balances: { virtualBalanceUsdc: "8450.00" },
        stats: { sentVolumeUsdc: "3240.00", paymentsSent: 8 },
        sends: [],
      });
    }
    return jsonResponse({ ok: true, id: "send_demo_001" });
  }

  if (url.includes("/api/employees")) {
    return jsonResponse({ employees: [] });
  }

  if (url.includes("/api/compliance-agent/")) {
    return null;
  }

  if (url.includes("/api/compliance") || url.includes("/api/vault") || url.includes("/api/regintel")) {
    return jsonResponse({});
  }

  if (url.startsWith("/api/") || url.includes("/api/")) {
    return jsonResponse({});
  }

  return null;
}
