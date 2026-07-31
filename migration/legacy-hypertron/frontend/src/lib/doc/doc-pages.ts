export type DocNavGroup = {
  label: string;
  items: { slug: string; title: string }[];
};

export type DocQuickLink = {
  title: string;
  description: string;
  href: string;
  external?: boolean;
};

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "h2"; id: string; title: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; variant: "info" | "tip"; text: string }
  | { type: "external-link"; label: string; href: string };

export type DocPage = {
  slug: string;
  category: string;
  title: string;
  subtitle: string;
  quickLinks?: DocQuickLink[];
  blocks: DocBlock[];
};

export const DOC_NAV: DocNavGroup[] = [
  {
    label: "Get started",
    items: [
      { slug: "introduction", title: "Introduction" },
      { slug: "getting-started", title: "Getting started" },
      { slug: "workspaces", title: "Workspaces" },
    ],
  },
  {
    label: "Payments",
    items: [
      { slug: "payment-links", title: "Payment links" },
      { slug: "send-payments", title: "Send payments" },
      { slug: "checkout", title: "Public checkout" },
    ],
  },
  {
    label: "Treasury",
    items: [{ slug: "treasury", title: "Balance & withdrawals" }],
  },
  {
    label: "Privacy",
    items: [{ slug: "secure-vault", title: "Secure Vault" }],
  },
  {
    label: "Bridge",
    items: [{ slug: "bridge", title: "USDC bridge" }],
  },
  {
    label: "Account",
    items: [
      { slug: "billing", title: "Plans & billing" },
      { slug: "support", title: "Support & FAQ" },
    ],
  },
];

