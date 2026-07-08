import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "code-beat-theme";

/**
 * Inline-able script that applies the saved/system theme before first paint (no flash).
 * Rendered in the root shell.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

const listeners = new Set<() => void>();

function currentTheme(): Theme {
  if (typeof document !== "undefined") {
    const set = document.documentElement.dataset.theme;
    if (set === "light" || set === "dark") return set;
  }
  return "dark";
}

function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Shared, reactive theme. Every consumer re-renders on toggle (so JS-themed widgets like the
 * diff pane switch together with the CSS-variable surfaces).
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);
  return {
    theme,
    toggle: () => setTheme(currentTheme() === "dark" ? "light" : "dark"),
  };
}
