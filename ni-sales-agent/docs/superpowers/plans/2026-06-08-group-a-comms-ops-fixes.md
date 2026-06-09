# Group A — Comms & Ops Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four prospect-facing comms/ops defects in the live NI sales agent — crowded cover titles, wiped reply quotes, Reply (not Reply-All), and noisy empty-tick Slack summaries — plus close the duplicate-draft idempotency gap.

**Architecture:** Surgical edits to four existing files (`template.ts`, `judgment.ts`, `graph.ts`, `loop.ts`). No new modules. Two fixes (quote + Reply-All) collapse into one Graph-adapter change because they touch the same method. Each task is test-gated against the existing vitest suite (105 tests today) and must keep typecheck + lint clean.

**Tech Stack:** Node 20 + TypeScript (ESM, `.js` import specifiers), vitest, MS Graph REST v1.0, Bedrock Sonnet 4.5.

---

## Context for the implementer (read before starting)

- **Run all commands from `ni-sales-agent/aws/`.** Test: `npm test`. Typecheck: `npm run typecheck`. Lint: `npm run lint`.
- **ESM rule:** intra-repo imports use the `.js` extension even for `.ts` files (e.g. `import ... from './template.js'`). Match it.
- **Ports vs. adapters:** `loop.ts` talks to Graph through the `GraphPort` interface (declared in `loop.ts`). The real implementation is `GraphClient` in `adapters/graph.ts`. Loop tests mock the port directly, so changing `GraphClient` internals does NOT affect `loop.test.ts` — only `graph.test.ts` exercises the real HTTP shape.
- **Do NOT deploy.** This plan stops at "green locally." A separate live deploy (with a final whole-diff review + user go-ahead) happens after.
- **Commit discipline:** conventional commits, one logical change per task.

### File map

| File | Change |
|---|---|
| `src/render/template.ts` | Add exported `coverTitleFontPx()`; use it for the cover `<h1>` font-size (Task 1). |
| `src/judgment/judgment.ts` | Add a "keep titleLine short" instruction to the `buildProposalContent` prompt (Task 1). |
| `src/adapters/graph.ts` | `createDraftReply` → Reply-All endpoint + prepend our HTML above the quote (Task 2); add `draftExistsInConversation()` (Task 4). |
| `src/orchestrator/loop.ts` | Gate the Slack summary post on real activity + add `run_done` log (Task 3); add `draftExistsInConversation` to `GraphPort` + idempotency guards in `stageDraft`/`stageProposal` (Task 4). |
| `test/render/template-v3.test.ts` | Cover-title scale tests (Task 1). |
| `test/adapters/graph.test.ts` | Reply-All + quote-preservation tests (Task 2); `draftExistsInConversation` tests (Task 4). |
| `test/orchestrator/loop.test.ts` | Quiet-tick test (Task 3); duplicate-draft-guard test + `draftExistsInConversation` added to `baseDeps` mock (Task 4). |

---

## Task 1: Long-title cover — auto-scale the headline + ask the LLM to keep it short

**Why:** The LLM's `titleLine` can wrap to 4 lines at the fixed `font-size:150px` and crowd the bottom stat-callouts on the cover. Fix both ends: clamp the font in the template (safety net) and instruct the prompt (prevention).

**Files:**
- Modify: `src/render/template.ts` (add helper near `statValue`, ~line 86; use it at the cover `<h1>`, line 150)
- Modify: `src/judgment/judgment.ts` (`buildProposalContent` system prompt, ~line 160)
- Test: `test/render/template-v3.test.ts`

- [ ] **Step 1: Write the failing test** — append to `test/render/template-v3.test.ts`

