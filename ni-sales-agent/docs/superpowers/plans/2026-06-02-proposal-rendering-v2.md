# Proposal Generator v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pptxgenjs proposal deck with a brand-faithful 16:9 PDF rendered from HTML/CSS by a dedicated render Lambda, and ground proposal content in the curated capability library.

**Architecture:** The orchestrator (tick) Lambda generates `ProposalContent` via Bedrock — now grounded by `capability-library.md` — then invokes a new pure-function `ni-sales-render` Lambda (`content → PDF bytes`) that fills one deterministic HTML template (Transilience design system) and prints it to PDF via puppeteer-core + @sparticuz/chromium. The orchestrator's existing `DeckPort.render(content) => Buffer` port is preserved; only its implementation swaps to a Lambda invoke. The orchestrator keeps its current S3 put + Outlook-attach flow.

**Tech Stack:** Node 20, TypeScript (ESM), AWS CDK (NodejsFunction), puppeteer-core, @sparticuz/chromium, @fontsource/jost, @fontsource/roboto, vitest. Bedrock global Sonnet 4.5.

---

## File Structure

**Create:**
- `aws/src/render/template.ts` — `renderProposalHtml(content: ProposalContent): string`. Pure function: fills the 16:9 HTML/CSS template. The only place layout lives.
- `aws/src/render/assets.generated.ts` — committed base64 constants: Jost 400/600, Roboto 400/500 woff2, NI logo PNG. Imported by the template.
- `aws/scripts/gen-render-assets.ts` — one-off generator that reads @fontsource woff2 + `ni-logo.png` and writes `assets.generated.ts`.
- `aws/src/render/pdf.ts` — `htmlToPdf(html: string): Promise<Buffer>`. Wraps puppeteer-core + @sparticuz/chromium.
- `aws/src/render/handler.ts` — render Lambda entry: event `{ content }` → `{ pdfBase64 }`.
- `aws/src/render/sample.ts` — local script: render the fixture to `./out/sample-proposal.pdf` for manual eyeballing.
- `aws/src/adapters/render.ts` — `RenderClient` (invokes the render Lambda, returns Buffer).
- `aws/test/render/template.test.ts`, `aws/test/render/assets.test.ts`, `aws/test/adapters/render.test.ts`, `aws/test/judgment/grounding.test.ts`.

**Modify:**
- `aws/src/proposal/types.ts` — add `credentials`, `transilienceEdge` to `ProposalContent`.
- `aws/src/judgment/judgment.ts` — inject capability library + new output keys in `buildProposalContent`.
- `aws/src/judgment/skills.ts` — add `loadContent(name)` for `src/content/*.md` (or extend).
- `aws/src/adapters/s3.ts` — PDF content type.
- `aws/src/orchestrator/loop.ts` — `stageProposal` filename/extension `.pptx` → `.pdf`.
- `aws/src/bootstrap.ts` — wire `RenderClient` into `deck.render`.
- `aws/infra/cdk/ni-sales-agent-stack.ts` — add render Lambda, grant invoke, env var, copy `content/`, drop pptxgenjs.
- `aws/package.json` — add deps, drop pptxgenjs, add scripts.
- `skills/proposal-assembly/SKILL.md` — read library; populate credentials/transilienceEdge; drop ni-branded-pptx; PDF not PPTX.

**Delete:** `aws/src/proposal/deck.ts`, `aws/test/proposal/deck.test.ts`.

**Conventions to follow:** ESM with `.js` import suffixes; `import.meta.url` path resolution only where unavoidable; vitest; the dependency-injection port pattern in `loop.ts`/`bootstrap.ts`; structured logger (no `print`/`console` in committed code beyond existing patterns).

---

## Task 1: Extend ProposalContent

**Files:**
- Modify: `aws/src/proposal/types.ts`
- Modify: `aws/test/proposal/deck.test.ts:5-22` (fixture — keeps the existing suite green until deck.ts is removed in Task 10)

- [ ] **Step 1: Add the two fields**

In `aws/src/proposal/types.ts`, add to `ProposalContent` after `whyNi`:

```ts
  whyNi: string[];
  credentials: string[];      // from capability-library §3; must-highlights first on technical work
  transilienceEdge: string[]; // from capability-library §5; [] when it doesn't strengthen the case
  commercials: Commercials;
```

- [ ] **Step 2: Keep the existing fixture compiling**

In `aws/test/proposal/deck.test.ts`, add the two fields to the `content` fixture after `whyNi`:

```ts
  whyNi: ['CERT-In empanelled auditor', 'BFSI/fintech testing experience'],
  credentials: ['CREST Accredited', 'CERT-In Empanelled', 'PCI QSA & PIN Assessor', 'HITRUST Assessor'],
  transilienceEdge: [],
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after scoping.' },
```

- [ ] **Step 3: Typecheck**

