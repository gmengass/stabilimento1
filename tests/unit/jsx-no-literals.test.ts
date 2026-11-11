import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId ?? "");
}

describe("no hard-coded UI strings (ADR 0005)", () => {
  const literal = "export default function X() {\n  return <p>Ciao</p>;\n}\n";

  it.each(["src/app/x.tsx", "src/components/x.tsx"])("rejects a JSX string in %s", async (path) => {
    expect(await ruleIds(literal, path)).toContain("react/jsx-no-literals");
  });

  it.each([
    'alt="Ciao"',
    'title="Ciao"',
    'placeholder="Ciao"',
    'aria-label="Ciao"',
    'placeholder={"Ciao"}',
    "placeholder={`Ciao`}",
    'alt={ok ? "Si" : "No"}',
    'aria-roledescription="x"',
    'aria-placeholder="x"',
    'aria-valuetext="x"',
  ])("rejects the user-facing attribute %s", async (attr) => {
    const code = `export const X = ({ ok }: { ok: boolean }) => <img ${attr} />;\n`;
    expect(await ruleIds(code, "src/components/x.tsx")).toContain("no-restricted-syntax");
  });

  it("allows technical attributes and translated attributes", async () => {
    const code =
      'export const X = ({ t }: { t: (k: string) => string }) => (\n  <p className="a" lang="it" aria-label={t("k")} />\n);\n';
    expect(await ruleIds(code, "src/app/x.tsx")).toEqual([]);
  });

  it("allows translated text", async () => {
    const translated =
      'export default function X({ t }: { t: (k: string) => string }) {\n  return <p>{t("k")}</p>;\n}\n';
    expect(await ruleIds(translated, "src/app/x.tsx")).not.toContain("react/jsx-no-literals");
  });
});