```ts
import { renderProposalHtml, coverTitleFontPx } from '../../src/render/template.js';

describe('coverTitleFontPx', () => {
  it('returns the full size for a short title', () => {
    expect(coverTitleFontPx('Web VAPT')).toBe(150);
  });
  it('scales down as the title gets longer', () => {
    const short = coverTitleFontPx('Web VAPT');
    const long = coverTitleFontPx('Comprehensive Web Application and API Security Assessment Programme');
    expect(long).toBeLessThan(short);
  });
  it('cover h1 uses the scaled font-size for a long title', () => {
    const longTitle = 'Comprehensive Web Application and API Security Assessment Programme';
    const html = renderProposalHtml({ ...content, titleLine: longTitle });
    expect(html).toContain(`font-size:${coverTitleFontPx(longTitle)}px`);
    expect(html).not.toContain('font-size:150px'); // the cover h1 is no longer the default 150
  });
});
```

> Note: `content` is the fixture already defined at the top of this file. Update the existing top-of-file import line `import { renderProposalHtml } from '../../src/render/template.js';` to also import `coverTitleFontPx` (shown above) — do not add a duplicate import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- template-v3`
Expected: FAIL — `coverTitleFontPx` is not exported / not defined.

- [ ] **Step 3: Add the helper in `src/render/template.ts`**

Insert immediately after the `statValue` function (after line 93):

```ts
/** Cover headline auto-scales down for long titles so a wrapped <h1> never crowds the
 *  bottom stat-callouts. The LLM is asked to keep titleLine short; this is the safety net. */
export function coverTitleFontPx(title: string): number {
  const len = title.trim().length;
  if (len <= 18) return 150;
  if (len <= 30) return 124;
  if (len <= 44) return 100;
  if (len <= 60) return 82;
  return 68;
}
```

- [ ] **Step 4: Use the helper at the cover `<h1>`**

In `buildCover`, replace line 150:

```ts
      <h1 class="title" style="font-size:150px;line-height:0.96;max-width:1500px;letter-spacing:-0.025em;">${esc(content.titleLine)}</h1>
```

with:

```ts
      <h1 class="title" style="font-size:${coverTitleFontPx(content.titleLine)}px;line-height:0.96;max-width:1500px;letter-spacing:-0.025em;">${esc(content.titleLine)}</h1>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- template-v3`
Expected: PASS (all cases, including the existing v3 tests).

- [ ] **Step 6: Add the prompt constraint in `src/judgment/judgment.ts`**

In `buildProposalContent`'s `system` string, insert this sentence immediately before the final `'Keep commercials.text to ONE short sentence ...'` line (~line 160):

```ts
      'Keep titleLine SHORT — at most 6 words. It is the cover headline rendered very ' +
      'large, so a long title wraps and crowds the layout. ' +
