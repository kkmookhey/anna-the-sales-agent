# Smart Intake + Forwarded-Enquiry Handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the agent drafting replies to non-enquiries, admit internal forwards, and on a forwarded enquiry draft a reply to the extracted original sender with a loud "verify recipient" flag — all while keeping the draft-and-hold safety model.

**Architecture:** A cheap sender-address prefilter drops obvious automated mail, then a new `classifyInbound` Bedrock call labels each inbound `enquiry | forwarded_enquiry | not_enquiry` with confidence and (for forwards) the extracted original sender. The intake loop branches on that; forwarded deals draft to the body-derived prospect via a new, deliberately-isolated Graph method + gate helper, with a Slack flag. The recipient relaxation is narrow, greppable, and never auto-sends.

**Tech Stack:** Node 20, TypeScript ESM (`.js` import suffixes), AWS SDK v3 (Lambda/Graph/Dynamo), Bedrock global Sonnet 4.5, vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-smart-intake-design.md`

---

## File Structure

**Create:**
- `aws/src/orchestrator/intake.ts` — pure intake helpers: `isAutomatedSender(fromAddress): boolean` (prefilter). One responsibility: cheap, deterministic automated-mail detection. Testable in isolation.
- `aws/test/orchestrator/intake.test.ts`, `aws/test/judgment/classify-inbound.test.ts`, `aws/test/gates/body-derived.test.ts`, `aws/test/adapters/graph-external-draft.test.ts`, `aws/test/state/intake-backcompat.test.ts`.

**Modify:**
- `aws/src/judgment/judgment.ts` — add `classifyInbound(...)`.
- `aws/src/orchestrator/loop.ts` — `JudgePort` gains `classifyInbound`; intake loop branches on classification; `stageDraft` routes forwarded deals to `createDraftToExternal` + emits the recipient flag; remove `isGenuineEnquiry`/`INTERNAL_DOMAIN`.
- `aws/src/bootstrap.ts` — wire `classifyInbound` into the judge dep.
- `aws/src/gates/gates.ts` — add `bodyDerivedRecipient(addr)`.
- `aws/src/adapters/graph.ts` — add `createDraftToExternal(messageId, bodyHtml, toAddress)`.
- `aws/src/state/types.ts` — add `Deal.intake`.
- `aws/src/state/repo.ts` — default `intake` on read (back-compat).
- `ni-sales-agent/CLAUDE.md` — document the narrow gate-#2 exception.

**Conventions:** ESM `.js` import suffixes; dependency-injection ports (`loop.ts` interfaces, `bootstrap.ts` wiring); judgments built via `loadSkill`/`JSON_RULE` returning JSON; structured logger; vitest with `vi` mocks. The gates module is the safety core — keep changes there minimal and clearly named.

---

# SLICE 1 — Classifier + remove internal filter

## Task 1: Automated-sender prefilter

**Files:**
- Create: `aws/src/orchestrator/intake.ts`
- Test: `aws/test/orchestrator/intake.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/orchestrator/intake.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAutomatedSender } from '../../src/orchestrator/intake.js';

