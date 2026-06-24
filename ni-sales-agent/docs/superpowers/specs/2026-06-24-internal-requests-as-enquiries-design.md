# Design: Treat internal-colleague requests as enquiries

**Date:** 2026-06-24
**Status:** Approved — lightweight, single-prompt change
**Author:** KK Mookhey (via Anna build session)

## Problem

NI sales staff now email their queries to `sales@networkintelligence.ai` to task the agent
("Anna") — build a proposal, assess an RFP go/no-go, answer a client's question, share the
scope behind a proposal. The agent's `classifyInbound` marks these as `not_enquiry`
("internal operational chatter") → disqualified, so nothing is staged. Confirmed by a
dry-run of the deployed Lambda on 2026-06-23: 5 internal-colleague emails, all disqualified,
0 staged.

## Insight

The existing pipeline already does the right thing once an email is classified `enquiry`: it
scopes, drafts a reply **to the sender** (the colleague is a verified participant), and
proceeds to a proposal — all draft-and-hold. Company is extracted from the body (e.g.
"ADNOC"), not the sender's domain, which already works for direct enquiries. **No new state
machine, sub-types, or records are needed.** The only blocker is the classifier filter.

## Change

Narrow `classifyInbound` (`aws/src/judgment/judgment.ts`) so a **genuine request for
security-services work counts as an `enquiry` whether it comes from an external prospect OR an
internal NI colleague** tasking the agent. Internal origin alone no longer implies
`not_enquiry`.

**Preserved — the noise filter stays.** Still `not_enquiry`: automated/notification mail,
delivery receipts, out-of-office, newsletters, vendors marketing/pitching TO us, requests for
our marketing collateral (e.g. an internal "send me the pitch deck" email), and pure non-work
chatter — regardless of internal vs external origin. The low-confidence → review safety net
is unchanged. `forwarded_enquiry` extraction is unchanged.

## Accepted limitation

A pure Q&A ask (e.g. "help me answer this client's SEBI question") will receive a
scoping-style reply rather than a direct answer, because the scoping skill scopes engagements
rather than answering regulatory questions. Build-a-proposal, go/no-go, and most "prepare X"
asks map cleanly. Shipping as-is to learn from real sales-team usage.

## Scope of work

- `aws/src/judgment/judgment.ts` — the `classifyInbound` system prompt.
- `aws/test/judgment/classify-inbound.test.ts` — assert the prompt instructs that internal
  work requests are enquiries and that the noise categories still disqualify.

No infra change. Deploy is the existing CDK flow.

## Out of scope

- Any new sub-type handling, internal-request records, or a separate state machine.
- Changing how replies are addressed (sender = verified participant already).
