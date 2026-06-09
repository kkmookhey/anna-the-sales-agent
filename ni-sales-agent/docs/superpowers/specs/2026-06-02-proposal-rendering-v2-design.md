# Proposal Generator v2 — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design); ready for implementation planning
**Author:** KK Mookhey + Claude

---

## 1. Goal & success criteria

Lift the NI Sales Agent's proposal output from a procedurally-drawn PPTX to a **top-tier,
brand-faithful proposal** whose *content* and *visual quality* both match the standard of a
hand-crafted Transilience/NI artifact.

Two independent lifts:

1. **Content** — proposals are grounded in a curated capability library so they quote *real*
   credentials, services and proof points (covering any cybersecurity requirement — MDR, GRC,
   cloud, AI security, VAPT — not just pentest) and never fabricate.
2. **Visual** — proposals render as a polished **16:9 PDF** built from the Transilience design
   system via HTML/CSS → headless Chrome, replacing pptxgenjs.

**Success criteria:**
- A generated proposal is grounded in `capability-library.md`: must-highlight credentials appear on
  technical engagements; no invented facts, clients, or numbers.
- Output is a 16:9 PDF rendered with the Transilience palette/type, attached to an Outlook draft and
  staged in Slack — same human-approval gates as today (draft-and-hold; nothing auto-sends).
- Sales can adjust pricing via a Slack-thread instruction and get a regenerated PDF.
- Tests pass (HTML snapshot, PDF validity, credential-presence), lint + typecheck clean.
- The existing orchestration / state machine / scoping / approval loop is **unchanged** in behavior.

**Out of scope (explicitly):** editable-PPTX output, a chat interface for free-form deck editing,
Excel/Word commercial annexures, and HubSpot similar-customer enrichment. The last is V2 (see §10).

---

## 2. Current state (what we're changing)

- `aws/src/proposal/deck.ts` — pptxgenjs procedural deck (9 slides, fixed palette, Calibri, logo
  embed). **Replaced.**
- `aws/src/proposal/types.ts` — `ProposalContent` data model. **Extended.**
- `aws/src/judgment.ts` (`buildProposalContent`) — Bedrock content generation from scope/assumptions
  only, no collateral grounding. **Enriched with the capability library.**
- `aws/src/loop.ts` (`stageProposal`) — calls `deck.render()` in-process, uploads to S3, attaches to
  Outlook draft, Slack stages. **Rewired to invoke the render Lambda.**
- `skills/proposal-assembly/SKILL.md` — references `ni-branded-pptx`. **Updated.**
- CDK `aws/infra/cdk/ni-sales-agent-stack.ts` — single NodejsFunction, `pptxgenjs` unbundled,
  `afterBundling` copies skills + assets. **Adds a render Lambda; drops pptxgenjs.**
- Lambda runtime: Node 20 (no Python). Bedrock model: global Sonnet 4.5.

---

## 3. Architecture

```
prospect reply
  → assessSufficiency                                            (unchanged)
  → stageProposal (orchestrator / tick Lambda)
      → buildProposalContent(Bedrock)                            ENRICHED
          + capability-library.md injected as a CACHED grounding block
          → ProposalContent (now incl. credentials[], transilienceEdge[])
      → invoke ni-sales-render  { content }                      NEW Lambda (pure fn)
          → fill HTML template (Transilience design system)
          → puppeteer-core + @sparticuz/chromium → PDF (16:9)
          → return { pdfBase64 }
      → S3 put proposals/<slug>-proposal-v<n>.pdf  (orchestrator) (reused path)
      → Outlook draft attachment (PDF bytes)                     (reused path)
      → Slack staging post → PROPOSAL_PENDING_APPROVAL          (unchanged)
```

### 3.1 Two-Lambda split (decision)

Headless Chrome lives in a **dedicated `ni-sales-render` Lambda**, not the orchestrator.

- **Orchestrator (tick) Lambda** — unchanged size/runtime; ticks every 20 min; stays lean.
- **`ni-sales-render` Lambda** — Node 20, **2048 MB**, **120 s** timeout, **1024 MB** ephemeral
  (`/tmp`). Deps (unbundled `nodeModules`, like pptxgenjs is today): `puppeteer-core`,
  `@sparticuz/chromium` (full package — bundled binary matches the npm version, eliminating
  version-drift maintenance). Carries the HTML template module, bundled fonts, and the NI logo.
- **Contract:** the render Lambda is a **pure function** — `content → PDF bytes`. Synchronous
  `Invoke` (RequestResponse); request `{ content: ProposalContent }`; response `{ pdfBase64: string }`.
  The orchestrator's existing `DeckPort.render(content) => Promise<Buffer>` is preserved: only the
  implementation swaps from in-process pptxgenjs to a Lambda-invoke client that decodes the base64.
  The orchestrator keeps its current S3 put + Outlook attach unchanged. The render Lambda needs **no
  S3 access**. (PDF responses are well under the 6 MB sync-invoke limit; ~11 pages of text + subset
  fonts is typically <1 MB. If proposals ever grow large, switch to an S3 hand-off — V2.)
- **IAM:** orchestrator gets `lambda:InvokeFunction` on the render Lambda. No S3 grant on the render
  Lambda. Env/wiring via CDK (`RENDER_FUNCTION_NAME` on the orchestrator).

**Rationale:** isolates a ~170 MB, occasionally-used, memory-hungry dependency from the frequent
tick path; independent memory tuning; tick cold-starts unaffected.
**Cost:** +1 CDK construct, +1 IAM grant, and a ~2–4 s Chromium cold-start on the (human-gated,
infrequent) proposal path — acceptable.

