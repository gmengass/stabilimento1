import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";
import { CamelCasePlugin, type Kysely } from "kysely";
import { getDb } from "@/db/client";
import type { DB } from "@/db/types";
import { defaultLocale, locales } from "@/i18n/config";
import { getEnv, parseAuthEnv } from "@/lib/env";
import { clearFailures, lockedUntil, normalizeUsername, recordFailure } from "./lockout";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from "./rules";

const HOUR_SECONDS = 60 * 60;
const COMMUNAL_SESSION_SECONDS = 30 * 24 * HOUR_SECONDS;
const SESSION_SECONDS = 12 * HOUR_SECONDS;

const ac = createAccessControl(defaultStatements);
// Staff get the plugin's plain "user" permissions: no access to any admin endpoint.
const accessRoles = {
  admin: ac.newRole(adminAc.statements),
  staff: ac.newRole(userAc.statements),
};

const ADMIN_ENDPOINTS = [
  "ban-user",
  "create-user",
  "get-user",
  "has-permission",
  "impersonate-user",
  "list-user-sessions",
  "list-users",
  "remove-user",
  "revoke-user-session",
  "revoke-user-sessions",
  "set-role",
  "set-user-password",
  "stop-impersonating",
  "unban-user",
  "update-user",
];

/**
 * Not reachable over HTTP: no public sign-up, username-only sign-in, no self-service profile
 * changes. Admin endpoints are called only server-side via `auth.api`, behind our own checks.
 */
export const DISABLED_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/is-username-available",
  "/update-user",
  "/change-email",
  "/change-password",
  "/delete-user",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  ...ADMIN_ENDPOINTS.map((name) => `/admin/${name}`),
];

const SIGN_IN_PATH = "/sign-in/username";
const UNAUTHORIZED = 401;

function signInUsername(ctx: { path?: string; body?: unknown }): string | null {
  if (ctx.path !== SIGN_IN_PATH) return null;
  return normalizeUsername((ctx.body as { username?: unknown } | null)?.username);
}

/**
 * Per-username lockout on top of the per-IP limit: 10 wrong passwords in 15 minutes lock that
 * username for 15 minutes, even with the right password. A correct sign-in resets the count.
 */
function lockoutHooks(db: Kysely<DB>) {
  return {
    before: createAuthMiddleware(async (ctx) => {
      const name = signInUsername(ctx);
      if (!name || !(await lockedUntil(db, name))) return;
      throw new APIError("TOO_MANY_REQUESTS", {
        code: "ACCOUNT_LOCKED",
        message: "Too many failed sign-ins, try again later",
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      const name = signInUsername(ctx);
      if (!name) return;
      const returned = ctx.context.returned;
      if (!isAPIError(returned)) {
        await clearFailures(db, name);
        return;
      }
      if (returned.statusCode !== UNAUTHORIZED) return;
      const locked = await recordFailure(db, name);
      if (locked) console.warn(`sign-in locked for "${name}" until ${locked.toISOString()}`);
    }),
  };
}

export interface AuthDeps {
  db: Kysely<DB>;
  secret: string;
  baseURL: string;
  /** Rate limiting is on by default; Better Auth would only enable it in production. */
  rateLimit?: boolean;
  /** Origins allowed besides `baseURL`, e.g. the box's IP (ADR 0008). */
  trustedOrigins?: string[];
}

export function createAuth({ db, secret, baseURL, rateLimit = true, trustedOrigins }: AuthDeps) {
  return betterAuth({
    appName: "Stabilimento",
    secret,
    baseURL,
    trustedOrigins,
    database: { db: db.withPlugin(new CamelCasePlugin()), type: "postgres" },
    disabledPaths: DISABLED_PATHS,
    hooks: lockoutHooks(db),
    advanced: {
      // Secure + __Secure- cookies in production even if APP_URL was left on http; elsewhere
      // Better Auth decides from the APP_URL scheme.
      useSecureCookies: process.env.NODE_ENV === "production" ? true : undefined,
      // Every device on the staff Wi-Fi shares one IPv6 /64: rate-limit per address instead.
      // Caddy overwrites X-Real-IP with the peer address; X-Forwarded-For is client-controlled.
      ipAddress: { ipv6Subnet: 128, ipAddressHeaders: ["x-real-ip"] },
      // Better Auth skips origin checks under NODE_ENV=test; keep them on so tests match production.
      disableOriginCheck: false,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
    },
    // Absolute, no sliding refresh: Server Components can't extend the cookie anyway. The cookie
    // lasts as long as the longest session; the database row decides (see the hook below):
    // 12 h for normal accounts, 30 days for communal tablets (ADR 0025).
    session: { expiresIn: COMMUNAL_SESSION_SECONDS, disableSessionRefresh: true },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await db
              .selectFrom("user")
              .select("communal")
              .where("id", "=", session.userId)
              .executeTakeFirst();
            if (user?.communal) return;
            return { data: { expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } };
          },
        },
      },
    },
    user: {
      additionalFields: {
        locale: {
          type: [...locales],
          required: false,
          defaultValue: defaultLocale,
          input: false,
        },
        communal: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    rateLimit: {
      enabled: rateLimit,
      window: 60,
      max: 100,
      customRules: { "/sign-in/username": { window: 60, max: 5 } },
    },
    plugins: [
      username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX }),
      admin({
        ac,
        roles: accessRoles,
        defaultRole: "staff",
        adminRoles: ["admin"],
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

/** The app's auth instance, created on first use so builds and migrations don't need secrets. */
export function getAuth(): Auth {
  auth ??= createAuth({
    db: getDb(),
    secret: parseAuthEnv(process.env).AUTH_SECRET,
    baseURL: getEnv().APP_URL,
    trustedOrigins: getEnv().TRUSTED_ORIGINS,
  });
  return auth;
}
