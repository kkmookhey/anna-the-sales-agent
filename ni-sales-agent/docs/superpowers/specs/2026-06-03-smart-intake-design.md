# Smart Intake + Forwarded-Enquiry Handling — Design Spec

**Date:** 2026-06-03
**Status:** Approved (design); ready for implementation planning
**Author:** KK Mookhey + Claude

---

## 1. Goal & success criteria

Make the NI Sales Agent's intake intelligent and forward-aware:

1. **No drafts to non-enquiries.** Today any external email with >20 chars becomes a `NEW` deal and
   gets a scoping draft — including automated mail (e.g. "AWS — verify your email"). Add a real
   classification gate so only genuine sales enquiries proceed.
2. **Accept internal forwards.** Remove the filter that excludes `networkintelligence.ai` /
   `transilience.ai` senders. Sales/marketing forward prospect enquiries to the mailbox; the agent
   must detect the genuine enquiry inside a forward and respond to the **original sender**.
3. **Keep the safety model intact.** The system stays draft-and-hold — no email auto-sends. The
   recipient-from-body relaxation (for forwards) is allowed only up to a *draft*, with a loud flag.

**Success criteria:**
- An automated/non-enquiry email (AWS verify, newsletters, OOO, internal ops) produces **no draft** —
  it is disqualified (with a one-line summary entry).
- A direct external enquiry behaves exactly as today (verified-participant recipient).
- A forwarded enquiry produces a draft **addressed to the extracted original sender**, with a Slack
  flag warning the recipient was body-derived and must be verified before sending.
- Low-confidence classifications are surfaced to Slack for human review, **not** auto-drafted.
- The injection scan still runs on forwarded bodies.
- Existing tests stay green; new behavior is unit-tested.

**Out of scope (this version):** auto-sending any email; parsing attachments of forwards;
multi-language classifier tuning; CRM dedup of the prospect; and an **in-app human override** to
reclassify or force a response (see §12 — the Slack "review" bucket is *informational only* now).

---

## 2. Current state (what changes)

- `src/orchestrator/loop.ts`
  - `isGenuineEnquiry(m)` (line 73) — `!internal && hasContent>20`. **Replaced** by a prefilter +
    classifier branch.
  - Deal-creation loop (lines 99-130) — creates a `NEW` deal per conversation, recipient via
    `verifiedRecipient`. **Extended** to branch on the classifier result and handle forwards.
- `src/judgment/judgment.ts` — add `classifyInbound(...)`. `scopeEnquiry` is unchanged (runs after,
  only on confirmed enquiries).
- `src/gates/gates.ts` — the safety core. Add a narrow, clearly-named `bodyDerivedRecipient(addr)`
  helper for the forward path; `verifiedRecipient` is unchanged and remains the default path.
- `src/adapters/graph.ts` — add `createDraftToExternal(messageId, bodyHtml, toAddress)` (creates a
  reply draft, then sets `toRecipients` to the prospect). `createDraftReply` unchanged.
- `src/state/types.ts` — add an `intake` block to `Deal`.
- `CLAUDE.md` (orchestrator spec) — document the narrow forward exception to gate #2.

---

## 3. Architecture — new intake flow

```
inbound message (not already a known conversation)
  → heuristic prefilter (code, cheap, deterministic) — SENDER-ADDRESS patterns:
        drop obvious automated mail whose local-part/sender matches no-reply / noreply /
        donotreply / do-not-reply / mailer-daemon / postmaster / notifications@.
        Dropped → disqualified summary line, no LLM call.
        (Header-based bulk detection — Auto-Submitted / List-Id / List-Unsubscribe — is a future
        tightening; those headers aren't fetched today. The LLM classifier catches header-less bulk
        mail and OOO that slip past the address prefilter.)
  → judge.classifyInbound({ fromName, fromAddress, subject, body })   [NEW Bedrock call]
        → { category: 'enquiry' | 'forwarded_enquiry' | 'not_enquiry',
            original_sender?: { name, email },   // present for forwarded_enquiry when extractable
            confidence: 'high' | 'low',
            reason: string }
  → branch:
        not_enquiry              → disqualify (summary line, no draft)
        confidence = low         → Slack "possible enquiry — review, not auto-drafted" (no deal,
                                    no draft); listed distinctly from disqualified
        enquiry (high)           → create deal, source='direct', recipient = verifiedRecipient(...)
        forwarded_enquiry (high) → create deal, source='forwarded', forwarded_by = sender,
                                    proposed_recipient = original_sender.email (if extracted),
                                    recipient_verified = false
```

