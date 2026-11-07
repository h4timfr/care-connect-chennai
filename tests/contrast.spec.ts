import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// WCAG AA contrast for the theme tokens in src/styles.css, computed from their OKLCH values
// (translucent tints are blended over the card colour, as rendered).

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

function tokens(selector: string) {
  const body = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*oklch\(([^)]*)\)/g)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

const light = tokens(":root");
const dark = { ...light, ...tokens(".dark") };

type Rgb = [number, number, number];

function oklchToLinear(value: string): Rgb {
  const [L, C, h] = value.replace("/", " ").split(/\s+/).map(Number) as [number, number, number];
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const encode = (x: number) => (x > 0.0031308 ? 1.055 * x ** (1 / 2.4) - 0.055 : 12.92 * x);
const decode = (x: number) => (x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92);
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function colour(theme: Record<string, string>, name: string, alpha = 1): Rgb {
  const rgb = oklchToLinear(theme[name]!);
  if (alpha === 1) return rgb;
  const base = oklchToLinear(theme["card"]!);
  return rgb.map((c, i) => decode(alpha * encode(c) + (1 - alpha) * encode(base[i]!))) as Rgb;
}

function contrast(theme: Record<string, string>, fg: string, bg: string, bgAlpha = 1) {
  const a = luminance(colour(theme, fg));
  const b = luminance(colour(theme, bg, bgAlpha));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// [label, foreground token, background token, background alpha]
const PAIRS: Record<"light" | "dark", [string, string, string, number][]> = {
  light: [
    ["body text", "foreground", "background", 1],
    ["muted text", "muted-foreground", "background", 1],
    ["muted text on muted", "muted-foreground", "muted", 1],
    ["primary button", "primary-foreground", "primary", 1],
    ["active nav item", "primary", "primary-soft", 1],
    ["destructive button", "destructive-foreground", "destructive", 1],
    ["error alert", "destructive", "destructive", 0.1],
    ["awaiting-confirmation badge", "warning-foreground", "warning", 0.15],
    ["sample-listing badge", "warning-foreground", "warning", 0.1],
    ["confirmed badge", "success", "success", 0.15],
    ["arrived badge", "info", "info", 0.15],
    ["cancelled badge", "destructive", "destructive", 0.12],
    ["highlight call to action", "highlight-foreground", "highlight", 1],
    ["active nav item / verified badge", "highlight", "highlight-soft", 1],
    ["select option text", "popover-foreground", "popover", 1],
    ["form control text", "foreground", "card", 1],
    ["link text on card", "primary", "card", 1],
  ],
  dark: [
    ["body text", "foreground", "background", 1],
    ["muted text", "muted-foreground", "background", 1],
    ["muted text on muted", "muted-foreground", "muted", 1],
    ["primary button", "primary-foreground", "primary", 1],
    ["active nav item", "primary", "primary-soft", 1],
    ["destructive button", "destructive-foreground", "destructive", 1],
    ["error alert", "destructive", "destructive", 0.1],
    ["awaiting-confirmation badge", "warning", "warning", 0.15],
    ["sample-listing badge", "warning", "warning", 0.1],
    ["confirmed badge", "success", "success", 0.15],
    ["arrived badge", "info", "info", 0.15],
    ["cancelled badge", "destructive", "destructive", 0.12],
    ["highlight call to action", "highlight-foreground", "highlight", 1],
    ["active nav item / verified badge", "highlight", "highlight-soft", 1],
    ["select option text", "popover-foreground", "popover", 1],
    ["form control text", "foreground", "card", 1],
    ["link text on card", "primary", "card", 1],
  ],
};

for (const [themeName, theme] of [
  ["light", light],
  ["dark", dark],
] as const) {
  test(`${themeName} theme text meets WCAG AA contrast`, () => {
    const failures = PAIRS[themeName]
      .map(([label, fg, bg, alpha]) => [label, contrast(theme, fg, bg, alpha)] as const)
      .filter(([, ratio]) => ratio < 4.5)
      .map(([label, ratio]) => `${label}: ${ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  });
}