describe('isAutomatedSender', () => {
  it('flags common automated local-parts', () => {
    for (const a of [
      'no-reply@amazon.com', 'noreply@aws.amazon.com', 'donotreply@bank.com',
      'do-not-reply@x.com', 'mailer-daemon@mail.com', 'postmaster@x.com', 'notifications@github.com',
    ]) {
      expect(isAutomatedSender(a)).toBe(true);
    }
  });

  it('does not flag a normal human sender', () => {
    for (const a of ['priya@acmebank.com', 'kk@networkintelligence.ai', 'cto@startup.io']) {
      expect(isAutomatedSender(a)).toBe(false);
    }
  });

  it('is case-insensitive and tolerates display-name form', () => {
    expect(isAutomatedSender('No-Reply@AWS.com')).toBe(true);
    expect(isAutomatedSender('AWS <no-reply@aws.com>')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd aws && npx vitest run test/orchestrator/intake.test.ts`
Expected: FAIL — no module `intake.js`.

- [ ] **Step 3: Implement the prefilter**

Create `aws/src/orchestrator/intake.ts`:
```ts
import { bareEmail } from '../gates/gates.js';

// Local-parts that indicate machine-generated mail (no human reads replies to these).
const AUTOMATED_LOCALPARTS = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'do_not_reply',
  'mailer-daemon', 'postmaster', 'notifications', 'notification',
];

/** True if the sender address looks machine-generated (cheap prefilter, no LLM). */
export function isAutomatedSender(fromAddress: string): boolean {
  const local = bareEmail(fromAddress).split('@')[0] ?? '';
  return AUTOMATED_LOCALPARTS.includes(local);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/orchestrator/intake.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
cd aws && git add src/orchestrator/intake.ts test/orchestrator/intake.test.ts
git commit -m "feat: add automated-sender prefilter for intake"
```

---

## Task 2: classifyInbound judgment

**Files:**
- Modify: `aws/src/judgment/judgment.ts`
- Test: `aws/test/judgment/classify-inbound.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/judgment/classify-inbound.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';

describe('classifyInbound', () => {
  it('passes the full body and asks for the classification shape', async () => {
    const askJson = vi.fn().mockResolvedValue({
      category: 'forwarded_enquiry',
      original_sender: { name: 'Priya', email: 'priya@acmebank.com' },
      confidence: 'high', reason: 'forwarded prospect enquiry',
    });
    const svc = new JudgmentService({ askJson } as never);

    const out = await svc.classifyInbound({
      fromName: 'KK', fromAddress: 'kk@networkintelligence.ai',
      subject: 'Fwd: pen test enquiry', body: 'FULL forwarded body with From: Priya <priya@acmebank.com>',
    });

    const [system, payload] = askJson.mock.calls[0];
    expect(system).toMatch(/enquiry/i);
    expect(system).toMatch(/forwarded_enquiry/);
    expect(system).toMatch(/not_enquiry/);
    expect(system).toMatch(/original_sender/);
    expect(payload).toContain('FULL forwarded body'); // full body, not a 255-char preview
    expect(out.category).toBe('forwarded_enquiry');
    expect(out.original_sender?.email).toBe('priya@acmebank.com');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd aws && npx vitest run test/judgment/classify-inbound.test.ts`
Expected: FAIL — `classifyInbound` is not a function.

- [ ] **Step 3: Implement classifyInbound**

In `aws/src/judgment/judgment.ts`, add this method to the `JudgmentService` class (e.g. after `scopeEnquiry`):
```ts
  async classifyInbound(input: {
    fromName: string;
    fromAddress: string;
    subject: string;
    body: string;
  }): Promise<{
    category: 'enquiry' | 'forwarded_enquiry' | 'not_enquiry';
    original_sender?: { name: string; email: string };
    confidence: 'high' | 'low';
    reason: string;
  }> {
    const system =
      'You triage a single email sent to a cybersecurity firm\'s sales inbox. ' +
      'Decide if it is a genuine SALES ENQUIRY for security services (pentest/VAPT, MDR/SOC, GRC, ' +
      'cloud security, compliance, identity, AI security). ' +
      `${JSON_RULE}\n` +
      'Categories: "enquiry" = a direct genuine prospect enquiry; ' +
      '"forwarded_enquiry" = the body contains a FORWARDED message whose original content is a ' +
      'genuine prospect enquiry (sales/marketing forwarded it in) — extract the ORIGINAL sender ' +
      'name + email from the forwarded header block; ' +
      '"not_enquiry" = automated/notification mail, delivery receipts, out-of-office, newsletters, ' +
      'vendors marketing TO us, internal operational chatter, or spam. ' +
      'Set confidence "low" when genuinely unsure. ' +
      'Output keys: category ("enquiry"|"forwarded_enquiry"|"not_enquiry"), ' +
      'original_sender (object {name, email}; OMIT unless category is forwarded_enquiry AND you can ' +
      'extract a plausible email), confidence ("high"|"low"), reason (string).';
    return this.judge.askJson(
      system,
      JSON.stringify({ from_name: input.fromName, from_address: input.fromAddress, subject: input.subject, body: input.body }),
    );
  }
```
(`JSON_RULE` is already defined at the top of this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/judgment/classify-inbound.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `cd aws && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd aws && git add src/judgment/judgment.ts test/judgment/classify-inbound.test.ts
git commit -m "feat: add classifyInbound judgment (enquiry/forwarded/not-enquiry)"
```

---

## Task 3: Wire classifyInbound into the JudgePort + bootstrap

**Files:**
- Modify: `aws/src/orchestrator/loop.ts` (the `JudgePort` interface, ~line 29-35)
- Modify: `aws/src/bootstrap.ts` (the `judge` dep object, ~line 48-54)

- [ ] **Step 1: Add to the JudgePort interface**

In `aws/src/orchestrator/loop.ts`, add this member to the `JudgePort` interface (alongside `scopeEnquiry` etc.):
```ts
  classifyInbound(i: { fromName: string; fromAddress: string; subject: string; body: string }): Promise<{ category: 'enquiry' | 'forwarded_enquiry' | 'not_enquiry'; original_sender?: { name: string; email: string }; confidence: 'high' | 'low'; reason: string }>;
```

- [ ] **Step 2: Wire it in bootstrap**

In `aws/src/bootstrap.ts`, add to the `judge` object literal (alongside `scopeEnquiry: (i) => judge.scopeEnquiry(i),`):
```ts
      classifyInbound: (i) => judge.classifyInbound(i),
```

- [ ] **Step 3: Typecheck**

Run: `cd aws && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd aws && git add src/orchestrator/loop.ts src/bootstrap.ts
git commit -m "feat: expose classifyInbound through JudgePort and bootstrap"
```

---

## Task 4: Branch intake on the classifier (replace isGenuineEnquiry)

**Files:**
- Modify: `aws/src/orchestrator/loop.ts` (remove `INTERNAL_DOMAIN`/`isGenuineEnquiry` lines 71-77; rewrite the inbound loop lines 99-130; add a `reviewLines` bucket)
- Test: `aws/test/orchestrator/loop.test.ts` (add cases — this file already exists and mocks deps)

- [ ] **Step 1a: Update the test harness `baseDeps`**

`test/orchestrator/loop.test.ts` has a `baseDeps(overrides)` helper (top of file) that builds a full
`LoopDeps` with mocks. The `judge` mock currently has NO `classifyInbound`; once the loop calls it
(Step 3) every existing test would crash. Add a default `classifyInbound` mock to the `judge` object
in `baseDeps` (alongside `scopeEnquiry`):
```ts
      classifyInbound: vi.fn().mockResolvedValue({ category: 'enquiry', confidence: 'high', reason: 'genuine enquiry' }),
```

- [ ] **Step 1b: Fix the existing internal-sender test (its rationale changes)**

The existing test "disqualifies an internal sender with no enquiry content" relied on the
internal-domain filter, which this task removes. Internal senders now go through the classifier. Keep
the test meaningful by having the classifier return `not_enquiry` for that message. In that test,
after building `deps`, override the classifier for that one message:
```ts
    (deps.judge.classifyInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ category: 'not_enquiry', confidence: 'high', reason: 'internal operational mail' });
```
Update the test's title/intent to "disqualifies a non-enquiry (classified not_enquiry)". The
assertions (`scopeEnquiry` not called, `createDraftReply` not called, `summary.disqualified === 1`)
stay.

- [ ] **Step 1c: Write the new failing tests**

Add these cases (they use the `baseDeps` + `listInbound … mockResolvedValueOnce([...])` pattern the
file already uses):
```ts
describe('runLoop — intake classification', () => {
  const inboundMsg = (over: Record<string, unknown>) => ({
    id: 'm9', conversationId: 'conv-9', subject: 'Hello', fromName: 'Sam',
    fromAddress: 'sam@prospect.com', participants: ['sam@prospect.com', 'sales@networkintelligence.ai'],
    receivedDateTime: '2026-06-02T14:00:00Z', bodyPreview: 'hi', bodyFull: '<p>hi</p>', hasAttachments: false,
    ...over,
  });

  it('disqualifies a not_enquiry without creating a deal', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([inboundMsg({})]);
    (deps.judge.classifyInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ category: 'not_enquiry', confidence: 'high', reason: 'newsletter' });
    const summary = await runLoop(deps);
    expect(deps.judge.classifyInbound).toHaveBeenCalledOnce();
    expect(deps.judge.scopeEnquiry).not.toHaveBeenCalled();
    expect(deps.repo.putDeal).not.toHaveBeenCalled();
    expect(summary.disqualified).toBe(1);
  });

  it('surfaces a low-confidence message for review without drafting', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([inboundMsg({})]);
    (deps.judge.classifyInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ category: 'enquiry', confidence: 'low', reason: 'maybe an enquiry' });
    await runLoop(deps);
    expect(deps.repo.putDeal).not.toHaveBeenCalled();
    expect(deps.graph.createDraftReply).not.toHaveBeenCalled();
    const posted = (deps.slack.postStaging as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(posted).toMatch(/[Rr]eview/);
  });

  it('skips the LLM for an automated sender', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([inboundMsg({ fromAddress: 'no-reply@aws.amazon.com', participants: ['no-reply@aws.amazon.com', 'sales@networkintelligence.ai'] })]);
    const summary = await runLoop(deps);
    expect(deps.judge.classifyInbound).not.toHaveBeenCalled();
    expect(summary.disqualified).toBe(1);
  });

  it('creates a deal for a high-confidence enquiry with the verified sender', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([inboundMsg({})]);
    await runLoop(deps);
    const stored = (deps.repo.putDeal as ReturnType<typeof vi.fn>).mock.calls[0][0] as Deal;
    expect(stored.contact_email).toBe('sam@prospect.com');
    expect(stored.intake.source).toBe('direct');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd aws && npx vitest run test/orchestrator/loop.test.ts`
Expected: FAIL (current code uses `isGenuineEnquiry`, never calls `classifyInbound`).

- [ ] **Step 3: Remove the old filter**

In `aws/src/orchestrator/loop.ts`, delete lines 71-77 (`const INTERNAL_DOMAIN = ...` through the end of `function isGenuineEnquiry`).

- [ ] **Step 4: Rewrite the inbound classification loop**

Replace the inbound `for (const m of inbound) { ... }` block (currently lines 99-130) with:
```ts
  const reviewLines: string[] = [];

  for (const m of inbound) {
    summary.processed++;
    if (byConversation.get(m.conversationId)) continue;

    if (isAutomatedSender(m.fromAddress)) {
      summary.disqualified++;
      stagingLines.push(`*Disqualified:* "${m.subject}" from \`${m.fromAddress}\` — automated sender.`);
      continue;
    }

    const body = htmlToText(m.bodyFull);
    const verdict = await deps.judge.classifyInbound({
      fromName: m.fromName, fromAddress: m.fromAddress, subject: m.subject, body,
    });

    if (verdict.category === 'not_enquiry') {
      summary.disqualified++;
      stagingLines.push(`*Disqualified:* "${m.subject}" from \`${m.fromAddress}\` — ${verdict.reason}.`);
      continue;
    }
    if (verdict.confidence === 'low') {
      reviewLines.push(`*Review (low-confidence):* "${m.subject}" from \`${m.fromAddress}\` — ${verdict.reason}. Not auto-drafted.`);
      continue;
    }

    const flags = scanForInjection(m.bodyPreview);
    if (flags.length) summary.flagged++;
    const fresh: Deal = {
      deal_id: m.conversationId,
      stage: 'NEW',
      company: domainToCompany(m.fromAddress),
      contact_name: m.fromName,
      contact_email: verifiedRecipient(m.fromAddress, m.participants),
      service_lines: [],
      created_at: m.receivedDateTime,
      last_inbound_id: m.id,
      last_inbound_at: m.receivedDateTime,
      next_followup_date: null,
      followup_count: 0,
      scope: emptyScope(),
      assumptions: [],
      proposal: null,
      actions: [],
      flags: flags.map((reason) => ({ ts: nowIso, message_id: m.id, reason })),
      intake: { source: 'direct', recipient_verified: true },
    };
    byConversation.set(fresh.deal_id, fresh);
    originatingContext.set(fresh.deal_id, { subject: m.subject, body });
  }
```
Add the import at the top of the file: `import { isAutomatedSender } from './intake.js';`
NOTE: this references `deal.intake` — `Deal.intake` is added in Task 6. To keep Slice 1 self-contained and compiling, **also do Task 6 Step 1 (add the `intake` field to the `Deal` type with `source`/`recipient_verified`) before running typecheck here.** (The two new fields used here are `source` and `recipient_verified`.)

- [ ] **Step 5: Surface the review bucket in the Slack summary**

In `runLoop`, where the summary message is assembled (the `header`/`postStaging` block, ~lines 146-149), include the review lines. Change the `postStaging` call to:
```ts
  await slack.postStaging(config.slackChannelId, [header, ...stagingLines, ...reviewLines].join('\n\n'));
```

- [ ] **Step 6: Run tests + typecheck**

Run: `cd aws && npm run typecheck && npx vitest run test/orchestrator/loop.test.ts && npm test`
Expected: PASS (after Task 6 Step 1's type addition is in place).

- [ ] **Step 7: Commit**

```bash
cd aws && git add src/orchestrator/loop.ts test/orchestrator/loop.test.ts
git commit -m "feat: classify inbound mail; drop internal-domain filter"
```

---

# SLICE 2 — Forwarded-enquiry handling

## Task 5: bodyDerivedRecipient gate helper

**Files:**
- Modify: `aws/src/gates/gates.ts`
- Test: `aws/test/gates/body-derived.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/gates/body-derived.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { bodyDerivedRecipient, verifiedRecipient } from '../../src/gates/gates.js';

describe('bodyDerivedRecipient', () => {
  it('returns a normalized email WITHOUT requiring it be a verified participant', () => {
    expect(bodyDerivedRecipient('Priya <Priya@AcmeBank.com>')).toBe('priya@acmebank.com');
  });

  it('rejects an empty/garbage value', () => {
    expect(() => bodyDerivedRecipient('')).toThrow();
    expect(() => bodyDerivedRecipient('not-an-email')).toThrow();
  });

  it('verifiedRecipient still throws for a non-participant (unchanged safety core)', () => {
    expect(() => verifiedRecipient('x@evil.com', ['a@b.com'])).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd aws && npx vitest run test/gates/body-derived.test.ts`
Expected: FAIL — `bodyDerivedRecipient` not exported.

- [ ] **Step 3: Implement the helper**

In `aws/src/gates/gates.ts`, add below `verifiedRecipient`:
```ts
/**
 * DELIBERATELY UNVERIFIED recipient extracted from an email BODY (forwarded enquiry only).
 * This bypasses participant verification on purpose — its safety rests on the draft-and-hold
 * gate (no auto-send) plus a mandatory Slack flag at the call site. Do not use for the normal
 * reply path; use verifiedRecipient there. Grep this symbol to audit every body-derived recipient.
 */
export function bodyDerivedRecipient(candidate: string): string {
  const email = bareEmail(candidate);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`bodyDerivedRecipient: not a usable email: ${candidate}`);
  }
  return email;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/gates/body-derived.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
cd aws && git add src/gates/gates.ts test/gates/body-derived.test.ts
git commit -m "feat: add bodyDerivedRecipient gate helper (forwarded-enquiry only)"
```

---

## Task 6: Deal.intake type + repo back-compat

**Files:**
- Modify: `aws/src/state/types.ts` (the `Deal` interface)
- Modify: `aws/src/state/repo.ts` (`getDeal` + `listDeals` default the field)
- Test: `aws/test/state/intake-backcompat.test.ts`

> Note: Task 4 Step 4 already required the `Deal.intake` *type* (Step 1 below) to exist for Slice 1 to compile. If you implemented Slice 1 first, Step 1 here is already done — verify and move to Step 2.

- [ ] **Step 1: Add the `intake` field to `Deal`**

In `aws/src/state/types.ts`, add to the `Deal` interface (after `flags`):
```ts
  intake: {
    source: 'direct' | 'forwarded';
    forwarded_by?: string;
    proposed_recipient?: string;
    recipient_verified: boolean;
  };
```

- [ ] **Step 2: Write the failing test**

Create `aws/test/state/intake-backcompat.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { DealRepo } from '../../src/state/repo.js';

function repoReturning(item: unknown) {
  const send = vi.fn().mockResolvedValue({ Item: item });
  return new DealRepo({ send } as never, 'tbl');
}

describe('DealRepo intake back-compat', () => {
  it('defaults intake to direct/verified when an older record lacks it', async () => {
    const legacy = { deal_id: 'c1', stage: 'NEW', company: 'X' }; // no `intake`
    const deal = await repoReturning(legacy).getDeal('c1');
    expect(deal?.intake).toEqual({ source: 'direct', recipient_verified: true });
  });

  it('preserves an existing intake block', async () => {
    const withIntake = { deal_id: 'c2', intake: { source: 'forwarded', recipient_verified: false, proposed_recipient: 'p@co.com' } };
    const deal = await repoReturning(withIntake).getDeal('c2');
    expect(deal?.intake.source).toBe('forwarded');
    expect(deal?.intake.proposed_recipient).toBe('p@co.com');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd aws && npx vitest run test/state/intake-backcompat.test.ts`
Expected: FAIL — legacy record returns `intake: undefined`.

- [ ] **Step 4: Default intake on read**

In `aws/src/state/repo.ts`, add a private normalizer and apply it in `getDeal` and `listDeals`:
```ts
  private withDefaults(item: Deal): Deal {
    if (!item.intake) item.intake = { source: 'direct', recipient_verified: true };
    return item;
  }
```
- In `getDeal`: change the return to `return res.Item ? this.withDefaults(res.Item as Deal) : null;`
- In `listDeals`: where it pushes (`deals.push(item)`), push `this.withDefaults(item)` instead.

- [ ] **Step 5: Run tests + typecheck**

Run: `cd aws && npm run typecheck && npx vitest run test/state/intake-backcompat.test.ts && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd aws && git add src/state/types.ts src/state/repo.ts test/state/intake-backcompat.test.ts
git commit -m "feat: add Deal.intake with read back-compat default"
```

---

## Task 7: createDraftToExternal Graph method

**Files:**
- Modify: `aws/src/adapters/graph.ts`
- Test: `aws/test/adapters/graph-external-draft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/adapters/graph-external-draft.test.ts`. (Read the existing `test/adapters/graph.test.ts` first to copy how it constructs a `GraphClient` with a mocked `call`/fetch.) The test must assert that `createDraftToExternal`:
- creates a reply draft (POST `.../createReply`),
- PATCHes the draft body, AND
- PATCHes `toRecipients` to the given external address.
```ts
import { describe, it, expect, vi } from 'vitest';
import { GraphClient } from '../../src/adapters/graph.js';

// Mirror graph.test.ts's construction; stub the private `call` to capture requests.
describe('createDraftToExternal', () => {
  it('creates a reply draft and sets toRecipients to the external prospect', async () => {
    const calls: { path: string; init?: { method?: string; body?: string } }[] = [];
    const client = new GraphClient({ tenantId: 't', clientId: 'c', clientSecret: 's' }, 'sales@x.com');
    // @ts-expect-error override private for test
    client.call = vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
      calls.push({ path, init });
      return { json: async () => ({ id: 'draft-1' }) } as never;
    });

    const id = await client.createDraftToExternal('msg-1', '<p>hi</p>', 'priya@acmebank.com');
    expect(id).toBe('draft-1');
    const patchBodies = calls.filter((c) => c.init?.method === 'PATCH').map((c) => c.init!.body ?? '');
    expect(patchBodies.some((b) => b.includes('priya@acmebank.com'))).toBe(true);
    expect(patchBodies.some((b) => b.includes('"content"'))).toBe(true);
    expect(calls.some((c) => c.path.includes('createReply'))).toBe(true);
  });
});
```
(If `graph.test.ts` uses a different mocking approach, follow that approach instead — the assertions above are what matters.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd aws && npx vitest run test/adapters/graph-external-draft.test.ts`
Expected: FAIL — `createDraftToExternal` not a function.

- [ ] **Step 3: Implement the method**

In `aws/src/adapters/graph.ts`, add after `createDraftReply`:
```ts
  /** Create a reply draft, then set its recipient to an explicit (body-derived) external address.
   *  Used ONLY for forwarded enquiries (see gates.bodyDerivedRecipient). Never auto-sends. */
  async createDraftToExternal(messageId: string, bodyHtml: string, toAddress: string): Promise<string> {
    const created = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/createReply`,
      { method: 'POST' },
    );
    const draft = (await created.json()) as { id: string };
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        body: { contentType: 'HTML', content: bodyHtml },
        toRecipients: [{ emailAddress: { address: toAddress } }],
      }),
    });
    return draft.id;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/adapters/graph-external-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Add to the GraphPort interface**

In `aws/src/orchestrator/loop.ts`, add to the `GraphPort` interface (alongside `createDraftReply`):
```ts
  createDraftToExternal(messageId: string, bodyHtml: string, toAddress: string): Promise<string>;
```

- [ ] **Step 6: Typecheck + full suite**

Run: `cd aws && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd aws && git add src/adapters/graph.ts src/orchestrator/loop.ts test/adapters/graph-external-draft.test.ts
git commit -m "feat: add createDraftToExternal Graph method for forwarded enquiries"
```

---

## Task 8: Populate intake for forwarded enquiries

**Files:**
- Modify: `aws/src/orchestrator/loop.ts` (the inbound loop from Task 4)
- Test: `aws/test/orchestrator/loop.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `aws/test/orchestrator/loop.test.ts` (a forward is an internal sender forwarding a prospect
enquiry; the classifier returns the extracted prospect):
```ts
describe('runLoop — forwarded intake', () => {
  const fwdMsg = {
    id: 'mf', conversationId: 'conv-f', subject: 'Fwd: pentest enquiry', fromName: 'Suraj',
    fromAddress: 'suraj@networkintelligence.ai',
    participants: ['suraj@networkintelligence.ai', 'sales@networkintelligence.ai'],
    receivedDateTime: '2026-06-02T14:00:00Z', bodyPreview: 'fyi', hasAttachments: false,
    bodyFull: '<p>FYI ---- From: Priya &lt;priya@acmebank.com&gt; we need a pentest ----</p>',
  };

  it('populates intake from the extracted prospect for a forwarded enquiry', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([fwdMsg]);
    (deps.judge.classifyInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      category: 'forwarded_enquiry', confidence: 'high', reason: 'forwarded prospect enquiry',
      original_sender: { name: 'Priya', email: 'priya@acmebank.com' },
    });
    await runLoop(deps);
    const stored = (deps.repo.putDeal as ReturnType<typeof vi.fn>).mock.calls[0][0] as Deal;
    expect(stored.intake).toEqual({ source: 'forwarded', forwarded_by: 'suraj@networkintelligence.ai', proposed_recipient: 'priya@acmebank.com', recipient_verified: false });
    expect(stored.contact_name).toBe('Priya');
    expect(stored.company).toBe('Acmebank');
  });

  it('marks a forward with no extractable sender for manual recipient', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([fwdMsg]);
    (deps.judge.classifyInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      category: 'forwarded_enquiry', confidence: 'high', reason: 'forwarded, sender unclear',
    });
    await runLoop(deps);
    const stored = (deps.repo.putDeal as ReturnType<typeof vi.fn>).mock.calls[0][0] as Deal;
    expect(stored.intake.source).toBe('forwarded');
    expect(stored.intake.recipient_verified).toBe(false);
    expect(stored.intake.proposed_recipient).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd aws && npx vitest run test/orchestrator/loop.test.ts`
Expected: FAIL.

- [ ] **Step 3: Branch the inbound loop for forwards**

In `aws/src/orchestrator/loop.ts`, in the inbound loop (Task 4), replace the single `enquiry`-path deal construction so that BOTH `enquiry` and `forwarded_enquiry` create a deal, differing in identity + intake. After the `confidence === 'low'` check, replace the deal-construction block with:
```ts
    const flags = scanForInjection(m.bodyPreview);
    if (flags.length) summary.flagged++;

    const forwarded = verdict.category === 'forwarded_enquiry';
    const prospect = forwarded ? verdict.original_sender : undefined;

    const fresh: Deal = {
      deal_id: m.conversationId,
      stage: 'NEW',
      company: prospect?.email ? domainToCompany(prospect.email) : domainToCompany(m.fromAddress),
      contact_name: prospect?.name ?? m.fromName,
      contact_email: forwarded
        ? (prospect?.email ?? '')                       // body-derived; see Task 9 for draft routing
        : verifiedRecipient(m.fromAddress, m.participants),
      service_lines: [],
      created_at: m.receivedDateTime,
      last_inbound_id: m.id,
      last_inbound_at: m.receivedDateTime,
      next_followup_date: null,
      followup_count: 0,
      scope: emptyScope(),
      assumptions: [],
      proposal: null,
      actions: [],
      flags: flags.map((reason) => ({ ts: nowIso, message_id: m.id, reason })),
      intake: forwarded
        ? { source: 'forwarded', forwarded_by: bareEmail(m.fromAddress), proposed_recipient: prospect?.email, recipient_verified: false }
        : { source: 'direct', recipient_verified: true },
    };
    byConversation.set(fresh.deal_id, fresh);
    originatingContext.set(fresh.deal_id, { subject: m.subject, body });
```
Add `bareEmail` to the existing gates import in this file (it already imports `verifiedRecipient`, `scanForInjection` from `../gates/gates.js`).

- [ ] **Step 4: Run tests + typecheck**

Run: `cd aws && npm run typecheck && npx vitest run test/orchestrator/loop.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd aws && git add src/orchestrator/loop.ts test/orchestrator/loop.test.ts
git commit -m "feat: populate Deal.intake for forwarded enquiries"
```

---

## Task 9: Route forwarded drafts to the prospect + flag

**Files:**
- Modify: `aws/src/orchestrator/loop.ts` (`stageDraft`, lines 274-308)
- Test: `aws/test/orchestrator/loop.test.ts`

- [ ] **Step 1a: Add `createDraftToExternal` to the harness graph mock**

In `baseDeps`, add to the `graph` mock (alongside `createDraftReply`):
```ts
      createDraftToExternal: vi.fn().mockResolvedValue('draft-ext-1'),
```

- [ ] **Step 1b: Write the failing tests**

Add to `aws/test/orchestrator/loop.test.ts` (drive each deal one full tick to its scoping draft):
```ts
describe('runLoop — forwarded draft routing', () => {
  const fwdMsg = {
    id: 'mf', conversationId: 'conv-f', subject: 'Fwd: pentest enquiry', fromName: 'Suraj',
    fromAddress: 'suraj@networkintelligence.ai',
    participants: ['suraj@networkintelligence.ai', 'sales@networkintelligence.ai'],
    receivedDateTime: '2026-06-02T14:00:00Z', bodyPreview: 'fyi', hasAttachments: false,
    bodyFull: '<p>FYI from Priya priya@acmebank.com needs a pentest</p>',
  };
  const fwdVerdict = (over: Record<string, unknown>) => ({ category: 'forwarded_enquiry', confidence: 'high', reason: 'fwd', ...over });

  it('drafts to the prospect with a verify-recipient flag', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([fwdMsg]);
    (deps.judge.classifyInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fwdVerdict({ original_sender: { name: 'Priya', email: 'priya@acmebank.com' } }));
    await runLoop(deps);
    expect(deps.graph.createDraftToExternal).toHaveBeenCalledWith('mf', expect.any(String), 'priya@acmebank.com');
    expect(deps.graph.createDraftReply).not.toHaveBeenCalled();
    const posted = (deps.slack.postStaging as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(posted).toContain('priya@acmebank.com');
    expect(posted).toMatch(/verify before sending/i);
    expect(posted).toContain('suraj@networkintelligence.ai');
  });

  it('falls back to the forwarder when no prospect address was extracted', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([fwdMsg]);
    (deps.judge.classifyInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fwdVerdict({}));
    await runLoop(deps);
    expect(deps.graph.createDraftReply).toHaveBeenCalled();
    expect(deps.graph.createDraftToExternal).not.toHaveBeenCalled();
    const posted = (deps.slack.postStaging as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(posted).toMatch(/set the recipient manually/i);
  });

  it('drafts a direct enquiry as a normal reply with no recipient flag', async () => {
    const deps = baseDeps({}); // default classifier verdict is enquiry/high
    await runLoop(deps);
    expect(deps.graph.createDraftReply).toHaveBeenCalled();
    expect(deps.graph.createDraftToExternal).not.toHaveBeenCalled();
    const posted = (deps.slack.postStaging as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(posted).not.toMatch(/verify before sending/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd aws && npx vitest run test/orchestrator/loop.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update stageDraft to route + flag**

In `aws/src/orchestrator/loop.ts`, replace the body of `stageDraft` (lines 284-307) with:
```ts
  const { config, graph, repo } = deps;
  const replyToMessageId = latest?.id ?? deal.last_inbound_id;
  const fwd = deal.intake.source === 'forwarded';
  const toProspect = fwd ? deal.intake.proposed_recipient : undefined;

  let draftRef = '(dry-run — text below)';
  let recipientFlag = '';
  if (!config.dryRun) {
    if (toProspect) {
      const to = bodyDerivedRecipient(toProspect);
      const draftId = await graph.createDraftToExternal(replyToMessageId, bodyHtml, to);
      draftRef = `Outlook draft created (id ${draftId})`;
      recipientFlag = `\n:warning: Recipient \`${to}\` was extracted from a FORWARDED body — verify before sending. Forwarded by \`${deal.intake.forwarded_by ?? 'unknown'}\`.`;
    } else {
      const draftId = await graph.createDraftReply(replyToMessageId, bodyHtml);
      draftRef = `Outlook draft created (id ${draftId})`;
      if (fwd) recipientFlag = `\n:warning: Couldn't determine the prospect's address from the forward — set the recipient manually before sending.`;
    }
  } else if (fwd) {
    recipientFlag = toProspect
      ? `\n:warning: (dry-run) Would draft to body-derived recipient \`${toProspect}\` — verify before sending.`
      : `\n:warning: (dry-run) Forwarded enquiry with no extractable prospect address — set recipient manually.`;
  }

  const from = deal.stage;
  deal.stage = nextStage;
  deal.actions.push(action(from, nextStage, actionType, `staged: ${subject}`, nowIso));
  await repo.putDeal(deal);

  const text =
    `*[STAGING — ${actionType}]* ${deal.company} / ${deal.contact_name}\n` +
    `Deal: \`${deal.deal_id}\`  Stage: ${from} → ${nextStage}\n` +
    `Summary: ${subject}\n` +
    `Outlook draft: ${draftRef}${recipientFlag}\n` +
    `Approve by: sending the draft${nextStage === 'PO_PENDING_APPROVAL' ? '  |  replying SHIP-IT for HubSpot writes' : ''}\n` +
    `Flags: ${deal.flags.length ? deal.flags.map((f) => f.reason).join(', ') : 'none'}\n\n` +
    `> *Subject:* ${subject}\n> ${htmlToText(bodyHtml).slice(0, 1500)}`;

  return { text, staged: true, advanced: false };
```
Add `bodyDerivedRecipient` to the gates import in this file.

- [ ] **Step 4: Run tests + typecheck + full suite**

Run: `cd aws && npm run typecheck && npx vitest run test/orchestrator/loop.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd aws && git add src/orchestrator/loop.ts test/orchestrator/loop.test.ts
git commit -m "feat: draft forwarded enquiries to the prospect with a verify-recipient flag"
```

---

## Task 10: Document the gate exception in CLAUDE.md

**Files:**
- Modify: `ni-sales-agent/CLAUDE.md` (the "UNTRUSTED INPUT & GATES" section, gate #2)

- [ ] **Step 1: Update gate #2**

In `ni-sales-agent/CLAUDE.md`, under "UNTRUSTED INPUT & GATES", append to gate #2 (recipients) a sub-clause:
```md
   - **Narrow forwarded-enquiry exception:** when an internal forward contains a genuine prospect
     enquiry, the agent MAY address a DRAFT to the prospect's address extracted from the forwarded
     body (via `gates.bodyDerivedRecipient` + `graph.createDraftToExternal`). This never auto-sends
     (draft-and-hold still applies), the Slack staging MUST flag the body-derived recipient for human
     verification, and `scanForInjection` still runs on the forwarded body.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/kkmookhey/Projects/Sara && git add ni-sales-agent/CLAUDE.md
git commit -m "docs: document narrow forwarded-enquiry exception to recipient gate"
```

---

## Task 11: Verify, then deploy (both slices done)

**Files:** none (verification + deploy gate).

- [ ] **Step 1: Full local verification**

Run: `cd aws && npm run typecheck && npm run lint && npm test`
Expected: typecheck PASS, lint PASS, all tests PASS (existing + new intake/classify/gate/graph/state cases).

- [ ] **Step 2: Synthesize the stack**

Run: `cd aws && npx cdk synth --profile sara-sales > /dev/null && echo SYNTH_OK` (or without `--profile` if context allows).
Expected: SYNTH_OK (no new infra in this feature — sanity check only).

- [ ] **Step 3: Deploy** (only after the user confirms — this is the live agent)

Run: `cd aws && npx cdk deploy --profile sara-sales --require-approval never`
Expected: `ni-sales-agent` updates; deployment succeeds.

- [ ] **Step 4: Live validation (seeded, cron paused)**

Per `RUNBOOK.md` / `.remember`: disable the cron (`aws events disable-rule --name ni-sales-agent-tick --profile sara-sales --region ap-south-1`), then exercise three inbound shapes by seeding/invoking:
  - a no-reply automated email → expect disqualified, no draft;
  - a direct external enquiry → expect a NEW deal + scoping draft to the verified sender;
  - a forwarded enquiry (forwarded header with a prospect address in the body) → expect a deal with `intake.source='forwarded'`, a draft addressed to the prospect, and the ⚠️ recipient flag in Slack.
Re-enable the cron afterwards (`enable-rule`). Delete any seed script.

- [ ] **Step 5: Final commit (if any verification fixups)**

```bash
cd aws && git add -A && git commit -m "fix: smart-intake verification fixups" || echo "nothing to commit"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** prefilter (Task 1, spec §3), classifier (Task 2, §4), wiring (Task 3), branch + remove internal filter + review bucket (Task 4, §3/§5/§9), `bodyDerivedRecipient` (Task 5, §6/§8), `Deal.intake` + back-compat (Task 6, §7), `createDraftToExternal` (Task 7, §6), forwarded intake population (Task 8, §6), draft routing + flag + fallback (Task 9, §6), CLAUDE.md exception (Task 10, §8), testing + deploy (Task 11, §10/§11).
- **Build order:** Slice 1 (Tasks 1-4) depends on the `Deal.intake` *type* from Task 6 Step 1 — do that one type addition early (noted in Task 4 Step 4). Everything else is in dependency order.
- **Out of scope (spec §1/§12):** auto-send; attachment parsing; actionable Slack review (the review bucket is informational only); header-based bulk detection.
- **Safety invariant to preserve:** the ONLY body-derived-recipient path is `bodyDerivedRecipient` → `createDraftToExternal`, always paired with the Slack flag, never auto-sent. Grep both symbols to audit.
