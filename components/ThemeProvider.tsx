"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const VARS: Record<Theme, Record<string, string>> = {
  light: {
    "--bg-base":       "#F0EDE7",
    "--bg-surface":    "#FAFAF8",
    "--bg-raised":     "#F4F1EB",
    "--bg-input":      "#FFFFFF",
    "--border":        "#DDD8CE",
    "--border-subtle": "#EAE6DF",
    "--text-primary":  "#141210",
    "--text-secondary":"#5C5751",
    "--text-muted":    "#9C948A",
    "--red":           "#C8202E",
    "--red-dim":       "rgba(200,32,46,0.10)",
    "--amber":         "#B86E00",
    "--amber-dim":     "rgba(184,110,0,0.10)",
    "--green":         "#167A46",
    "--green-dim":     "rgba(22,122,70,0.10)",
    "--blue":          "#1D4ED8",
    "--blue-dim":      "rgba(29,78,216,0.10)",
    "--noise-opacity": "0.02",
  },
  dark: {
    "--bg-base":       "#08090D",
    "--bg-surface":    "#0D1018",
    "--bg-raised":     "#131825",
    "--bg-input":      "#0F1420",
    "--border":        "#1E2436",
    "--border-subtle": "#141929",
    "--text-primary":  "#DDE2F2",
    "--text-secondary":"#6E7894",
    "--text-muted":    "#3D4460",
    "--red":           "#E63946",
    "--red-dim":       "rgba(230,57,70,0.13)",
    "--amber":         "#F0A500",
    "--amber-dim":     "rgba(240,165,0,0.13)",
    "--green":         "#2DCA6F",
    "--green-dim":     "rgba(45,202,111,0.13)",
    "--blue":          "#3B82F6",
    "--blue-dim":      "rgba(59,130,246,0.13)",
    "--noise-opacity": "0.035",
  },
};

function buildStyle(theme: Theme) {
  return `:root{${Object.entries(VARS[theme]).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("khabri_theme");
    const resolved: Theme = saved === "dark" ? "dark" : "light";
    setTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("khabri_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      {/* Inject CSS vars directly — bypasses any CSS file caching issues */}
      <style
        dangerouslySetInnerHTML={{ __html: buildStyle(theme) }}
        suppressHydrationWarning
      />
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
