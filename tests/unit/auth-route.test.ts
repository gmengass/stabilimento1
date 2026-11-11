import { beforeEach, describe, expect, it, vi } from "vitest";

const { handler } = vi.hoisted(() => ({ handler: vi.fn<(r: Request) => Promise<Response>>() }));

vi.mock("@/lib/auth/auth", () => ({ getAuth: () => ({ handler }) }));

const { GET, POST } = await import("@/app/api/auth/[...all]/route");

const request = (method: string, path: string) =>
  new Request(`http://localhost:3000/api/auth${path}`, { method });

beforeEach(() => {
  handler.mockReset();
  handler.mockResolvedValue(Response.json({ ok: true }));
});

describe("auth route allowlist", () => {
  it.each([
    ["POST", "/sign-in/username"],
    ["POST", "/sign-out"],
    ["GET", "/get-session"],
    ["POST", "/sign-out/"],
  ])("forwards %s %s", async (method, path) => {
    const handle = method === "GET" ? GET : POST;
    expect((await handle(request(method, path))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["POST", "/sign-up/email"],
    ["POST", "/sign-in/email"],
    ["POST", "/admin/create-user"],
    ["POST", "/change-password"],
    ["GET", "/sign-in/username"],
    ["POST", "/get-session"],
    ["GET", "/list-sessions"],
    ["POST", "/some-future-endpoint"],
  ])("answers 404 to %s %s without calling Better Auth", async (method, path) => {
    const handle = method === "GET" ? GET : POST;
    expect((await handle(request(method, path))).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("disabled accounts on sign-in", () => {
  it("answers a banned user like a wrong password", async () => {
    handler.mockResolvedValue(Response.json({ code: "BANNED_USER" }, { status: 403 }));
    const response = await POST(request("POST", "/sign-in/username"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "INVALID_USERNAME_OR_PASSWORD",
      message: "Invalid username or password",
    });
  });

  it("passes other 403s through (e.g. a rejected origin)", async () => {
    handler.mockResolvedValue(Response.json({ code: "INVALID_ORIGIN" }, { status: 403 }));
    const response = await POST(request("POST", "/sign-in/username"));
    expect(response.status).toBe(403);
  });
});
