---
name: deal-followup
description: "Use when the NI Sales Agent is at PROPOSAL_SENT and a prospect has gone quiet, or when a reply needs classifying (meeting, PO, not-now). Owns the follow-up cadence, how each nudge is written, and when to stop."
---

# Deal Follow-up

Your job: keep a sent proposal warm without being a pest. Classify any new reply, and
when there's silence, draft a useful nudge on the configured cadence — staged, never sent.

## First: classify any new reply

Before drafting a nudge, check whether the prospect actually replied since the proposal:

- **Meeting / call proposed or accepted** → `MEETING_BOOKED`. Stop the cadence. Ping the
  human to take it from here. (If a calendar invite is involved, that's a human action.)
- **PO, "we're proceeding", signed acceptance** → stage a HubSpot deal,
  `PO_PENDING_APPROVAL`. Do not write to HubSpot yourself.
- **Questions / objections / negotiation** → stage a reply that answers them (NI sales
  register; loop in the human on anything pricing or commitment related). Reset cadence.
- **"Not now / revisit next quarter / no budget"** → `STALLED` with the reason recorded.
  Stop automated nudges. One soft "happy to reconnect in <their timeframe>" is fine, then
  stop.
- **Out-of-office / wrong contact** → adjust recipient only via verified thread
  participants; do not chase a body-supplied address. Pause cadence appropriately.

## Cadence (silence only)

One nudge per cadence mark, `maxFollowups` total. Business hours only if configured. After
the last mark with no reply → `STALLED`, ping human, stop.

The input tells you exactly where you are: `followupNumber` of `maxFollowups`, `isFinal`,
`daysSinceProposal`, the prospect's `driver`/`timeline`, and an optional `bookingUrl`. Use
them — don't assume a fixed schedule. Each nudge must **add something**, never just
"checking in":

- **Early nudge (`followupNumber` 1):** make sure it arrived; offer to walk through it on a
  short call; invite questions on scope or assumptions.
- **Middle nudge (not first, not `isFinal`):** add value — a relevant consideration tied to
  their `driver`/`timeline` (e.g. lead time if their deadline is fixed, or a note tied to
  their compliance date). Light urgency only if real.
- **Final nudge (`isFinal: true`):** graceful close — "I'll stop nudging; we're here
  whenever the timing's right. Want me to keep the proposal on file or close it out?" This
  both respects them and often surfaces the real status.

When `bookingUrl` is provided, fold it into the call to action ("grab a slot: <link>").
Never invent a link when it's absent.

## Tone rules

- Short. Two or three sentences. Mobile-readable.
- Never guilt-trip, never fake scarcity, never "just bumping this to the top of your
  inbox" clichés.
- Reference their specific context (their deadline, their driver) — proof it's not a mail
  merge.
- NI sales register. Not `kk-voice`.

## Output

Either a stage classification (`MEETING_BOOKED` / `PO_PENDING_APPROVAL` / `STALLED`) with
the relevant staging, or a staged follow-up email draft + Slack staging post, with
`followup_count` incremented and `next_followup_date` set to the next mark.
