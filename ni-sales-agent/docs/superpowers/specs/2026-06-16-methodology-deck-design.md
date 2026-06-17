# Slice 2 — In-depth Methodology Deck for RFP / Large Engagements

> Long-form 20–25 slide methodology deck · curated methodology library · diagrammatic graphics
> Date: 2026-06-16 · Status: approved design, pre-plan
> Builds on Slice 1 (commercial correctness — geo entity, letterhead commercials, effort estimation).
> Slice 1 shipped `ProposalContent.effort` with `isLarge` (>10 man-days) — the routing trigger here.

---

## 1. Problem

Every deal today renders the same 10-slide standard proposal deck (`renderProposalHtml` in
`aws/src/render/template.ts`). That is right for a small, focused engagement. It is **not**
enough for an RFP or a >10 man-day scope, where a technical evaluator expects in-depth
methodology: which standards and frameworks we test against, our phase-by-phase approach
per service line, how AI accelerates delivery, a framework/compliance crosswalk, and a
credible effort & timeline plan. The reference NI/Transilience decks (e.g. the L&T deck)
are ~18–20 slides with exactly this structure; we need to generate that calibre on demand.

## 2. Goal & success criteria

When `effort.isLarge` (>10 man-days) **or** an RFP signal is detected, Anna produces a
**20–25 slide methodology deck** that:

- Leads with the engagement thesis, understanding, and scope (reusing existing slides).
- Presents an **operating-loop methodology overview** (NI testing lifecycle / ADVISE).
- Goes **deep per service line** — phase-by-phase, citing real frameworks (OWASP WSTG/ASVS,
  PTES, NIST SP 800-115, MITRE ATT&CK, OSSTMM, CIS) and tooling, grounded in a curated
  library (never invented).
- Tells the **AI-augmented delivery** story (Transilience: ~16,000 raw findings → ~10
  prioritized actions; 95% prioritization accuracy; ~80% alert-investigation reduction).
- Shows a **framework / compliance crosswalk** matrix.
- Surfaces the **effort (man-days)** from Slice 1 plus a **day-by-day delivery timeline**.
- States the **boundary** (assumptions / exclusions) for credibility.
- Uses **diagrammatic CSS/SVG components**, on-brand, rendered crisp in the PDF.

Small deals (`!isLarge && !rfp`) keep the existing 10-slide deck, **byte-for-byte unchanged**.

Done = new units have passing tests; lint + typecheck pass; a representative multi-service
large deal renders a 20–25 slide methodology PDF; a small deal still renders the standard
deck; methodology content quotes only the curated library.

## 3. Positioning (carried from Slice 1)

NI delivers the offensive / assessment work (CREST-accredited); Transilience is the AI
layer (vulnerability prioritization, noise reduction, continuous exposure). The methodology
deck makes that concrete: each service line shows where Transilience accelerates the
human-led methodology, which is why the man-day estimates are lower than pure-human delivery.

## 4. Architecture

```
deal ── buildProposalContent ──► ProposalContent (+ effort.isLarge, + rfp)
                                        │
                 deckType = (effort.isLarge || rfp) ? 'methodology' : 'standard'   (loop.ts)
                                        │
        ┌───────────────── standard ───┴─── methodology ─────────────────┐
        ▼                                                                 ▼
renderProposalHtml (unchanged)            judge.buildMethodologyContent({proposal, scope, library})
                                                                          │
                                                          ──► MethodologyContent
                                                                          │
                                                          renderMethodologyHtml(content, methodology)
                                                                          │
                                                          standard slides + new methodology slides
                                                                          │  (htmlToPdf, unchanged)
                                                                          ▼
                                                          20–25 slide methodology PDF
```

The render-event payload gains `deckType` and (for methodology) `methodology` — same
threading pattern Slice 1 used for `entity`. The commercials `.docx` path is unchanged.

### 4.1 New / changed units

