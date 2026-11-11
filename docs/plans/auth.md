# Plan: Auth (log in, roles)

Roadmap: Milestone 0. Branch: `feat/auth`. Decisions: ADR 0002 (Better Auth), ADR 0005 (locale
follows the user), ADR 0006 (per-request rendering).

## Goal
Staff and admins log in with username + password into a protected app shell. Only admins manage
staff accounts. No public sign-up. The interface language follows the logged-in user.

## Approach
- **Better Auth** (pinned), Kysely adapter on `getDb()`, `emailAndPassword: { enabled: true,
  disableSignUp: true }`. Plugins: `username()` (3–30 chars, lowercased),
  `admin({ defaultRole: "staff", adminRoles: ["admin"] })`, `nextCookies()`.
- **Admin plugin, not an own role column**: it already gives role checks, ban/unban ("disable"),
  `createUser`, `setUserPassword`, `listUsers` and session revocation. A DB check constraint on
  `role` is added anyway.
- **Locked endpoints**: `disabledPaths` for `/sign-up/email`, `/update-user`, `/change-email`,
  `/delete-user`, `/admin/impersonate-user`.
- **Emails**: Better Auth needs a unique `user.email`; store `<username>@staff.invalid`, never shown.
- **Route protection**: no `proxy.ts`. `src/app/login/` is public; route group `src/app/(app)/`
  layout calls `requireUser()`. Every page, action and handler also calls `requireUser()` /
  `requireAdmin()` itself. `getCurrentUser()` wraps `auth.api.getSession` in React `cache()`.
  Cookie cache off, so bans and role changes apply on the next request. `/health` and
  `/api/auth/*` stay public.
- **Login / logout**: server actions. Login validates with Zod, calls `auth.api.signInUsername`,
  then writes the `locale` cookie from `user.locale`. Logout calls `signOut`, redirects to `/login`.
- **Staff management** (admin only, `/admin/staff`): list, create, disable/enable (ban, revokes
  sessions), reset password (revokes sessions). No disabling yourself or the last active admin.
  **Cut line**: steps 8–9 may move to a follow-up item "Staff accounts".
- **Locale**: `setLocale` also updates `user.locale` when logged in; `request.ts` passes
  `user: currentUser?.locale` to `resolveLocale`. `locale` is an `additionalFields` entry with
  `input: false`.
- **i18n**: namespaces `login`, `auth.errors`, `appShell`, `staff` in IT and EN.
- **Seed**: `npm run db:seed-admin` → `src/db/seed-admin.ts` → pure `ensureAdmin(...)`. Reads
  `ADMIN_USERNAME` / `ADMIN_PASSWORD`; refuses if missing or too short; no-op if the username
  exists (password untouched). Allowed in production.

## Data / API
- Migration `src/db/migrations/0003_auth.ts`: `"user"`, `session`, `account`, `verification`,
  snake_case columns mapped through Better Auth `fields`, `timestamptz`, text ids.
  `"user"` adds `username` (unique), `display_username`, `role` (default `'staff'`, check
  admin/staff), `banned`, `ban_reason`, `ban_expires`, `locale` (default `'it'`, check it/en).
  `session` adds `impersonated_by` and an index on `user_id`. `down` drops in reverse FK order.
- `src/app/api/auth/[...all]/route.ts` (`toNextJsHandler`).
- Env: `AUTH_SECRET` (min 32 chars), optional `ADMIN_USERNAME` / `ADMIN_PASSWORD`; `baseURL`
  from `APP_URL`.

## Acceptance criteria
- [ ] Logged out, `/` and `/admin/staff` redirect to `/login`; `/health` is 200 without a session
- [ ] `POST /api/auth/sign-up/email` returns 4xx and creates no row
- [ ] Valid login sets an httpOnly, SameSite=Lax cookie (Secure in prod), creates a session and
      opens the shell; logout deletes the session and redirects to `/login`
- [ ] Unknown username, wrong password and disabled user get the same status and generic message
- [ ] The 6th failed login from one IP within 60 s returns 429
- [ ] Staff are refused on `/admin/staff` and every admin action; admins create, disable/enable
      and reset passwords; disable/reset end sessions; no disabling yourself or the last admin
- [ ] Too-short passwords rejected by create, reset and the seed script
- [ ] `db:seed-admin` twice → exactly one admin with the first password; clear error if env missing
- [ ] Logged in, switching language updates `user.locale` and the cookie and follows the user to
      a new browser; logged out, cookie only (unchanged)
- [ ] Migration up → down → up works; `role='owner'` or `locale='fr'` fails
- [ ] All new UI strings in IT and EN; `npm run lint` passes
- [ ] E2E: `/` → `/login` → log in as seeded admin → shell → log out → back stays on `/login`

## Steps (one commit each)
1. `chore:` better-auth, env vars, `.env.example`
2. `feat:` auth migration + `db:types` + round-trip/constraint test (`/checkpoint` first)
3. `feat:` auth config + route handler; tests: sign-up blocked, sign-in, generic errors, rate limit
4. `test:` + `feat:` `ensureAdmin` and `db:seed-admin`
5. `test:` + `feat:` guards, `(app)` layout, login page/actions, logout, i18n strings
6. `test:` + `feat:` `setLocale` + `request.ts` user preference, cookie overwrite on login
7. `test:` e2e login flow, CI seeding
8. `test:` + `feat:` staff list and create (cut line)
9. `test:` + `feat:` disable/enable, reset password, self/last-admin guard
10. `docs:` ADR 0007, ARCHITECTURE, ROADMAP, PROGRESS

## Security
- Rate limit: Better Auth in-memory store (one instance); `/sign-in/username` 5 per 60 s; client
  IP from Caddy's `x-forwarded-for`.
- Sessions: `expiresIn` 12 h, `updateAge` 1 h; `__Secure-` cookie prefix in production.
- Passwords: min 10, max 128, no composition rules; scrypt (Better Auth).
- Timing: unknown username must cost the same as a wrong password.
- Concurrent creates: unique index → "username taken". Last-admin check + ban in one transaction.
- Security agent review required.

## To verify after `npm ci`
Next 16: `redirect()` in a route-group layout, `forbidden()`/`authInterrupts` status, async
`cookies()` in actions, catch-all handler signature. Better Auth: Kysely 0.29 support, snake_case
`fields` for plugin fields, server-side `createUser` with `disableSignUp`, banned-user error code,
`.invalid` email validation.

## Open questions
- Session length on shared tablets: 12 h, or until end of day (Europe/Rome)?
- On login, the saved user locale overwrites a language just chosen on the login page.
- Running `db:seed-admin` in the standalone Docker image (is `tsx` there?): Deploy item.
- AuditLog for staff-account changes: deferred until AuditLog exists.
