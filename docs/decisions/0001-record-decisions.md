# 0001. Record technical decisions as ADRs

- Status: Accepted
- Date: 2026-11-10

## Context
Decisions that only live in chat get re-discussed and contradicted in later sessions.

## Decision
Every significant technical decision is recorded as a short Architecture Decision Record (ADR) in
`docs/decisions/NNNN-title.md`, with these sections: Status, Date, Context, Decision, Consequences.
ADRs are never edited after acceptance. Instead, a new ADR supersedes the old one.

## Consequences
Claude and contributors read ADRs instead of re-deriving choices. Chats stay short.