```

> No unit test for the prompt text: the judgment tests mock `askJson`, so the system prompt is not asserted (it is an internal string). This is an intentional skipped test — the constraint is verified by the build + the cover render staying within bounds. State this if asked.

- [ ] **Step 7: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS, 0 errors.

- [ ] **Step 8: Render sanity check (manual eyeball, optional but recommended)**

Run: `npm run render:sample` then `sips -s format png out/sample-proposal.pdf --out /tmp/p1.png` and view page 1. Confirm the cover title and stat-callouts do not collide.

- [ ] **Step 9: Commit**

```bash
git add src/render/template.ts src/judgment/judgment.ts test/render/template-v3.test.ts
git commit -m "fix: auto-scale cover headline and constrain titleLine length"
```

---

## Task 2: Preserve the quoted thread + Reply-All on standard reply drafts

**Why:** `GraphClient.createDraftReply` POSTs `createReply` (Reply, not Reply-All) and then PATCHes `body.content` with ONLY our HTML — which **wipes the quoted thread** Graph generated. Switch to **Reply-All** (keeps CC'd participants) and **prepend** our HTML above the existing quote instead of replacing it.

**Scope guard:** Only `createDraftReply` (the standard scoping/clarify/follow-up/proposal path) changes. `createDraftToExternal` (the forwarded-enquiry path) is **left exactly as-is on purpose** — it must stay a plain `createReply` that replaces the body, so we never leak the internal forwarder's quoted commentary to an external prospect.

**Files:**
- Modify: `src/adapters/graph.ts` (`createDraftReply`, lines 86–97)
- Test: `test/adapters/graph.test.ts`

- [ ] **Step 1: Write the failing tests** — append inside the `describe('GraphClient', ...)` block in `test/adapters/graph.test.ts`

```ts
  it('createDraftReply uses Reply-All and prepends our HTML above the quoted thread', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { id: 'draft-9', body: { contentType: 'HTML', content: '<div class="quote">--- original thread ---</div>' } } },
      { json: {} },
    ]);

    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const id = await g.createDraftReply('m1', '<p>Our reply</p>');

    expect(id).toBe('draft-9');
    // 1) created via createReplyAll (keeps CC'd participants on the thread)
    const createUrl = fetchMock.mock.calls[1]![0] as string;
    expect(createUrl).toContain('/messages/m1/createReplyAll');
    // 2) PATCH prepends our HTML and keeps the quoted thread
    const patchBody = JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string);
    expect(patchBody.body.content).toBe('<p>Our reply</p><div class="quote">--- original thread ---</div>');
  });

  it('createDraftReply tolerates a draft response with no body content', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { id: 'draft-10' } }, // no body field
      { json: {} },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const id = await g.createDraftReply('m1', '<p>Our reply</p>');
    expect(id).toBe('draft-10');
    const patchBody = JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string);
    expect(patchBody.body.content).toBe('<p>Our reply</p>');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- adapters/graph`
Expected: FAIL — current code calls `/createReply` and the PATCH content equals only `<p>Our reply</p>` (quote wiped).

- [ ] **Step 3: Rewrite `createDraftReply` in `src/adapters/graph.ts`**

Replace lines 86–97:

```ts
  async createDraftReply(messageId: string, bodyHtml: string): Promise<string> {
    const created = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/createReply`,
      { method: 'POST' },
    );
    const draft = (await created.json()) as { id: string };
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: { contentType: 'HTML', content: bodyHtml } }),
    });
    return draft.id;
  }
```

with:

```ts
  /** Create a Reply-All draft and PREPEND our HTML above the quoted thread Graph generated.
   *  Reply-All keeps CC'd participants on the conversation; prepending (not replacing) keeps
   *  the prospect's quoted message intact. The forwarded path uses createDraftToExternal,
   *  which deliberately does NOT preserve the quote. */
  async createDraftReply(messageId: string, bodyHtml: string): Promise<string> {
    const created = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/createReplyAll`,
      { method: 'POST' },
    );
    const draft = (await created.json()) as { id: string; body?: { content?: string } };
    const existing = draft.body?.content ?? '';
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: { contentType: 'HTML', content: `${bodyHtml}${existing}` } }),
    });
    return draft.id;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- adapters/graph`
Expected: PASS. (The existing `graph-external-draft.test.ts` for `createDraftToExternal` is untouched and must stay green — confirm in the next step.)

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS, 0 errors. Pay attention that `graph-external-draft.test.ts` still passes (forwarded path unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/adapters/graph.ts test/adapters/graph.test.ts
git commit -m "fix: reply-all and preserve quoted thread on standard reply drafts"
```

---

## Task 3: Quiet Slack — skip the summary post on no-activity ticks

**Why:** `runLoop` posts the run-summary to Slack every 20 min even on empty ticks (0 staged / 0 advanced / 0 disqualified / 0 flagged / 0 errors), spamming the channel. Post only when something real happened; always emit a `run_done` log so silent runs are still observable.

**Files:**
- Modify: `src/orchestrator/loop.ts` (lines 172–182)
- Test: `test/orchestrator/loop.test.ts`

- [ ] **Step 1: Write the failing test** — append a new describe block to `test/orchestrator/loop.test.ts`

