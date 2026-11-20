# 0024. Communal accounts: shared tablets, "who is acting?"

- Status: Proposed
- Date: 2026-11-20
- Amends: [ADR 0007](0007-auth-details.md) (sessions), [ADR 0013](0013-activity-and-undo.md) (who is the actor)

## Context
- Club tablets are shared ([ADR 0007](0007-auth-details.md), [ADR 0010](0010-android-app.md)). Staff
  have no time to log out and in, or to switch users, between bookings.
- The audit log and "undo your own" need a real person behind every action (ADR 0013).
- Owner (2026-11-20): attribution matters mainly to find out who to ask when something goes wrong,
  not for accountability for money, so no PIN for now.

## Decision
- **Flag**: an admin ticks "Communal (shared tablet)" when creating a staff account. It is stored
  on the user (`communal boolean not null default false`), and a check constraint allows it only
  with the `staff` role. It is set through `createUser`'s additional data; no HTTP route can reach
  it (ADR 0007 blocks the admin and update endpoints). It cannot be changed afterwards (create a
  new account instead), so no account silently changes kind.
- **Communal sessions** last 30 days absolute (no sliding refresh), so the tablet stays logged
  in. Banning the account ends it on the next request, as today. Normal accounts keep 12 hours.
  Better Auth takes the cookie lifetime from one global `session.expiresIn`, so that becomes
  30 days, and a `databaseHooks.session.create.before` hook sets the session row's `expiresAt`
  to 12 hours for non-communal users. The row is what the server checks, so a normal account's
  cookie outliving its session changes nothing.
- **Acting staff**: a communal session carries an optional acting staff member, stored server-side
  (`acting_staff`: session id primary key, staff user id, last used time; rows go with the
  session). It is never trusted from the client. Checking the idle time and refreshing it is one
  atomic `update ... returning`, so two simultaneous actions can't race.
  Any active, non-communal staff account can be chosen; no PIN.
- **Pop-up**: a state-changing action from a communal session with no acting staff, or one idle
  for more than 2 minutes, is refused with `needs_actor`. The client shows "Who is doing this?"
  with a name chip per staff member, then retries the same action. Choosing sets the acting
  staff; each action refreshes the idle time. A visible "Acting as: <name> · Not me" label sits
  on the booking panel; "Not me" clears it.
- **Actor everywhere**: all code that records `created_by`, `cancelled_by` and `audit_log.user_id`
  gets the acting staff id, never the communal account's. Communal accounts never appear in the
  activity stream, so "undo your own" (30 minutes) works per person.
- **Permissions**: a communal account has `staff` rights only. Admin pages, staff management and
  the user menu's password/account areas are not reachable from it.
- **Disabling** a staff member removes them from the pop-up and ends any acting selection of theirs.

## Alternatives considered
- **Pop-up on every action**: most accurate, but one extra tap on each booking in a rush.
- **Top-bar user switcher**: people forget it, so actions get the wrong name.
- **PIN per person**: stops name borrowing, but costs seconds per switch; add it later if payments
  (Milestone 2) need accountability. The acting-staff table does not change for that.
- **Treat the tablet as one user**: cheapest, but makes the audit log and undo-your-own meaningless.

## Consequences
- A wrong name within the 2-minute window is possible. The label on the panel and an easy
  "Not me" limit it. The audit log records the person, not the tablet; if that proves too little,
  add a nullable `via_user_id` later.
- Actions need a new refusal path (`needs_actor`) in every booking server action.
- The session hook must be covered by a test: a Better Auth upgrade that ignores the hook would
  silently give normal accounts 30 days.