| Unit | File | Purpose |
|---|---|---|
| Methodology library | `aws/src/render/methodology-library.ts` (new) | Curated, per-service-line methodology grounding (phases, frameworks, tooling, AI-augmentation) + generic fallback |
| Methodology content types | `aws/src/proposal/types.ts` (modify) | `MethodologyContent` + sub-types; `rfp: boolean` on `ProposalContent` |
| Methodology generation | `aws/src/judgment/judgment.ts` (modify) | `buildProposalContent` also returns `rfp`; new `buildMethodologyContent(...)` |
| Methodology skill prompt | inline in `judgment.ts` + `methodology-assembly` content | Output-keys + grounding instruction for the methodology call |
| Diagram CSS | `aws/src/render/design-system/proposal.css` (modify) + regenerate `assets.generated.ts` | New components: flow-band, coverage-table, crosswalk-matrix, kill-chain, funnel, day-timeline, badge, fw-tag |
| Methodology slide builders | `aws/src/render/methodology-template.ts` (new) | `buildMethodologyOverview`, `buildServiceMethodology`, `buildAiAugmentedDelivery`, `buildFrameworkCrosswalk`, `buildEffortTimeline`, `buildBoundary` |
| Methodology deck assembler | `aws/src/render/methodology-template.ts` `renderMethodologyHtml(content, methodology)` | Orders standard + methodology builders, numbered chapters, dynamic numbering |
| Shared slide chrome | refactor small helpers out of `template.ts` if needed (`head`, `foot`, `SlideDesc`, `esc`, `logoMark`) into a shared module both templates import | Avoid duplication between standard and methodology templates |
| Render handler | `aws/src/render/handler.ts` (modify) | Pick `renderMethodologyHtml` vs `renderProposalHtml` by `event.deckType`; thread `event.methodology` |
| Adapter | `aws/src/adapters/render.ts` (modify) | `render(content, entity?, deckType?, methodology?)` |
| Orchestrator | `aws/src/orchestrator/loop.ts` (modify) | Compute `deckType`; for methodology, call `buildMethodologyContent` and pass it through |

## 5. Detailed design

### 5.1 Methodology library — `methodology-library.ts`

```ts
export interface MethodologyPhase { name: string; detail: string }
export interface ServiceMethodology {
  key: string;             // service-line key, e.g. 'pentest_web'
  label: string;           // human label
  phases: MethodologyPhase[];      // ordered lifecycle phases for this line
  frameworks: string[];    // e.g. ['OWASP WSTG', 'OWASP ASVS', 'PTES', 'NIST SP 800-115']
  tooling: string[];       // representative tools (NI uses + AI)
  aiAugmentation: string;  // how Transilience accelerates THIS line
}
export function methodologyFor(serviceLineKey: string): ServiceMethodology; // falls back to GENERIC
export const ADVISE_LOOP: MethodologyPhase[]; // NI's overall operating loop (Assess→...→Evolve)
```

v1 keys (with a `GENERIC` fallback for any unlisted line): `pentest_web`, `pentest_mobile`,
`pentest_api`, `pentest_network`, `red_team`, `cloud_security`, `config_review`,
`compliance` / `audit`. Each authored from the public standard bodies + NI's ADVISE. The
library is the single source of framework names — Bedrock receives the relevant subset and
must quote only from it.

### 5.2 Content types — `proposal/types.ts`

```ts
export interface FrameworkCrosswalkRow { area: string; frameworks: string[]; evidence: string }
export interface TimelineDay { day: string; milestone: string }
export interface ServiceMethodologyBlock {
  serviceLine: string;
  phases: { name: string; detail: string }[];
  frameworks: string[];
  tooling: string[];
  aiAugmentation: string;
}
export interface MethodologyContent {
  operatingLoop: { name: string; detail: string }[];   // tailored ADVISE / testing lifecycle
  services: ServiceMethodologyBlock[];                  // one per in-scope service line
  aiHighlights: { stat: string; label: string }[];     // e.g. {stat:'16k→10', label:'...'}
  crosswalk: FrameworkCrosswalkRow[];
  timeline: TimelineDay[];                              // day-by-day plan from effort man-days
  exclusions: string[];                                 // the boundary
}
```
`ProposalContent` gains `rfp: boolean`.

### 5.3 Methodology generation — `judgment.ts`

- `buildProposalContent` output-keys gains `rfp (boolean — true if the enquiry/scope reads as
  a formal RFP/tender or a structured multi-line evaluation)`. Normalised to a boolean in code.
- New `buildMethodologyContent({ proposal, scope, library })`: loads a `methodology-assembly`
  instruction + the relevant library subset, asks for the `MethodologyContent` shape, grounded
  ("cite only frameworks/tools present in the library subset; never invent"). The timeline is
  derived from `proposal.effort.totalManDays` (spread across phases). Returns validated
  `MethodologyContent`; arrays default to `[]` on omission.

### 5.4 Diagram components — `proposal.css` (+ regenerate)

