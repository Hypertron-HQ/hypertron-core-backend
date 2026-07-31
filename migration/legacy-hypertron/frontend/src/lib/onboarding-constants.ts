import {
  CreditCard,
  FileText,
  Bot,
  Users,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export const BUSINESS_NATURES = [
  { value: "agency", label: "Agency" },
  { value: "rwa", label: "RWA (Real World Assets)" },
  { value: "fintech", label: "Fintech" },
  { value: "marketplace", label: "Marketplace" },
  { value: "saas", label: "SaaS" },
  { value: "other", label: "Other" },
] as const;

export const WIDGETS: { id: string; label: string; description: string; icon: LucideIcon }[] = [
  { id: "payments", label: "Payments solution", description: "Accept and manage payments", icon: CreditCard },
  { id: "doc-hub", label: "Doc hub", description: "Store and manage documents", icon: FileText },
  { id: "ai-assistant", label: "AI assistant", description: "Smart automation and support", icon: Bot },
  { id: "employee-mgmt", label: "Employee management", description: "Team and HR tools", icon: Users },
  { id: "compliance", label: "Compliance Agent", description: "Regulatory and policy checks", icon: ShieldCheck },
];

export const BUSINESS_TO_WIDGETS: Record<string, string[]> = {
  agency: ["payments", "doc-hub", "ai-assistant", "employee-mgmt"],
  rwa: ["payments", "doc-hub", "compliance"],
  fintech: ["payments", "doc-hub", "ai-assistant", "compliance"],
  marketplace: ["payments", "doc-hub", "ai-assistant"],
  saas: ["payments", "doc-hub", "ai-assistant", "employee-mgmt"],
  other: ["payments", "doc-hub"],
};