Run: `cd aws && npm run typecheck`
Expected: PASS (deck.ts only reads a subset of fields; adding fields doesn't break it).

- [ ] **Step 4: Run the existing suite**

Run: `cd aws && npm test`
Expected: PASS (61 existing tests still green).

- [ ] **Step 5: Commit**

```bash
cd aws && git add src/proposal/types.ts test/proposal/deck.test.ts
git commit -m "feat: add credentials and transilienceEdge to ProposalContent"
```

---

## Task 2: Install render dependencies

**Files:**
- Modify: `aws/package.json`

- [ ] **Step 1: Add runtime + dev deps**

Run:

```bash
cd aws
npm install puppeteer-core@^23 @sparticuz/chromium@^131
npm install -D @fontsource/jost@^5 @fontsource/roboto@^5
```

(Use the latest matching majors if these are unavailable; `@sparticuz/chromium` major should track a Chromium that puppeteer-core supports — verify with the package's README compatibility table.)

- [ ] **Step 2: Verify the @fontsource woff2 files exist**

Run: `ls node_modules/@fontsource/jost/files/jost-latin-400-normal.woff2 node_modules/@fontsource/jost/files/jost-latin-600-normal.woff2 node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2 node_modules/@fontsource/roboto/files/roboto-latin-500-normal.woff2`
Expected: all four paths listed (no "No such file"). If filenames differ, run `ls node_modules/@fontsource/jost/files | grep latin` and note the actual names for Task 3.

- [ ] **Step 3: Commit**

```bash
cd aws && git add package.json package-lock.json
git commit -m "chore: add puppeteer-core, @sparticuz/chromium, @fontsource fonts"
```

---

## Task 3: Generate inlined font + logo assets

**Files:**
- Create: `aws/scripts/gen-render-assets.ts`
- Create: `aws/src/render/assets.generated.ts` (produced by the script)
- Create: `aws/test/render/assets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/render/assets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { JOST_400, JOST_600, ROBOTO_400, ROBOTO_500, NI_LOGO_PNG } from '../../src/render/assets.generated.js';

const isB64 = (s: string) => s.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(s);

describe('render assets', () => {
  it('exposes non-empty base64 woff2 + logo constants', () => {
    for (const c of [JOST_400, JOST_600, ROBOTO_400, ROBOTO_500, NI_LOGO_PNG]) {
      expect(isB64(c)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd aws && npx vitest run test/render/assets.test.ts`
Expected: FAIL — cannot find module `assets.generated.js`.

- [ ] **Step 3: Write the generator**

Create `aws/scripts/gen-render-assets.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const b64 = (p: string) => readFileSync(p).toString('base64');

// Adjust filenames here if Task 2 Step 2 reported different ones.
const assets = {
  JOST_400: b64(join(root, 'node_modules/@fontsource/jost/files/jost-latin-400-normal.woff2')),
  JOST_600: b64(join(root, 'node_modules/@fontsource/jost/files/jost-latin-600-normal.woff2')),
  ROBOTO_400: b64(join(root, 'node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2')),
  ROBOTO_500: b64(join(root, 'node_modules/@fontsource/roboto/files/roboto-latin-500-normal.woff2')),
  NI_LOGO_PNG: b64(join(root, 'src/assets/ni-logo.png')),
};

const body = Object.entries(assets)
  .map(([k, v]) => `export const ${k} = '${v}';`)
  .join('\n');

writeFileSync(
  join(root, 'src/render/assets.generated.ts'),
  `// AUTO-GENERATED by scripts/gen-render-assets.ts. Do not edit by hand.\n${body}\n`,
);
console.log('Wrote src/render/assets.generated.ts');
```

- [ ] **Step 4: Run the generator**

Run: `cd aws && mkdir -p src/render && npx tsx scripts/gen-render-assets.ts`
Expected: prints `Wrote src/render/assets.generated.ts`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/render/assets.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the generate script to package.json**

In `aws/package.json` `scripts`, add:

```json
    "gen:render-assets": "tsx scripts/gen-render-assets.ts",
```

- [ ] **Step 7: Commit**

```bash
cd aws && git add scripts/gen-render-assets.ts src/render/assets.generated.ts test/render/assets.test.ts package.json
git commit -m "feat: generate inlined base64 font + logo assets for PDF render"
```

---

## Task 4: HTML template

**Files:**
- Create: `aws/src/render/template.ts`
- Create: `aws/test/render/template.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/render/template.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderProposalHtml } from '../../src/render/template.js';
import type { ProposalContent } from '../../src/proposal/types.js';

const content: ProposalContent = {
  company: 'Novelty Wealth',
  contactName: 'Shashank Agrawal',
  serviceLines: ['pentest_mobile', 'pentest_api', 'compliance'],
  titleLine: 'Mobile Application VAPT Proposal for Novelty Wealth',
  understanding: ['SEBI-regulated investment advisory', 'CERT-In report needed within 30 days'],
  scopeRows: [
    { line: 'Mobile VAPT', detail: 'Android + iOS, ~95 screens (OWASP MASVS/MSTG)' },
    { line: 'API/backend', detail: 'Endpoints consumed by the app' },
  ],
  assumptions: ['~95 screens as stated', 'Builds + credentials provided'],
  approach: ['OWASP MASVS/MSTG', 'Authenticated testing'],
  deliverables: ['CERT-In compliant report', 'Re-test of fixed findings'],
  timeline: '~4 weeks including re-test',
  whyNi: ['BFSI/fintech testing experience'],
  credentials: ['CREST Accredited', 'CERT-In Empanelled', 'PCI QSA & PIN Assessor', 'HITRUST Assessor'],
  transilienceEdge: [],
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after scoping.' },
  nextSteps: ['Sign NDA', 'Share builds + credentials', 'Kick-off call'],
};