### 3.2 Content grounding (decision)

- `capability-library.md` lives at `aws/src/content/capability-library.md` (already written &
  fact-checked).
- CDK `afterBundling` copies `src/content/` → `<output>/content/` (same mechanism as skills/logo).
- `judgment.ts` loads it at runtime via the existing candidate-path resolution
  (`join(here,'content','capability-library.md')` / `LAMBDA_TASK_ROOT`).
- `buildProposalContent` injects the **full** library (~12 KB) into the Bedrock system prompt,
  marked *"quote, never invent."*
- **No prompt caching:** proposals are generated infrequently, so Bedrock's 5-minute cache TTL would
  essentially never hit — caching would add complexity for ~zero benefit. Skipped.
- Section-by-serviceLine selection to trim tokens is a deliberate later optimization — full inject
  is the v1 choice for determinism and reliability.

---

## 4. Data model changes

`aws/src/proposal/types.ts` — extend `ProposalContent`:

```ts
interface ProposalContent {
  // ... existing fields unchanged ...
  credentials: string[];       // NEW — from library §3; must-highlights first on technical work
  transilienceEdge: string[];  // NEW — from library §5; populated only when it strengthens the case
}
```

- Both default to `[]` (sparse → section drops, mirroring existing optional-section behavior).
- `proposal-assembly/SKILL.md` updated to: (a) read the capability library as grounding,
  (b) populate `credentials` and `transilienceEdge` from it (library-only, never invented),
  (c) keep the existing pricing discipline, (d) drop the `ni-branded-pptx` rendering reference and
  point at the HTML renderer instead.

---

## 5. The HTML template

- **One deterministic template.** Claude designs it once (via the `frontend-design` skill, against
  the Transilience design system); a TS function fills it from `ProposalContent` at runtime. The LLM
  never emits layout HTML per proposal — that would reintroduce brand drift.
- **Format:** 16:9 pages. CSS `@page { size: 1280px 720px; margin: 0 }` + `page-break-after: always`
  per section. Puppeteer `page.pdf({ printBackground: true, preferCSSPageSize: true })`.
- **Design system:** reuse tokens from `Website/colors_and_type.css` / `branding2.md`. Rich Black
  (`#0A0A0B`) surfaces, violet→crimson gradient (`#582A90 → #B61A3F`) earned on hero/accent bars,
  Bumblebee yellow (`#FCE205`) accent only. Geometric radii, hairline borders.
- **Fonts & logo:** **Jost** (display, 400/600) + **Roboto** (body, 400/500) and the NI logo are
  inlined as **committed base64 constants** (`src/render/assets.generated.ts`, produced once by a
  generation script from the `@fontsource` packages + `ni-logo.png`). The template references them as
  `@font-face`/`data:` URIs. This compiles the assets into the esbuild bundle — no runtime file
  reads, no bundle path-resolution (the failure mode from the prior session). If licensed Futura PT
  is supplied later, regenerate with it as `--font-display`.
- **Section flow** (sparse sections drop cleanly):
  Cover → Understanding your need → Scope (table) → Approach & standards → Deliverables & timeline →
  Credentials → Transilience edge (conditional) → Why NI → Assumptions → Commercials → Next steps.

---

## 6. Pricing edits

Unchanged from the agreed approach: **regenerate-on-Slack-instruction**. Sales replies in the
approval thread with a pricing directive; the orchestrator re-runs `buildProposalContent` (or patches
`commercials`) → re-invokes the render Lambda → replaces the Outlook draft attachment. Reuses the
existing approval loop and state machine; no new artifact format. Full free-form chat editing is
out of scope (later).

---

## 7. Testing

- **HTML snapshot** (deterministic) — fill the template with fixture `ProposalContent`; snapshot the
  HTML string to catch layout/regression drift without rendering.
- **PDF validity** — assert magic bytes `%PDF` and non-trivial size (mirrors today's `deck.test.ts`).
- **Credential presence** — for a technical-engagement fixture, assert the four must-highlight
  credentials appear in the rendered HTML.
- **Grounding** — unit-test that `buildProposalContent` includes the library in the Bedrock request
  payload (mock Bedrock).
- **Manual gate** — generate a sample PDF locally and eyeball it before deploy (the Chromium render
  is the one real unknown; verify font loading and `/tmp` sizing here).

---

## 8. Cleanup / removals

- Delete `aws/src/proposal/deck.ts` and `aws/test/proposal/deck.test.ts` (replaced).
- Remove `pptxgenjs` from dependencies and from the CDK `nodeModules` unbundled list.
- Update `skills/proposal-assembly/SKILL.md`; retire `ni-branded-pptx` references.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Chromium-in-Lambda (binary, fonts, `/tmp`) is the main unknown | `@sparticuz/chromium` is well-trodden; verify with the local-render manual gate before wiring into the pipeline; 1 GB ephemeral + 2048 MB memory headroom |
| PDF payload / S3 round-trip | Render Lambda writes to S3 and returns the key; orchestrator fetches bytes — avoids the 6 MB sync-invoke response limit |
| Grounding bloats tokens / cost | Library is prompt-cached (static); ~12 KB; section-selection optimization deferred |
| Brand drift if LLM touches layout | LLM produces *content only*; layout is a fixed deterministic template |

---

## 10. V2 (not in this build)

- HubSpot similar-customer pull: surface closed-won clients in the prospect's vertical from the last
  18 months to tailor the proof section (library §13).
- Section-by-serviceLine library selection for token efficiency.
- Free-form chat interface for deck editing.
- Optional editable-PPTX secondary output, if a real need emerges.
