---
name: scope-sufficiency
description: "Use when the NI Sales Agent is at SCOPE_REVIEW — a prospect has replied to scoping questions and the agent must decide whether there's enough to build a proposal, what's still missing, and which reasonable assumptions to make explicit so the deal keeps moving."
---

# Scope Sufficiency

Your job: look at everything captured in `deal.scope` plus the latest reply, and make one
of three calls — **build**, **assume-and-build**, or **ask one more time**. Bias toward
keeping the deal moving; a proposal built on stated assumptions beats a stalled thread.

## The three outcomes

**BUILD** — you have enough to scope and price with confidence on every in-scope line.
Proceed to `proposal-assembly`. Record any minor assumptions you still made.

**ASSUME-AND-BUILD** — the core is clear but 1–3 secondary details are missing. Fill them
with the **most reasonable, conservative** assumption, write each one down in
`deal.assumptions`, and proceed. The proposal will state these openly so the prospect can
correct them. This is the default when a reply is "good enough."

**ASK ONCE MORE** — a *blocking* detail is missing (something that materially changes
price or feasibility and can't be safely assumed). Stage one more short clarifying email
(via `enquiry-scoping`, max 2–3 questions) and return the deal to
`SCOPING_PENDING_APPROVAL`. Only do this once per deal; if the second reply is still
short, switch to ASSUME-AND-BUILD rather than stalling.

## What counts as "enough"

Enough = you can state, for each in-scope line: **what** is being tested/delivered,
roughly **how much** of it, the **environment/access**, and the **deadline**. If those
four are answerable (from their words or a safe assumption), build.

## What is blocking vs assumable

| Detail | If unknown |
|---|---|
| Which app(s)/system(s) are in scope | Blocking if truly ambiguous; assumable if "their main product" is obvious |
| Asset count / size band | Assumable — assume the smaller plausible band, state it |
| Access model (black/grey/white) | Assumable — assume grey-box, state it |
| Compliance framework | Blocking — never guess which standard |
| Active incident (DFIR) | Never assume — urgent human handoff |
| Production vs staging | Assumable — assume staging-mirrors-prod, state it |
| Deadline | Assumable — propose a standard lead time, state it |
| Budget authority | Never blocks the proposal; note the signal for the human |

## Writing good assumptions

Each assumption must be: **specific**, **conservative** (under-scope rather than over-
promise), and **falsifiable in one line** by the prospect. Phrase them as the proposal
will show them: "We've assumed X — let us know if that's not right and we'll adjust."

Good: "We've assumed the single production web app is in scope, not the marketing site."
Bad: "We assumed standard scope." (vague, not falsifiable)

## Output

Return: the decision (`BUILD` / `ASSUME-AND-BUILD` / `ASK-ONCE-MORE`), the updated
`deal.scope`, the `deal.assumptions[]` to record, and — if asking again — the clarifying
questions for `enquiry-scoping`. Never silently drop a missing detail; it's either asked,
assumed-and-recorded, or genuinely known.
