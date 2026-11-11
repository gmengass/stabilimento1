import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function ruleIds(code: string, filePath = "src/components/Fixture.tsx"): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId ?? "fatal");
}

describe("no hard-coded user-facing strings (ADR 0005)", () => {
  it("rejects JSX text", async () => {
    expect(await ruleIds("export const X = () => <p>Ciao</p>;\n")).toContain(
      "react/jsx-no-literals",
    );
  });

  it.each(["alt", "title", "placeholder", "label", "aria-label"])(
    "rejects a literal %s attribute",
    async (attr) => {
      expect(await ruleIds(`export const X = () => <img ${attr}="Ciao" />;\n`)).toContain(
        "no-restricted-syntax",
      );
    },
  );

  it.each([
    'placeholder={"Ciao"}',
    "placeholder={`Ciao`}",
    'alt={ok ? "Si" : "No"}',
    'aria-roledescription="x"',
    'aria-placeholder="x"',
    'aria-valuetext="x"',
  ])("rejects the attribute form %s", async (attr) => {
    const code = `export const X = ({ ok }: { ok: boolean }) => <img ${attr} />;\n`;
    expect(await ruleIds(code)).toContain("no-restricted-syntax");
  });

  it("allows technical attributes and translated text", async () => {
    const code =
      'export const X = ({ t }: { t: (k: string) => string }) => (\n  <p className="a" lang="it" aria-label={t("k")}>\n    {t("k")}\n  </p>\n);\n';
    expect(await ruleIds(code)).toEqual([]);
  });

  it("applies to src/app too", async () => {
    expect(
      await ruleIds("export const X = () => <p>Ciao</p>;\n", "src/app/fixture/page.tsx"),
    ).toContain("react/jsx-no-literals");
  });
});
