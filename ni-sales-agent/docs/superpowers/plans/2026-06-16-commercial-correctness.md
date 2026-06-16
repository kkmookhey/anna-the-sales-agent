# Commercial Correctness (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage every commercial proposal on the real NII letterhead, from the correct legal entity for the customer's geography, with an AI-augmented man-days effort table and jurisdiction-correct T&Cs.

**Architecture:** A new pure `resolveEntity(region)` picks one of three `LegalEntity` records from the already-captured `deal.scope.region`. The orchestrator passes that entity to the render Lambda, where a new `buildCommercialsLetterhead(content, entity)` generates WordprocessingML body XML and splices it into a base64-embedded copy of the real letterhead `.docx` (preserving the header logo + footers) using jszip. `buildProposalContent` is extended to also return an `effort` estimate that feeds the effort table and a `largeEngagement` flag.

**Tech Stack:** TypeScript (ESM, NodeNext), AWS Lambda, jszip (embed/rezip docx), Bedrock (effort estimation), vitest.

---

## File structure

| File | Responsibility |
|---|---|
| `aws/src/render/assets/letterhead-docx.ts` (new, generated/committed) | The real NII letterhead `.docx` as a base64 string constant |
| `aws/src/render/legal-entities.ts` (new) | The three `LegalEntity` records + `resolveEntity(region)` |
| `aws/src/render/commercials-content.ts` (rewrite) | Shared `VALIDITY_DAYS`, `EXCLUSIONS`, base `TERMS`; `PO_ENTITY` removed |
| `aws/src/render/docx-xml.ts` (new) | Tiny typed WordprocessingML emitters: `xmlEscape`, `para`, `heading`, `bullet`, `table` |
| `aws/src/render/commercials-letterhead.ts` (new) | `buildCommercialsLetterhead(content, entity)` — builds body XML, splices into letterhead, rezips |
| `aws/src/render/commercials.ts` (delete) | Old plain-docx builder, retired |
| `aws/src/proposal/types.ts` (modify) | `EffortLine`, `Effort` types; `effort` on `ProposalContent` |
| `aws/src/judgment/judgment.ts` (modify) | `buildProposalContent` returns `effort`; total + `isLarge` recomputed in code |
| `aws/src/render/handler.ts` (modify) | Render path calls `buildCommercialsLetterhead` using `event.entity` |
| `aws/src/adapters/render.ts` (modify) | `render(content, entity?)` sends `entity` in the payload |
| `aws/src/orchestrator/loop.ts` (modify) | Resolve entity from `scope.region`; pass to render; Slack flags |
| `aws/src/render/sample.ts` (modify) | Sample fixture gains `effort`; uses the letterhead builder |
| `aws/test/render/*` (new/modify) | Tests per task |

**Skill content note:** `buildProposalContent` loads the `proposal-assembly` skill text via `loadSkill('proposal-assembly')`. The output-keys instruction is built in `judgment.ts` itself (not the skill file), so the effort instruction is added there — no skill-file edit required.

---

## Task 1: Embed the letterhead `.docx` as a base64 module

**Files:**
- Create: `aws/src/render/assets/letterhead-docx.ts`
- Test: `aws/test/render/letterhead-asset.test.ts`
- Modify: `aws/package.json` (add `jszip` as a direct dependency)

- [ ] **Step 1: Add jszip as a direct dependency**

`jszip` is already resolved transitively (via `docx`) but must be a direct dep so esbuild bundles it for the Lambda.

Run:
```bash
cd aws && npm install jszip@^3.10.1
```
Expected: `package.json` `dependencies` now lists `jszip`.

- [ ] **Step 2: Generate the base64 letterhead module**

The source letterhead is `/Users/kkmookhey/Projects/Sara/assets/NII_New Logo Letterhead.docx`. Generate the committed module:

Run:
```bash
cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws
node -e '
const fs=require("fs");
const b=fs.readFileSync("/Users/kkmookhey/Projects/Sara/assets/NII_New Logo Letterhead.docx").toString("base64");
const out=`// AUTO-GENERATED from assets/NII_New Logo Letterhead.docx — do not hand-edit.\n// Regenerate with the one-liner in docs/superpowers/plans/2026-06-16-commercial-correctness.md Task 1.\nexport const LETTERHEAD_DOCX_BASE64 =\n  ${JSON.stringify(b)};\n`;
fs.writeFileSync("src/render/assets/letterhead-docx.ts", out);
console.log("wrote", out.length, "bytes");
'
```
Expected: prints `wrote <N> bytes`; `src/render/assets/letterhead-docx.ts` exists exporting `LETTERHEAD_DOCX_BASE64`.

- [ ] **Step 3: Write the failing test**

Create `aws/test/render/letterhead-asset.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { LETTERHEAD_DOCX_BASE64 } from '../../src/render/assets/letterhead-docx.js';

