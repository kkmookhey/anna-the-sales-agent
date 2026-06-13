# Design: Judge JSON resilience + Draft-guard park fix

**Date:** 2026-06-13
**Status:** Approved (design)
**Scope:** Two adjacent bug fixes in the live NI Sales Agent Lambda — (#1) fragile
LLM-response JSON handling in the Bedrock judge, and (#2) the draft-existence guard
silently wedging deals. Shipped as one PR.

---

## Background

Two defects surfaced in production (`ap-south-1`, `ni-sales-agent` Lambda), both
biting rich, multi-service-line deals (e.g. AJ Enterprise, Goodvalue):

### Bug #1 — Judge JSON fragility
Every judge call funnels through `BedrockJudge.askJson` (`src/judgment/bedrock.ts`),
which: caps output at `maxTokens = 2000`, ignores `res.stopReason`, and does a raw
`JSON.parse(extractJson(text))` with **no retry and no repair**. Two observed Slack
errors, one root cause (the judge returns invalid JSON and nothing recovers):

- `"Model response contained no balanced JSON object"` — the response opened `{` but
  was **truncated** before closing (hit the 2000-token cap). `assessSufficiency` is
  forced to echo the entire merged `scope` object, which for these deals is large
  enough to truncate.
- `"Expected ',' or '}' after property value in JSON at position 2394"` — `JSON.parse`
  choked mid-document on an **unescaped quote/newline** inside a long free-text scope
  value (the `environment` / `asset_count` fields run 300–500 chars of commas, parens,
  and quotes).

Why now: the merged `scope` grows on every clarification round-trip. Early small
enquiries fit in 2000 tokens with simple values; these UAE multi-line deals are the
first to cross the ceiling and carry messier free text.

There is also a latent correctness bug in `extractJson`: it counts braces without
tracking string context, so any `{`/`}` *inside* a string value (HTML, code samples in
`clarifying_body_html`) miscounts the depth and can slice the wrong substring.

### Bug #2 — Draft-guard early-return swallows the transition
The `SCOPE_REVIEW` and `PROPOSAL_SENT` handlers in `src/orchestrator/loop.ts` set
`deal.last_inbound_id` / `last_inbound_at` in memory, then call
`stageDraft` / `stageProposal` to persist via `repo.putDeal`. Both staging functions
begin with an idempotency guard:

```ts
if (!config.dryRun && (await graph.draftExistsInConversation(deal.deal_id))) {
  logger.info('skip_duplicate_draft', { ... });
  return null;            // returns BEFORE repo.putDeal
}
```

When an unsent draft is already on the thread, the guard returns `null` before any
persistence. Result: the consumed reply and stage change are never written, so the deal
re-evaluates the same reply **every 20-minute tick forever** — running the expensive
judge each time (which is also where the #1 errors are thrown) and surfacing **nothing**
to a human. Confirmed in logs: `skip_duplicate_draft … stage:SCOPE_REVIEW action:proposal`
fires on every run for AJ Enterprise, and `last_inbound_at` is frozen at the original RFP
timestamp.

This is draft-and-hold working *almost* correctly: an unsent draft *should* block the
next step. The defect is that the block is silent and wastes an LLM call per tick.

**Out of scope (operational, not code):** the backlog of unsent drafts currently wedging
~6 deals is cleared by sending/discarding the drafts in Outlook. That is the post-deploy
smoke test, not part of this change.

---

## Design

### Part 1 — `src/judgment/bedrock.ts`

**1a. String-aware `extractJson`.** Walk the response tracking whether we are inside a
quoted string (respecting `\"` escapes); only count `{`/`}` that occur outside strings.
Return the first balanced top-level object. Throw the existing clear error if none.

**1b. Resilient `askJson`.** After `ConverseCommand`:
- Inspect `res.stopReason`. If `max_tokens`, treat the output as truncated: **retry once**
  with a doubled `maxTokens` (do not attempt to parse the known-truncated body).
- Attempt `JSON.parse(extractJson(text))`. On any throw, **retry once** with a corrective
  system reprompt appended ("Your previous response was not valid JSON. Return exactly one
  complete, fully-escaped JSON object, no prose, no code fences.").
- A second failure throws the same clear error — a genuinely broken response still surfaces
  in Slack. Retries are capped at one per failure mode; never unbounded.

**1c. Per-call token budgets.** Raise the three scope-heavy calls — `assessSufficiency`,
`buildProposalContent`, `scopeEnquiry` — to `maxTokens: 8000`. Leave the small classifiers
(`classifyInbound`, `classifyProposalReply`) at the 2000 default. Numbers are tunable;
combined with 1d they carry large headroom.

**1d. `assessSufficiency` returns scope deltas (contract change).** Change the judge output
from the full merged `scope` to `scope_updates` — only the fields this reply changed or
added. Semantics are unchanged because the loop already merges:
`deal.scope = { ...deal.scope, ...verdict.scope }` (`loop.ts:234`). This removes the bulk
of the output and is the structural reason the truncation cannot recur. Touch points: the
prompt wording (`judgment.ts:73-75`), the `SufficiencyResult` type/JSDoc, and the variable
the loop reads (rename for clarity, same merge behaviour).

**1e. Tighten `JSON_RULE`** (`judgment.ts:28`) to instruct strict escaping of double-quotes
and newlines inside string values, and "one complete object only".

### Part 2 — `src/orchestrator/loop.ts`

**2a. `parkIfDraftPending(deal, deps, nowIso)` helper.** Returns a park result when
`graph.draftExistsInConversation(deal.deal_id)` is true. Called at the **top** of:
- the `SCOPE_REVIEW` handling (both outcomes — clarify and proposal — create a draft), and
- the **clarification → follow-up** sub-branch of `PROPOSAL_SENT` (the meeting and PO
  branches must remain unaffected: they create no draft and must still advance).

When parked, the helper:
- does **not** mutate `last_inbound_*` or `stage` (the reply stays unconsumed, so the deal
  resumes correctly once the human clears the draft),
- skips the judge call entirely,
- posts exactly one Slack line:
  `⏳ Parked: <Company> — an unsent draft is already on this thread. Send or discard it to let the agent proceed.`

**2b. One-time notification via `parked_at`.** Add a nullable `parked_at: string | null`
field to `Deal` (`state/types.ts`), initialised to `null` in the `fresh` deal literal
(`loop.ts:140`). Set it on the first park; notify only on the `null → set` edge; clear it
on any successful advance (so a future park re-notifies). DynamoDB is schemaless, so this
adds no migration.

**2c. Keep the in-staging guards** in `stageDraft` / `stageProposal` as a defense-in-depth
backstop. They are no longer the primary gate, so the silent-loss path is removed, but a
double-draft can still never be created.

---

## Data flow

- **Parked:** `SCOPE_REVIEW` deal with a lingering draft → `parkIfDraftPending`
  short-circuits → no judge call, no state change, one Slack note (first time only).
  Human sends/discards the draft → next tick: not parked → judge runs → stages →
  `parked_at` cleared.
- **#1 retry:** truncated or garbled response → one retry (bigger budget or corrective
  reprompt) → success, or a clean thrown error to Slack on the second failure.
- **Net effect:** both fixes convert *silence* into a *visible* state — a parked note or a
  genuine error — never a deal that looks idle while looping.

## Error handling
- Retries are bounded (one per failure mode); a persistently broken model response throws
  and is reported in the run summary exactly as today.
- Parking is non-destructive: no email is sent, no draft is altered, no stage is forced.

## Testing (vitest, alongside the existing 144)
- `extractJson`: braces inside string values, escaped quotes, and truncated input (throws
  the clear error).
- `askJson`: mock Bedrock client covering truncated-then-full, malformed-then-valid, and
  `stopReason = max_tokens`; assert exactly one retry and no unbounded looping.
- `assessSufficiency`: delta `scope_updates` merges correctly onto prior scope; a
  no-change reply yields an empty/partial update without dropping existing fields.
- Part 2 park path: draft present ⇒ `judge.assessSufficiency` **not** called, no state
  mutation, Slack notified once, second run silent; draft absent ⇒ behaviour unchanged;
  `PROPOSAL_SENT` meeting/PO branches still advance with a draft present.

## Scope boundary (explicitly not doing)
- No retry/backoff framework, no streaming, no model change.
- No changes to the meeting / PO / HubSpot paths.
- No auto-clearing of drafts — the existing draft backlog (#3) is cleared manually and
  serves as the post-deploy smoke test.