```ts
describe('runLoop — quiet ticks', () => {
  it('skips the Slack summary when nothing happened but still updates the canvas', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.repo.listDeals as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const summary = await runLoop(deps);

    expect(deps.slack.postStaging).not.toHaveBeenCalled();
    expect(deps.slack.upsertCanvas).toHaveBeenCalledOnce();
    expect(summary).toEqual({ processed: 0, staged: 0, advanced: 0, disqualified: 0, flagged: 0, errors: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- orchestrator/loop`
Expected: FAIL — `postStaging` is called once (current code always posts).

- [ ] **Step 3: Gate the post in `src/orchestrator/loop.ts`**

Replace lines 177–180:

```ts
  const header = `:robot_face: *NI Sales Agent — run summary*${config.dryRun ? ' (dry-run)' : ''}\n` +
    `_${summary.processed} inbound · ${summary.staged} staged · ${summary.advanced} advanced · ` +
    `${summary.disqualified} disqualified · ${summary.flagged} flagged · ${summary.errors} errors_`;
  await slack.postStaging(config.slackChannelId, [header, ...stagingLines, ...reviewLines].join('\n\n'));
```

with:

```ts
  logger.info('run_done', { ...summary });

  const hasActivity = stagingLines.length > 0 || reviewLines.length > 0;
  if (hasActivity) {
    const header = `:robot_face: *NI Sales Agent — run summary*${config.dryRun ? ' (dry-run)' : ''}\n` +
      `_${summary.processed} inbound · ${summary.staged} staged · ${summary.advanced} advanced · ` +
      `${summary.disqualified} disqualified · ${summary.flagged} flagged · ${summary.errors} errors_`;
    await slack.postStaging(config.slackChannelId, [header, ...stagingLines, ...reviewLines].join('\n\n'));
  }
```

> `logger` is already imported in `loop.ts` (line 7). `disqualified`, `staged`, `advanced`, and `errors` all push a line into `stagingLines`, and low-confidence pushes into `reviewLines`, so `hasActivity` correctly covers every "real" counter. A tick whose only outcome is `processed > 0` (all inbound matched existing deals → `continue`) produces no lines and is correctly treated as quiet.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- orchestrator/loop`
Expected: PASS. The existing tests that assert `postStaging` toHaveBeenCalledOnce (NEW enquiry, dry-run, canvas, PO slices) still pass because each has activity.

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/loop.ts test/orchestrator/loop.test.ts
git commit -m "fix: skip Slack run-summary on no-activity ticks"
```

---

## Task 4: Idempotency guard — never stack a second Outlook draft on a thread

