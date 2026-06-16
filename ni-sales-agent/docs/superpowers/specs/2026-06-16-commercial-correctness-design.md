# Slice 1 — Commercial Correctness

> Geo legal-entity selection · letterhead commercials · effort estimation
> Date: 2026-06-16 · Status: approved design, pre-plan
> Part of the larger "proposal quality uplift" effort. Slice 2 (content/design
> uplift + 20–25 slide methodology deck) is a separate spec authored after this ships.

---

## 1. Problem

Every commercial proposal Anna stages today is commercially wrong in four ways:

1. It is always billed from **Network Intelligence Pvt. Ltd.** (India), regardless of
   where the customer is — even for US/EU/Middle East prospects.
2. The billing entity address, GSTIN and PAN are literal **placeholders**
   (`[ADDRESS — confirm billing entity address]`).
3. The commercials are a **plain, unbranded `.docx`** built from scratch by the `docx`
   library — not on Network Intelligence letterhead.
4. There is **no effort estimate** — nothing tells the customer how many man-days the
   work is, and nothing reflects that NI delivers heavily AI-augmented (via Transilience),
   which is the core commercial differentiator.

`deal.scope.region` is already captured at intake (`state/types.ts:31`) but is never read
downstream — it is the hook this slice activates.

## 2. Goal & success criteria

A staged commercial proposal must be:

- **On the real NII letterhead** (the provided `NII_New Logo Letterhead.docx`), Word-editable.
- **From the correct legal entity** for the customer's geography, with the correct tax
  identity (US: none · Middle East/Africa: VAT 104043215300003 · India: GST 27AABCN6183F1ZE).
- **Effort-quantified** — a man-days table per service line, reflecting AI-augmented delivery.
- **Jurisdiction-correct** in payment terms, governing law, and currency.

Done = the three new/changed units have passing tests, lint + typecheck pass, and a sample
build for each of the three geos produces a letterhead `.docx` carrying the right entity,
the right (single) tax line, and the effort table.

## 3. Positioning (locked)

NI delivers the offensive / advisory work (pentest, red team, VAPT — CREST-accredited
offensive practice); **Transilience supplies the AI layer** — vulnerability prioritization,
noise reduction, continuous exposure management. Heavy AI use is the reason the man-day
estimates are lower than pure-human delivery. This framing is the commercial story and the
basis for the effort `aiLeverageNote`. It deliberately does **not** claim Transilience
itself performs pentest/red-team (which would contradict the platform's documented
anti-roadmap).

## 4. Architecture

```
deal.scope.region ──► resolveEntity() ──► LegalEntity ─┐
                                                        ├─► buildCommercialsLetterhead()
judge.buildProposalContent() ──► ProposalContent.effort ┘        │
                                                                 ▼
                                          letterhead template (vendored) + jszip
                                                                 │
                                                                 ▼
                                              branded, Word-editable commercials .docx
```

The PDF deck half of `deck.render` is **unchanged** in this slice.

### 4.1 New / changed units

| Unit | File | Purpose |
|---|---|---|
| Legal-entity model | `render/legal-entities.ts` (new) | The three entities + `resolveEntity(region)` deterministic classifier |
| Letterhead template | `render/assets/letterhead/` (new, vendored) | Unzipped parts of the provided NII letterhead docx (header2 + EMF logo + footers preserved verbatim) |
| Letterhead commercials builder | `render/commercials-letterhead.ts` (new) | Generates body WordprocessingML, splices before `<w:sectPr>`, re-zips via jszip |
| Entity T&C variants | `render/commercials-content.ts` (rewritten) | Per-entity payment terms, governing law, tax line; shared exclusions |
| Effort estimation | `judgment/judgment.ts` + proposal-assembly skill | Adds `effort` to the Bedrock output |
| Data model | `proposal/types.ts` | `Effort`, `EffortLine` types; `effort` on `ProposalContent` |
| Integration | `orchestrator/loop.ts` | Resolve entity, pass effort, swap docx builder, extend Slack staging |
| Retired | `render/commercials.ts` (old `buildCommercialsDocx`) | Replaced by the letterhead builder |

## 5. Detailed design

### 5.1 Legal entities — `render/legal-entities.ts`

```ts
export type EntityKey = 'us' | 'mea' | 'india';

export interface LegalEntity {
  key: EntityKey;
  legalName: string;
  address: string;          // confirm-by-KK placeholder until provided
  taxLabel: 'GST' | 'VAT' | null;
  taxValue: string | null;  // GST/VAT hard-coded; null for US
  currency: 'USD' | 'AED' | 'INR';
  paymentTerms: string;     // entity-specific
  governingLaw: string;     // confirm-by-KK venue for US/MEA
  signatory: string;        // role line for the signature block
}

export function resolveEntity(region: string | null): { entity: LegalEntity; defaulted: boolean };
```

Region → bucket (case-insensitive keyword/country match on the free-text region string):

- **us**: united states, usa, us, canada, uk, united kingdom, europe, eu, eea, germany,
  france, netherlands, ireland, spain, italy, nordics, … → Network Intelligence LLC · USD · no tax id.
- **mea**: uae, dubai, abu dhabi, ksa, saudi, qatar, bahrain, oman, kuwait, middle east,
  africa, egypt, kenya, nigeria, south africa, … → Network Intelligence Middle East LLC ·
  AED · VAT 104043215300003.
- **india** (and the default): india, bharat, mumbai, delhi, bengaluru, … →
  Network Intelligence Pvt. Ltd. · INR · GST 27AABCN6183F1ZE.

`resolveEntity(null or unmatched)` returns `{ entity: india, defaulted: true }`. The
`defaulted` flag drives a Slack warning so a human confirms geo before the proposal is sent.

