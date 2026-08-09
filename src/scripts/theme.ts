const THEME_KEY = "aman-theme";
type ThemeMode = "system" | "light" | "dark";

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === "system" || value === "light" || value === "dark";

const getStoredMode = (): ThemeMode => {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isThemeMode(value) ? value : "dark";
  } catch {
    return "dark";
  }
};

const prefersDark = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

const resolvedTheme = (mode: ThemeMode) =>
  mode === "dark" || (mode === "system" && prefersDark()) ? "dark" : "light";

const updateThemeMeta = (theme: "light" | "dark") => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#02050b" : "#f5f3ed";
};

const modeLabel = (mode: ThemeMode, theme: "light" | "dark") =>
  mode === "system" ? `System (${theme})` : mode[0].toUpperCase() + mode.slice(1);

const applyTheme = (mode: ThemeMode) => {
  const theme = resolvedTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themeMode = mode;
  root.style.colorScheme = theme;
  updateThemeMeta(theme);
  const label = modeLabel(mode, theme);
  document.querySelectorAll<HTMLElement>("[data-theme-label]").forEach((node) => {
    node.textContent = label;
  });
  document.querySelectorAll<HTMLElement>("[data-theme-toggle]").forEach((node) => {
    node.setAttribute("aria-label", `Color theme: ${label}. Activate to change`);
    node.setAttribute("title", `Color theme: ${label}`);
    node.dataset.themeMode = mode;
  });
};

const persistMode = (mode: ThemeMode) => {
  try { window.localStorage.setItem(THEME_KEY, mode); } catch { /* private mode */ }
};

const nextMode = (mode: ThemeMode): ThemeMode =>
  mode === "system" ? "light" : mode === "light" ? "dark" : "system";

const startThemeController = () => {
  let mode = getStoredMode();
  applyTheme(mode);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest<HTMLElement>("[data-theme-toggle]");
    if (!toggle) return;
    mode = nextMode(mode);
    persistMode(mode);
    applyTheme(mode);
  });

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener("change", () => {
    if (mode === "system") applyTheme(mode);
  });
};

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startThemeController, { once: true });
  } else {
    startThemeController();
  }
}