describe('letterhead asset', () => {
  it('is a valid docx with the branded header and logo image preserved', async () => {
    const zip = await JSZip.loadAsync(Buffer.from(LETTERHEAD_DOCX_BASE64, 'base64'));
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('word/header2.xml')).toBeTruthy();        // default header carries the logo
    expect(zip.file('word/media/image1.emf')).toBeTruthy();   // the EMF banner logo
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('<w:sectPr');                       // section props (header/footer bindings) present
    expect(doc).toContain('w:type="default" r:id="rId8"');    // default headerReference intact
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd aws && npx vitest run test/render/letterhead-asset.test.ts`
Expected: PASS (the generated module loads, header + image + sectPr present).

- [ ] **Step 5: Commit**

```bash
cd /Users/kkmookhey/Projects/Sara/ni-sales-agent
git add aws/package.json aws/package-lock.json aws/src/render/assets/letterhead-docx.ts aws/test/render/letterhead-asset.test.ts
git commit -m "feat(render): embed NII letterhead docx as a base64 asset module"
```

---

## Task 2: Legal entities + `resolveEntity`

**Files:**
- Create: `aws/src/render/legal-entities.ts`
- Test: `aws/test/render/legal-entities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/render/legal-entities.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveEntity } from '../../src/render/legal-entities.js';

describe('resolveEntity', () => {
  it('maps US / UK / Europe to Network Intelligence LLC with no tax id (USD)', () => {
    for (const r of ['United States', 'us', 'UK', 'Germany', 'Europe', 'EEA']) {
      const { entity, defaulted } = resolveEntity(r);
      expect(entity.key).toBe('us');
      expect(entity.legalName).toBe('Network Intelligence LLC');
      expect(entity.taxValue).toBeNull();
      expect(entity.currency).toBe('USD');
      expect(defaulted).toBe(false);
    }
  });

  it('maps Middle East / Africa to Network Intelligence Middle East LLC with VAT (AED)', () => {
    for (const r of ['UAE', 'Dubai', 'KSA', 'Saudi Arabia', 'Qatar', 'Africa', 'Kenya']) {
      const { entity } = resolveEntity(r);
      expect(entity.key).toBe('mea');
      expect(entity.legalName).toBe('Network Intelligence Middle East LLC');
      expect(entity.taxLabel).toBe('VAT');
      expect(entity.taxValue).toBe('104043215300003');
      expect(entity.currency).toBe('AED');
    }
  });

  it('maps India to Network Intelligence Pvt. Ltd. with GST (INR)', () => {
    const { entity, defaulted } = resolveEntity('India');
    expect(entity.key).toBe('india');
    expect(entity.legalName).toBe('Network Intelligence Pvt. Ltd.');
    expect(entity.taxLabel).toBe('GST');
    expect(entity.taxValue).toBe('27AABCN6183F1ZE');
    expect(entity.currency).toBe('INR');
    expect(defaulted).toBe(false);
  });

  it('defaults unknown / null region to India and flags it', () => {
    for (const r of [null, '', 'Mars', 'somewhere']) {
      const { entity, defaulted } = resolveEntity(r);
      expect(entity.key).toBe('india');
      expect(defaulted).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd aws && npx vitest run test/render/legal-entities.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/legal-entities.js'`.

- [ ] **Step 3: Implement `legal-entities.ts`**

Create `aws/src/render/legal-entities.ts`:
```ts
export type EntityKey = 'us' | 'mea' | 'india';

export interface LegalEntity {
  key: EntityKey;
  legalName: string;
  /** Confirm-by-KK placeholder until a real registered address is provided. */
  address: string;
  taxLabel: 'GST' | 'VAT' | null;
  taxValue: string | null;
  currency: 'USD' | 'AED' | 'INR';
  paymentTerms: string;
  /** Governing-law / jurisdiction clause text. US/UAE venue is a confirm-by-KK placeholder. */
  governingLaw: string;
  signatory: string;
}

const US: LegalEntity = {
  key: 'us',
  legalName: 'Network Intelligence LLC',
  address: '[US ENTITY ADDRESS — confirm]',
  taxLabel: null,
  taxValue: null,
  currency: 'USD',
  paymentTerms: '50% on award, 50% on delivery of the final report. Net 30 days from invoice, in USD.',
  governingLaw: 'This engagement is governed by the laws of the State of [US STATE — confirm], United States, and the parties submit to its exclusive jurisdiction.',
  signatory: 'For and on behalf of Network Intelligence LLC',
};

const MEA: LegalEntity = {
  key: 'mea',
  legalName: 'Network Intelligence Middle East LLC',
  address: '[MIDDLE EAST ENTITY ADDRESS — confirm]',
  taxLabel: 'VAT',
  taxValue: '104043215300003',
  currency: 'AED',
  paymentTerms: '50% on award, 50% on delivery of the final report. Net 30 days from invoice, in AED. Prices are exclusive of 5% VAT, charged where applicable.',
  governingLaw: 'This engagement is governed by the laws of the United Arab Emirates, and the parties submit to the exclusive jurisdiction of the [UAE VENUE — confirm] courts.',
  signatory: 'For and on behalf of Network Intelligence Middle East LLC',
};

const INDIA: LegalEntity = {
  key: 'india',
  legalName: 'Network Intelligence Pvt. Ltd.',
  address: '[INDIA ENTITY ADDRESS — confirm]',
  taxLabel: 'GST',
  taxValue: '27AABCN6183F1ZE',
  currency: 'INR',
  paymentTerms: '50% on award, 50% on delivery of the final report. Net 30 days from invoice, in INR. Prices are exclusive of 18% GST, charged where applicable.',
  governingLaw: 'This engagement is governed by the laws of India, and the parties submit to the exclusive jurisdiction of the courts at Mumbai, Maharashtra.',
  signatory: 'For and on behalf of Network Intelligence Pvt. Ltd.',
};

// Keyword buckets matched case-insensitively against the free-text region string.
const US_KEYS = ['united states', 'usa', ' us', 'us ', 'u.s', 'america', 'canada', 'uk', 'united kingdom',
  'britain', 'england', 'europe', 'european', 'eu', 'eea', 'germany', 'france', 'netherlands', 'ireland',
  'spain', 'italy', 'belgium', 'sweden', 'norway', 'denmark', 'finland', 'switzerland', 'poland', 'portugal', 'austria'];
const MEA_KEYS = ['uae', 'u.a.e', 'emirates', 'dubai', 'abu dhabi', 'sharjah', 'ksa', 'saudi', 'qatar', 'doha',
  'bahrain', 'oman', 'muscat', 'kuwait', 'middle east', 'mena', 'gcc', 'africa', 'african', 'egypt', 'kenya',
  'nigeria', 'south africa', 'morocco', 'ghana', 'tanzania'];
const INDIA_KEYS = ['india', 'indian', 'bharat', 'mumbai', 'delhi', 'bengaluru', 'bangalore', 'hyderabad',
  'chennai', 'pune', 'kolkata', 'gurgaon', 'gurugram', 'noida'];

function matches(hay: string, keys: string[]): boolean {
  return keys.some((k) => hay.includes(k));
}

/**
 * Resolve the billing legal entity from the free-text customer region.
 * Unknown / empty region defaults to the India entity and sets `defaulted: true`
 * so the orchestrator can flag it for human geo confirmation.
 */
export function resolveEntity(region: string | null | undefined): { entity: LegalEntity; defaulted: boolean } {
  const hay = ` ${(region ?? '').toLowerCase().trim()} `;
  if (hay.trim() && matches(hay, US_KEYS)) return { entity: US, defaulted: false };
  if (hay.trim() && matches(hay, MEA_KEYS)) return { entity: MEA, defaulted: false };
  if (hay.trim() && matches(hay, INDIA_KEYS)) return { entity: INDIA, defaulted: false };
  return { entity: INDIA, defaulted: true };
}

export const ENTITIES = { US, MEA, INDIA } as const;
```

- [ ] **Step 4: Run the test**

Run: `cd aws && npx vitest run test/render/legal-entities.test.ts`
Expected: PASS (all four cases green).

- [ ] **Step 5: Commit**

```bash
git add aws/src/render/legal-entities.ts aws/test/render/legal-entities.test.ts
git commit -m "feat(render): geo legal-entity model + resolveEntity(region)"
```

---

## Task 3: Rewrite shared commercials content

**Files:**
- Modify: `aws/src/render/commercials-content.ts`

- [ ] **Step 1: Replace the file contents**

`PO_ENTITY`, `PAYMENT_TERMS`, and the India-only governing-law `TERMS` clause move into `legal-entities.ts` (Task 2). What remains is genuinely shared. Replace `aws/src/render/commercials-content.ts` entirely with:
```ts
// DRAFT commercials boilerplate — KK / legal MUST review before any real send.
// Entity-specific data (name, address, tax id, payment terms, governing law) lives in
// ./legal-entities.ts and is selected per customer geography. This file holds only the
// clauses that are identical across all entities.

export const VALIDITY_DAYS = 30;

export const EXCLUSIONS = [
  'Remediation of identified vulnerabilities (advisory only).',
  'Source-code review unless explicitly scoped.',
  'Testing of third-party / external systems not owned by the client.',
  'Any work outside the agreed scope, handled via a written change request.',
];

// Shared clauses. The governing-law clause is appended per-entity from
// LegalEntity.governingLaw by the commercials builder.
export const BASE_TERMS = [
  'This proposal and its commercials are confidential and valid for the stated validity period.',
  "Testing is performed against the agreed scope with the client's written authorisation.",
  'Findings are reported to the client; no data is disclosed to third parties.',
  'Liability is limited to the fees paid for the engagement.',
];
```

- [ ] **Step 2: Verify nothing else imports the removed symbols yet**

Run: `cd aws && grep -rn "PO_ENTITY\|PAYMENT_TERMS\|from './commercials-content'\|from '../render/commercials-content'" src | grep -v legal-entities`
Expected: the only remaining references are in `src/render/commercials.ts` (to be deleted in Task 7) — note them; they are replaced there. No other file should import `PO_ENTITY`/`PAYMENT_TERMS`/`TERMS`.

- [ ] **Step 3: Commit**

```bash
git add aws/src/render/commercials-content.ts
git commit -m "refactor(render): reduce commercials-content to shared clauses; entity data moves to legal-entities"
```

---

## Task 4: WordprocessingML emitters

**Files:**
- Create: `aws/src/render/docx-xml.ts`
- Test: `aws/test/render/docx-xml.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/render/docx-xml.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { xmlEscape, para, heading, bullet, table } from '../../src/render/docx-xml.js';

describe('docx-xml emitters', () => {
  it('escapes XML-significant characters', () => {
    expect(xmlEscape('a & b < c > d " e')).toBe('a &amp; b &lt; c &gt; d &quot; e');
  });

  it('emits a paragraph run with escaped text', () => {
    const xml = para('Liability & scope');
    expect(xml).toContain('<w:p>');
    expect(xml).toContain('<w:t xml:space="preserve">Liability &amp; scope</w:t>');
  });

  it('emits a heading with bold styling', () => {
    expect(heading('Payment terms')).toContain('<w:b/>');
    expect(heading('Payment terms')).toContain('Payment terms');
  });

  it('emits a bullet paragraph referencing a numbering id', () => {
    expect(bullet('one exclusion')).toContain('<w:numPr>');
  });

  it('emits a table with a header row and one body row', () => {
    const xml = table(['Service line', 'Effort (man-days)'], [['Web App VAPT', '6']]);
    expect(xml.startsWith('<w:tbl>')).toBe(true);
    expect(xml).toContain('<w:tblBorders>');
    expect(xml).toContain('Service line');
    expect(xml).toContain('Web App VAPT');
    expect(xml).toContain('preserve">6</w:t>'); // cell value present
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(2); // header + 1 body row
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd aws && npx vitest run test/render/docx-xml.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `docx-xml.ts`**

Create `aws/src/render/docx-xml.ts`:
```ts
// Minimal WordprocessingML emitters for splicing body content into a letterhead template.
// These produce raw OOXML strings; callers concatenate them and insert before <w:sectPr>.

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function run(text: string, opts: { bold?: boolean; size?: number } = {}): string {
  const rpr =
    opts.bold || opts.size
      ? `<w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ''}</w:rPr>`
      : '';
  return `<w:r>${rpr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

export function para(text: string, opts: { bold?: boolean; size?: number } = {}): string {
  return `<w:p>${run(text, opts)}</w:p>`;
}

export function heading(text: string): string {
  return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${run(text, { bold: true, size: 26 })}</w:p>`;
}

export function title(text: string): string {
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${run(text, { bold: true, size: 36 })}</w:p>`;
}

// Bullet list uses Word's default bullet numbering definition id 0 — present in the
// letterhead template's numbering.xml. If absent at render time the text still shows,
// just without the glyph, so this is safe.
export function bullet(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
}

function cell(text: string, opts: { bold?: boolean } = {}): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(text, opts)}</w:tc>`;
}

export function table(headers: string[], rows: string[][]): string {
  const borders =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
      .join('') +
    '</w:tblBorders>';
  const tblPr = `<w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>`;
  const headerRow = `<w:tr>${headers.map((h) => cell(h, { bold: true })).join('')}</w:tr>`;
  const bodyRows = rows.map((r) => `<w:tr>${r.map((c) => cell(c)).join('')}</w:tr>`).join('');
  return `<w:tbl>${tblPr}${headerRow}${bodyRows}</w:tbl>`;
}
```

- [ ] **Step 4: Run the test**

Run: `cd aws && npx vitest run test/render/docx-xml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add aws/src/render/docx-xml.ts aws/test/render/docx-xml.test.ts
git commit -m "feat(render): WordprocessingML emitters for docx body splicing"
```

---

## Task 5: Effort types

**Files:**
- Modify: `aws/src/proposal/types.ts`

- [ ] **Step 1: Add the effort types and field**

In `aws/src/proposal/types.ts`, add after the `CtaStep` interface (around line 15):
```ts
export interface EffortLine { serviceLine: string; basis: string; manDays: number }
export interface Effort {
  lines: EffortLine[];
  totalManDays: number;
  aiLeverageNote: string;
  isLarge: boolean; // totalManDays > 10 — Slice 2 methodology-deck trigger
}
```
Then add `effort: Effort;` to the `ProposalContent` interface (after `ctaSteps: CtaStep[];`).

- [ ] **Step 2: Typecheck**

Run: `cd aws && npx tsc --noEmit`
Expected: FAIL — existing constructions of `ProposalContent` (in `sample.ts` and tests) now lack `effort`. Note the failing locations; they are fixed in Tasks 6/8/9. (This is expected; do not fix unrelated code here.)

- [ ] **Step 3: Commit**

```bash
git add aws/src/proposal/types.ts
git commit -m "feat(proposal): add Effort types and effort field to ProposalContent"
```

---

## Task 6: Effort estimation in `buildProposalContent`

**Files:**
- Modify: `aws/src/judgment/judgment.ts:166-207`
- Test: `aws/test/judgment/effort.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/judgment/effort.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';

function fakeJudge(payload: unknown) {
  // Minimal BedrockJudge stand-in: askJson returns the canned payload.
  return { askJson: async () => payload } as any;
}

const baseRaw = {
  titleLine: 'Web App Security', understanding: [], scopeRows: [], assumptions: [],
  approach: [], deliverables: [], timeline: '4 weeks', whyNi: [], credentials: [],
  transilienceEdge: [], commercials: { mode: 'placeholder', text: 'TBC' }, nextSteps: [],
  understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
};

describe('buildProposalContent effort', () => {
  it('recomputes totalManDays from lines and sets isLarge=false at 10', async () => {
    const svc = new JudgmentService(fakeJudge({
      ...baseRaw,
      effort: { lines: [{ serviceLine: 'pentest_web', basis: '2 apps', manDays: 6 },
                         { serviceLine: 'config_review', basis: '1 env', manDays: 4 }],
                totalManDays: 999, aiLeverageNote: 'AI-augmented', isLarge: false },
    }));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.effort.totalManDays).toBe(10);  // recomputed, not trusting the model's 999
    expect(c.effort.isLarge).toBe(false);     // 10 is NOT large
  });

  it('sets isLarge=true above 10 man-days', async () => {
    const svc = new JudgmentService(fakeJudge({
      ...baseRaw,
      effort: { lines: [{ serviceLine: 'red_team', basis: 'full', manDays: 11 }],
                totalManDays: 11, aiLeverageNote: 'AI-augmented', isLarge: false },
    }));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.effort.totalManDays).toBe(11);
    expect(c.effort.isLarge).toBe(true);
  });

  it('tolerates a missing effort object (defaults to empty, not large)', async () => {
    const svc = new JudgmentService(fakeJudge(baseRaw));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.effort.lines).toEqual([]);
    expect(c.effort.totalManDays).toBe(0);
    expect(c.effort.isLarge).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd aws && npx vitest run test/judgment/effort.test.ts`
Expected: FAIL — `c.effort` is undefined (not yet populated/normalised).

- [ ] **Step 3: Extend the output-keys instruction and normalise effort**

In `aws/src/judgment/judgment.ts`, inside `buildProposalContent`, add to the output-keys string (after the `ctaSteps (...)` line, before the closing instructions):
```ts
      'effort ({ lines: {serviceLine,basis,manDays:number}[], totalManDays:number, aiLeverageNote:string } — ' +
      'one line per service line; estimate man-days assuming NI delivers heavily AI-AUGMENTED via the ' +
      'Transilience platform (vulnerability prioritization, noise reduction, continuous exposure), so figures ' +
      'are LOWER than pure-human delivery but remain credible: a focused web-app VAPT ~4-8 md, an external ' +
      'network test ~3-6 md, a config/cloud review ~3-6 md per environment, a red-team ~10-20 md, a compliance ' +
      'assessment ~8-15 md; scale by the asset_count and environments in scope. aiLeverageNote is ONE sentence ' +
      'stating the AI-augmentation assumption). ' +
```
Then change the return to normalise effort (recompute the total and `isLarge` in code — never trust the model's arithmetic). Replace the final `return { ... }` block with:
```ts
    const rawEffort = (raw as { effort?: { lines?: unknown; aiLeverageNote?: string } }).effort;
    const lines = Array.isArray(rawEffort?.lines)
      ? (rawEffort!.lines as Array<{ serviceLine?: string; basis?: string; manDays?: number }>).map((l) => ({
          serviceLine: String(l.serviceLine ?? ''),
          basis: String(l.basis ?? ''),
          manDays: Number(l.manDays) || 0,
        }))
      : [];
    const totalManDays = lines.reduce((sum, l) => sum + l.manDays, 0);
    const effort = {
      lines,
      totalManDays,
      aiLeverageNote: String(rawEffort?.aiLeverageNote ?? ''),
      isLarge: totalManDays > 10,
    };
    return {
      company: input.company,
      contactName: input.contactName,
      serviceLines: input.serviceLines,
      ...raw,
      effort,
    };
```
Also widen the `askJson` generic so the raw type allows `effort`: change
`this.judge.askJson<Omit<ProposalContent, 'company' | 'contactName' | 'serviceLines'>>(` to
`this.judge.askJson<Omit<ProposalContent, 'company' | 'contactName' | 'serviceLines' | 'effort'> & { effort?: unknown }>(`.

- [ ] **Step 4: Run the test**

Run: `cd aws && npx vitest run test/judgment/effort.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add aws/src/judgment/judgment.ts aws/test/judgment/effort.test.ts
git commit -m "feat(judgment): estimate AI-augmented effort in buildProposalContent"
```

---

## Task 7: Letterhead commercials builder

**Files:**
- Create: `aws/src/render/commercials-letterhead.ts`
- Test: `aws/test/render/commercials-letterhead.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/render/commercials-letterhead.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildCommercialsLetterhead } from '../../src/render/commercials-letterhead.js';
import { ENTITIES } from '../../src/render/legal-entities.js';
import type { ProposalContent } from '../../src/proposal/types.js';

function content(overrides: Partial<ProposalContent> = {}): ProposalContent {
  return {
    company: 'Acme & Co', contactName: 'Jane Roe', serviceLines: ['pentest_web'],
    titleLine: 'X', understanding: [], scopeRows: [], assumptions: [], approach: [],
    deliverables: [], timeline: '4 weeks', whyNi: [], credentials: [], transilienceEdge: [],
    commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed.' },
    nextSteps: [], understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
    effort: {
      lines: [{ serviceLine: 'pentest_web', basis: '2 web apps', manDays: 6 }],
      totalManDays: 6, aiLeverageNote: 'Delivered AI-augmented via Transilience.', isLarge: false,
    },
    ...overrides,
  };
}

async function bodyText(buf: Buffer): Promise<{ zip: JSZip; doc: string }> {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file('word/document.xml')!.async('string');
  return { zip, doc };
}

describe('buildCommercialsLetterhead', () => {
  it('preserves the letterhead header + logo image and the section properties', async () => {
    const { zip, doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.INDIA));
    expect(zip.file('word/header2.xml')).toBeTruthy();
    expect(zip.file('word/media/image1.emf')).toBeTruthy();
    expect(doc).toContain('<w:sectPr');                    // header/footer bindings preserved
    expect(doc).toContain('w:type="default" r:id="rId8"');
  });

  it('renders the India entity with GST and NOT VAT', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.INDIA));
    expect(doc).toContain('27AABCN6183F1ZE');
    expect(doc).toContain('GST');
    expect(doc).not.toContain('VAT');
    expect(doc).toContain('jurisdiction of the courts at Mumbai');
  });

  it('renders the Middle East entity with VAT and NOT GST', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.MEA));
    expect(doc).toContain('104043215300003');
    expect(doc).toContain('VAT');
    expect(doc).not.toContain('GST');
    expect(doc).not.toContain('27AABCN6183F1ZE');
  });

  it('renders the US entity with no tax id at all', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.US));
    expect(doc).not.toContain('VAT');
    expect(doc).not.toContain('GST:');
    expect(doc).toContain('Network Intelligence LLC');
  });

  it('includes the effort table rows, the total, and escapes the company name', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.INDIA));
    expect(doc).toContain('2 web apps');
    expect(doc).toContain('Total');
    expect(doc).toContain('Acme &amp; Co');                // XML-escaped, no raw &
    expect(doc).not.toContain('Acme & Co');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd aws && npx vitest run test/render/commercials-letterhead.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `commercials-letterhead.ts`**

