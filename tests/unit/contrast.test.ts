import { describe, expect, it } from "vitest";

// WCAG 1.4.3: text needs 4.5:1. Hex values are the Tailwind 4 palette and globals.css tokens.
// Keep in step with `viewClass` (src/components/beach-map.tsx) and the status/notice colours in
// live-refresh, beach-board, booking-panel, day-counts, search and area-tabs.

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string) {
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
  ["released (shares free colours)", "#14532d", "#f0fdf4"],
  ["sea band", "#0c4a6e", "#bae6fd"],
  ["tab, active", "#ffffff", "#075985"],
  ["notice, light", "#451a03", "#fef3c7"],
  ["notice, dark", "#fef3c7", "#451a03"],
];

const text: [string, string, string][] = [
  ["muted, light", "#4b5563", LIGHT],
  ["muted, dark", "#9ca3af", DARK],
  ["success, light", "#15803d", LIGHT],
  ["success, dark", "#4ade80", DARK],
  ["error, light", "#b91c1c", LIGHT],
  ["error, dark", "#f87171", DARK],
  ["warning text, light", "#92400e", LIGHT],
  ["warning text, dark", "#fcd34d", DARK],
  ["success strong, light", "#166534", LIGHT],
  ["tab, light", "#0c4a6e", LIGHT],
  ["tab, dark", "#bae6fd", DARK],
  ["info, light", "#1e40af", LIGHT],
  ["info, dark", "#93c5fd", DARK],
];

// WCAG 1.4.11: the focus ring needs 3:1 against what it sits on. Tiles use a black line with a
// white band inside it (beach-map.tsx), so the ring shows on every tile colour.
const ring: [string, string, string][] = [
  ["ring, light page", "#1d4ed8", LIGHT],
  ["ring, dark page", "#93c5fd", DARK],
];

describe("focus ring contrast", () => {
  it.each(ring)("%s is at least 3:1", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(tiles)("tile %s: black or white ring contrasts at least 3:1", (_name, _fg, bg) => {
    expect(Math.max(contrast("#000000", bg), contrast("#ffffff", bg))).toBeGreaterThanOrEqual(3);
  });
});

describe("text contrast", () => {
  it.each([...tiles, ...text])("%s is at least 4.5:1", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

// Date controls and the day strip (src/app/(app)/day-tone.tsx). Arturo's page is #fbf6ec, Sera's
// #16232f; Light/Dark strips use the Tailwind palette.
const ARTURO = "#fbf6ec";
const SERA = "#16232f";
const dayNav: [string, string, string][] = [
  ["past, Arturo", "#5a3a10", "#ece4d3"],
  ["past, Sera", "#d9cdb4", "#1e2f3d"],
  ["today, Arturo and Sera", "#fbf6ec", "#1f3d2b"],
  ["back to today", "#2a1402", "#ffc300"],
  ["ahead, Arturo outline", "#2a1402", ARTURO],
  ["ahead, Sera outline", "#fbf6ec", SERA],
  ["ahead, Arturo calendar and strip", "#2a1402", "#fde7cf"],
  ["ahead, Sera calendar and strip", "#fbf6ec", "#2a2418"],
  ["strip past, light", "#1f2937", "#f3f4f6"],
  ["strip past, dark", "#f3f4f6", "#1f2937"],
  ["strip ahead, light", "#461901", "#fffbeb"],
  ["strip ahead, dark", "#fffbeb", "#461901"],
];

describe("date controls contrast", () => {
  it.each(dayNav)("%s is at least 4.5:1", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["calendar icon on today, Arturo", "#1f3d2b", ARTURO],
    ["calendar icon on today, Sera", "#e8862a", SERA],
  ])("%s is at least 3:1", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