describe('renderProposalHtml', () => {
  it('produces a full HTML document with the title and a 16:9 page size', () => {
    const html = renderProposalHtml(content);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Mobile Application VAPT Proposal for Novelty Wealth');
    expect(html).toContain('size: 1280px 720px');
  });

  it('renders the must-highlight credentials', () => {
    const html = renderProposalHtml(content);
    for (const c of content.credentials) expect(html).toContain(c);
  });

  it('embeds the brand fonts as @font-face data URIs', () => {
    const html = renderProposalHtml(content);
    expect(html).toContain("font-family: 'Jost'");
    expect(html).toContain('data:font/woff2;base64,');
  });

  it('omits a section when its content is empty (transilienceEdge)', () => {
    const html = renderProposalHtml(content);
    expect(html).not.toContain('The Transilience AI edge');
  });

  it('escapes HTML in content to prevent broken markup', () => {
    const html = renderProposalHtml({ ...content, titleLine: 'A <script> & "co"' });
    expect(html).toContain('A &lt;script&gt; &amp; &quot;co&quot;');
    expect(html).not.toContain('<script> &');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd aws && npx vitest run test/render/template.test.ts`
Expected: FAIL — cannot find module `template.js`.

- [ ] **Step 3: Implement the template**

Create `aws/src/render/template.ts`. Design tokens from the Transilience system (Rich Black `#0A0A0B`, gradient `#582A90 → #B61A3F`, yellow `#FCE205`; Jost display, Roboto body). 16:9 pages via `@page { size: 1280px 720px }` + `page-break-after`. Sections render only when non-empty.

```ts
import type { ProposalContent } from '../proposal/types.js';
import { JOST_400, JOST_600, ROBOTO_400, ROBOTO_500, NI_LOGO_PNG } from './assets.generated.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const face = (family: string, weight: number, b64: string): string =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
  `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

const FONTS = [
  face('Jost', 400, JOST_400), face('Jost', 600, JOST_600),
  face('Roboto', 400, ROBOTO_400), face('Roboto', 500, ROBOTO_500),
].join('');

const CSS = `
${FONTS}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:1280px 720px;margin:0;}
html,body{font-family:'Roboto',sans-serif;color:#E7E7EA;background:#0A0A0B;}
.page{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;
  background:#0A0A0B;padding:72px 88px;}
.page:last-child{page-break-after:auto;}
h1,h2,.eyebrow{font-family:'Jost',sans-serif;}
.eyebrow{font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#FCE205;font-weight:600;margin-bottom:18px;}
h1{font-size:54px;font-weight:600;line-height:1.05;max-width:900px;}
h2{font-size:34px;font-weight:600;margin-bottom:28px;}
.accent{height:6px;width:280px;background:linear-gradient(90deg,#582A90,#731E7A,#A01855,#B61A3F);margin:24px 0;}
.logo{height:40px;}
.cover{display:flex;flex-direction:column;justify-content:center;}
.cover .meta{font-family:'Jost',sans-serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#9A9AA2;margin-top:28px;}
ul{list-style:none;display:flex;flex-direction:column;gap:16px;margin-top:8px;}
li{font-size:20px;line-height:1.4;padding-left:26px;position:relative;}
li::before{content:'';position:absolute;left:0;top:11px;width:8px;height:8px;border-radius:999px;background:#B61A3F;}
table{width:100%;border-collapse:collapse;margin-top:8px;}
th,td{text-align:left;padding:16px 18px;font-size:18px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top;}
th{font-family:'Jost',sans-serif;background:#582A90;color:#fff;font-weight:600;}
td.line{font-weight:500;color:#fff;width:30%;}
.chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;}
.chip{font-family:'Jost',sans-serif;font-size:16px;font-weight:600;border:1px solid rgba(255,255,255,.16);
  border-radius:999px;padding:12px 20px;color:#fff;}
.foot{position:absolute;bottom:40px;left:88px;right:88px;display:flex;justify-content:space-between;
  font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6A6A72;}
.para{font-size:20px;line-height:1.5;max-width:920px;margin-top:8px;}
`;

const logoTag = `<img class="logo" src="data:image/png;base64,${NI_LOGO_PNG}" alt="Network Intelligence"/>`;
const foot = (n: number, total: number) =>
  `<div class="foot"><span>Network Intelligence · Confidential</span><span>${n} / ${total}</span></div>`;

const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

function listSection(eyebrow: string, title: string, items: string[]): string | null {
  if (!items.length) return null;
  return `<section class="body"><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2>${ul(items)}</section>`;
}

export function renderProposalHtml(content: ProposalContent): string {
  const pages: string[] = [];

  // 1. Cover
  pages.push(
    `<div class="cover">${logoTag}<div class="accent"></div>` +
    `<h1>${esc(content.titleLine)}</h1>` +
    `<div class="meta">Prepared for ${esc(content.company)} · ${esc(content.contactName)}</div>` +
    `<div class="meta">${content.serviceLines.map(esc).join(' · ').toUpperCase()}</div></div>`,
  );

  // 2. Understanding
  pages.push(listSection('What we heard', 'Understanding your need', content.understanding));

  // 3. Scope (table)
  if (content.scopeRows.length) {
    const rows = content.scopeRows
      .map((r) => `<tr><td class="line">${esc(r.line)}</td><td>${esc(r.detail)}</td></tr>`)
      .join('');
    pages.push(
      `<section><div class="eyebrow">In scope</div><h2>Scope</h2>` +
      `<table><thead><tr><th>Service line</th><th>In scope</th></tr></thead><tbody>${rows}</tbody></table></section>`,
    );
  }

  // 4. Approach
  pages.push(listSection('How we work', 'Approach & methodology', content.approach));

  // 5. Deliverables & timeline
  if (content.deliverables.length || content.timeline) {
    pages.push(listSection('What you get', 'Deliverables & timeline',
      [...content.deliverables, ...(content.timeline ? [`Timeline: ${content.timeline}`] : [])])!);
  }

  // 6. Credentials (chips)
  if (content.credentials.length) {
    pages.push(
      `<section><div class="eyebrow">Why us</div><h2>Credentials</h2>` +
      `<div class="chips">${content.credentials.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div></section>`,
    );
  }

  // 7. Transilience edge (conditional)
  pages.push(listSection('AI-native delivery', 'The Transilience AI edge', content.transilienceEdge));

  // 8. Why NI
  pages.push(listSection('The fit', 'Why Network Intelligence', content.whyNi));

  // 9. Assumptions
  pages.push(listSection('Please correct anything off', 'Assumptions',
    content.assumptions.map((a) => `${a} — tell us if this isn't right`)));

  // 10. Commercials
  if (content.commercials.text) {
    pages.push(
      `<section><div class="eyebrow">Commercials</div><h2>Commercials</h2>` +
      `<p class="para">${esc(content.commercials.text)}</p></section>`,
    );
  }

  // 11. Next steps
  pages.push(listSection('From here', 'Next steps', content.nextSteps));

  const kept = pages.filter((p): p is string => p !== null);
  const total = kept.length;
  const body = kept
    .map((p, i) => `<div class="page">${p}${foot(i + 1, total)}</div>`)
    .join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/render/template.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
cd aws && git add src/render/template.ts test/render/template.test.ts
git commit -m "feat: add HTML proposal template (Transilience design system, 16:9)"
```

---

## Task 5: PDF generation + local sample

**Files:**
- Create: `aws/src/render/pdf.ts`
- Create: `aws/src/render/sample.ts`

> No unit test runs puppeteer in CI (it needs a real Chromium). `pdf.ts` is covered by the manual local sample (Step 3) and the deploy-time gate in Task 11.

- [ ] **Step 1: Implement the PDF wrapper**

Create `aws/src/render/pdf.ts`. It is environment-aware: in Lambda it uses the `@sparticuz/chromium`
Linux binary; locally (macOS/dev) `@sparticuz/chromium`'s binary won't run, so it launches a
system-installed Chrome (overridable via `PUPPETEER_EXECUTABLE_PATH`).

```ts
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launchOptions(): Promise<{ args: string[]; executablePath: string; headless: true }> {
  // In Lambda, AWS sets AWS_LAMBDA_FUNCTION_NAME — use the bundled Linux Chromium.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return { args: chromium.args, executablePath: await chromium.executablePath(), headless: true };
  }
  // Local dev: the @sparticuz binary is Linux-only. Use a system Chrome.
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? MAC_CHROME;
  return { args: [], executablePath, headless: true };
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const opts = await launchOptions();
  const browser = await puppeteer.launch({ ...opts, defaultViewport: { width: 1280, height: 720 } });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

Note: the local sample (Step 3) needs Chrome installed at the macOS path, or `PUPPETEER_EXECUTABLE_PATH`
set. The authoritative render verification is the Lambda smoke test in Task 12 Step 3.

- [ ] **Step 2: Implement the local sample script**

Create `aws/src/render/sample.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderProposalHtml } from './template.js';
import { htmlToPdf } from './pdf.js';
import type { ProposalContent } from '../proposal/types.js';

const content: ProposalContent = {
  company: 'Novelty Wealth', contactName: 'Shashank Agrawal',
  serviceLines: ['pentest_mobile', 'pentest_api', 'compliance'],
  titleLine: 'Mobile Application VAPT Proposal for Novelty Wealth',
  understanding: ['SEBI-regulated investment advisory', 'CERT-In report needed within 30 days'],
  scopeRows: [
    { line: 'Mobile VAPT', detail: 'Android + iOS, ~95 screens (OWASP MASVS/MSTG)' },
    { line: 'API/backend', detail: 'Endpoints consumed by the app' },
  ],
  assumptions: ['~95 screens as stated', 'Builds + credentials provided'],
  approach: ['OWASP MASVS/MSTG', 'Authenticated testing with SSL pinning enabled'],
  deliverables: ['CERT-In compliant report with remediation', 'Re-test of fixed findings'],
  timeline: '~4 weeks including re-test',
  whyNi: ['BFSI/fintech testing experience', '550+ security professionals'],
  credentials: ['CREST Accredited', 'CERT-In Empanelled', 'PCI QSA & PIN Assessor', 'HITRUST Assessor', 'ISO 27001'],
  transilienceEdge: ['Continuous, AI-managed pen testing', 'Findings prioritised by exploitability'],
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after a short scoping call.' },
  nextSteps: ['Sign NDA', 'Share builds + credentials', 'Kick-off call'],
};

async function main(): Promise<void> {
  const pdf = await htmlToPdf(renderProposalHtml(content));
  mkdirSync('out', { recursive: true });
  writeFileSync('out/sample-proposal.pdf', pdf);
  console.log(`Wrote out/sample-proposal.pdf (${pdf.length} bytes)`);
}
main();
```

- [ ] **Step 3: Render the sample and eyeball it**

Run: `cd aws && npx tsx src/render/sample.ts && open out/sample-proposal.pdf`
Expected: a valid 16:9 PDF; fonts render (Jost headings, Roboto body), brand colours present, all sections laid out, no overflow. Fix template CSS in Task 4's file if anything looks wrong, then re-run.

- [ ] **Step 4: Add scripts to package.json**

In `aws/package.json` `scripts`, add:

```json
    "render:sample": "tsx src/render/sample.ts",
```

Add `out/` to `aws/.gitignore` if not already ignored.

- [ ] **Step 5: Commit**

```bash
cd aws && git add src/render/pdf.ts src/render/sample.ts package.json .gitignore
git commit -m "feat: add puppeteer PDF generation and local sample renderer"
```

---

## Task 6: Render Lambda handler

**Files:**
- Create: `aws/src/render/handler.ts`

> Contract: event `{ content: ProposalContent }` → `{ pdfBase64: string }`. Pure function; no S3, no network beyond Chromium.

- [ ] **Step 1: Implement the handler**

Create `aws/src/render/handler.ts`:

```ts
import type { ProposalContent } from '../proposal/types.js';
import { renderProposalHtml } from './template.js';
import { htmlToPdf } from './pdf.js';

export interface RenderEvent { content: ProposalContent }
export interface RenderResult { pdfBase64: string }

export async function handler(event: RenderEvent): Promise<RenderResult> {
  if (!event?.content) throw new Error('render: missing content');
  const pdf = await htmlToPdf(renderProposalHtml(event.content));
  return { pdfBase64: pdf.toString('base64') };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd aws && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd aws && git add src/render/handler.ts
git commit -m "feat: add ni-sales-render Lambda handler (content -> pdfBase64)"
```

---

## Task 7: Render client + DeckPort swap

**Files:**
- Create: `aws/src/adapters/render.ts`
- Create: `aws/test/adapters/render.test.ts`
- Modify: `aws/src/bootstrap.ts:10,57`

- [ ] **Step 1: Write the failing test**

Create `aws/test/adapters/render.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { RenderClient } from '../../src/adapters/render.js';

describe('RenderClient', () => {
  it('invokes the function and returns decoded PDF bytes', async () => {
    const pdf = Buffer.from('%PDF-1.7 hello');
    const payload = JSON.stringify({ pdfBase64: pdf.toString('base64') });
    const send = vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) });
    const client = new RenderClient({ send } as never, 'ni-sales-render');

    const out = await client.render({ titleLine: 'x' } as never);
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
    expect(send).toHaveBeenCalledOnce();
  });

  it('throws if the function returned a function error', async () => {
    const send = vi.fn().mockResolvedValue({ FunctionError: 'Unhandled', Payload: new TextEncoder().encode('{}') });
    const client = new RenderClient({ send } as never, 'ni-sales-render');
    await expect(client.render({} as never)).rejects.toThrow(/render lambda/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd aws && npx vitest run test/adapters/render.test.ts`
Expected: FAIL — cannot find module `render.js`.

- [ ] **Step 3: Implement the client**

Create `aws/src/adapters/render.ts`:

```ts
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { ProposalContent } from '../proposal/types.js';

export class RenderClient {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly functionName: string,
  ) {}

  static fromEnv(functionName: string, region: string): RenderClient {
    return new RenderClient(new LambdaClient({ region }), functionName);
  }

  async render(content: ProposalContent): Promise<Buffer> {
    const res = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        Payload: new TextEncoder().encode(JSON.stringify({ content })),
      }),
    );
    const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
    if (res.FunctionError) throw new Error(`render lambda failed: ${res.FunctionError} ${text}`);
    const parsed = JSON.parse(text) as { pdfBase64?: string };
    if (!parsed.pdfBase64) throw new Error('render lambda returned no pdfBase64');
    return Buffer.from(parsed.pdfBase64, 'base64');
  }
}
```

- [ ] **Step 4: Install the Lambda SDK client**

Run: `cd aws && npm install @aws-sdk/client-lambda@^3.658.0`

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/adapters/render.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Wire it into bootstrap**

In `aws/src/bootstrap.ts`, replace the deck import (line 10) and the `deck` dep (line 57):

Replace:
```ts
import { renderDeck } from './proposal/deck.js';
```
with:
```ts
import { RenderClient } from './adapters/render.js';
```

Replace:
```ts
    deck: { render: (content) => renderDeck(content) },
```
with:
```ts
    deck: RenderClient.fromEnv(env['RENDER_FUNCTION_NAME']!, config.region),
```

(`RenderClient` satisfies `DeckPort` — it has `render(content): Promise<Buffer>`.)

- [ ] **Step 7: Typecheck + full test run**

Run: `cd aws && npm run typecheck && npm test`
Expected: PASS. (deck.ts still exists and compiles; it's just no longer imported by bootstrap.)

- [ ] **Step 8: Commit**

```bash
cd aws && git add src/adapters/render.ts test/adapters/render.test.ts src/bootstrap.ts package.json package-lock.json
git commit -m "feat: invoke render Lambda for proposals via RenderClient (DeckPort)"
```

---

## Task 8: Content grounding in buildProposalContent

**Files:**
- Modify: `aws/src/judgment/skills.ts`
- Modify: `aws/src/judgment/judgment.ts:96-120`
- Modify: `skills/proposal-assembly/SKILL.md`
- Create: `aws/test/judgment/grounding.test.ts`

- [ ] **Step 1: Add a content loader**

In `aws/src/judgment/skills.ts`, add below `loadSkill`:

```ts
const CONTENT_ROOTS = [
  join(here, 'content'),
  ...(process.env.LAMBDA_TASK_ROOT ? [join(process.env.LAMBDA_TASK_ROOT, 'content')] : []),
  join(here, '..', 'content'),
  join(here, '..', '..', 'content'),
];

export function loadContent(name: string): string {
  for (const root of CONTENT_ROOTS) {
    const path = join(root, `${name}.md`);
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error(`Content not found: ${name} (looked in ${CONTENT_ROOTS.join(', ')})`);
}
```

- [ ] **Step 2: Write the failing test**

Create `aws/test/judgment/grounding.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';

describe('buildProposalContent grounding', () => {
  it('injects the capability library and requests the new output keys', async () => {
    const askJson = vi.fn().mockResolvedValue({
      titleLine: 't', understanding: [], scopeRows: [], assumptions: [], approach: [],
      deliverables: [], timeline: '', whyNi: [], credentials: ['CREST Accredited'],
      transilienceEdge: [], commercials: { mode: 'placeholder', text: 'x' }, nextSteps: [],
    });
    const svc = new JudgmentService({ askJson } as never);

    const out = await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo', serviceLines: ['mdr'], scope: {}, assumptions: [],
    });

    const system = askJson.mock.calls[0][0] as string;
    expect(system).toContain('Capability Library');         // library text is in the prompt
    expect(system).toContain('PCI PIN Assessor');           // a known library fact
    expect(system).toMatch(/credentials \(string\[\]\)/);   // new output key requested
    expect(system).toMatch(/transilienceEdge \(string\[\]\)/);
    expect(out.credentials).toEqual(['CREST Accredited']);  // passthrough into ProposalContent
    expect(out.company).toBe('Acme');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd aws && npx vitest run test/judgment/grounding.test.ts`
Expected: FAIL — system prompt lacks the library text and the new keys.

- [ ] **Step 4: Inject the library + new keys**

In `aws/src/judgment/judgment.ts`: add `loadContent` to the import on line 2:

```ts
import { loadSkill, loadContent } from './skills.js';
```

Replace the `buildProposalContent` `system` assignment (lines 103-109) with:

```ts
    const system =
      `${loadSkill('proposal-assembly')}\n\n` +
      `## Capability Library (grounding — quote facts from here; never invent)\n` +
      `Use ONLY credentials, services, proof points and clients stated below. If the client's need ` +
      `isn't covered here, say so plainly — do not fabricate.\n\n${loadContent('capability-library')}\n\n` +
      `${JSON_RULE}\n` +
      'PRICING DISCIPLINE: if the captured scope cannot justify a firm price, set ' +
      'commercials.mode="placeholder" and say pricing will be confirmed. Never fabricate a figure.\n' +
      'Output keys: titleLine (string), understanding (string[]), scopeRows ({line,detail}[]), ' +
      'assumptions (string[]), approach (string[]), deliverables (string[]), timeline (string), ' +
      'whyNi (string[]), credentials (string[]), transilienceEdge (string[]), ' +
      'commercials ({mode:"fixed"|"range"|"placeholder", text:string}), nextSteps (string[]). ' +
      'Populate `credentials` from the library (lead with PCI QSA, PCI PIN Assessor, CREST, HITRUST ' +
      'on technical engagements). Populate `transilienceEdge` only when it strengthens this case; ' +
      'otherwise return [].';
```

(The `Omit<ProposalContent, 'company' | 'contactName' | 'serviceLines'>` raw type already includes
the two new fields, so the spread on lines 114-119 carries them through unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd aws && npx vitest run test/judgment/grounding.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the proposal-assembly skill**

In `skills/proposal-assembly/SKILL.md`: (a) replace the "## Rendering" section's `ni-branded-pptx` /
pptxgenjs guidance with a one-line note that rendering is handled downstream as a branded **PDF**
(the skill only produces content); (b) add a line under deck structure: *"Populate `credentials`
(lead with PCI QSA, PCI PIN Assessor, CREST, HITRUST) and `transilienceEdge` from the capability
library; never invent."*; (c) change any `.pptx` / "deck" output references to "proposal (PDF)".
Keep the pricing-discipline section as-is.

- [ ] **Step 7: Full test run**

Run: `cd aws && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd aws && git add src/judgment/skills.ts src/judgment/judgment.ts test/judgment/grounding.test.ts ../skills/proposal-assembly/SKILL.md
git commit -m "feat: ground proposal content in the capability library"
```

---

## Task 9: PDF output in stageProposal + S3

**Files:**
- Modify: `aws/src/adapters/s3.ts:3,17`
- Modify: `aws/src/orchestrator/loop.ts:331`

- [ ] **Step 1: Switch the S3 content type to PDF**

In `aws/src/adapters/s3.ts`, replace line 3:

```ts
const PDF_CT = 'application/pdf';
```

and in `put`, change `ContentType: PPTX_CT` to `ContentType: PDF_CT`.

- [ ] **Step 2: Change the proposal filename to .pdf**

In `aws/src/orchestrator/loop.ts`, replace line 331:

```ts
  const fileName = `${slug}-proposal-v${version}.pdf`;
```

(The Outlook attachment uses `fileName` + the buffer from `deck.render`, which is now PDF bytes —
no other change needed in `stageProposal`.)

- [ ] **Step 3: Typecheck + full test run**

Run: `cd aws && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd aws && git add src/adapters/s3.ts src/orchestrator/loop.ts
git commit -m "feat: store and attach proposals as PDF"
```

---

## Task 10: Remove pptxgenjs and the old deck

**Files:**
- Delete: `aws/src/proposal/deck.ts`, `aws/test/proposal/deck.test.ts`
- Modify: `aws/package.json`

- [ ] **Step 1: Delete the old renderer + its test**

Run: `cd aws && git rm src/proposal/deck.ts test/proposal/deck.test.ts`

- [ ] **Step 2: Remove the dependency**

Run: `cd aws && npm uninstall pptxgenjs`

- [ ] **Step 3: Confirm nothing references it**

Run: `cd aws && grep -rn "pptxgen\|renderDeck\|deck.js" src test` 
Expected: no matches (empty output).

- [ ] **Step 4: Typecheck + full test run**

Run: `cd aws && npm run typecheck && npm test`
Expected: PASS (deck.test removed; all render/grounding/existing tests green).

- [ ] **Step 5: Commit**

```bash
cd aws && git add -A
git commit -m "refactor: remove pptxgenjs deck renderer (replaced by PDF render Lambda)"
```

---

## Task 11: CDK — render Lambda, wiring, bundling

**Files:**
- Modify: `aws/infra/cdk/ni-sales-agent-stack.ts`

- [ ] **Step 1: Add the render Lambda construct**

In `aws/infra/cdk/ni-sales-agent-stack.ts`, after the `Decks` bucket block (after line 34) and
before `const fn = ...`, add:

```ts
    const renderFn = new nodejs.NodejsFunction(this, 'RenderFn', {
      functionName: 'ni-sales-render',
      entry: 'src/render/handler.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(120),
      memorySize: 2048,
      ephemeralStorageSize: Size.mebibytes(1024),
      bundling: {
        format: nodejs.OutputFormat.ESM,
        // @sparticuz/chromium ships a brotli binary; puppeteer-core resolves it at runtime.
        // Neither survives esbuild bundling — keep both as installed modules.
        nodeModules: ['@sparticuz/chromium', 'puppeteer-core'],
      },
    });
```

Add `Size` to the `aws-cdk-lib` import on line 1:

```ts
import { Stack, StackProps, Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
```

- [ ] **Step 2: Wire the orchestrator → render Lambda**

In the orchestrator `fn` `environment` block (after line 77, `BEDROCK_MODEL_ID`), add:

```ts
        RENDER_FUNCTION_NAME: renderFn.functionName,
```

After the existing grants (after line 85, `slackSecret.grantRead(fn);`), add:

```ts
    renderFn.grantInvoke(fn);
```

- [ ] **Step 3: Copy the content library into the orchestrator bundle**

In the orchestrator `fn` `commandHooks.afterBundling` array (lines 54-57), add a third copy line:

```ts
        afterBundling: (i: string, o: string) => [
          `cp -R ${i}/../skills ${o}/skills`,
          `mkdir -p ${o}/assets && cp -R ${i}/src/assets/. ${o}/assets/ 2>/dev/null || true`,
          `mkdir -p ${o}/content && cp -R ${i}/src/content/. ${o}/content/ 2>/dev/null || true`,
        ],
```

- [ ] **Step 4: Remove pptxgenjs from the orchestrator bundle config**

In the orchestrator `fn` `bundling`, remove `nodeModules: ['pptxgenjs'],` (and its preceding comment
lines 48-49). The orchestrator no longer needs any unbundled module.

- [ ] **Step 5: Synthesize the stack to validate**

Run: `cd aws && npx cdk synth --profile sara-sales > /dev/null && echo SYNTH_OK`
Expected: `SYNTH_OK` (no synth errors). If `cdk synth` requires bootstrapped context, this still
validates construct wiring.

- [ ] **Step 6: Commit**

```bash
cd aws && git add infra/cdk/ni-sales-agent-stack.ts
git commit -m "feat: add ni-sales-render Lambda and wire content grounding (CDK)"
```

---

## Task 12: Verify, deploy, and validate live

**Files:** none (verification gate).

- [ ] **Step 1: Full local verification**

Run: `cd aws && npm run typecheck && npm run lint && npm test && npm run render:sample`
Expected: typecheck PASS, lint PASS, all tests PASS, `out/sample-proposal.pdf` written. Open it and
confirm visual quality (brand fonts/colours, 16:9, all sections, credentials chips, no overflow).

- [ ] **Step 2: Deploy**

Run: `cd aws && npx cdk deploy --profile sara-sales --require-approval never`
Expected: stack updates; both `ni-sales-agent` and `ni-sales-render` functions present.

- [ ] **Step 3: Smoke-test the render Lambda in AWS**

Run (write the payload to a file first, then invoke):
```bash
cat > /tmp/render-payload.json <<'JSON'
{"content":{"company":"Test Co","contactName":"A B","serviceLines":["mdr"],"titleLine":"MDR Proposal for Test Co","understanding":["x"],"scopeRows":[{"line":"MDR","detail":"24/7"}],"assumptions":[],"approach":["y"],"deliverables":["z"],"timeline":"4 weeks","whyNi":["w"],"credentials":["CREST Accredited"],"transilienceEdge":[],"commercials":{"mode":"placeholder","text":"TBC"},"nextSteps":["call"]}}
JSON
aws lambda invoke --function-name ni-sales-render \
  --payload fileb:///tmp/render-payload.json \
  --cli-binary-format raw-in-base64-out --profile sara-sales --region ap-south-1 /tmp/render-out.json
node -e "const o=require('/tmp/render-out.json');const b=Buffer.from(o.pdfBase64,'base64');require('fs').writeFileSync('/tmp/render-out.pdf',b);console.log('PDF bytes:',b.length, b.subarray(0,5).toString())"
open /tmp/render-out.pdf
```
Expected: prints `PDF bytes: <n> %PDF-` and opens a valid branded PDF. (This is the one real unknown —
Chromium cold-start, fonts, `/tmp` sizing — verified here before trusting the pipeline.)

- [ ] **Step 4: Validate end-to-end (seeded deal)**

Follow the handoff's seeding procedure (`RUNBOOK.md` / `.remember`): disable the cron
(`aws events disable-rule --name ni-sales-agent-tick`), seed a deal at `SCOPE_REVIEW`, run one tick,
confirm a PDF proposal is staged to S3 + attached to an Outlook draft + posted to Slack, then
re-enable the rule. Delete the seed script after.

- [ ] **Step 5: Final commit (if any verification fixups were made)**

```bash
cd aws && git add -A && git commit -m "fix: render verification fixups" || echo "nothing to commit"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** content grounding (Tasks 1, 8), HTML/CSS→16:9 PDF (Tasks 4, 5), dedicated render
  Lambda pure-fn contract (Tasks 6, 7, 11), inlined assets (Task 3), data-model extension (Task 1),
  S3/Outlook PDF (Task 9), cleanup (Task 10), testing + manual gate (Tasks 4–7 unit, 5 & 12 manual).
  Pricing-edit-via-Slack reuses the existing approval loop (no code change in this build — the
  regenerate path is the existing `SCOPE_REVIEW → stageProposal` transition; out of scope here).
- **Out of scope (per spec §1):** editable PPTX, chat editing, Excel annexure, HubSpot enrichment.
- **Risk watch:** Task 12 Step 3 is the gate for the Chromium-in-Lambda unknown. If the binary fails
  to launch, check the `@sparticuz/chromium` ↔ Chromium ↔ puppeteer-core version compatibility table
  and bump `memorySize`/`ephemeralStorageSize` before any other change.
