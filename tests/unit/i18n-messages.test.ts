import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Messages = { [key: string]: string | Messages };

function loadMessages(locale: string): Messages {
  const path = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Messages;
}

function flatten(messages: unknown, prefix = ""): Record<string, unknown> {
  if (typeof messages !== "object" || messages === null || Array.isArray(messages)) {
    return { [prefix]: messages };
  }
  return Object.entries(messages).reduce<Record<string, unknown>>(
    (acc, [key, value]) => ({ ...acc, ...flatten(value, prefix ? `${prefix}.${key}` : key) }),
    {},
  );
}

/** ICU argument names: `{name}`, `{count, plural, ...}`, nested plural/select branches included. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*(?:,|\})/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

const it_ = flatten(loadMessages("it"));
const en = flatten(loadMessages("en"));
const files = { it: it_, en };

describe("message files", () => {
  it("it.json is non-empty and has the required keys", () => {
    const required = ["common.languageSwitcher.label", "home.title", "meta.title", "meta.description"];
    const missing = required.filter((key) => !(key in it_));
    expect(Object.keys(it_).length, "it.json is empty").toBeGreaterThan(0);
    expect(missing, `it.json is missing required keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("it.json and en.json have identical key sets", () => {
    const missingInEn = Object.keys(it_).filter((key) => !(key in en));
    const missingInIt = Object.keys(en).filter((key) => !(key in it_));
    expect(
      { missingInEn, missingInIt },
      `en.json missing: [${missingInEn.join(", ")}]; it.json missing: [${missingInIt.join(", ")}]`,
    ).toEqual({ missingInEn: [], missingInIt: [] });
  });

  it("every value is a non-empty string", () => {
    const bad = Object.entries(files).flatMap(([file, messages]) =>
      Object.entries(messages)
        .filter(([, value]) => typeof value !== "string" || value.trim() === "")
        .map(([key]) => `${file}.json:${key}`),
    );
    expect(bad, `empty or non-string values: ${bad.join(", ")}`).toEqual([]);
  });

  it("each key uses the same ICU placeholders in both files", () => {
    const mismatches = Object.keys(it_)
      .filter((key) => typeof it_[key] === "string" && typeof en[key] === "string")
      .filter(
        (key) =>
          placeholders(it_[key] as string).join(",") !== placeholders(en[key] as string).join(","),
      )
      .map(
        (key) =>
          `${key}: it {${placeholders(it_[key] as string)}} vs en {${placeholders(en[key] as string)}}`,
      );
    expect(mismatches, mismatches.join("; ")).toEqual([]);
  });
});

describe("placeholders helper", () => {
  it("extracts simple and plural argument names, ignoring plural branch text", () => {
    expect(placeholders("Ciao {name}")).toEqual(["name"]);
    expect(
      placeholders("{count, plural, =0 {nessun posto} one {# posto per {name}} other {# posti}}"),
    ).toEqual(["count", "name"]);
    expect(placeholders("Nessun argomento")).toEqual([]);
  });
});
