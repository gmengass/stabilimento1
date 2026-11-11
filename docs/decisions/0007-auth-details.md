# 0007. Auth details: accounts, endpoints and sessions

- Status: Accepted (on merge of this PR)
- Date: 2026-11-11

## Context
- ADR 0002 picks Better Auth (username + password, DB sessions, admin/staff roles).
- Only staff and admins use the app (brief); there is no public sign-up. Tablets are shared.
- Better Auth needs a unique email per user and exposes many HTTP endpoints by default.

## Decision
- **Roles** come from Better Auth's admin plugin with two roles, `admin` and `staff` (staff get
  the plugin's plain-user permissions). A DB check constraint allows only these two.
- **Accounts**: no sign-up. The first admin comes from `db:seed-admin` (idempotent, never
  changes an existing account). Admins create, disable (ban) and reset staff in `/admin/staff`.
  Staff have no email: we store `<username>@staff.invalid`, which is never shown.
- **Ids** are Better Auth's random text ids; columns are snake_case via Kysely's `CamelCasePlugin`.
- **HTTP surface**: `src/app/api/auth/[...all]/route.ts` forwards only `POST /sign-in/username`,
  `POST /sign-out` and `GET /get-session`. Admin operations run server-side through `auth.api`,
  behind our own role checks. `disabledPaths` repeats the block as defence in depth.
- **Login** is a client form that POSTs to `/sign-in/username`, because Better Auth's rate limit
  (5 attempts per minute per address, IPv6 per address) only applies to HTTP requests.
  A disabled account answers 401 like a wrong password.
- **Sessions** last an absolute 12 hours (no sliding refresh), cookie cache off, so a ban or
  password reset ends sessions on the next request. Cookies are Secure in production.
- **Disabling** another admin runs under a Postgres advisory lock and refuses to remove the last
  active admin.

## Alternatives considered
- **Own role column and user CRUD**: more security code to get right than configuring the plugin.
- **Login as a Server Action calling `auth.api`**: skips the rate limiter.
- **Sliding sessions**: a tablet in constant use would never log out.

## Consequences
- Upgrading Better Auth cannot silently expose new endpoints.
- The rate limit needs the real client IP: the app port is bound to localhost and Caddy must set
  `X-Forwarded-For` (Deploy item, which also sets `trustedProxies`).
- Staff cannot change their own password yet; an admin resets it.
