import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";
import { CamelCasePlugin, type Kysely } from "kysely";
import { getDb } from "@/db/client";
import type { DB } from "@/db/types";
import { defaultLocale, locales } from "@/i18n/config";
import { getEnv, parseAuthEnv } from "@/lib/env";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from "./rules";

const HOUR_SECONDS = 60 * 60;

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

export interface AuthDeps {
  db: Kysely<DB>;
  secret: string;
  baseURL: string;
  /** Rate limiting is on by default; Better Auth would only enable it in production. */
  rateLimit?: boolean;
}

export function createAuth({ db, secret, baseURL, rateLimit = true }: AuthDeps) {
  return betterAuth({
    appName: "Stabilimento",
    secret,
    baseURL,
    database: { db: db.withPlugin(new CamelCasePlugin()), type: "postgres" },
    disabledPaths: DISABLED_PATHS,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      revokeSessionsOnPasswordReset: true,
    },
    session: { expiresIn: 12 * HOUR_SECONDS, updateAge: HOUR_SECONDS },
    user: {
      additionalFields: {
        locale: {
          type: [...locales],
          required: false,
          defaultValue: defaultLocale,
          input: false,
        },
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
  });
  return auth;
}
