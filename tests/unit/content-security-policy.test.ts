import { describe, expect, it } from "vitest";
import nextConfig, { CONTENT_SECURITY_POLICY } from "../../next.config";

describe("Content-Security-Policy", () => {
  it("is sent on every page", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toContainEqual({
      source: "/:path*",
      headers: [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }],
    });
  });

  it("keeps everything on this site and forbids framing and plugins", () => {
    const directives = Object.fromEntries(
      CONTENT_SECURITY_POLICY.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]),
    );
    expect(directives["default-src"]).toEqual(["'self'"]);
    expect(directives["connect-src"]).toEqual(["'self'"]);
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(directives["object-src"]).toEqual(["'none'"]);
    expect(directives["script-src"]).not.toContain("'unsafe-eval'");
  });
});