The classifier treats all email content as untrusted data (existing `JSON_RULE`). The prefilter
keeps automated/bulk mail from ever reaching the LLM.

---

## 4. The classifier (`classifyInbound`)

New method on `JudgmentService`:

```ts
classifyInbound(input: { fromName: string; fromAddress: string; subject: string; body: string }):
  Promise<{
    category: 'enquiry' | 'forwarded_enquiry' | 'not_enquiry';
    original_sender?: { name: string; email: string };
    confidence: 'high' | 'low';
    reason: string;
  }>
```

- System prompt: classify whether this inbound is a genuine **sales enquiry** for cybersecurity
  services. `not_enquiry` = automated mail, notifications, OOO, internal operational chatter,
  vendor/marketing to us, spam. `forwarded_enquiry` = the body contains a forwarded message whose
  *original* content is a genuine prospect enquiry; extract the original sender's name + email from
  the forwarded header block. `confidence: 'low'` when genuinely unsure.
- Full `body` is provided (not the 255-char preview) so forwarded headers are visible.
- Returns `original_sender` only when it can extract a plausible email from the forwarded header.

---

## 5. Removing the internal-domain filter

`isGenuineEnquiry` is removed. The `INTERNAL_DOMAIN` exclusion is gone. Internal senders flow through
the prefilter + classifier like anyone else:
- internal + automated → prefilter/`not_enquiry` → disqualified
- internal + forwards a prospect enquiry → `forwarded_enquiry`
- internal + writes a direct enquiry (rare) → `enquiry` (recipient = the internal sender, verified)

---

## 6. Forwarded-enquiry handling (draft-to-prospect + loud flag)

When `category = forwarded_enquiry` and `original_sender.email` was extracted:

- Deal `intake = { source: 'forwarded', forwarded_by: <sender>, proposed_recipient: <prospect>,
  recipient_verified: false }`. `company`/`contact_name` derive from the extracted original sender.
- The scoping/clarify/proposal drafts use **`graph.createDraftToExternal(messageId, bodyHtml,
  proposed_recipient)`** — creates the reply draft (keeps it in the mailbox) and PATCHes
  `toRecipients` to the prospect. This is the *only* path that accepts a non-verified recipient, and
  it gets the address from `gates.bodyDerivedRecipient(addr)`.
