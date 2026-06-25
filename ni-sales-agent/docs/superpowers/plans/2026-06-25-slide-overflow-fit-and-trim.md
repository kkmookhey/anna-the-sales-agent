# Plan — Stop slides overflowing the footer (content trim + render-time shrink-to-fit)

Date: 2026-06-25
Status: awaiting approval

## Goal

After the ~2x font bump, content-heavy slides overrun: text flows under the absolutely-
positioned footer and/or is clipped at the 1080px bottom edge. Fix it two ways: trim the
generated word count ~10–15% (A), and add a render-time shrink-to-fit guard so a slide can
never silently overflow again regardless of content (C).

## Success criteria

1. No standard slide's flowed content overlaps the footer or is clipped at the bottom, on
   both sample decks (proposal + methodology) and on long-content inputs.
2. Fonts stay at the enlarged sizes by default; the guard only shrinks a slide when it
   would otherwise overflow, and never below a readable floor.
3. Generated body fields are ~10–15% shorter on average via explicit per-field budgets;
   detail/quality is preserved (budgets are tight, not gutting).
4. `npm run typecheck` clean, `npm test` green (existing + new), assets regenerated.

## Background (verified in code)

- Content length is decided by the Bedrock judge in `buildProposalContent` /
  `buildMethodologyContent` (`judgment.ts`). Only a few fields are length-bounded
  (`titleLine` ≤6 words, `commercials.text` one sentence, fixed array counts); most body
  fields (`pillars.body`, `signals.detail`, `scopeRows.detail`, `approachPhases.detail`,
  `deliverables`, `whyNi`, methodology `phases[].detail`, `exclusions`, `crosswalk.evidence`)
  have **no length budget**.
- Templates cap array **counts** (`slice(0,3)`, `Math.min(...,4)`) but not text length.
- Layout has **no overflow guard**: `.slide` is fixed 1920×1080 `overflow:hidden`; `.foot`
  is `position:absolute; bottom:56px`. `deck-stage` auto-scaling only fits the canvas to a
  screen viewport; the PDF prints at authored size (`@media print`, slides in document flow,
  `overflow:hidden`). So overflow flows under the footer and clips. (`deck-stage.js:230`.)
- The flowed content has no wrapper element — `.head`/`.foot` are absolute siblings of the
  inner HTML inside `<section class="slide">` (`deck-shared.ts:assembleSlides`).

## Slice A — Trim generated word count (~10–15%)

Add explicit, tight per-field budgets so the model writes less without losing substance.

1. **`judgment.ts buildProposalContent` prompt** — append budgets: `pillars.body` ≤ ~20
   words; `signals.detail` ≤ ~16; `scopeRows.detail` ≤ ~22; `approachPhases.detail` ≤ ~20;
   each `deliverables` item ≤ ~8; each `whyNi` item ≤ ~12; `understanding` items ≤ ~16.
   State "be specific and concrete within the budget — trim filler, keep facts."
2. **`judgment.ts buildMethodologyContent` prompt** — `phases[].detail` ≤ ~18 words;
   `exclusions` items ≤ ~16; `crosswalk.evidence` ≤ ~10; `operatingLoop[].detail` ≤ ~18;
   `aiAugmentation` one short sentence.
3. **`proposal-assembly/SKILL.md`** — one line reinforcing "tight, scannable slide copy;
   prefer fragments over sentences in cards" so the skill and prompt agree.
   *Tests (`test/judgment/judgment.test.ts`):* assert the two builder prompts contain the
   word-budget phrasing (same style as the existing prompt-contract tests). These are soft
   guarantees — Slice C is the hard backstop.

## Slice C — Render-time shrink-to-fit guard

Make overflow structurally impossible, content-agnostic.

1. **`deck-shared.ts assembleSlides`** — wrap the flowed inner content of standard slides
   in `<div class="slide-content">…</div>` (head + slide-content + foot). `full` slides
   (cover, next-steps) are bespoke/centered and keep their current markup — out of scope of
   the auto-fit (noted as a follow-up if they ever overflow).
2. **`deck.css`** — `.slide-content { transform-origin: top left; width: 100%; }`. (Font
   sizes are px, so scaling must be a transform, not a parent font-size.) Regenerate
   `assets.generated.ts` (`npm run gen:render-assets`) — the deck inlines CSS from there.
3. **`pdf.ts`** — after `emulateMediaType('print')` and the existing readiness wait, run a
   `page.evaluate` fit pass: for each `.slide` containing a `.slide-content`, compute the
   available band (`foot.getBoundingClientRect().top − content.top − GAP`) vs the content's
   natural height (`content.scrollHeight`); if it overflows, set
   `content.style.transform = scale(k)` with `k = clamp(available/natural, MIN_SCALE, 1)`
   (`MIN_SCALE` ≈ 0.62). Floor-hit (still overflowing at MIN_SCALE) is `console.warn`-ed so
   it surfaces in render logs rather than silently clipping.
4. **Extract the scale math** as a pure helper `fitScale(naturalH, availableH, minScale)` in
   a small module (e.g. `render/fit.ts`) so the clamping logic is unit-testable independent
   of the DOM.
   *Tests:* `test/render/fit.ts` — `fitScale` returns 1 when it fits, the exact ratio when
   it overflows, and never below `minScale`. DOM glue is verified by rendering (below).

## Verification

- `npm run typecheck` + `npm test` (incl. new `fitScale` + prompt-budget tests).
- `npm run gen:render-assets && npm run render:sample`, then read both sample PDFs and
  confirm: (a) no footer overlap / bottom clipping on any slide, (b) most slides unscaled
  (fonts still large), (c) only genuinely dense slides shrink, and slightly.
- Add a deliberately overflowing fixture render (long pillar/scope text) to confirm the
  guard engages and the slide fits.

## Out of scope / risks

- `full` slides (cover, next-steps) aren't auto-fit this round; cover already auto-scales
  its title, next-steps is centered. If next-steps overflows on long CTAs we extend the
  wrapper there in a follow-up.
- Transform-scale leaves bottom whitespace on shrunk slides (acceptable — far better than
  overlap). No change to the gating/agent model.
- `assets.generated.ts` must be regenerated and committed for the CSS change to ship.