**Why:** `stageDraft`/`stageProposal` create an Outlook draft without first checking whether an unsent draft already exists on the thread (CLAUDE.md gate #4). A cron race during the v3 E2E produced a duplicate proposal draft (deleted by hand). Add a Graph query for existing drafts in the conversation and skip staging when one already exists.

**Behaviour:** When a draft already exists on the thread (and not in dry-run), skip the whole staging action — no second draft, no second Slack post, no re-render. The prior run already drafted, posted, and persisted the stage, so state stays consistent. The guard is placed at the **top** of `stageProposal` so the expensive `buildProposalContent` + `deck.render` are skipped too.

**Files:**
- Modify: `src/adapters/graph.ts` (new method near `wasReplySent`, ~line 117)
- Modify: `src/orchestrator/loop.ts` (`GraphPort` interface line 13–20; guards in `stageDraft` ~line 317 and `stageProposal` ~line 365)
- Test: `test/adapters/graph.test.ts`, `test/orchestrator/loop.test.ts`

- [ ] **Step 1: Write the failing Graph test** — append inside `describe('GraphClient', ...)` in `test/adapters/graph.test.ts`

```ts
  it('draftExistsInConversation queries the drafts folder, escapes quotes, and returns true when a draft exists', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { value: [{ id: 'existing-draft' }] } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const exists = await g.draftExistsInConversation("conv'1");
    expect(exists).toBe(true);
    const url = fetchMock.mock.calls[1]![0] as string;
    expect(url).toContain('/mailFolders/drafts/messages');
    expect(decodeURIComponent(url)).toContain("conversationId eq 'conv''1'");
  });

  it('draftExistsInConversation returns false when no draft exists', async () => {
    mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { value: [] } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    expect(await g.draftExistsInConversation('conv-2')).toBe(false);
  });
```

- [ ] **Step 2: Run the Graph test to verify it fails**

Run: `npm test -- adapters/graph`
Expected: FAIL — `draftExistsInConversation` is not a function.

- [ ] **Step 3: Add `draftExistsInConversation` to `GraphClient`**

In `src/adapters/graph.ts`, insert after `wasReplySent` (after line 125):

```ts
  /** True if an unsent draft already exists on the conversation (idempotency guard — CLAUDE.md gate #4). */
  async draftExistsInConversation(conversationId: string): Promise<boolean> {
    const filter = encodeURIComponent(`conversationId eq '${this.odata(conversationId)}'`);
    const path = `/users/${this.box()}/mailFolders/drafts/messages?$filter=${filter}&$top=1&$select=id`;
    const res = await this.call(path);
    const json = (await res.json()) as { value: unknown[] };
    return json.value.length > 0;
  }
```

- [ ] **Step 4: Run the Graph test to verify it passes**

Run: `npm test -- adapters/graph`
Expected: PASS.

- [ ] **Step 5: Add the method to the `GraphPort` interface in `src/orchestrator/loop.ts`**

In the `GraphPort` interface (lines 13–20), add this line after `wasReplySent`:

```ts
  draftExistsInConversation(conversationId: string): Promise<boolean>;
```

- [ ] **Step 6: Add `draftExistsInConversation` to the loop-test `baseDeps` mock**

In `test/orchestrator/loop.test.ts`, in the `graph: { ... }` mock object (~line 16–31), add after the `wasReplySent` line:

```ts
      draftExistsInConversation: vi.fn().mockResolvedValue(false),
```

> This keeps all existing loop tests green (guard sees "no existing draft" → proceeds as before).

- [ ] **Step 7: Write the failing guard test** — append a new describe block to `test/orchestrator/loop.test.ts`

```ts
describe('runLoop — idempotency guard', () => {
  it('does not create a second proposal draft when one already exists on the thread', async () => {
    const deps = baseDeps({});
    (deps.graph.draftExistsInConversation as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.repo.listDeals as ReturnType<typeof vi.fn>).mockResolvedValue([
      { deal_id: 'conv-1', stage: 'SCOPE_REVIEW', company: 'Novelty Wealth', contact_name: 'Shashank',
        contact_email: 'kkmookhey@gmail.com', service_lines: ['pentest_mobile'], created_at: '2026-06-01T00:00:00Z',
        last_inbound_id: 'm1', last_inbound_at: '2026-06-02T10:00:00Z', next_followup_date: null, followup_count: 0,
        scope: { service_lines: ['pentest_mobile'], asset_count: null, environment: null, compliance_driver: null,
          timeline: null, prior_testing: null, access_model: null, authority_signal: null, region: null },
        assumptions: [], proposal: null, actions: [], flags: [], intake: { source: 'direct', recipient_verified: true } },
    ]);
    (deps.graph.latestInboundInConversation as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'm2', conversationId: 'conv-1', subject: 'Re: VAPT', fromName: 'Shashank',
      fromAddress: 'kkmookhey@gmail.com', participants: ['kkmookhey@gmail.com'], receivedDateTime: '2026-06-02T12:00:00Z',
      bodyPreview: 'answers', bodyFull: '<p>answers</p>', hasAttachments: false,
    });

    await runLoop(deps);

    expect(deps.judge.buildProposalContent).not.toHaveBeenCalled(); // guarded before the expensive render
    expect(deps.deck.render).not.toHaveBeenCalled();
    expect(deps.graph.createDraftReply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run the guard test to verify it fails**

Run: `npm test -- orchestrator/loop`
Expected: FAIL — `buildProposalContent`/`deck.render`/`createDraftReply` are still called (no guard yet).

- [ ] **Step 9: Add the guard to `stageProposal` in `src/orchestrator/loop.ts`**

At the very top of `stageProposal` (right after the `const { config, graph, repo, judge, deck, s3 } = deps;` destructure, ~line 365), insert:

```ts
  if (!config.dryRun && (await graph.draftExistsInConversation(deal.deal_id))) {
    logger.info('skip_duplicate_draft', { deal_id: deal.deal_id, stage: deal.stage, action: 'proposal' });
    return null;
  }
```

- [ ] **Step 10: Add the guard to `stageDraft` in `src/orchestrator/loop.ts`**

At the top of `stageDraft` (right after `const { config, graph, repo } = deps;`, ~line 317), insert:

```ts
  if (!config.dryRun && (await graph.draftExistsInConversation(deal.deal_id))) {
    logger.info('skip_duplicate_draft', { deal_id: deal.deal_id, stage: deal.stage, action: actionType });
    return null as unknown as AdvanceResult;
  }
```

> `stageDraft` is typed to return `Promise<AdvanceResult>` (non-null), but its callers in `advanceDeal` already handle a `null` result via `if (line)` in the run loop. Returning `null` here is the minimal-change path. The `as unknown as AdvanceResult` cast keeps the signature; alternatively widen the return type to `Promise<AdvanceResult | null>` and drop the cast — pick whichever the code-quality reviewer prefers. Default to widening the return type for cleanliness:
>
> - Change `stageDraft`'s signature `): Promise<AdvanceResult> {` → `): Promise<AdvanceResult | null> {` and use plain `return null;`.
> - The two `return stageDraft(...)` sites in `advanceDeal` (STAGE_SCOPING ~line 279, STAGE_FOLLOWUP ~line 285) and the NOOP-path `return stageDraft(...)` (~lines 221, 250) already flow into `advanceDeal`'s `Promise<AdvanceResult | null>` return type, so no caller change is needed.

- [ ] **Step 11: Run the guard test to verify it passes**

Run: `npm test -- orchestrator/loop`
Expected: PASS.

- [ ] **Step 12: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS, 0 errors. All pre-existing tests stay green (guard defaults to false in `baseDeps`).

- [ ] **Step 13: Commit**

```bash
git add src/adapters/graph.ts src/orchestrator/loop.ts test/adapters/graph.test.ts test/orchestrator/loop.test.ts
git commit -m "fix: guard against stacking duplicate Outlook drafts on a thread"
```

---

## Final verification (after all tasks)

- [ ] `npm run typecheck && npm run lint && npm test` — all green, 0 errors.
- [ ] `git log --oneline -5` — four clean conventional commits, one per task.
- [ ] Optional render eyeball: `npm run render:sample` + `sips -s format png out/sample-proposal.pdf --out /tmp/p1.png`.
- [ ] **Do NOT deploy.** Hand back for a whole-diff review + explicit go-ahead before any live AWS deploy.

---

## Out of scope (handoff "recommended" items NOT in this plan)

- **Dead LLM fields** (`understanding`/`approach`/`nextSteps`/`transilienceEdge` no longer rendered by the v3 deck) — trim from the prompt/type later.
- **Lucide tree-shaking** (~402KB inlined, ~24 icons used).
- **Group B** (XLS/PDF attachment parsing) — separate brainstorm → spec → plan; security-sensitive.

## Self-review notes

- **Spec coverage:** Group A items 1–4 map to Tasks 1 (long-title), 2 (quote + reply-all), 3 (quiet Slack); idempotency gap → Task 4. ✅
- **Type consistency:** new `coverTitleFontPx(string): number`, `draftExistsInConversation(string): Promise<boolean>` used identically in adapter, port, and tests. `stageDraft` return widened to `AdvanceResult | null` consistently. ✅
- **No placeholders:** every code step shows full code; every run step shows the command + expected result. ✅