Create `aws/src/render/commercials-letterhead.ts`:
```ts
import JSZip from 'jszip';
import type { ProposalContent } from '../proposal/types.js';
import type { LegalEntity } from './legal-entities.js';
import { serviceLineLabel } from './labels.js';
import { VALIDITY_DAYS, EXCLUSIONS, BASE_TERMS } from './commercials-content.js';
import { LETTERHEAD_DOCX_BASE64 } from './assets/letterhead-docx.js';
import { title, heading, para, bullet, table } from './docx-xml.js';

function buildBodyXml(content: ProposalContent, entity: LegalEntity): string {
  const parts: string[] = [];

  parts.push(title(`Commercial Proposal — ${content.company}`));
  parts.push(para(`Prepared for ${content.contactName}.`));

  // Effort table
  parts.push(heading('Estimated effort'));
  if (content.effort.aiLeverageNote) parts.push(para(content.effort.aiLeverageNote));
  const rows = content.effort.lines.map((l) => [serviceLineLabel(l.serviceLine), l.basis, String(l.manDays)]);
  rows.push(['Total', '', String(content.effort.totalManDays)]);
  parts.push(table(['Service line', 'Scope basis', 'Effort (man-days)'], rows));

  // Pricing
  parts.push(heading('Proposed commercials'));
  parts.push(para(content.commercials?.text ?? 'Indicative pricing to be confirmed after a short scoping call.'));

  // Validity
  parts.push(heading('Validity'));
  parts.push(para(`This commercial proposal is valid for ${VALIDITY_DAYS} days from the date of issue.`));

  // Payment terms (entity-specific)
  parts.push(heading('Payment terms'));
  parts.push(para(entity.paymentTerms));

  // Billing entity block — exactly one tax line (or none for US)
  parts.push(heading('Billing entity'));
  parts.push(para(`Entity: ${entity.legalName}`));
  parts.push(para(`Address: ${entity.address}`));
  if (entity.taxLabel && entity.taxValue) parts.push(para(`${entity.taxLabel}: ${entity.taxValue}`));

  // Exclusions
  parts.push(heading('Exclusions'));
  for (const e of EXCLUSIONS) parts.push(bullet(e));

  // Terms (shared + entity governing law)
  parts.push(heading('Standard terms & conditions'));
  for (const t of BASE_TERMS) parts.push(bullet(t));
  parts.push(bullet(entity.governingLaw));

  // Signatory
  parts.push(para(entity.signatory, { size: 18 }));
  parts.push(para('sales@networkintelligence.ai · networkintelligence.ai', { size: 18 }));

  return parts.join('');
}

/**
 * Build the commercial proposal as a Word .docx on the real NII letterhead.
 * The branded header (EMF logo) and footers are preserved; only the document body
 * is replaced with generated content, keeping the trailing <w:sectPr> intact so the
 * header/footer references survive.
 */
export async function buildCommercialsLetterhead(content: ProposalContent, entity: LegalEntity): Promise<Buffer> {
  const zip = await JSZip.loadAsync(Buffer.from(LETTERHEAD_DOCX_BASE64, 'base64'));
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('letterhead template missing word/document.xml');
  const doc = await docFile.async('string');

  const bodyOpen = doc.indexOf('<w:body>');
  const sectStart = doc.lastIndexOf('<w:sectPr');
  const bodyEnd = doc.indexOf('</w:body>');
  if (bodyOpen === -1 || sectStart === -1 || bodyEnd === -1 || sectStart > bodyEnd) {
    throw new Error('letterhead template has an unexpected document.xml shape');
  }
  const head = doc.slice(0, bodyOpen + '<w:body>'.length);
  const sectPr = doc.slice(sectStart, bodyEnd); // <w:sectPr ...>...</w:sectPr>

  const rebuilt = `${head}${buildBodyXml(content, entity)}${sectPr}</w:body></w:document>`;
  zip.file('word/document.xml', rebuilt);

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(out);
}
```

