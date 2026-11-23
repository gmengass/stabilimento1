# Plan: security fixes before v1.0 (Milestone 3)

Branch: `feat/security-fixes` (one PR per batch below, small commits).
Sources: Opus re-audit (security agent, 2026-11-23) and Opus review of communal accounts
(reviewer agent, 2026-11-23). They replace the 2026-11-20 audit notes in PROGRESS.
No Critical or High findings. `npm audit --omit=dev`: 0.

## Batch 1: code fixes, no owner decision needed (done on this branch)
Status 2026-11-23: all 13 done; reviewer and security agents re-checked the branch; unit,
integration and all 85 e2e specs pass locally (system Chrome). Their follow-ups are in:
lockout per username *and* address (one device can't lock others out), reset lifts a lock,
full CSP in `next.config.ts`, invisible characters, daily search cap, bounded limiter memory,
pop-up reloads its names, ADR 0027. Still open from that review: see "Not closed by Batch 1".

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | Med | `0013_communal.ts:23` `down` leaves 30-day communal sessions alive; their actions then record the tablet account | Delete communal users' sessions before dropping the column; rollback test with a live communal session |
| 2 | Med | No rate limits on search or write actions (`search/page.tsx:35`, `booking-actions.ts`): a tablet cookie can dump every name and phone | Per-session and per-IP limits on search and booking actions, `429`-style refusal; tests |
| 3 | Med | No `FLAG_SECURE` (`MainActivity.kt:33`): customer data in screenshots and recents | Add the flag |
| 4 | Low | Idle timeout clears the "Acting as" label but not the previous person's Undo buttons (`acting.tsx:73`, `activity-panel.tsx:403`) | `router.refresh()` on idle and on "Not me" |
| 5 | Low | `currentActing` (`acting.ts:83`) filters less than `resolveActor` | One shared where-clause |
| 6 | Low | `setLocale` (`i18n/actions.ts:21`) saves one tablet's language for every tablet | Skip the DB write for communal users |
| 7 | Low | Live streams limited to 10 per user (`api/live/route.ts:8`): many tablets on one communal account get 429 | Count per session for communal accounts |
| 8 | Low | Name and notes accept NUL/control chars (`bookings.ts:29,31`): 500 and customer data in logs | Strip `\p{Cc}` in the schema, as `search.ts` does |
| 9 | Low | Login limited per IP only (`auth.ts:128`) | Lockout per username and address (ADR 0027) |
| 10 | Low | No CSP (`deploy/Caddyfile`) | CSP in `next.config.ts` (`'unsafe-inline'` scripts until nonces) |
| 11 | Low | Picking a person races with disabling them (`staff.ts:133`, `acting.ts:61`) | `for share` lock on the user row in `chooseActing` |
| 12 | — | Test gaps: `acting.test.ts:299` proves nothing; no e2e for communal → `/admin/*`, "Not me", disabling the acting person | Server-side test that `communal: true` is ignored; e2e specs (run in CI) |
| 13 | — | 7 moderate dev-only `npm audit` (minimatch) | `npm audit fix` (chore commit) |

## Not closed by Batch 1
- Med: the map sends every occupant's name, phone and notes for any `?date=`, unthrottled (live
  refresh reloads it every few seconds, so a per-minute limit would break the live map). Fix
  with owner decision 2: no phone or notes in the map data; the panel loads them per booking
  through a rate-limited action. With masking, search can drop phones too.
- Low: parallel sign-ins can pass the lock check together before any failure is counted
  (bounded by 5 a minute per address). Counting in the before-hook would close it.
- Low: per-address keys assume Caddy sees real client addresses; check on the box (RUNBOOK).

## Batch 2: infrastructure (risky, `/checkpoint` first; RUNBOOK steps for the owner)
- Med: the app connects to Postgres as superuser (`docker-compose.yml:58`). Add a DML-only app
  role (init script plus migration with `down`), keep the owner role for `migrate`.
- Low: container hardening (`no-new-privileges`, `cap_drop`, read-only app fs); stop publishing
  Postgres on `127.0.0.1:5432` unless the RUNBOOK needs it.
- Low: pin images and CI actions by digest/SHA; Gradle `verification-metadata.xml`.
- Low: Android `<domain-config>` pinning the club root for LAN names, a pin-set for `ts.net`.
- Low: encrypt pre-update dumps to the backup recipients; drop `booking_before_restore` after a
  successful restore check.
- Low: `update.sh` verifies a signed tag (needs the owner's signing key; RUNBOOK).

## Owner decisions (each blocks only its own item)
1. **GDPR retention** (Med, new ADR): anonymise name, phone and notes N months after a
   booking's last day? Admin erase/export per customer? Limit staff to browsing past dates
   for how long?
2. **Phone masking** in search results and on the map (e.g. `•••• 1234`, full number on tap),
   and how far back staff may browse past dates. Closes the Medium above.
3. **Communal session length**: keep 30 days, or 7 days with a "renew" button for the admin.
4. **Tablet design** (amends ADR 0025): record the tablet on each audit entry (`via_user_id`)
   and an optional "on duty today" list for the pop-up (cheap, recommended now); a per-person
   PIN only for money actions as part of the Milestone 2 payments ADR (recommended, required
   before payments); per-tablet QR enrollment replacing the shared password (later).
5. Until then, RUNBOOK: reset the communal password when anyone leaves (it revokes its
   sessions), and a lost-tablet step (disable the account).

## Corrections to the 2026-11-20 audit
Search lives in `search/page.tsx:35`, not `booking-actions.ts:30`; picomatch no longer in
`npm audit`; `no-store` on `/search` is probably already sent by Next (verify live); Gradle
plugin 9.x is an upgrade, not a vulnerability. It missed the superuser role, retention of past
seasons, `ts.net` pinning, unsigned tags, control chars in logs, container hardening and the
per-user stream limit.
