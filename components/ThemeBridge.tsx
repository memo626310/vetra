"use client";

import { useLayoutEffect } from "react";
import { applyVetraTheme, readVetraTheme, type VetraTheme, VETRA_THEME_EVENT } from "@/lib/theme";

export default function ThemeBridge() {
  useLayoutEffect(() => {
    const syncTheme = () => {
      const saved = window.localStorage.getItem("vetra-theme");
      const darkThemes: VetraTheme[] = ["midnight", "ocean", "violet"];
      let theme: VetraTheme;

      if (saved === "dark") {
        const lastDark = window.localStorage.getItem("vetra-last-dark-theme");
        theme = darkThemes.includes(lastDark as VetraTheme) ? lastDark as VetraTheme : "midnight";
        window.localStorage.setItem("vetra-theme", theme);
      } else {
        theme = readVetraTheme();
      }

      if (theme !== "light") window.localStorage.setItem("vetra-last-dark-theme", theme);
      else {
        const current = document.documentElement.dataset.vetraTheme;
        if (current && darkThemes.includes(current as VetraTheme)) {
          window.localStorage.setItem("vetra-last-dark-theme", current);
        }
      }

      applyVetraTheme(theme);
    };
    syncTheme();
    window.addEventListener(VETRA_THEME_EVENT, syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener(VETRA_THEME_EVENT, syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  return null;
}
