import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { actor, staffModule } = vi.hoisted(() => ({
  actor: { current: null as CurrentUser | null },
  staffModule: {
    createStaff: vi.fn(async () => ({ ok: true as const })),
    setDisabled: vi.fn(async () => ({ ok: true as const })),
    resetPassword: vi.fn(async () => ({ ok: true as const })),
  },
}));

vi.mock("@/lib/auth/session", () => ({ readCurrentUser: vi.fn(async () => actor.current) }));
vi.mock("@/lib/auth/staff", () => staffModule);
vi.mock("@/lib/auth/auth", () => ({ getAuth: () => ({}) }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createStaffAction, resetPasswordAction, setDisabledAction } =
  await import("@/app/(app)/admin/staff/actions");

const user = (role: CurrentUser["role"]): CurrentUser => ({
  id: "u1",
  username: "anna",
  name: "Anna",
  role,
  locale: "it",
});

const actions = [
  ["createStaffAction", createStaffAction, staffModule.createStaff],
  ["setDisabledAction", setDisabledAction, staffModule.setDisabled],
  ["resetPasswordAction", resetPasswordAction, staffModule.resetPassword],
] as const;

beforeEach(() => vi.clearAllMocks());

describe.each(actions)("%s", (_name, action, operation) => {
  it("is forbidden when logged out", async () => {
    actor.current = null;
    await expect(action({})).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("is forbidden for staff", async () => {
    actor.current = user("staff");
    await expect(action({})).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("runs for an admin", async () => {
    actor.current = user("admin");
    await expect(action({})).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