### 5.2 Letterhead commercials builder — `render/commercials-letterhead.ts`

- **Template:** the unzipped NII letterhead is vendored under `render/assets/letterhead/`
  (`word/document.xml`, `word/header2.xml`, `word/media/image1.emf`, footers, styles,
  theme, `[Content_Types].xml`, rels, etc. — verbatim). The branding lives in `header2.xml`
  as the EMF logo; the body is a single empty paragraph + trailing `<w:sectPr>` that carries
  the header/footer references.
- **Build:** read `document.xml`, generate body XML for the sections below, splice it
  **immediately before the final `<w:sectPr>`** (so the section's header/footer bindings are
  preserved), re-zip every part with **jszip** (already a transitive dep), return the Buffer.
- **WordprocessingML helpers** (small, typed, unit-tested): `para`, `heading`, `bullet`,
  `table(rows)` — each emits well-formed `<w:p>` / `<w:tbl>` XML with proper escaping.
- **Body sections, in order:**
  1. Title — "Commercial Proposal — {company}" + addressee.
  2. **Effort table** — columns: Service line | Scope basis | Effort (man-days); total row.
  3. Commercials / pricing text (`content.commercials.text`; placeholder-flagged as today).
  4. Validity (`VALIDITY_DAYS`).
  5. Payment terms — `entity.paymentTerms`.
  6. Billing-entity block — `entity.legalName`, `entity.address`, and **exactly one** of
     `GST: …` / `VAT: …` / (nothing for US).
  7. Exclusions (shared list).
  8. Standard terms & conditions — shared clauses + `entity.governingLaw`.
  9. Signatory block — `entity.signatory`, sales@networkintelligence.ai, networkintelligence.ai.

### 5.3 Entity content variants — `render/commercials-content.ts` (rewritten)

- `VALIDITY_DAYS` and `EXCLUSIONS` stay shared.
- `PO_ENTITY` (single India hard-code) is removed; entity data now lives in
  `legal-entities.ts`.
- `TERMS` becomes a base list of shared clauses; the governing-law clause is composed
  per-entity from `entity.governingLaw`.
- Payment terms move onto each entity (`paymentTerms`) so currency/region phrasing is correct.

### 5.4 Effort estimation — `judgment/judgment.ts` + skill

- `proposal/types.ts` gains:
  ```ts
  export interface EffortLine { serviceLine: string; basis: string; manDays: number }
  export interface Effort {
    lines: EffortLine[];
    totalManDays: number;
    aiLeverageNote: string;
    isLarge: boolean;       // totalManDays > 10 (or RFP signal)
  }
  ```
  and `effort: Effort` on `ProposalContent`.
- `buildProposalContent` is extended (same Bedrock round-trip — no extra call): the
  proposal-assembly skill instructs the model to estimate **AI-augmented man-days per
  service line**, told explicitly that NI delivers heavily AI-augmented via Transilience,
  with a per-service-line sanity band in the prompt so numbers stay credible. The model
  also returns `aiLeverageNote` (one line stating the assumption) and the per-line `basis`.
- `isLarge = totalManDays > 10` is computed in code (not trusted to the model). It sets a
  `largeEngagement` flag on the deal. **In Slice 1 this only drives a Slack note + the
  effort table** — it is the trigger Slice 2 will consume for the methodology deck.

### 5.5 Integration — `orchestrator/loop.ts`

- In `stageProposal`: `const { entity, defaulted } = resolveEntity(deal.scope.region)`.
- Call `buildCommercialsLetterhead(content, entity)` for the docx half; PDF deck half
  unchanged.
- Slack staging text gains: total man-days, `largeEngagement`, and warnings when
  `defaulted` is true or `entity.address` is still a placeholder.

## 6. Money vs man-days (explicit boundary)

No rate card was provided. Therefore:

- The effort table shows **man-days**, not currency.
- Monetary pricing stays exactly as today — Bedrock-produced `commercials.text` with the
  `fixed | range | placeholder` mode and the existing placeholder warning.
- A `dayRates` config per entity is **stubbed but empty**; when KK supplies day-rates, a
  follow-up can compute money = man-days × rate. Out of scope for this slice.

## 7. Testing (TDD)

- `legal-entities.test.ts` — representative region strings (us/uk/eu, uae/ksa/africa,
  india) resolve to the correct entity, tax label/value, currency; `null`/garbage →
  India + `defaulted: true`; US entity has `taxValue: null`.
- `commercials-letterhead.test.ts` — output unzips; `word/header2.xml` and
  `word/media/image1.emf` are present and byte-identical to the template (letterhead
  preserved); body contains the right single tax line (VAT **xor** GST **xor** neither),
  every effort line + the total, and the entity-specific governing-law clause; the trailing
  `<w:sectPr>` is intact (header/footer bindings survive).
- Effort shape asserted in the build path; `isLarge` boundary (10 vs 11 man-days).

## 8. Assumptions (correct any before/while planning)

- **A1** No rate card → effort table is man-days; money stays placeholder/Bedrock-text.
- **A2** The three entity addresses and the exact US/UAE governing-law venue are
  confirm-by-KK placeholders; VAT/GST hard-coded as given.
- **A3** Region→entity buckets per §5.1; unknown geo → India + Slack flag.
- **A4** "Heavy AI users" → Bedrock estimates AI-augmented man-days directly, with a stated
  leverage note; not a blanket multiplier.
- **A5** `>10 man-days OR RFP` sets `largeEngagement`, consumed by Slice 2; only flagged here.

## 9. Out of scope (Slice 2)

Content/design uplift of the deck, the 20–25 slide methodology deck with approach/graphics
and framework references, surfacing effort on the deck itself, and money-from-rate-card.
