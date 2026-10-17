/**
 * Single source of truth for branding. A rebrand is a change to this file
 * (plus dropping new image files into /public if the logo changes).
 *
 * Colors are injected as CSS variables in the root layout; every component
 * uses the design tokens in globals.css, never these hex values directly.
 */
export const brand = {
  name: "PPI Form",
  orgName: "PPI Malaysia",
  logo: "/logo.png",
  favicon: "/favicon.png",
  colors: {
    /** Brand red from the PPI logo. Accent only (focus bars, links, highlights). */
    accent: "#E8080A",
    /** Darker red for filled buttons: white text on it is 6.0:1 (AA; #E8080A is only 4.7:1). */
    primary: "#C80609",
    primaryForeground: "#FFFFFF",
    /** Near-black for text and headings. */
    ink: "#111111",
    /** Secondary text. 6.0:1 on white, 5.5:1 on canvas (AA). */
    inkMuted: "#5F6368",
    surface: "#FFFFFF",
    /** Page background behind cards (Google Forms–style light grey). */
    canvas: "#F4F4F5",
    border: "#E4E4E7",
    danger: "#B91C1C",
    /** "Accepting responses" status. 5.5:1 on white. */
    success: "#047857",
  },
  /** Multi-series chart palette: red, black, greys, then a few neutral supporting hues. */
  chartPalette: ["#E8080A", "#111111", "#71717A", "#A1A1AA", "#7F1D1D", "#0F766E", "#B45309", "#334155"],
} as const;

export type Brand = typeof brand;

/** CSS custom properties derived from the brand, consumed by globals.css. */
export function brandCssVariables(): string {
  const c = brand.colors;
  const vars: Record<string, string> = {
    "--brand-accent": c.accent,
    "--brand-primary": c.primary,
    "--brand-primary-foreground": c.primaryForeground,
    "--brand-ink": c.ink,
    "--brand-ink-muted": c.inkMuted,
    "--brand-surface": c.surface,
    "--brand-canvas": c.canvas,
    "--brand-border": c.border,
    "--brand-danger": c.danger,
    "--brand-success": c.success,
  };
  brand.chartPalette.forEach((color, i) => {
    vars[`--brand-chart-${i + 1}`] = color;
  });
  return `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}
