export type VetraTheme = "midnight" | "ocean" | "violet" | "light";

const THEME_KEY = "vetra-theme";
const LAST_DARK_THEME_KEY = "vetra-last-dark-theme";
const THEME_EVENT = "vetra:theme-change";

const isTheme = (value: string | null): value is VetraTheme =>
  value === "midnight" || value === "ocean" || value === "violet" || value === "light";

export function readVetraTheme(): VetraTheme {
  if (typeof window === "undefined") return "midnight";
  const saved = window.localStorage.getItem(THEME_KEY);
  if (isTheme(saved)) return saved;
  if (saved === "dark") return "midnight";
  return "midnight";
}

export function writeVetraTheme(theme: VetraTheme) {
  if (typeof window === "undefined") return;
  const current = readVetraTheme();
  if (current !== "light") window.localStorage.setItem(LAST_DARK_THEME_KEY, current);
  if (theme !== "light") window.localStorage.setItem(LAST_DARK_THEME_KEY, theme);
  window.localStorage.setItem(THEME_KEY, theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function writeVetraThemeMode(dark: boolean) {
  if (typeof window === "undefined") return;
  if (!dark) {
    writeVetraTheme("light");
    return;
  }
  const current = readVetraTheme();
  if (current !== "light") {
    writeVetraTheme(current);
    return;
  }
  const lastDark = window.localStorage.getItem(LAST_DARK_THEME_KEY);
  writeVetraTheme(isTheme(lastDark) && lastDark !== "light" ? lastDark : "midnight");
}

export function applyVetraTheme(theme: VetraTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.vetraTheme = theme;
  document.documentElement.classList.toggle("dark", theme !== "light");
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
}

export const VETRA_THEME_EVENT = THEME_EVENT;
