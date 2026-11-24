const EUROS = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/**
 * Euros as an admin types them ("77", "77,5", "77.50", "€ 77") to whole cents. Null for anything
 * else; blank input is `"blank"`. Thousands separators are not accepted: "1.234" would be ambiguous.
 */
export function parseEuros(text: string): number | "blank" | null {
  const trimmed = text.replace(/€/g, "").trim();
  if (trimmed === "") return "blank";
  const match = EUROS.exec(trimmed);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Cents as an editable euro amount: "77" or "77.50" (no currency sign, no grouping). */
export function centsToInput(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}
