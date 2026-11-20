# Plan: communal accounts (ADR 0024)

## Acceptance criteria
1. Admin can create a staff account flagged communal; admins can't flag admins; the flag can't be
   edited afterwards.
2. A communal session lasts 30 days; normal sessions still end after 12 hours.
3. From a communal session, every state-changing action without a valid acting staff member (none
   chosen, or idle > 2 minutes) changes nothing and returns `needs_actor`.
4. Choosing a staff member sets the acting staff on the server; only active non-communal staff are
   accepted. The next action succeeds and records that person in `created_by`, `cancelled_by`
   and `audit_log.user_id`. Never the communal account.
5. "Not me" clears it; disabling a staff member clears their selection.
6. Undo-your-own works per acting person. Communal accounts have no admin access.
7. The pop-up appears in the booking flow and retries the action; phone and tablet layouts work.

## Steps
1. Migration `0013_communal` (up/down): `user.communal`, table `acting_staff`; `db:types`.
2. `src/lib/auth`: create-staff takes `communal`; session length hook; `resolveActor(session)`
   returns the user id or `needs_actor`; choose / clear / touch acting staff.
3. Route every booking, move, cancel, check-in, season-pass and undo action through
   `resolveActor` (`src/app/(app)/booking-actions.ts` and callers).
4. UI: communal checkbox in `/admin/staff`; "Who is doing this?" dialog; "Acting as" label; it/en.
5. Tests first (`tester`): integration (actor resolution, idle expiry, banned staff, communal
   cannot reach admin actions, wrong user id from client ignored), unit, one e2e at tablet width.
6. `security` agent review (auth + session change), then `reviewer`.

## Risks
- Session length relies on a Better Auth hook (checked in 1.7.20); a test must catch an upgrade that ignores it.
- Many actions to cover; a missed one would record the communal account. Add a test that fails
  if an action writes the session user id directly.
