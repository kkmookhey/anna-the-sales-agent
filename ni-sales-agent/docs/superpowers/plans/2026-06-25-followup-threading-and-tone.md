# Plan — Follow-up threading fix + follow-up tone/context escalation

Date: 2026-06-25
Status: awaiting approval

## Goal

When Anna stages a follow-up on a quiet proposal, the draft must (a) thread correctly
into the existing conversation carrying the prior mail-trail, and (b) read like a
purposeful, escalating nudge rather than a generic "checking in" — using how far along
the cadence we are and the prospect's own driver/deadline.

## Success criteria

1. A staged follow-up is a reply on the original `conversationId`, with the quoted trail
   present, anchored to the **most recent live message in the thread** (the proposal we
   sent, or the prospect's latest reply) — not a stale/oldest message.
2. When the reply anchor cannot be resolved to a live in-thread message, Anna does **not**
   silently fall back to a dead id — it flags this in the Slack staging for the human.
3. The final nudge (`followup_count + 1 >= max_followups`) is a graceful break-up; earlier
   nudges escalate per the existing deal-followup skill. The judge is given the data it
   needs to know which nudge this is and the prospect's driver/deadline.
4. `npm run typecheck` clean, `npm test` green (existing + new tests), no behaviour change
   to the scoping/proposal reply paths.

## Background (verified in code)

- Follow-ups already route through `stageDraft` → `graph.createDraftReply`
  (`loop.ts:348`, `graph.ts:105`). `createDraftReply` uses Graph `createReplyAll` and
  prepends new text to the quoted trail — so the trail IS preserved **when the anchor is
  a valid in-thread message**.
- The anchor is resolved in `stageDraft` (`loop.ts:417`):
  `latest?.id ?? latestMessageInConversation(convId)?.id ?? deal.last_inbound_id`.
  For a quiet-prospect follow-up `latest` is null, so it depends on
  `latestMessageInConversation` (`graph.ts:186`).
- `latestMessageInConversation` sorts the conversation's messages by `receivedDateTime`
  and drops drafts. **Our own sent proposal has no `receivedDateTime`** (it has
  `sentDateTime`), so it sorts last and is effectively ignored — the function returns the
  prospect's older scope reply, and if that id is stale (mail moved to "Processed",
  non-immutable ids) it dies, falling through to a dead `last_inbound_id`. That is the
  "appears as a fresh email" symptom.
- `draftFollowup` (`judgment.ts:105`) is given only `{company, contactName,
  followupNumber, scopeSummary}` — not `max_followups`, days-elapsed, or an explicit
  driver/deadline, so the skill's "nudge 3 = final break-up" guidance is guesswork.
- The deal carries what we need: `scope.compliance_driver`, `scope.timeline`,
  `proposal.staged_at`, and the `PROPOSAL_SENT` action timestamp in `actions[]`.

## Slice 1 — Reliable reply anchor (threading fix)

Make the thread anchor robust and fail loud instead of silent.

1. **`graph.ts` — fix `latestMessageInConversation`.** Sort by the effective timestamp
   `sentDateTime || receivedDateTime` (some messages only have one), still excluding
   drafts. Select both fields. This makes our sent proposal a valid, preferred anchor.
   *Test (write first), `test/adapters/graph.test.ts`:* given a conversation whose newest
   message is a sent item with only `sentDateTime`, the function returns that message's
   id (currently returns the older received one / null).
2. **`loop.ts` — make `stageDraft` anchor resolution explicit and safe.** Keep the
   order `fresh inbound → newest live in conversation → stored last_inbound_id`, but when
   it lands on the stored-id fallback (no live message resolved), append a Slack flag
   (`:warning: couldn't re-resolve the live thread — verify this reply is on-thread before
   sending`). No silent dead-id replies.
   *Test, `test/orchestrator/loop.test.ts`:* a follow-up with no fresh inbound and a
   resolvable conversation anchors to the conversation's newest message; with an
   unresolvable conversation, the staging text contains the verify-thread flag.
3. **Done when:** both tests pass; full suite green; scoping/proposal reply paths
   unchanged (they pass a fresh `latest`, so behaviour is identical).

## Slice 2 — Follow-up context & tone escalation

Give the judge what the skill already asks for.

1. **`loop.ts` — enrich the `draftFollowup` call** (both call sites, ~285 and ~347) with:
   `maxFollowups` (from config), `isFinal` (`followup_count + 1 >= maxFollowups`),
   `daysSinceProposal` (from `proposal.staged_at` or the `PROPOSAL_SENT` action ts), and an
   explicit `driver`/`timeline` pulled from `scope`. Optional `bookingUrl` from config,
   included only if present (no fabricated link).
2. **`judgment.ts` — widen `draftFollowup` input type** and pass the new fields through to
   the model; extend the system instruction to state that `isFinal` ⇒ graceful close.
3. **`deal-followup/SKILL.md` — small tightening** so the nudge selection keys off
   `isFinal`/`followupNumber` and `daysSinceProposal` rather than assuming a 3-mark cadence,
   and instructs including the booking CTA when provided. (Skill copy is bundled at build;
   no separate deploy needed beyond the normal one.)
4. **`config` — add optional `bookingUrl`** (nullable; default null) so nothing breaks if
   unset.
   *Tests, `test/judgment/judgment.test.ts`:* `draftFollowup` forwards the new fields into
   the judge payload; `isFinal` true is reflected in the system prompt. `test/config.test.ts`:
   `bookingUrl` defaults to null and round-trips when set.
5. **Done when:** tests pass; a local dry-run of a `PROPOSAL_SENT` deal at the final mark
   produces a break-up-toned draft referencing the driver; non-final marks unchanged in shape.

## Out of scope (deliberately)

- No change to the gating model — follow-ups stay draft-and-hold, human-sent.
- No new infra, dashboard, or auto-send. No change to immutable-ID handling beyond using
  the existing resolver (broader immutable-ID hardening is a separate item).
- No HubSpot or pricing changes.

## Risks / watch-items

- Graph `$filter` + timestamp quirks: `latestMessageInConversation` already sorts
  client-side (Graph rejects `$filter`+`$orderby`); keep that. Verify sent items appear
  under `/users/{box}/messages` (all-folder scope) for the test mailbox.
- Can't fully reproduce the moved-to-"Processed" stale-id case in unit tests; the Slack
  verify-thread flag (Slice 1.2) is the safety net for that real-world path.
- M365 MCP is read-only in-session, so end-to-end confirmation of a live drafted reply is
  a post-deploy manual check (inspect one staged follow-up in Outlook Drafts).

## Verification before "done"

- `npm run typecheck` + `npm test` green.
- Local dry-run render/stage of a `PROPOSAL_SENT` sample deal at a mid and final mark;
  eyeball the drafted subject/body.
- Post-deploy: stage one real follow-up and confirm in Outlook it threads with the trail.
