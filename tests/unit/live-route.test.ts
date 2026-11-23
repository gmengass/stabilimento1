import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const { GET, MAX_STREAMS_PER_USER } = await import("@/app/api/live/route");
const { subscriberCount, startListener } = await import("@/lib/live/listener");

const ANNA: CurrentUser = {
  id: "u1",
  username: "anna",
  name: "Anna",
  role: "staff",
  locale: "it",
  communal: false,
  sessionId: "s1",
};

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

  describe("stream cap per user", () => {
    const BEA: CurrentUser = { ...ANNA, id: "u2", username: "bea", name: "Bea" };
    const opened: AbortController[] = [];
    const open = async (user: CurrentUser, controller = new AbortController()) => {
      opened.push(controller);
      actor.current = user;
      return GET(liveRequest(controller.signal));
    };
    afterEach(() => {
      opened.splice(0).forEach((c) => c.abort());
    });

    it("refuses one stream too many with 429 and Retry-After, and frees a slot on close", async () => {
      const first = new AbortController();
      expect((await open(ANNA, first)).status).toBe(200);
      for (let i = 1; i < MAX_STREAMS_PER_USER; i++) expect((await open(ANNA)).status).toBe(200);

      const refused = await open(ANNA);
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);

      first.abort();
      expect((await open(ANNA)).status).toBe(200);
    });

    it("counts each user separately", async () => {
      for (let i = 0; i < MAX_STREAMS_PER_USER; i++) await open(ANNA);
      expect((await open(BEA)).status).toBe(200);
    });

    it("counts each tablet of a communal account separately (review 2026-11-23)", async () => {
      const tablet = { ...ANNA, id: "c1", communal: true, sessionId: "tablet-1" };
      for (let i = 0; i < MAX_STREAMS_PER_USER; i++) await open(tablet);
      expect((await open(tablet)).status).toBe(429);
      expect((await open({ ...tablet, sessionId: "tablet-2" })).status).toBe(200);
    });

    it("does not count a request that was already aborted", async () => {
      const gone = new AbortController();
      gone.abort();
      for (let i = 0; i < MAX_STREAMS_PER_USER + 2; i++) await open(ANNA, gone);
      expect((await open(ANNA)).status).toBe(200);
    });

    it("gives the slot back when opening the stream fails", async () => {
      for (let i = 0; i < MAX_STREAMS_PER_USER + 2; i++) {
        vi.mocked(startListener).mockImplementationOnce(() => {
          throw new Error("boom");
        });
        await expect(open(ANNA)).rejects.toThrow("boom");
      }
      expect((await open(ANNA)).status).toBe(200);
    });
  });
});
