import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import "../theme.css";

type Theme = "light" | "dark";
const preferenceKey = "headroom-theme-v1";

export function initialiseTheme(): Theme {
  let theme: Theme = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {
    /* The system preference works when storage is unavailable. */
  }
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(preferenceKey, next);
    } catch {
      /* Keep the choice for this page. */
    }
  }
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-label="Dark mode"
      aria-checked={theme === "dark"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={toggle}
    >
      {theme === "dark" ? (
        <Moon size={15} aria-hidden="true" />
      ) : (
        <Sun size={15} aria-hidden="true" />
      )}
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
