export type DashboardTheme = "dark" | "light";

export const DASHBOARD_THEME_STORAGE_KEY = "hypertron-dashboard-theme";
export const DASHBOARD_THEME_UPDATED_EVENT = "hypertron-dashboard-theme-updated";
export const DASHBOARD_THEME_DEFAULT: DashboardTheme = "light";

export function getStoredDashboardTheme(): DashboardTheme {
  if (typeof window === "undefined") return DASHBOARD_THEME_DEFAULT;

  const fromDom = document.documentElement.getAttribute("data-dashboard-theme");
  if (fromDom === "light" || fromDom === "dark") return fromDom;

  const stored = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return DASHBOARD_THEME_DEFAULT;
}

export function setStoredDashboardTheme(theme: DashboardTheme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, theme);
  document.documentElement.setAttribute("data-dashboard-theme", theme);
  document.documentElement.style.colorScheme = theme;
  document.cookie = `${DASHBOARD_THEME_STORAGE_KEY}=${theme};path=/;max-age=31536000;SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(DASHBOARD_THEME_UPDATED_EVENT, { detail: theme }));
}

/** Inline in root layout `<head>` so the first paint matches saved theme. */
export const DASHBOARD_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(DASHBOARD_THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t=${JSON.stringify(DASHBOARD_THEME_DEFAULT)};document.documentElement.setAttribute("data-dashboard-theme",t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;
