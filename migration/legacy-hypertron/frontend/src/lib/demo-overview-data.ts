export const DEMO_OPERATIONS = [
  { label: "Client Onboarding", count: "7 in progress" },
  { label: "Contributor Onboarding", count: "5 in progress" },
  { label: "Agency Onboarding", count: "3 in progress" },
  { label: "Workflows", count: "5 active" },
] as const;

export const DEMO_EXPENSES = [
  { name: "Infrastructure", value: 42 },
  { name: "Payroll", value: 78 },
  { name: "Marketing", value: 28 },
  { name: "Operations", value: 35 },
  { name: "Others", value: 18 },
] as const;

export const DEMO_COMPLIANCE_NEWS = [
  {
    level: "High Impact",
    color: "text-red-600 bg-red-50 border-red-100",
    title: "EU MiCA reporting deadline moved up",
  },
  {
    level: "Medium Impact",
    color: "text-amber-700 bg-amber-50 border-amber-100",
    title: "US stablecoin guidance — draft comment period",
  },
  {
    level: "Low Impact",
    color: "text-emerald-700 bg-emerald-50 border-emerald-100",
    title: "Stellar foundation network upgrade notice",
  },
] as const;

export const DEMO_TREASURY_SERIES = [
  { date: "Apr 20", value: 4200 },
  { date: "Apr 24", value: 5800 },
  { date: "Apr 28", value: 7100 },
  { date: "May 2", value: 8900 },
  { date: "May 8", value: 10200 },
  { date: "May 14", value: 11800 },
  { date: "Jun 1", value: 13450 },
] as const;

export const DEMO_REGULATORY = {
  regulations: 3,
  updates: 5,
  deadlines: 2,
  highRisk: 2,
  mediumRisk: 5,
  lowRisk: 8,
} as const;

export type DemoPaymentSlice = {
  name: string;
  count: number;
  volume: number;
  color: string;
};

export const DEMO_PAYMENT_BREAKDOWN: DemoPaymentSlice[] = [
  { name: "Completed", count: 42, volume: 14820, color: "#60a5fa" },
  { name: "Pending", count: 5, volume: 1870, color: "#fbbf24" },
  { name: "Failed", count: 2, volume: 640, color: "#fca5a5" },
  { name: "Expired", count: 1, volume: 320, color: "#94a3b8" },
];
