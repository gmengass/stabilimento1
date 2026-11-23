# 0027. Sign-in lockout, rate limits, and shared tablets' own language

- Status: Accepted (owner, 2026-11-23: lockout policy and the security fixes, Batch 1)
- Date: 2026-11-23
- Amends: [ADR 0005](0005-interface-languages.md) (language of a communal account), [ADR 0007](0007-auth-details.md)
  (sign-in limits), [ADR 0019](0019-live-map-updates.md) and [ADR 0025](0025-communal-accounts.md)
  (live streams of a communal account)

## Context
- The 2026-11-23 security re-audit ([plan](../plans/security-fixes.md)): sign-in is limited per
  address only (5 a minute), so one username can be guessed from many addresses; nothing limits
  searches or booking actions, so a lost tablet's session can copy names and phones.
- A communal account is shared by every tablet (ADR 0025). Anything kept "per user" is shared by
  all of them: the saved language, and the live map's 10 streams per user.

## Decision
- **Sign-in lockout** (`login_failure`, migration 0015): wrong passwords are counted per username
  from one address (10 in 15 minutes lock that pair) and per username from anywhere (100 in 15
  minutes lock it everywhere). A lock lasts 15 minutes, never longer, and refuses even the right
  password. Unknown usernames are counted the same way, so a lock confirms nothing. A correct
  sign-in, a password reset or an admin's "Unlock sign-in" on the staff page clears the counts.
  Locks are logged with a hash of the username, never the typed text.
- **Rate limits** in memory (one app process, ADR 0003): 30 searches a minute and 400 a day, 60
  booking actions a minute (including undo and quick-book suggestions). Each counts per account,
  per tablet session for a communal account, and per client address (`X-Real-IP`). Over a limit,
  nothing runs and staff see "wait a minute". `RATE_LIMIT_MULTIPLIER` raises them for tests only.
- **Communal accounts** keep the language per tablet, in the `locale` cookie; the account's saved
  language is neither used nor changed. Their live-stream limit is per tablet session.

## Alternatives considered
- **Lock per username only** (first version): one device on the Wi-Fi could keep the admin or the
  tablet account locked out indefinitely.
- **Permanent lock until an admin unlocks**: the same attack, with no way back but the admin.
- **Rate limits in Postgres**: survive restarts, but a write on every search and action; a restart
  gives a scraper one fresh minute, not the customer list.

## Consequences
- A guesser gets at most 5 tries a minute per address before a lock, and a burst of parallel tries
  can pass the lock check together before any is counted (bounded by the per-address limit).
- The limits slow copying the customer list but don't stop it: the map still sends every
  occupant's name, phone and notes for any date. Masking phones and limiting past dates are owner
  decisions (PROGRESS, open questions).
- If Docker hides client addresses (all requests from one bridge address), the per-address keys
  become one shared counter: check client IPs as in the RUNBOOK.
