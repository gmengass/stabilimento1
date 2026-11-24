import { describe, expect, it, vi } from "vitest";
import { probeSession } from "@/lib/live/session-probe";

// Pages that must not reload check the session with one light request (ADR 0030).

async function probe(fetch: () => Promise<Response>) {
  const goToLogin = vi.fn();
  await probeSession({ fetch: fetch as typeof globalThis.fetch, goToLogin });
  return goToLogin.mock.calls.length;
}

describe("probeSession", () => {
  it("goes to the sign-in page when the session is gone", async () => {
    expect(await probe(async () => Response.json(null))).toBe(1);
    expect(await probe(async () => new Response(null, { status: 401 }))).toBe(1);
  });

  it("stays while signed in, on a server error, or offline", async () => {
    expect(await probe(async () => Response.json({ user: { id: "u" } }))).toBe(0);
    expect(await probe(async () => new Response(null, { status: 502 }))).toBe(0);
    expect(
      await probe(async () => {
        throw new TypeError("offline");
      }),
    ).toBe(0);
  });
});