- [ ] **Step 4: Run the test**

Run: `cd aws && npx vitest run test/render/commercials-letterhead.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Visual QA (manual, recommended)**

Build a sample and eyeball it (repo QA pattern: docx → pdf → inspect). Optional but advised before declaring done:
```bash
cd aws && npx tsx -e '
import { writeFileSync } from "fs";
import { buildCommercialsLetterhead } from "./src/render/commercials-letterhead.js";
import { ENTITIES } from "./src/render/legal-entities.js";
const c:any = { company:"Demo Bank", contactName:"A. Buyer", serviceLines:["pentest_web"], commercials:{mode:"placeholder",text:"Indicative pricing to be confirmed."}, effort:{lines:[{serviceLine:"pentest_web",basis:"3 apps",manDays:7}],totalManDays:7,aiLeverageNote:"Delivered AI-augmented via Transilience.",isLarge:false} };
buildCommercialsLetterhead(c, ENTITIES.MEA).then(b=>{writeFileSync("out/commercials-sample.docx", b); console.log("wrote out/commercials-sample.docx");});
'
```
Open `out/commercials-sample.docx` in Word/LibreOffice; confirm the letterhead banner shows and content sits below it.

- [ ] **Step 6: Commit**

```bash
git add aws/src/render/commercials-letterhead.ts aws/test/render/commercials-letterhead.test.ts
git commit -m "feat(render): letterhead commercials builder with geo entity + effort table"
```

---

## Task 8: Wire the render handler and adapter

**Files:**
- Modify: `aws/src/render/handler.ts`
- Modify: `aws/src/adapters/render.ts:16-28`
- Delete: `aws/src/render/commercials.ts`
- Modify: `aws/test/render/handler.test.ts` (if it constructs `ProposalContent`/asserts docx)

- [ ] **Step 1: Update the render handler**

In `aws/src/render/handler.ts`:
- Replace `import { buildCommercialsDocx } from './commercials.js';` with:
  ```ts
  import { buildCommercialsLetterhead } from './commercials-letterhead.js';
  import { resolveEntity, type LegalEntity } from './legal-entities.js';
  ```
- Change `RenderEvent` to:
  ```ts
  export interface RenderEvent { content: ProposalContent; entity?: LegalEntity }
  ```
- In `handler`, replace the `Promise.all` render branch with:
  ```ts
  const entity = event.entity ?? resolveEntity(null).entity; // default India if caller omitted
  const [pdf, docx] = await Promise.all([
    htmlToPdf(renderProposalHtml(event.content)),
    buildCommercialsLetterhead(event.content, entity),
  ]);
  ```

- [ ] **Step 2: Update the adapter**

In `aws/src/adapters/render.ts`:
- Add the import: `import type { LegalEntity } from '../render/legal-entities.js';`
- Change the signature and payload:
  ```ts
  async render(content: ProposalContent, entity?: LegalEntity): Promise<{ pdf: Buffer; docx: Buffer }> {
    const res = await this.lambda.send(new InvokeCommand({
      FunctionName: this.functionName,
      Payload: new TextEncoder().encode(JSON.stringify({ content, entity })),
    }));
  ```
  (the rest of the method is unchanged.)

- [ ] **Step 3: Delete the retired builder**

```bash
cd aws && git rm src/render/commercials.ts
```
Then confirm nothing imports it:
Run: `grep -rn "commercials\.js\|buildCommercialsDocx" src` — Expected: no matches.

- [ ] **Step 4: Fix the handler test if needed**

Run: `cd aws && npx vitest run test/render/handler.test.ts`
- If it passes, continue. If it fails because it constructs a `ProposalContent` without `effort` or imports the deleted builder, update the fixture to include the `effort` object shown in Task 7's `content()` helper and remove any `buildCommercialsDocx` reference. Re-run until PASS.

- [ ] **Step 5: Commit**

```bash
git add aws/src/render/handler.ts aws/src/adapters/render.ts aws/test/render/handler.test.ts
git commit -m "feat(render): route commercials through the letterhead builder with geo entity"
```

---

## Task 9: Orchestrator integration + Slack flags

**Files:**
- Modify: `aws/src/orchestrator/loop.ts:447-510`

- [ ] **Step 1: Resolve the entity and pass it to render**

In `aws/src/orchestrator/loop.ts`, add the import near the other render imports at the top:
```ts
import { resolveEntity } from '../render/legal-entities.js';
```
In `stageProposal`, after `content` is built (after line 460) and before `deck.render`, insert:
```ts
  const region = (deal.scope as { region?: string | null }).region ?? null;
  const { entity, defaulted } = resolveEntity(region);
```
Change the render call (line 463) from `await deck.render(content)` to:
```ts
  const { pdf, docx } = await deck.render(content, entity);
```

- [ ] **Step 2: Add the commercial flags to the Slack staging text**

Still in `stageProposal`, replace the `priceFlag` block (lines 496-499) with a combined flags block:
```ts
  const flags: string[] = [];
  if (content.commercials.mode === 'placeholder')
    flags.push(':warning: Commercials are a PLACEHOLDER — a human must set pricing before sending.');
  if (defaulted)
    flags.push(`:round_pushpin: Billing entity DEFAULTED to ${entity.legalName} (region unknown) — confirm geo.`);
  else
    flags.push(`Billing entity: ${entity.legalName} (${entity.currency}).`);
  if (entity.address.startsWith('['))
    flags.push(':warning: Entity address is still a placeholder in commercials-content — confirm before send.');
  if (content.effort.isLarge)
    flags.push(`:large_blue_circle: ${content.effort.totalManDays} man-days — LARGE engagement (methodology deck candidate).`);
  else
    flags.push(`Effort: ${content.effort.totalManDays} man-days.`);
  const flagText = flags.length ? `\n${flags.join('\n')}` : '';
```
Then in the `text` template, change the `Approve by:` line from `` `Approve by: sending the draft${priceFlag}\n` `` to:
```ts
    `Approve by: sending the draft${flagText}\n` +
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `cd aws && npx tsc --noEmit`
Expected: PASS (no remaining `effort`/signature errors).

Run: `cd aws && npx vitest run`
Expected: All tests PASS. If any pre-existing fixture builds a `ProposalContent` without `effort`, add the `effort` object from Task 7's helper to it. If any test asserts the old `priceFlag` exact string, update it to the new flag phrasing.

- [ ] **Step 4: Commit**

```bash
git add aws/src/orchestrator/loop.ts
git commit -m "feat(orchestrator): geo entity selection + effort/entity flags in proposal staging"
```

---

## Task 10: Update the sample harness + lint

**Files:**
- Modify: `aws/src/render/sample.ts`

- [ ] **Step 1: Update the sample**

In `aws/src/render/sample.ts`:
- If it imports/uses `buildCommercialsDocx`, switch to:
  ```ts
  import { buildCommercialsLetterhead } from './commercials-letterhead.js';
  import { resolveEntity } from './legal-entities.js';
  ```
  and replace the docx build call with `await buildCommercialsLetterhead(content, resolveEntity('UAE').entity);`.
- Add an `effort` object to the sample `ProposalContent` fixture:
  ```ts
  effort: {
    lines: [{ serviceLine: 'pentest_web', basis: '3 web apps', manDays: 7 }],
    totalManDays: 7,
    aiLeverageNote: 'Effort reflects AI-augmented delivery via the Transilience platform.',
    isLarge: false,
  },
  ```

- [ ] **Step 2: Run the sample**

Run: `cd aws && npx tsx src/render/sample.ts`
Expected: writes `out/sample-proposal.pdf` and the commercials `.docx` without error.

- [ ] **Step 3: Lint + final full suite**

Run: `cd aws && npx eslint . && npx tsc --noEmit && npx vitest run`
Expected: lint clean, typecheck clean, all tests green.

- [ ] **Step 4: Commit**

```bash
git add aws/src/render/sample.ts
git commit -m "chore(render): update sample harness for letterhead commercials + effort"
```

---

## Self-review notes (coverage map)

- Spec §5.1 (legal entities + resolveEntity) → Task 2.
- Spec §5.2 (letterhead builder, splice before sectPr, jszip) → Tasks 1, 4, 7.
- Spec §5.3 (entity content variants) → Tasks 2 (entity data) + 3 (shared clauses).
- Spec §5.4 (effort types + estimation, isLarge in code) → Tasks 5, 6.
- Spec §5.5 (orchestrator integration + Slack flags) → Tasks 8, 9.
- Spec §6 (money vs man-days boundary) → effort table is man-days only (Task 7); pricing stays `commercials.text` (unchanged); no rate card introduced.
- Spec §7 (tests) → Tasks 2, 4, 6, 7 (+ handler/full suite in 8, 9, 10).

## Deployment (after all tasks pass — PAUSE for KK go-ahead first)

Per the project runbook, deploy is a separate, human-gated step:
```bash
cd aws && AWS_PROFILE=sara-sales AWS_REGION=ap-south-1 npx cdk deploy --profile sara-sales --require-approval never
```
Smoke-verify the next staged proposal's commercials `.docx` (geo entity + effort table). Given the known sandbox signature-lag, prefer verifying behaviour via a throwaway vitest build over a backgrounded AWS CLI invoke.