New, self-contained CSS classes (dark + light variants where needed), then
`npm run gen:render-assets` rewrites the committed `assets.generated.ts`:
- `.flow-band` — horizontal numbered phases with connector chevrons (operating loop).
- `.coverage-table` — rows of area | coverage | framework tags | status badge.
- `.crosswalk-matrix` — grid mapping engagement areas × frameworks/compliance.
- `.kill-chain` — MITRE-style horizontal stage band.
- `.funnel` — the 16k→10 before/after reduction visual.
- `.day-timeline` — vertical day markers with milestones.
- `.badge` (status/severity pill) and `.fw-tag` (framework tag pill).

### 5.5 Slide builders + assembler — `methodology-template.ts`

Reuses shared chrome (`head`, `foot`, `SlideDesc`, `esc`, `logoMark`, `STYLE`) — extracted
from `template.ts` into a shared module (e.g. `render/deck-shared.ts`) and imported by both,
so the standard deck is untouched in behaviour but the helpers are no longer duplicated.

New builders return `SlideDesc`:
- `buildMethodologyOverview(methodology)` — `.flow-band` of the operating loop.
- `buildServiceMethodology(block)` — per service line: phase cards/coverage-table + `.fw-tag`s
  + tooling + AI-augmentation. One slide per line (split to two if a line has many phases).
- `buildAiAugmentedDelivery(methodology)` — `.funnel` + `aiHighlights` stat tiles.
- `buildFrameworkCrosswalk(methodology)` — `.crosswalk-matrix`.
- `buildEffortTimeline(content, methodology)` — Slice 1 effort table (man-days) + `.day-timeline`.
- `buildBoundary(methodology)` — exclusions as a deliberate-scope grid.

`renderMethodologyHtml(content, methodology)` order (numbered chapters `00·…`):
cover → exec summary → understanding → scope → **methodology overview** → **service
methodology ×N** → **AI-augmented delivery** → **framework crosswalk** → deliverables →
**effort & timeline** → credentials → why NI → **boundary** → next steps. Dynamic numbering
(already in the assembler) computes the total; multi-service RFPs land in the 20–25 band.

### 5.6 Routing — `loop.ts`, `handler.ts`, `render.ts`

- `loop.ts`: `const deckType = (content.effort.isLarge || content.rfp) ? 'methodology' : 'standard'`.
  If methodology, `const methodology = await judge.buildMethodologyContent(...)`. Pass both to
  `deck.render(content, entity, deckType, methodology)`. Slack staging notes deck type + slide
  count intent.
- `render.ts`: `render(content, entity?, deckType?, methodology?)` → payload.
- `handler.ts`: `event.deckType === 'methodology' ? renderMethodologyHtml(event.content, event.methodology) : renderProposalHtml(event.content)`.

## 6. Slide-count posture

"20–25" is a **target that scales with service-line count**, not a hard pad. A 2–3 service-line
RFP naturally lands ~20–24 with the fixed slides + per-line deep-dives. A single-line large
engagement renders fewer but still far richer than the standard deck (overview + that line's
deep-dive + AI + crosswalk + effort/timeline + boundary). We do **not** inject filler to hit a
count; if a deck would fall short, the per-service deep-dive expands (phase-per-card) rather
than padding. The slide count is logged for visibility.

## 7. Testing

- `methodology-library.test.ts` — core keys present; `methodologyFor('unknown')` → GENERIC;
  every entry has non-empty phases + frameworks.
- `buildMethodologyContent` (mock judge) — returns the `MethodologyContent` shape; arrays
  default to `[]`; timeline present.
- Each new builder — renders its component class + framework tags; null/empty-safe.
- `renderMethodologyHtml` — for a 3-service large deal, slide count ∈ [20,25]; chapters
  numbered; every section present.
- Routing — small deal (`!isLarge && !rfp`) → `renderProposalHtml` output unchanged;
  large deal → methodology deck. (Assert via handler/adapter and a loop-level test.)
- `design-assets.test.ts` — extends to confirm the new CSS classes are inlined.

## 8. Assumptions (correct any before/while planning)

- **A1** Route on `effort.isLarge || rfp`; standard deck unchanged for small deals.
- **A2** Library v1 = core offensive/assessment lines + GENERIC fallback; expandable later.
- **A3** Methodology generation is a *second* Bedrock call, large-deals-only.
- **A4** Content grounded ONLY in the curated library — no invented frameworks.
- **A5** 20–25 is a scaling target, not a hard pad.
- **A6** Graphics = CSS/SVG components, no image pipeline.
- **A7** First implementation task renders a real sample methodology deck for aesthetic
  validation before all slides are built.

## 9. Out of scope

Editable PPTX export; per-image/diagram generation pipelines; reworking the standard 10-slide
deck; rate-card pricing (Slice 1 §6 boundary still holds — effort stays man-days).