export const DOC_PAGES: Record<string, DocPage> = {
  introduction: {
    slug: "introduction",
    category: "Get started",
    title: "Hypertron user guide",
    subtitle:
      "Collect and send payments on Stellar, manage workspaces, and optionally use privacy tools and cross chain USDC bridging.",
    quickLinks: [
      {
        title: "Launch app",
        description: "Sign in and open your dashboard.",
        href: "/?launch=1",
      },
      {
        title: "Getting started",
        description: "Wallet, workspace, and first payment link.",
        href: "/doc/getting-started",
      },
      {
        title: "Payment links",
        description: "Create a link and get paid in XLM or USDC.",
        href: "/doc/payment-links",
      },
      {
        title: "Support",
        description: "FAQs and how to reach us.",
        href: "/doc/support",
      },
      {
        title: "Technical architecture",
        description: "System design, modules, flows, and contracts.",
        href: "/doc/technical/overview",
      },
    ],
    blocks: [
      {
        type: "p",
        text: "Hypertron helps businesses run B2B payment workflows on Stellar. You create workspaces, share payment links with customers, track incoming funds, and withdraw to your wallet when you are ready.",
      },
      {
        type: "h2",
        id: "who-its-for",
        title: "Who it is for",
      },
      {
        type: "ul",
        items: [
          "Teams that invoice or collect payments in XLM or USDC on Stellar.",
          "Businesses that want one dashboard for links, treasury, and workspace settings.",
          "Users comfortable connecting a Stellar wallet (Freighter) to sign transactions.",
        ],
      },
      {
        type: "h2",
        id: "what-you-can-do",
        title: "What you can do today",
      },
      {
        type: "ul",
        items: [
          "Create and manage payment links (Collect tab).",
          "Send outbound payments from the dashboard (Send tab).",
          "Share a public checkout page with each link (/pay/…).",
          "View workspace activity and withdraw pooled funds (Treasury).",
          "Use Secure Vault for optional private settlement on testnet.",
          "Bridge native USDC between Stellar, Ethereum, Avalanche, and Solana (Bridge page).",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "Hypertron currently targets Stellar testnet for most flows unless your deployment is configured for mainnet. Always confirm the network shown in Freighter before sending funds.",
      },
    ],
  },
  "getting-started": {
    slug: "getting-started",
    category: "Get started",
    title: "Getting started",
    subtitle: "Sign in, connect Freighter, and create your first workspace.",
    blocks: [
      {
        type: "h2",
        id: "sign-in",
        title: "Sign in",
      },
      {
        type: "ol",
        items: [
          "Open the app and choose Sign in from the home page.",
          "Complete sign in with email or social login (Privy).",
          "Connect Freighter when prompted so Hypertron can read your Stellar address and request signatures.",
        ],
      },
      {
        type: "h2",
        id: "wallet",
        title: "Set up Freighter",
      },
      {
        type: "ul",
        items: [
          "Install the Freighter browser extension if you have not already.",
          "Switch Freighter to the same network as the app (testnet or mainnet).",
          "On testnet, fund your account with XLM from Friendbot and add a USDC trustline if you plan to receive USDC.",
        ],
      },
      {
        type: "h2",
        id: "first-workspace",
        title: "Create a workspace",
      },
      {
        type: "ol",
        items: [
          "From the Workspaces hub, click Create Workspace.",
          "Follow the steps: business details, layout, and widgets you want enabled.",
          "Open the workspace from the hub to reach Overview, Payments, Treasury, and settings.",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Try the read only demo at /demo/dashboard if you want to explore the UI before connecting a wallet.",
      },
    ],
  },
  workspaces: {
    slug: "workspaces",
    category: "Get started",
    title: "Workspaces",
    subtitle: "How the hub, templates, and workspace settings fit together.",
    blocks: [
      {
        type: "h2",
        id: "hub",
        title: "Workspaces hub",
      },
      {
        type: "p",
        text: "The hub lists every workspace you own. From here you can create a new workspace, open an existing one, or manage account level pages like Billing and Support.",
      },
      {
        type: "h2",
        id: "templates",
        title: "Templates & My Templates",
      },
      {
        type: "p",
        text: "When you create a workspace you pick a starting layout. Saved layouts appear under My Templates so you can reuse the same dashboard structure for new clients or projects.",
      },
      {
        type: "h2",
        id: "settings",
        title: "Workspace settings",
      },
      {
        type: "ul",
        items: [
          "Open Settings inside a workspace to update business profile and enabled widgets.",
          "Employee Management lets you track team members when that widget is enabled.",
          "Theme (light or dark) is controlled from Account in the hub sidebar.",
        ],
      },
    ],
  },
  "payment-links": {
    slug: "payment-links",
    category: "Payments",
    title: "Payment links",
    subtitle: "Create shareable links so customers pay you in XLM or USDC on Stellar.",
    blocks: [
      {
        type: "h2",
        id: "create-link",
        title: "Create a link",
      },
      {
        type: "ol",
        items: [
          "Open Payments in your workspace and stay on the Collect tab.",
          "Enter amount, asset (XLM or USDC), and an optional memo or label.",
          "Generate the link and copy the URL or QR code to send to your customer.",
        ],
      },
      {
        type: "h2",
        id: "what-customers-see",
        title: "What customers see",
      },
      {
        type: "p",
        text: "Customers open your link on a public checkout page. They connect Freighter, review the amount, and approve the payment. You receive attribution via the link memo in your payment pool.",
      },
      {
        type: "h2",
        id: "manage-links",
        title: "Manage links",
      },
      {
        type: "ul",
        items: [
          "View active and past links from the same Payments screen.",
          "Each link maps to a unique checkout URL under /pay/…",
          "Amount and destination are encoded in the link; share the full URL unchanged.",
        ],
      },
    ],
  },
  "send-payments": {
    slug: "send-payments",
    category: "Payments",
    title: "Send payments",
    subtitle: "Pay suppliers or partners from the dashboard Send tab.",
    blocks: [
      {
        type: "h2",
        id: "send-flow",
        title: "How to send",
      },
      {
        type: "ol",
        items: [
          "Go to Payments and open the Send tab.",
          "Enter recipient Stellar address, amount, and asset.",
          "Review and sign with Freighter to broadcast the transaction.",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "Double check the recipient address and network. On chain payments cannot be reversed once confirmed.",
      },
    ],
  },
  checkout: {
    slug: "checkout",
    category: "Payments",
    title: "Public checkout",
    subtitle: "The /pay page your customers use to complete a payment link.",
    blocks: [
      {
        type: "h2",
        id: "checkout-flow",
        title: "Checkout flow",
      },
      {
        type: "ol",
        items: [
          "Customer opens the payment link you shared.",
          "They connect Freighter on the checkout page.",
          "They confirm amount, asset, and destination, then sign the transaction.",
          "A success state confirms the payment was submitted to the network.",
        ],
      },
      {
        type: "h2",
        id: "fees",
        title: "Fees & sponsorship",
      },
      {
        type: "p",
        text: "Depending on deployment settings, small checkout fees may be sponsored so your customer pays less XLM for network fees. This does not change the payment amount you requested.",
      },
    ],
  },
  treasury: {
    slug: "treasury",
    category: "Treasury",
    title: "Balance & withdrawals",
    subtitle: "Track pooled payments and withdraw to your wallet.",
    blocks: [
      {
        type: "h2",
        id: "overview",
        title: "Treasury overview",
      },
      {
        type: "p",
        text: "The Overview and Treasury areas summarize payment activity for the workspace. Incoming link payments are attributed to your pool using each link’s memo.",
      },
      {
        type: "h2",
        id: "withdraw",
        title: "Withdraw funds",
      },
      {
        type: "ol",
        items: [
          "Open Withdraw (Treasury) from the workspace sidebar.",
          "Choose amount and asset to withdraw to your connected Freighter address.",
          "Sign the withdrawal transaction when prompted.",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Ensure your Freighter account has enough XLM for transaction fees when withdrawing.",
      },
    ],
  },
  "secure-vault": {
    slug: "secure-vault",
    category: "Privacy",
    title: "Secure Vault",
    subtitle: "Optional privacy layer using on chain commitments (beta, testnet).",
    blocks: [
      {
        type: "h2",
        id: "what-it-is",
        title: "What Secure Vault does",
      },
      {
        type: "p",
        text: "Secure Vault lets you deposit funds into a commitment pool on Stellar testnet. Payments can reference this pool for private settlement flows instead of a plain public transfer, when enabled for your deployment.",
      },
      {
        type: "h2",
        id: "setup",
        title: "Before you use it",
      },
      {
        type: "ul",
        items: [
          "Connect Freighter on Stellar testnet with XLM for fees.",
          "Open Secure Vault from the workspace sidebar.",
          "Initialize the pool once, then add commitments as guided in the UI.",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "Secure Vault is a beta feature. Use testnet only until your operator confirms mainnet support.",
      },
    ],
  },
  bridge: {
    slug: "bridge",
    category: "Bridge",
    title: "USDC bridge",
    subtitle: "Move native USDC between Stellar, Ethereum, Avalanche, and Solana using Circle CCTP.",
    blocks: [
      {
        type: "h2",
        id: "overview",
        title: "Overview",
      },
      {
        type: "p",
        text: "The Bridge page burns USDC on the source chain and mints native USDC on the destination. Stellar routes use Freighter; EVM chains use MetaMask; Solana uses Phantom.",
      },
      {
        type: "h2",
        id: "wallets",
        title: "Wallets you need",
      },
      {
        type: "ul",
        items: [
          "Stellar: Freighter (required when Stellar is source or destination).",
          "Ethereum or Avalanche: MetaMask or another injected EVM wallet.",
          "Solana: Phantom.",
        ],
      },
      {
        type: "h2",
        id: "how-to-bridge",
        title: "How to bridge",
      },
      {
        type: "ol",
        items: [
          "Open Bridge from the workspace sidebar.",
          "Select source and destination networks and enter a USDC amount.",
          "Connect the wallets required for both sides.",
          "Click Bridge USDC and approve each step (approve, burn, wait for attestation, mint).",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "Attestation usually takes one to five minutes. Start with a small test amount. Network mode (testnet vs mainnet) must match your wallet networks.",
      },
    ],
  },
  billing: {
    slug: "billing",
    category: "Account",
    title: "Plans & billing",
    subtitle: "Workspace tiers and account settings from the hub.",
    blocks: [
      {
        type: "h2",
        id: "tiers",
        title: "Plans",
      },
      {
        type: "p",
        text: "Billing & Plans lives in the hub sidebar. Tiers describe workspace limits and features. Select a tier that matches your team size and payment volume.",
      },
      {
        type: "h2",
        id: "account",
        title: "Account settings",
      },
      {
        type: "ul",
        items: [
          "Update profile details from Account in the hub.",
          "View your connected wallet address.",
          "Switch light or dark theme for the dashboard.",
        ],
      },
    ],
  },
  support: {
    slug: "support",
    category: "Account",
    title: "Support & FAQ",
    subtitle: "Common questions and how to contact the team.",
    blocks: [
      {
        type: "h2",
        id: "faq",
        title: "Frequently asked questions",
      },
      {
        type: "p",
        text: "How do I create a new workspace? From the Workspaces hub, click Create Workspace and complete the setup steps. You can start from a template to move faster.",
      },
      {
        type: "p",
        text: "How do I change my plan? Open Billing & Plans in the hub, choose a tier, and click Update plan.",
      },
      {
        type: "p",
        text: "How is my data secured? Wallet access uses Freighter. Sensitive workspace documents can use Secure Vault encryption when that feature is enabled for your deployment.",
      },
      {
        type: "p",
        text: "Can I invite team members? Yes. With Employee Management enabled in your workspace, invite members by email or wallet address.",
      },
      {
        type: "h2",
        id: "contact",
        title: "Get support",
      },
      {
        type: "p",
        text: "Support is on X only. Message us or follow @hypertron_HQ for help and product updates.",
      },
      {
        type: "external-link",
        label: "@hypertron_HQ on X",
        href: "https://x.com/hypertron_HQ",
      },
    ],
  },
};

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES[slug];
}

export function getDocHeadings(page: DocPage): { id: string; title: string }[] {
  return page.blocks.filter((b): b is Extract<DocBlock, { type: "h2" }> => b.type === "h2").map((b) => ({
    id: b.id,
    title: b.title,
  }));
}

export function getAllDocSlugs(): string[] {
  return Object.keys(DOC_PAGES);
}

export function getAdjacentDocs(slug: string): { prev?: { slug: string; title: string }; next?: { slug: string; title: string } } {
  const flat = DOC_NAV.flatMap((g) => g.items);
  const idx = flat.findIndex((i) => i.slug === slug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? flat[idx - 1] : undefined,
    next: idx < flat.length - 1 ? flat[idx + 1] : undefined,
  };
}
