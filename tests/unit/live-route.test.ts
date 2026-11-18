import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor } = vi.hoisted(() => ({ actor: { current: null as CurrentUser | null } }));

vi.mock("@/lib/auth/session", () => ({
  readCurrentUser: vi.fn(async () => actor.current),
  getCurrentUser: vi.fn(async () => actor.current),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));
// Keep the real subscriber registry; only the LISTEN connection is stubbed (no database here).
vi.mock("@/lib/live/listener", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/live/listener")>()),
  startListener: vi.fn(async () => undefined),
  stopListener: vi.fn(async () => undefined),
}));

const { GET } = await import("@/app/api/live/route");
const { subscriberCount } = await import("@/lib/live/listener");

const ANNA: CurrentUser = { id: "u1", username: "anna", name: "Anna", role: "staff", locale: "it" };

function liveRequest(signal?: AbortSignal) {
  return new Request("http://localhost:3000/api/live", { signal });
}

async function waitFor(check: () => boolean, ms = 2_000) {
  const until = Date.now() + ms;
  while (!check() && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  actor.current = null;
});

describe("GET /api/live", () => {
  it("answers 401 without a session and subscribes nobody", async () => {
    const before = subscriberCount();
    const response = await GET(liveRequest());
    expect(response.status).toBe(401);
    expect(subscriberCount()).toBe(before);
  });

  it("opens an unbuffered event stream for a signed-in user", async () => {
    actor.current = ANNA;
    const controller = new AbortController();
    const response = await GET(liveRequest(controller.signal));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^text\/event-stream/);
    const cacheControl = response.headers.get("Cache-Control") ?? "";
    expect(cacheControl).toContain("no-cache");
    expect(cacheControl).toContain("no-transform");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    controller.abort();
  });

  it("starts with the connected comment", async () => {
    actor.current = ANNA;
    const controller = new AbortController();
    const response = await GET(liveRequest(controller.signal));
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe(": connected\n\n");
    controller.abort();
  });

  it("subscribes while open and unsubscribes when the client goes away", async () => {
    actor.current = ANNA;
    const before = subscriberCount();
    const controller = new AbortController();
    const response = await GET(liveRequest(controller.signal));
    await response.body!.getReader().read();
    expect(subscriberCount()).toBe(before + 1);

    controller.abort();
    await waitFor(() => subscriberCount() === before);
    expect(subscriberCount()).toBe(before);
  });
});
