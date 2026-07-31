export type TechnicalPage = {
  slug: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  /** Optional in-page anchor nav (right rail). */
  onThisPage?: { id: string; title: string }[];
};

export const TECHNICAL_DOC = {
  badge: "Technical docs",
  category: "Developers",
} as const;

export const TECHNICAL_PAGES: TechnicalPage[] = [
  {
    slug: "overview",
    eyebrow: "System",
    title: "System overview",
    subtitle:
      "How Hypertron is structured: web app, agent workflow, Soroban contracts, and Stellar.",
  },
  {
    slug: "architecture",
    eyebrow: "Topology",
    title: "High level architecture",
    subtitle:
      "Request flow from wallets through the Next.js BFF, agent workflow, and on chain settlement.",
  },
  {
    slug: "modules",
    eyebrow: "Code map",
    title: "Modules",
    subtitle: "Frontend route groups, backend services, and smart contract boundaries.",
    onThisPage: [
      { id: "frontend", title: "Frontend" },
      { id: "backend", title: "Backend (BFF + services)" },
      { id: "contracts-ref", title: "Smart contracts" },
    ],
  },
  {
    slug: "protocols",
    eyebrow: "Integrations",
    title: "Protocols integrated",
    subtitle: "Stellar, Soroban, CCTP, Privy, OpenAI, and wallet SDKs used across the stack.",
  },
  {
    slug: "data-model",
    eyebrow: "Persistence",
    title: "Data model",
    subtitle: "Prisma models on MongoDB: identity, payments, vault, and compliance data.",
  },
  {
    slug: "flows",
    eyebrow: "End to end",
    title: "End to end flows",
    subtitle: "Payment attribution, private withdrawal, USDC bridge, and compliance analysis.",
    onThisPage: [
      { id: "flow-payment", title: "Payment link & attribution" },
      { id: "flow-withdraw", title: "Private withdrawal" },
      { id: "flow-bridge", title: "USDC bridge (CCTP)" },
      { id: "flow-compliance", title: "AI compliance analysis" },
    ],
  },
  {
    slug: "privacy-payments",
    eyebrow: "Privacy",
    title: "Privacy payments",
    subtitle:
      "Operational vs cryptographic privacy, current PoolManager stack, Nethermind reference, and migration plan for opt-in ZK settlement.",
    onThisPage: [
      { id: "privacy-overview", title: "Overview" },
      { id: "real-vs-operational", title: "Real vs operational privacy" },
      { id: "reference-nethermind", title: "Nethermind reference" },
      { id: "current-architecture", title: "Current architecture (Phase 1)" },
      { id: "current-status", title: "Where we are today" },
      { id: "target-architecture", title: "Target architecture (Phase 2)" },
      { id: "migration-plan", title: "Migration plan" },
      { id: "dual-mode-checkout", title: "Opt-in dual-mode checkout" },
    ],
  },
  {
    slug: "contracts",
    eyebrow: "On chain",
    title: "Smart contracts & deployments",
    subtitle: "PoolManager interface, deployed testnet addresses, and build commands.",
  },
  {
    slug: "roadmap",
    eyebrow: "Status",
    title: "Work in progress",
    subtitle: "Shipped features, active work, and planned milestones before mainnet.",
  },
];

export function technicalHref(slug: string) {
  return `/doc/technical/${slug}`;
}

export function getTechnicalPage(slug: string): TechnicalPage | undefined {
  return TECHNICAL_PAGES.find((p) => p.slug === slug);
}

export function getAllTechnicalSlugs(): string[] {
  return TECHNICAL_PAGES.map((p) => p.slug);
}

export function getAdjacentTechnical(slug: string): {
  prev?: { slug: string; title: string };
  next?: { slug: string; title: string };
} {
  const idx = TECHNICAL_PAGES.findIndex((p) => p.slug === slug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? TECHNICAL_PAGES[idx - 1] : undefined,
    next: idx < TECHNICAL_PAGES.length - 1 ? TECHNICAL_PAGES[idx + 1] : undefined,
  };
}

/** @deprecated use TECHNICAL_PAGES */
export const TECHNICAL_SECTIONS = TECHNICAL_PAGES.map((p) => ({ id: p.slug, title: p.title }));
