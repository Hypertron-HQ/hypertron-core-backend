/**
 * Saved templates (dashboard bundles) from Compliance Maker.
 * Primary persistence uses /api/templates (MongoDB via Prisma),
 * with localStorage retained as fallback for disconnected wallets.
 */
const MY_TEMPLATES_KEY = "hypertron_my_templates";

export type WidgetType = "chart" | "metric" | "table" | "alert";

export type WidgetSettings = {
  dataSource: "mock" | "coingecko" | "stellar" | "custom-api";
  refresh: "realtime" | "1m" | "5m" | "15m" | "1h";
  deployment: "local" | "staging" | "prod";
  parameters: string;
};

export type DashboardWidget = {
  id: string;
  widgetId: string;
  title: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  settings: WidgetSettings;
};

export function defaultWidgetSettings(): WidgetSettings {
  return {
    dataSource: "mock",
    refresh: "5m",
    deployment: "local",
    parameters: "",
  };
}

/** Legacy shape for templates that only stored minimal widget info */
export type SavedTemplateWidget = {
  id: string;
  title: string;
  type: string;
  category?: string;
};

export type SavedTemplate = {
  id: string;
  name: string;
  businessName?: string;
  savedAt: string;
  bundleId: string;
  bundleName: string;
  description?: string;
  /** Full workspace layout; when present, workspace loads these. */
  widgets?: DashboardWidget[];
};

function isValidWalletAddress(walletAddress: string | null | undefined): boolean {
  const s = (walletAddress ?? "").trim();
  return s.length === 56 && s.startsWith("G");
}

function loadSavedTemplatesFromLocal(): SavedTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplateToLocal(
  template: Omit<SavedTemplate, "id" | "savedAt"> & { widgets?: DashboardWidget[] }
): SavedTemplate {
  const list = loadSavedTemplatesFromLocal();
  const newOne: SavedTemplate = {
    ...template,
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    savedAt: new Date().toISOString(),
  };
  list.unshift(newOne);
  window.localStorage.setItem(MY_TEMPLATES_KEY, JSON.stringify(list));
  return newOne;
}

function updateTemplateInLocal(
  id: string,
  updates: Partial<Pick<SavedTemplate, "name" | "description" | "widgets">>
): SavedTemplate | null {
  const list = loadSavedTemplatesFromLocal();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates, savedAt: new Date().toISOString() };
  window.localStorage.setItem(MY_TEMPLATES_KEY, JSON.stringify(list));
  return list[idx];
}

type ApiTemplate = {
  id: string;
  name: string;
  businessName?: string | null;
  savedAt: string;
  bundleId: string;
  bundleName: string;
  description?: string | null;
  widgets?: unknown;
};

function normalizeTemplate(raw: ApiTemplate): SavedTemplate {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    businessName: typeof raw.businessName === "string" ? raw.businessName : undefined,
    savedAt: String(raw.savedAt),
    bundleId: String(raw.bundleId ?? ""),
    bundleName: String(raw.bundleName ?? ""),
    description: typeof raw.description === "string" ? raw.description : undefined,
    widgets: Array.isArray(raw.widgets) ? (raw.widgets as DashboardWidget[]) : [],
  };
}

export function loadSavedTemplatesLocal(): SavedTemplate[] {
  return loadSavedTemplatesFromLocal();
}

export async function loadSavedTemplates(
  walletAddress?: string | null
): Promise<SavedTemplate[]> {
  if (!isValidWalletAddress(walletAddress)) {
    return loadSavedTemplatesFromLocal();
  }
  try {
    const res = await fetch("/api/templates", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return loadSavedTemplatesFromLocal();
    const json = (await res.json().catch(() => ({}))) as { templates?: ApiTemplate[] };
    return Array.isArray(json.templates) ? json.templates.map(normalizeTemplate) : [];
  } catch {
    return loadSavedTemplatesFromLocal();
  }
}

export async function getTemplateById(
  id: string,
  walletAddress?: string | null
): Promise<SavedTemplate | null> {
  if (!id) return null;
  if (!isValidWalletAddress(walletAddress)) {
    return loadSavedTemplatesFromLocal().find((t) => t.id === id) ?? null;
  }
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { template?: ApiTemplate };
    return json.template ? normalizeTemplate(json.template) : null;
  } catch {
    return null;
  }
}

export async function saveTemplate(
  template: Omit<SavedTemplate, "id" | "savedAt"> & { widgets?: DashboardWidget[] },
  walletAddress?: string | null
): Promise<SavedTemplate> {
  if (!isValidWalletAddress(walletAddress)) {
    return saveTemplateToLocal(template);
  }
  try {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        ...template,
      }),
    });
    if (!res.ok) return saveTemplateToLocal(template);
    const json = (await res.json().catch(() => ({}))) as { template?: ApiTemplate };
    return json.template ? normalizeTemplate(json.template) : saveTemplateToLocal(template);
  } catch {
    return saveTemplateToLocal(template);
  }
}

export async function updateTemplate(
  id: string,
  updates: Partial<Pick<SavedTemplate, "name" | "description" | "widgets">>,
  walletAddress?: string | null
): Promise<SavedTemplate | null> {
  if (!isValidWalletAddress(walletAddress)) {
    return updateTemplateInLocal(id, updates);
  }
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        ...updates,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { template?: ApiTemplate };
    return json.template ? normalizeTemplate(json.template) : null;
  } catch {
    return null;
  }
}

/** Build DashboardWidget[] from a Compliance Maker bundle (e.g. when saving from Onboarding). */
export function widgetsFromBundle(bundle: {
  widgets?: Array< { id: string; title: string; type: string }>;
}): DashboardWidget[] {
  const list = bundle?.widgets ?? [];
  const settings = defaultWidgetSettings();
  return list.map((w, i) => {
    const col = (i % 4) * 3;
    const row = Math.floor(i / 4) * 5;
    return {
      id: `dw-${Date.now()}-${i}`,
      widgetId: String(w.id || `widget-${i}`),
      title: String(w.title || w.id || `Widget ${i + 1}`),
      type: (w.type as WidgetType) || "chart",
      x: col,
      y: row,
      w: 3,
      h: 5,
      settings,
    };
  });
}
