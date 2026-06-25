import type { CSSProperties } from "react";

/** Theme tokens — each maps to a `--bgt-*` CSS variable on the widget root. */
export interface BugReportTheme {
  accent?: string;
  accentHover?: string;
  accentFg?: string;
  bg?: string;
  fg?: string;
  muted?: string;
  border?: string;
  radius?: string;
}

const VAR_MAP: Record<keyof BugReportTheme, string> = {
  accent: "--bgt-accent",
  accentHover: "--bgt-accent-hover",
  accentFg: "--bgt-accent-fg",
  bg: "--bgt-bg",
  fg: "--bgt-fg",
  muted: "--bgt-muted",
  border: "--bgt-border",
  radius: "--bgt-radius",
};

/** Turns a theme object into inline CSS-variable overrides. */
export function themeVars(theme?: BugReportTheme): CSSProperties {
  const out: Record<string, string> = {};
  if (!theme) return out;
  for (const [key, cssVar] of Object.entries(VAR_MAP)) {
    const value = theme[key as keyof BugReportTheme];
    if (value) out[cssVar] = value;
  }
  return out as CSSProperties;
}
