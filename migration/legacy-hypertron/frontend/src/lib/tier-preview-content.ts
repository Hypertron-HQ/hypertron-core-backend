import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  Users,
  ShieldCheck,
  Newspaper,
  Briefcase,
} from "lucide-react";
import type { WorkspaceTierId } from "@/lib/workspace-tier-context";

export type TierFeatureHighlight = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export const TIER_FEATURE_HIGHLIGHTS: Record<WorkspaceTierId, TierFeatureHighlight[]> = {
  "tier-1": [
    {
      title: "Payments on Stellar",
      description: "Stripe-class checkout flows on Stellar — links, receive, and settlement.",
      href: "/dashboard/payment-links",
      icon: CreditCard,
    },
    {
      title: "Employee management",
      description: "Roster, status, and HR-style operations for your team.",
      href: "/dashboard/employee-management",
      icon: Users,
    },
    {
      title: "Compliance analyser",
      description: "Upload policies and sites for automated regulatory analysis.",
      href: "/dashboard/compliance-agent",
      icon: ShieldCheck,
    },
  ],
  "tier-2": [
    {
      title: "Payments & opt-in privacy",
      description: "Public settlement plus optional privacy rails for sensitive flows.",
      href: "/dashboard/payment-links",
      icon: CreditCard,
    },
    {
      title: "Employee management",
      description: "Team directory, lifecycle, and operational readiness.",
      href: "/dashboard/employee-management",
      icon: Users,
    },
    {
      title: "Compliance analyser & execution",
      description: "From analysis to execution — policies, filings, and agent workflows.",
      href: "/dashboard/compliance-agent",
      icon: ShieldCheck,
    },
    {
      title: "RNS — Regulation News Sniper",
      description: "Curated regulatory and market news for your corridors.",
      href: "/dashboard/rns",
      icon: Newspaper,
    },
  ],
  "tier-3": [
    {
      title: "Payments & opt-in privacy",
      description: "Full payments stack with privacy options where you need them.",
      href: "/dashboard/payment-links",
      icon: CreditCard,
    },
    {
      title: "Employee management",
      description: "People operations aligned with compliance and delivery.",
      href: "/dashboard/employee-management",
      icon: Users,
    },
    {
      title: "Compliance analyser & execution",
      description: "End-to-end compliance posture with agent-backed execution.",
      href: "/dashboard/compliance-agent",
      icon: ShieldCheck,
    },
    {
      title: "RNS — Regulation News Sniper",
      description: "Stay ahead of rule changes that affect your products.",
      href: "/dashboard/rns",
      icon: Newspaper,
    },
    {
      title: "Escrow-based project management",
      description: "Milestone escrow on Stellar for delivery, reviews, and payouts.",
      href: "/dashboard/escrow",
      icon: Briefcase,
    },
  ],
};

export function tierTagline(tier: WorkspaceTierId): string {
  switch (tier) {
    case "tier-1":
      return "Foundation stack — payments, people, and compliance analysis.";
    case "tier-2":
      return "Growth stack — adds privacy payments, compliance execution, and RNS.";
    case "tier-3":
      return "Full stack — Tier 2 plus escrow-based project delivery.";
    default:
      return "";
  }
}