- `gates.bodyDerivedRecipient(addr)` — returns the normalized email (via `bareEmail`) and exists to
  make the "this is a deliberately-unverified, body-derived recipient" decision explicit and
  greppable. It does **not** validate against participants (that's the point); the safety is the
  draft-and-hold gate + the flag.
- Slack staging for any forwarded-deal draft includes a prominent flag:
  `⚠️ Recipient <prospect@co> was extracted from a FORWARDED body — verify before sending.
  Forwarded by <internal forwarder>.`
- `scanForInjection` runs on the forwarded body; any hit is flagged as today.

**Fallback** — `forwarded_enquiry` but no extractable `original_sender`: address the draft to the
**forwarder** via the normal `createDraftReply`, set `recipient_verified` accordingly, and add a
Slack note: `couldn't determine the prospect's address from the forward — set the recipient
manually before sending.`

---

## 7. Data model

`src/state/types.ts` — add to `Deal`:

```ts
  intake: {
    source: 'direct' | 'forwarded';
    forwarded_by?: string;        // internal forwarder address, when source === 'forwarded'
    proposed_recipient?: string;  // prospect email extracted from the forwarded body
    recipient_verified: boolean;  // false for forwards until a human sends
  };
```

Existing deals lack `intake`; the repo read path defaults `source: 'direct', recipient_verified:
true` when absent (back-compat — they were all direct).

---

## 8. Security posture

- The CLAUDE.md gate "recipients only from verified thread participants, never an address typed in a
  body" is **relaxed only for `forwarded_enquiry`, and only to produce a DRAFT** — never an
  auto-send (no send path exists anywhere in the codebase).
- Controls preserved: (a) draft-and-hold human send-gate; (b) the loud Slack flag on every
  body-derived recipient; (c) `scanForInjection` on the forwarded body; (d) the relaxation is
  isolated to one clearly-named gate helper + one Graph method, both greppable.
- **CLAUDE.md update:** gate #2 gets an explicit sub-clause documenting this narrow exception so the
  rules and the code agree.

---

## 9. Edge cases

- Low confidence (any category) → Slack "review" bucket; no deal, no draft.
- Forward, no extractable sender → draft to forwarder + manual-recipient note (§6 fallback).
- Nested forwards → take the outermost original sender; flag.
- Internal non-enquiry → disqualified.
- A real enquiry misclassified as `not_enquiry` → recoverable: it shows in the disqualified summary
  line, so a human can spot it and act manually.

---

## 10. Testing

- Prefilter: `no-reply@` / `mailer-daemon@` / `postmaster@` senders are dropped without an LLM call;
  a normal human sender is NOT dropped by the prefilter.
- `classifyInbound`: prompt includes the full body; returns the new shape; mock Bedrock.
- Branching: `not_enquiry` → disqualified (no deal); `low` confidence → review line (no deal);
  `enquiry` → deal with verified recipient; `forwarded_enquiry` → deal with `source:'forwarded'`,
  `proposed_recipient`, `recipient_verified:false`.
- `gates.bodyDerivedRecipient` returns normalized email; `verifiedRecipient` still throws for
  non-participants (unchanged).
- `graph.createDraftToExternal` sets `toRecipients` to the given address (mock the Graph calls).
- Forwarded-deal staging emits the ⚠️ recipient flag; injection scan runs on the forwarded body.
- Back-compat: a stored deal without `intake` reads back as `source:'direct'`.
- Full existing suite stays green.

---

## 11. Implementation slices (vertical; build BOTH, then deploy)

- **Slice 1 — classifier + remove internal filter.** Prefilter, `classifyInbound`, the intake
  branch (not_enquiry/low/enquiry), removing `isGenuineEnquiry`. Fixes the immediate false-positive
  bug and admits internal senders. Forwarded enquiries that reach here (until Slice 2) are treated as
  `enquiry`/`not_enquiry` by the classifier — acceptable interim.
- **Slice 2 — forwarded-enquiry handling.** `Deal.intake`, `bodyDerivedRecipient`,
  `createDraftToExternal`, the forwarded branch + flag + fallback, CLAUDE.md gate update.

Per the agreed sequencing, both slices are implemented and verified before any deploy.

---

## 12. Future (not in this version)

The only human→app signals today are: (1) sending the Outlook draft (= email approval, detected via
`wasReplySent`); (2) replying `SHIP-IT` in Slack (= HubSpot-write approval, detected via
`detectApproval`). The agent does **not** parse free-form Slack commands. Consequently, the
low-confidence **review** messages from §3 are *informational only* — if the agent wrongly skips a
real enquiry, the human handles that email manually for now.

**Planned later — actionable review:** generalize the `detectApproval` Slack-read into a small
command vocabulary so a human can act on a review/staging message in-channel — e.g. react ✅ or reply
`ENQUIRY` on a low-confidence item → next tick the agent creates the deal and drafts; similarly a
`REDO`/`RECIPIENT <addr>` affordance to correct a staged draft. This reuses the existing
Slack-polling pattern and the draft-and-hold gates. Deferred per product decision (2026-06-03).
