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

  it("allows translated text", async () => {
    const translated =
      'export default function X({ t }: { t: (k: string) => string }) {\n  return <p>{t("k")}</p>;\n}\n';
    expect(await ruleIds(translated, "src/app/x.tsx")).not.toContain("react/jsx-no-literals");
  });
});
