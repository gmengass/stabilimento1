import { describe, expect, it } from "vitest";

// WCAG 1.4.3: text needs 4.5:1. Hex values are the Tailwind 4 palette and globals.css tokens.

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const LIGHT = "#ffffff";
const DARK = "#0a0a0a";

const tiles: [string, string, string][] = [
  ["free", "#14532d", "#f0fdf4"],
  ["noShow", "#451a03", "#fffbeb"],
  ["selected", "#ffffff", "#2563eb"],
  ["booked", "#450a0a", "#fee2e2"],
  ["checkedIn", "#042f2e", "#ccfbf1"],
  ["season", "#2e1065", "#ede9fe"],
  ["open", "#ffffff", "#b91c1c"],
  ["sea band", "#0c4a6e", "#bae6fd"],
];

const text: [string, string, string][] = [
  ["muted, light", "#4b5563", LIGHT],
  ["muted, dark", "#9ca3af", DARK],
  ["success, light", "#15803d", LIGHT],
  ["success, dark", "#4ade80", DARK],
  ["error, light", "#b91c1c", LIGHT],
  ["error, dark", "#f87171", DARK],
  ["info, light", "#1e40af", LIGHT],
  ["info, dark", "#93c5fd", DARK],
];

describe("text contrast", () => {
  it.each([...tiles, ...text])("%s is at least 4.5:1", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
