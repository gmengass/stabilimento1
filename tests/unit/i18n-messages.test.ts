import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type Messages = { [key: string]: string | Messages };

function load(locale: string): Record<string, unknown> {
  const path = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
  return flatten(JSON.parse(readFileSync(path, "utf8")) as Messages);
}

function flatten(tree: Messages, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/**
 * Top-level ICU argument names: `{name}`, `{n, plural, ...}`, `{d, date}`.
 * Skips nested sub-messages and apostrophe-quoted literals ('{' or '{text}').
 */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  let i = 0;
  while (i < message.length) {
    const ch = message[i];
    if (ch === "'") {
      if (message[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (message[i + 1] === "{" || message[i + 1] === "}") {
        const end = message.indexOf("'", i + 1);
        i = end === -1 ? message.length : end + 1;
        continue;
      }
    }
    if (ch === "{") {
      if (depth === 0) {
        const match = /^\{\s*([^\s,{}]+)\s*[,}]/.exec(message.slice(i));
        if (match) names.add(match[1]);
      }
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    i++;
  }
  return [...names].sort();
}

describe("placeholders helper", () => {
  it("extracts top-level argument names only", () => {
    expect(
      placeholders("Hi {name}, {count, plural, one {# item for {who}} other {# items}}"),
    ).toEqual(["count", "name"]);
    expect(placeholders("Plain text")).toEqual([]);
    expect(placeholders("Literal '{braces}' and {real}")).toEqual(["real"]);
  });
});

describe("message catalogs", () => {
  let itMessages: Record<string, unknown> = {};
  let enMessages: Record<string, unknown> = {};

  beforeAll(() => {
    itMessages = load("it");
    enMessages = load("en");
  });

  it("have identical key sets", () => {
    expect(Object.keys(enMessages).sort()).toEqual(Object.keys(itMessages).sort());
  });

  it.each(["it", "en"])("%s has only non-empty string values", (locale) => {
    const messages = locale === "it" ? itMessages : enMessages;
    expect(Object.keys(messages).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(messages)) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
    }
  });

  it("use the same ICU placeholders per key", () => {
    for (const key of Object.keys(itMessages)) {
      if (!(key in enMessages)) continue;
      expect(placeholders(String(enMessages[key])), key).toEqual(
        placeholders(String(itMessages[key])),
      );
    }
  });

  it.each([
    "metadata.title",
    "metadata.description",
    "home.title",
    "languageSwitcher.label",
    "languageSwitcher.it",
    "languageSwitcher.en",
  ])("define required key %s", (key) => {
    expect(itMessages).toHaveProperty([key]);
    expect(enMessages).toHaveProperty([key]);
  });
});
