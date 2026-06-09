# Proposal v3 — Design-System Deck + Editable Commercials Doc — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design); ready for implementation planning
**Author:** KK Mookhey + Claude
**Supersedes:** the flat template introduced in `2026-06-02-proposal-rendering-v2-design.md` (the render Lambda + draft-and-hold pipeline from v2 stay; only the *renderer* is replaced).

---

## 1. Goal & success criteria

Close the quality gap between the app's generated proposal and the hand-crafted "gold" deck
(`NI_IGT_Managed_SOC_Proposal`) by **recreating the real Transilience design system in the renderer**
(deterministically), and move the most-edited content — pricing/terms — into a **separate editable
Word document** attached alongside the PDF.

Validated premise: a one-shot render of the IICA proposal using the design-system handoff
(`deck.css` + `proposal.css` + `deck-stage.js` + assets) produced gold-quality output. So the visual
quality is achievable **deterministically** — no per-deal LLM HTML generation, no Anthropic-API
dependency, no data egress beyond the existing Bedrock content step.

**Success criteria:**
- A generated proposal PDF uses the Transilience design system (Rich Black surfaces, violet→crimson
  gradient, Jost/Roboto, the gold component vocabulary: cover stat-callouts, pillar cards, stat tiles,
  signal rows, scope table, phase tiles, credential chips, CTA cards), at 1920×1080 16:9, one slide
  per page — visually comparable to the gold deck.
- Content is grounded (capability library + deal scope) as today; the renderer is **deterministic**
  and brand-locked; sections drop cleanly when their data is absent.
- A separate **editable `.docx` commercials document** (2–3 pages: proposed commercials, validity,
  PO-entity block, payment terms, exclusions, standard T&Cs) is generated per deal and **attached to
  the same Outlook draft** as the PDF. The deck's commercials slide becomes a brief pointer to it.
- The render Lambda runs offline (no CDN): fonts, icons, CSS, JS, logo all inlined/bundled.
- Existing gates unchanged: draft-and-hold, forwarded-recipient flag, S3 archive, Slack staging.
- Tests pass (HTML-structure assertions, PDF + DOCX validity, content mapping), lint + typecheck clean.

**Out of scope (this version):** per-deal *structural* variety (one rich deterministic deck shape for
all engagements — service-line-specific shapes are a later enhancement); LLM-generated bespoke HTML
(explicitly not needed — see §3); a designer-owned Word template via docxtemplater (we generate the
docx programmatically for v1 — see §5).

---

## 2. Source material (the handoff bundle)

From the Claude Design handoff (`api.anthropic.com/v1/design/h/…`, extracted to
`transilience-ai-design-system/`):
- `project/decks/igt-proposal/` — the gold IGT deck: `deck.css` (framework), `proposal.css`
  (components), `colors_and_type.css` (tokens), `deck-stage.js` (the deck web component with
  `@media print` → one-slide-per-page), `assets/` (logo-mark.svg, photos).
- `project/assets/` — `logo-mark.svg`, `logo-wordmark.svg`, `brand-gradient-bar.png`.
- The validated one-shot deck (`/tmp/iica-deck/`) is the reference implementation for the renderer.

