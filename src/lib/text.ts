import { z } from "zod";

// A NUL breaks Postgres text (a 500 that can log the row). Other control characters, invisible
// format characters such as bidi overrides (U+202E can make "Rossi" display as "issoR") and line
// separators only disguise a name. Zero-width (non-)joiners stay: some names and emoji need them.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const KEPT = new Set(["\u200C", "\u200D"]);
// Notes also keep line breaks and tabs.
const KEPT_IN_NOTES = new Set([...KEPT, "\n", "\t"]);

const strip = (text: string, kept: Set<string>) =>
  text.replace(INVISIBLE, (char) => (kept.has(char) ? char : ""));

/** Text without characters that break storage or hide what a name really says. */
export function stripInvisible(text: string): string {
  return strip(text, KEPT);
}

/** A required one-line name: control characters dropped, trimmed, 1 to `max` characters. */
export function singleLine(max: number) {
  return z.string().overwrite(stripInvisible).trim().min(1).max(max);
}

/** Free text that may span lines: control characters other than line breaks and tabs dropped. */
export function multiLine(max: number) {
  return z
    .string()
    .overwrite((text) => strip(text.replace(/\r\n?/g, "\n"), KEPT_IN_NOTES))
    .trim()
    .max(max);
}
