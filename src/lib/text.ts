import { z } from "zod";

// A NUL breaks Postgres text (a 500 that can log the row); other control characters only
// confuse whoever reads the name later.
const CONTROL = /\p{Cc}/gu;
// Notes keep line breaks and tabs.
const CONTROL_BUT_LINES = /[^\P{Cc}\n\t]/gu;

/** A required one-line name: control characters dropped, trimmed, 1 to `max` characters. */
export function singleLine(max: number) {
  return z
    .string()
    .overwrite((text) => text.replace(CONTROL, ""))
    .trim()
    .min(1)
    .max(max);
}

/** Free text that may span lines: control characters other than line breaks and tabs dropped. */
export function multiLine(max: number) {
  return z
    .string()
    .overwrite((text) => text.replace(/\r\n?/g, "\n").replace(CONTROL_BUT_LINES, ""))
    .trim()
    .max(max);
}