These CSS/JS/asset files are vendored into the repo under `aws/src/render/design-system/` as the
authoritative styling. We recreate the design (per the handoff's intent), not regenerate it per call.

---

## 3. Why deterministic (not LLM-generated HTML)

The visual quality lives in the **design-system CSS + components**, which are fixed. The **content**
quality is already handled by `buildProposalContent` (Bedrock, grounded in the capability library +
scope). So the renderer fills fixed components with grounded content — deterministic, testable,
brand-locked, offline, no new API keys, no data egress. This is strictly simpler and safer than the
earlier "Opus generates HTML per deal" direction, which is dropped.

---

## 4. Component 1 — Design-system deck renderer

### 4.1 Output
A self-contained HTML document: `<deck-stage width="1920" height="1080">` wrapping `<section
class="slide …">` slides, styled by the vendored `colors_and_type.css` + `deck.css` + `proposal.css`
(inlined into a `<style>` block), with `deck-stage.js` inlined (`<script>`). `deck-stage` injects
`@page { size: 1920px 1080px }` on connect; puppeteer `emulateMediaType('print')` + `page.pdf({
printBackground: true, preferCSSPageSize: true })` produces the one-slide-per-page PDF (the proven
path).

### 4.2 Offline assets (no CDN in Lambda)
- **Fonts:** Jost (300/400/500/600/700) + Roboto (300/400/500/700) + JetBrains Mono (400/500) as
  inlined `@font-face` base64 woff2 (extend the existing `assets.generated.ts` generator).
- **Icons:** the `<i data-lucide>` set used by the deck is replaced by an inlined icon map (the ~24
  Lucide SVGs the renderer uses), bundled as a committed constant — no `lucide` CDN, no runtime
  `createIcons()`.
- **Logo / brand:** `logo-mark.svg` (+ wordmark) inlined as data URIs (fixes the faint/clipped logo).

### 4.3 Slide set (deterministic; a slide drops when its data is empty)
Cover → Executive summary → Understanding → Scope → Approach → Deliverables & timeline → Credentials →
Why NI → Commercials (pointer) → Next steps. (Matches the validated IICA reference deck.)

### 4.4 Content model
Extend `ProposalContent` with structured fields the rich components need; the LLM populates them
(grounded), the renderer maps them to components; keep existing fields; everything optional-drops.
New fields (final names settled in the plan):
- `understandingStats: { value: string; label: string }[]` — Understanding stat tiles (deal-specific).
- `pillars: { title: string; body: string }[]` — Executive-summary pillar cards (≤3).
- `signals: { title: string; detail: string }[]` — Understanding signal rows (environment facts).
- `approachPhases: { name: string; detail: string }[]` — Approach phase tiles.
- `ctaSteps: { when: string; title: string; detail: string }[]` — Next-steps CTA cards.
- Reused: `credentials[]` → chips; `whyNi[]` → Why-NI tiles; `scopeRows[]` → scope table;
  `deliverables[]` + `timeline` → deliverables slide; `titleLine`, `company`, `contactName`,
  `serviceLines` → cover (with human-readable service-line labels — see §6).
- **Cover stat-callouts** are firm-level (25+ years, CERT-In, 550+, 200+) sourced from a fixed
  constant (capability library), not the LLM.
The `proposal-assembly` skill + `buildProposalContent` output keys are extended accordingly, still
grounded "quote, never invent."

### 4.5 Files
- Vendor: `aws/src/render/design-system/{colors_and_type.css, deck.css, proposal.css, deck-stage.js}`
  and `…/assets/{logo-mark.svg, logo-wordmark.svg}`.
- `aws/src/render/template.ts` → rewritten to emit the design-system deck HTML from `ProposalContent`
  (one focused builder per slide type; keep `esc()` escaping on all interpolated content).
- `aws/src/render/icons.ts` — the inlined Lucide SVG map.
- `aws/src/render/assets.generated.ts` — extended with the additional font weights + logo SVGs.

---

## 5. Component 2 — Editable commercials `.docx`

### 5.1 Output
A 2–3 page editable Word document generated **programmatically with the `docx` library (MIT)** —
license-clean, offline, no template binary to maintain. Structure (a "standardized template"):
- Header (NI logo/name) + title "Commercial Proposal — <Company>".
- **Proposed commercials** — fixed-fee line(s) / indicative range / placeholder, per the deal's
  `commercials` (mirrors the pricing discipline: placeholder when scope can't justify a figure).
- Scope summary (one line per service line).
- Validity (e.g. 30 days), payment terms, **PO entity block** (NI billing entity name/address/GST —
  a fixed constant), exclusions.
- **Standard terms & conditions** — boilerplate text held in a refine-able constants file
  (`aws/src/render/commercials-content.ts`), clearly marked DRAFT until KK/legal vet it.
- Contact footer.

### 5.2 Why programmatic `docx` (not docxtemplater)
For v1: `docx` (MIT) avoids docxtemplater's licensing questions and a binary-template-file to
maintain, and still produces a fully Word-editable doc sales tweak per deal. The boilerplate/T&C text
lives in `commercials-content.ts` for KK/legal to refine in one place. (A designer-owned Word template
via docxtemplater is a documented later option if legal wants to own the file directly.)

### 5.3 Pipeline placement
The render Lambda returns **both** artifacts: `{ pdfBase64, docxBase64 }`. The orchestrator
(`stageProposal`) stores both in S3 (`proposals/<slug>-proposal-v<n>.pdf` and `…-commercials-v<n>.docx`)
and **attaches both to the same Outlook draft**. The deck's Commercials slide is a brief pointer
("Detailed commercials in the attached document"). Pricing edits = sales edits the `.docx`; **no PDF
regeneration needed** — this is the main UX win.

### 5.4 Files
- `aws/src/render/commercials.ts` — `buildCommercialsDocx(content): Promise<Buffer>` (uses `docx`).
- `aws/src/render/commercials-content.ts` — boilerplate T&Cs, PO-entity block, validity (refine-able).
- Render handler returns `{ pdfBase64, docxBase64 }`; `RenderClient` + `stageProposal` updated to
  handle both; `s3.ts` gains a DOCX content type; `graph.addAttachment` called twice (PDF + DOCX).

---

## 6. Quick wins (folded in)
- Service-line keys → human labels (`pentest_web` → "Web Application VAPT") via a label map used on
  the cover + scope.
- Real logo SVGs inlined (fixes the faint/clipped cover logo from v2).

---

## 7. Architecture (unchanged spine)
```
stageProposal (orchestrator, gates unchanged)
  → buildProposalContent (Bedrock + capability library)   [extended output fields]
  → invoke ni-sales-render { content }
       → build design-system deck HTML  → puppeteer → PDF
       → build commercials .docx (docx lib)
       → return { pdfBase64, docxBase64 }
  → S3 put PDF + DOCX
  → Outlook draft: attach PDF + DOCX  (to prospect; forwarded-recipient flag unchanged)
  → Slack staging + draft-and-hold     (unchanged)
```
Render Lambda timeout/memory may need a small bump for the larger render; no new infra otherwise.

---

## 8. Testing
- **Deck HTML:** structure assertions — `<deck-stage>`, expected slide `data-screen-label`s present
  for populated sections, brand fonts/`@page`/design tokens present, credentials + stat tiles render,
  empty sections omitted, all interpolated content escaped.
- **PDF:** magic bytes `%PDF`, multi-page, non-trivial size.
- **DOCX:** valid OOXML (PK zip signature), contains company + commercials line + PO-entity block.
- **Content mapping:** `buildProposalContent` requests the new structured keys; passthrough into
  `ProposalContent`.
- **Render contract:** `RenderClient` decodes both `pdfBase64` + `docxBase64`; `stageProposal`
  attaches both.
- **Manual gate:** `npm run render:sample` emits both artifacts locally for eyeballing before deploy.

---

## 9. Risks
| Risk | Mitigation |
|------|------------|
| Offline icons/fonts in Lambda | Inline the used Lucide SVGs + all needed woff2 weights; no CDN at render |
| `deck-stage.js` `@page` needs JS to run under `setContent` | Wait for `customElements.whenDefined('deck-stage')` + a tick before `page.pdf`; covered by the local sample gate |
| Render bigger/slower (richer deck) | Bump render Lambda timeout/memory modestly; proposals are infrequent + human-gated |
| Draft T&Cs shipped unvetted | Boilerplate marked DRAFT; KK/legal refine `commercials-content.ts` before real sends; human approval gate |
| One rich shape doesn't fit every engagement type | Acceptable for v1 (covers VAPT/audit/GRC well); service-line shapes = later enhancement |

---

## 10. Implementation slices (build both, then deploy)
- **Slice 1 — Design-system deck renderer:** vendor the CSS/JS/assets; inline fonts/icons/logo;
  extend `ProposalContent` + the content prompt; rewrite `template.ts` to emit the design-system deck;
  render to PDF; service-line labels; local sample.
- **Slice 2 — Commercials `.docx`:** `commercials.ts` + `commercials-content.ts`; render handler
  returns both artifacts; `RenderClient` + `stageProposal` + `s3.ts` + `graph` attach both; deck
  commercials slide → pointer.

Both slices implemented and verified before any deploy (per the established sequencing).
