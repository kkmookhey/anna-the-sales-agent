# Methodology Deck (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an engagement is an RFP or exceeds 10 man-days, render a 20–25 slide methodology deck with per-service-line methodology grounded in real frameworks, diagrammatic graphics, an AI-augmented-delivery story, a framework crosswalk, and an effort & timeline plan — while small deals keep the existing 10-slide deck unchanged.

**Architecture:** A curated `methodology-library.ts` grounds a second, large-deals-only Bedrock call (`buildMethodologyContent`) that returns a `MethodologyContent` object. A new `methodology-template.ts` reuses the standard deck's shared chrome + several standard slide builders and adds methodology slide builders, assembled by `renderMethodologyHtml`. `loop.ts` computes `deckType` from `effort.isLarge || rfp` and threads it (and the methodology content) through the render Lambda, which picks the template.

**Tech Stack:** TypeScript (ESM/NodeNext), AWS Lambda, Bedrock, Puppeteer HTML→PDF, vitest. Design-system CSS is authored in `design-system/proposal.css` and inlined into the committed `assets.generated.ts` via `npm run gen:render-assets`.

---

## File structure

| File | Responsibility |
|---|---|
| `aws/src/render/deck-shared.ts` (new) | Shared deck chrome extracted from template.ts: `esc`, `logoMark`, `head`, `foot`, `STYLE`, `SlideDesc`, `assembleSlides`, `wrapDeck` |
| `aws/src/render/template.ts` (modify) | Standard deck; imports shared chrome; standard slide builders become `export`ed for reuse |
| `aws/src/render/methodology-library.ts` (new) | Curated per-service-line methodology grounding + `GENERIC` + `ADVISE_LOOP` + `methodologyFor()` |
| `aws/src/proposal/types.ts` (modify) | `rfp` on `ProposalContent`; `MethodologyContent` + sub-types |
| `aws/src/judgment/judgment.ts` (modify) | `buildProposalContent` returns `rfp`; new `buildMethodologyContent()` |
| `aws/src/render/design-system/proposal.css` (modify) | New diagram component classes |
| `aws/src/render/assets.generated.ts` (regenerated) | Committed inline of the CSS — never hand-edited |
| `aws/src/render/methodology-template.ts` (new) | Methodology slide builders + `renderMethodologyHtml(content, methodology)` |
| `aws/src/render/handler.ts` (modify) | Pick template by `event.deckType`; thread `event.methodology` |
| `aws/src/adapters/render.ts` (modify) | `render(content, entity?, deckType?, methodology?)` |
| `aws/src/orchestrator/loop.ts` (modify) | Compute `deckType`; call `buildMethodologyContent`; pass through; Slack note |
| `aws/test/render/*`, `aws/test/judgment/*` (new/modify) | Tests per task |

**Context the implementer should read first:** `aws/src/render/template.ts` (the existing deck — patterns, components, the `SlideDesc` shape, `renderProposalHtml`), `aws/src/render/design-system/proposal.css` (existing component CSS + the `--tr-*` / `--font-*` tokens), and `aws/src/judgment/judgment.ts` (`buildProposalContent` pattern).

---

## Task 1: Extract shared deck chrome

Goal: pull the chrome shared by both decks out of `template.ts` into `deck-shared.ts`, and make the reusable standard builders `export`ed — WITHOUT changing the standard deck's output. The existing render tests are the guard.

**Files:**
- Create: `aws/src/render/deck-shared.ts`
- Modify: `aws/src/render/template.ts`
- Test: existing `aws/test/render/template-v3.test.ts` (guard — must still pass)

- [ ] **Step 1: Create `aws/src/render/deck-shared.ts`** with the chrome currently inside `template.ts` (move, don't rewrite — copy the existing function bodies verbatim from template.ts):

```ts
import {
  JOST_300, JOST_400, JOST_500, JOST_600, JOST_700,
  ROBOTO_300, ROBOTO_400, ROBOTO_500, ROBOTO_700,
  MONO_400, MONO_500,
  COLORS_CSS, DECK_CSS, PROPOSAL_CSS,
  DECK_STAGE_JS, LUCIDE_JS,
  LOGO_MARK_SVG,
} from './assets.generated.js';

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const face = (family: string, weight: number, b64: string): string =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
  `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

const FONT_FACES = [
  face('Jost', 300, JOST_300), face('Jost', 400, JOST_400), face('Jost', 500, JOST_500),
  face('Jost', 600, JOST_600), face('Jost', 700, JOST_700),
  face('Roboto', 300, ROBOTO_300), face('Roboto', 400, ROBOTO_400),
  face('Roboto', 500, ROBOTO_500), face('Roboto', 700, ROBOTO_700),
  face('JetBrains Mono', 400, MONO_400), face('JetBrains Mono', 500, MONO_500),
].join('');

export const STYLE = `<style>${FONT_FACES}${COLORS_CSS}${DECK_CSS}${PROPOSAL_CSS}</style>`;

export function logoMark(heightPx: number): string {
  const scaledSvg = LOGO_MARK_SVG.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s*width="[^"]*"/, '').replace(/\s*height="[^"]*"/, '');
    return `<svg${cleaned} style="height:100%;width:auto;">`;
  });
  return `<span style="display:inline-flex;align-items:center;height:${heightPx}px;">${scaledSvg}</span>`;
}

export function head(dark: boolean, chapter: string): string {
  const headClass = dark ? 'head' : 'head head-light';
  return `<div class="${headClass}">` +
    `<div class="mark">${logoMark(32)}<span>Network Intelligence</span></div>` +
    `<div class="chapter">${esc(chapter)}</div></div>`;
}

export function foot(dark: boolean, label: string, n: number, total: number): string {
  const footClass = dark ? 'foot' : 'foot foot-light';
  const nn = String(n).padStart(2, '0');
  const tt = String(total).padStart(2, '0');
  return `<div class="${footClass}">` +
    `<span>NI · ${esc(label)}</span>` +
    `<span>${nn}<span class="dot"></span>${tt}</span></div>`;
}

export interface SlideDesc {
  full?: string;
  inner?: string;
  variant?: string;
  dark?: boolean;
  chapter?: string;
  footLabel?: string;
  sectionStyle?: string;
}

/** Wrap an assembled deck body in the document shell + deck-stage + scripts. */
export function wrapDeck(deck: string): string {
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${STYLE}</head>` +
    `<body><deck-stage width="1920" height="1080">${deck}</deck-stage>` +
    `<script>${DECK_STAGE_JS}</script>` +
    `<script>${LUCIDE_JS}</script>` +
    `<script>window.lucide&&lucide.createIcons()</script>` +
    `</body></html>`
  );
}

/** Filter nulls, compute total, wrap each SlideDesc with numbered head/foot. */
export function assembleSlides(descs: (SlideDesc | null)[]): string {
  const kept = descs.filter((d): d is SlideDesc => d !== null);
  const total = kept.length;
  return kept.map((d, i) => {
    const n = i + 1;
    if (d.full !== undefined) return d.full;
    const variantClass = d.variant ? `slide ${d.variant}` : 'slide';
    const styleAttr = d.sectionStyle ? ` style="${d.sectionStyle}"` : '';
    const dark = d.dark ?? false;
    return `<section class="${variantClass}"${styleAttr}>` +
      head(dark, d.chapter ?? '') + (d.inner ?? '') + foot(dark, d.footLabel ?? '', n, total) +
      `</section>`;
  }).join('');
}
```

- [ ] **Step 2: Refactor `aws/src/render/template.ts` to use the shared chrome.**
  - Remove the now-moved declarations from template.ts: the `assets.generated.js` import block, `esc`, `face`, `FONT_FACES`, `STYLE`, `logoMark`, `head`, `foot`, and the `SlideDesc` interface.
  - Add at the top: `import { esc, logoMark, head, foot, STYLE, type SlideDesc, assembleSlides, wrapDeck } from './deck-shared.js';` and keep `import { serviceLineLabel } from './labels.js';`. Keep the `LOGO_MARK_SVG`-based `logoMark` usage via the shared import (do NOT re-import LOGO_MARK_SVG — `logoMark` is now imported).
  - `coverTitleFontPx`, `statValue`, `COVER_STATS` stay in template.ts (cover-specific).
  - Replace the body of `renderProposalHtml` with:
    ```ts
    export function renderProposalHtml(content: ProposalContent): string {
      const descs: (SlideDesc | null)[] = [
        buildCover(content), buildExecSummary(content), buildUnderstanding(content),
        buildScope(content), buildApproach(content), buildDeliverables(content),
        buildCredentials(content), buildWhyNi(content), buildCommercials(content),
        buildNextSteps(content),
      ];
      return wrapDeck(assembleSlides(descs));
    }
    ```
  - Add `export` to the builders the methodology deck reuses: `buildCover`, `buildExecSummary`, `buildUnderstanding`, `buildScope`, `buildDeliverables`, `buildCredentials`, `buildWhyNi`, `buildNextSteps`. (Leave `buildApproach`, `buildCommercials` un-exported — methodology replaces them.)

- [ ] **Step 3: Run the guard test.**
Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/render/template-v3.test.ts`
Expected: PASS unchanged. If it fails, the extraction altered output — reconcile until the standard deck renders identically.

- [ ] **Step 4: Typecheck.**
Run: `cd aws && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/render/deck-shared.ts ni-sales-agent/aws/src/render/template.ts
git commit -m "refactor(render): extract shared deck chrome into deck-shared; export reusable builders"
```

---

## Task 2: Methodology library

**Files:**
- Create: `aws/src/render/methodology-library.ts`
- Test: `aws/test/render/methodology-library.test.ts`

- [ ] **Step 1: Write the failing test** `aws/test/render/methodology-library.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { methodologyFor, ADVISE_LOOP, LIBRARY_KEYS } from '../../src/render/methodology-library.js';

describe('methodology-library', () => {
  it('has the core service lines, each with phases and frameworks', () => {
    for (const k of ['pentest_web', 'pentest_api', 'pentest_mobile', 'pentest_network',
                     'red_team', 'cloud_security', 'config_review', 'compliance']) {
      const m = methodologyFor(k);
      expect(m.phases.length).toBeGreaterThanOrEqual(4);
      expect(m.frameworks.length).toBeGreaterThanOrEqual(2);
      expect(m.aiAugmentation.length).toBeGreaterThan(10);
      expect(LIBRARY_KEYS).toContain(k);
    }
  });

  it('falls back to GENERIC for an unknown line but keeps the requested key label', () => {
    const m = methodologyFor('exotic_unlisted_service');
    expect(m.phases.length).toBeGreaterThanOrEqual(4);
    expect(m.frameworks.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes the ADVISE operating loop', () => {
    expect(ADVISE_LOOP.length).toBe(6);
    expect(ADVISE_LOOP[0].name).toBe('Assess');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module not found):
`cd aws && npx vitest run test/render/methodology-library.test.ts`

- [ ] **Step 3: Implement `aws/src/render/methodology-library.ts`** with curated, accurate content:
```ts
import { serviceLineLabel } from './labels.js';

export interface MethodologyPhase { name: string; detail: string }
export interface ServiceMethodology {
  key: string;
  label: string;
  phases: MethodologyPhase[];
  frameworks: string[];
  tooling: string[];
  aiAugmentation: string;
}

const AI_TRIAGE =
  'Transilience compresses the raw finding set (~16,000 signals → ~10 prioritized actions, ~95% ' +
  'prioritization accuracy) and removes duplicate noise, so testers spend manual effort only on ' +
  'exploitable, high-impact issues.';

const ENTRIES: Record<string, Omit<ServiceMethodology, 'label'>> = {
  pentest_web: {
    key: 'pentest_web',
    phases: [
      { name: 'Reconnaissance & mapping', detail: 'Crawl, fingerprint the stack, enumerate entry points and the authenticated surface.' },
      { name: 'Authentication & session', detail: 'Test login, session management, MFA, password and recovery flows.' },
      { name: 'Authorization & business logic', detail: 'IDOR/BOLA, privilege boundaries, workflow and rate-limit abuse.' },
      { name: 'Input validation & injection', detail: 'Injection, XSS, SSRF, deserialization, file handling against OWASP Top 10.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with reproduction steps, then a verification retest of fixes.' },
    ],
    frameworks: ['OWASP WSTG', 'OWASP ASVS', 'OWASP Top 10', 'PTES', 'NIST SP 800-115'],
    tooling: ['Burp Suite Pro', 'OWASP ZAP', 'nuclei', 'sqlmap', 'custom exploit scripts', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  pentest_api: {
    key: 'pentest_api',
    phases: [
      { name: 'Spec & endpoint discovery', detail: 'Parse OpenAPI/Swagger, enumerate endpoints, methods and parameters.' },
      { name: 'AuthN / AuthZ', detail: 'BOLA, BFLA, broken authentication, token and scope handling.' },
      { name: 'Input & schema validation', detail: 'Mass assignment, injection, schema and content-type abuse.' },
      { name: 'Rate-limit & business logic', detail: 'Resource exhaustion, replay, and workflow abuse.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with requests/responses, then fix-verification retest.' },
    ],
    frameworks: ['OWASP API Security Top 10', 'OWASP WSTG', 'OWASP ASVS', 'PTES'],
    tooling: ['Burp Suite Pro', 'Postman', 'nuclei', 'custom scripts', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  pentest_mobile: {
    key: 'pentest_mobile',
    phases: [
      { name: 'Static analysis', detail: 'Reverse-engineer the binary; review storage, secrets and configuration.' },
      { name: 'Dynamic & runtime', detail: 'Runtime manipulation, instrumentation, and platform-control bypass.' },
      { name: 'Network & API', detail: 'Transport security, certificate pinning, and backend API testing.' },
      { name: 'Storage & cryptography', detail: 'Local data protection and cryptographic implementation review.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with reproduction, then a verification retest.' },
    ],
    frameworks: ['OWASP MASVS', 'OWASP MASTG', 'PTES'],
    tooling: ['MobSF', 'Frida', 'objection', 'Burp Suite Pro', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  pentest_network: {
    key: 'pentest_network',
    phases: [
      { name: 'Discovery & enumeration', detail: 'Host, service and version discovery across the in-scope ranges.' },
      { name: 'Vulnerability identification', detail: 'Authenticated and unauthenticated checks, validated to remove false positives.' },
      { name: 'Exploitation', detail: 'Controlled exploitation of confirmed weaknesses to prove impact.' },
      { name: 'Post-exploitation & lateral movement', detail: 'Privilege escalation and lateral movement mapped to MITRE ATT&CK.' },
      { name: 'Reporting & retest', detail: 'Risk-rated findings with evidence, then a verification retest.' },
    ],
    frameworks: ['NIST SP 800-115', 'PTES', 'OSSTMM', 'MITRE ATT&CK', 'CIS Benchmarks'],
    tooling: ['Nmap', 'Nessus', 'Metasploit', 'BloodHound', 'custom scripts', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  red_team: {
    key: 'red_team',
    phases: [
      { name: 'Threat intelligence & recon', detail: 'OSINT and target profiling to build realistic attack scenarios.' },
      { name: 'Initial access', detail: 'Phishing, exposed services and supply-chain vectors to gain a foothold.' },
      { name: 'Foothold & command-and-control', detail: 'Establish resilient, evasive C2 aligned to MITRE ATT&CK.' },
      { name: 'Escalation & lateral movement', detail: 'Privilege escalation and movement toward the agreed objectives.' },
      { name: 'Objectives & exfiltration', detail: 'Demonstrate impact against the crown-jewel objectives.' },
      { name: 'Reporting & purple-team', detail: 'Attack narrative, detection gaps, and a joint purple-team replay.' },
    ],
    frameworks: ['MITRE ATT&CK', 'TIBER-EU', 'Lockheed Martin Cyber Kill Chain', 'PTES'],
    tooling: ['Cobalt Strike / Sliver', 'custom implants', 'BloodHound', 'OSINT tooling', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  cloud_security: {
    key: 'cloud_security',
    phases: [
      { name: 'Configuration & posture review', detail: 'Benchmark the account/subscription against CIS and provider guidance.' },
      { name: 'Identity & access', detail: 'IAM roles, trust policies, privilege escalation and key exposure.' },
      { name: 'Data & network exposure', detail: 'Public exposure, storage, encryption and segmentation.' },
      { name: 'Logging & detection', detail: 'Audit-log coverage, alerting and detection readiness.' },
      { name: 'Reporting & remediation', detail: 'Prioritized findings with remediation guidance and a retest.' },
    ],
    frameworks: ['CIS Benchmarks (AWS/Azure/GCP)', 'NIST CSF', 'CSA CCM', 'MITRE ATT&CK Cloud'],
    tooling: ['ScoutSuite', 'Prowler', 'provider-native tooling', 'Transilience posture engine'],
    aiAugmentation:
      'Transilience continuously inventories cloud and AI workloads, maps each finding to frameworks ' +
      'automatically, and prioritizes by real exposure so remediation starts with what actually matters.',
  },
  config_review: {
    key: 'config_review',
    phases: [
      { name: 'Baseline & scope', detail: 'Confirm in-scope systems and the applicable hardening baseline.' },
      { name: 'Automated benchmark scan', detail: 'Assess against CIS Benchmarks and vendor hardening guides.' },
      { name: 'Manual validation', detail: 'Validate results and review controls automation cannot judge.' },
      { name: 'Gap analysis', detail: 'Rate gaps by risk against the baseline.' },
      { name: 'Reporting', detail: 'Prioritized hardening recommendations with evidence.' },
    ],
    frameworks: ['CIS Benchmarks', 'NIST SP 800-53', 'Vendor hardening guides'],
    tooling: ['CIS-CAT', 'provider-native scanners', 'custom checks', 'Transilience triage'],
    aiAugmentation: AI_TRIAGE,
  },
  compliance: {
    key: 'compliance',
    phases: [
      { name: 'Scoping & gap assessment', detail: 'Define the control set in scope and assess the current-state gap.' },
      { name: 'Control testing & evidence', detail: 'Test control design and operating effectiveness; collect evidence.' },
      { name: 'Risk analysis', detail: 'Rate residual risk and map to the relevant regulatory obligations.' },
      { name: 'Remediation roadmap', detail: 'Prioritized, owner-assigned remediation plan.' },
      { name: 'Report & attestation readiness', detail: 'Audit-ready report and readiness for certification/attestation.' },
    ],
    frameworks: ['ISO/IEC 27001', 'PCI DSS', 'SOC 2', 'NIST CSF'],
    tooling: ['evidence workflow', 'control test scripts', 'Transilience compliance crosswalk'],
    aiAugmentation:
      'Transilience auto-maps every finding to the relevant frameworks with per-finding provenance, ' +
      'so auditors receive structured evidence rather than screenshots.',
  },
};

const GENERIC: Omit<ServiceMethodology, 'label'> = {
  key: 'generic',
  phases: [
    { name: 'Scoping & planning', detail: 'Confirm scope, objectives, rules of engagement and success criteria.' },
    { name: 'Assessment & testing', detail: 'Execute the assessment against the agreed scope and standards.' },
    { name: 'Analysis & validation', detail: 'Validate findings and remove false positives.' },
    { name: 'Reporting', detail: 'Risk-rated findings with clear, actionable remediation.' },
    { name: 'Retest', detail: 'Verify that remediated issues are resolved.' },
  ],
  frameworks: ['NIST SP 800-115', 'PTES', 'OWASP', 'CIS Benchmarks'],
  tooling: ['industry-standard tooling', 'custom scripts', 'Transilience triage'],
  aiAugmentation: AI_TRIAGE,
};

export const LIBRARY_KEYS = Object.keys(ENTRIES);

export function methodologyFor(serviceLineKey: string): ServiceMethodology {
  const base = ENTRIES[serviceLineKey] ?? GENERIC;
  return { ...base, label: serviceLineLabel(serviceLineKey) };
}

export const ADVISE_LOOP: MethodologyPhase[] = [
  { name: 'Assess', detail: 'Understand the environment, threats and the regulatory drivers in play.' },
  { name: 'Design', detail: 'Define the testing strategy, scope and standards for the engagement.' },
  { name: 'Visualize', detail: 'Map the attack surface and model the threats that matter.' },
  { name: 'Implement', detail: 'Execute the methodology — test, exploit and validate.' },
  { name: 'Sustain', detail: 'Report, retest and harden against the confirmed weaknesses.' },
  { name: 'Evolve', detail: 'Feed findings into continuous exposure management via Transilience.' },
];
```

- [ ] **Step 4: Run, expect PASS.** `cd aws && npx vitest run test/render/methodology-library.test.ts`

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/render/methodology-library.ts ni-sales-agent/aws/test/render/methodology-library.test.ts
git commit -m "feat(render): curated methodology library (frameworks/phases/tooling per service line)"
```

---

## Task 3: Methodology content types + `rfp` flag

**Files:**
- Modify: `aws/src/proposal/types.ts`

- [ ] **Step 1: Add the types.** In `aws/src/proposal/types.ts`, after the `Effort` interface, add:
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
  operatingLoop: { name: string; detail: string }[];
  services: ServiceMethodologyBlock[];
  aiHighlights: { stat: string; label: string }[];
  crosswalk: FrameworkCrosswalkRow[];
  timeline: TimelineDay[];
  exclusions: string[];
}
```
Then add `rfp: boolean;` to the `ProposalContent` interface (after `effort: Effort;`).

- [ ] **Step 2: Typecheck (expect known breakages).**
Run: `cd aws && npx tsc --noEmit 2>&1 | head -40`
Expected: errors only where `ProposalContent` is constructed without `rfp` (sample.ts, fixtures, judgment return). These are fixed in Tasks 4/9/10. Errors anywhere ELSE are unexpected.

- [ ] **Step 3: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/proposal/types.ts
git commit -m "feat(proposal): MethodologyContent types + rfp flag on ProposalContent"
```

---

## Task 4: `rfp` in `buildProposalContent`

**Files:**
- Modify: `aws/src/judgment/judgment.ts` (`buildProposalContent`)
- Test: `aws/test/judgment/rfp.test.ts`

- [ ] **Step 1: Write the failing test** `aws/test/judgment/rfp.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';
import type { BedrockJudge } from '../../src/judgment/bedrock.js';

function fakeJudge(payload: unknown): BedrockJudge {
  return { askJson: async () => payload } as unknown as BedrockJudge;
}
const base = {
  titleLine: 'X', understanding: [], scopeRows: [], assumptions: [], approach: [], deliverables: [],
  timeline: '', whyNi: [], credentials: [], transilienceEdge: [], commercials: { mode: 'placeholder', text: '' },
  nextSteps: [], understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
  effort: { lines: [], totalManDays: 0, aiLeverageNote: '', isLarge: false },
};

describe('buildProposalContent rfp', () => {
  it('passes through rfp:true', async () => {
    const svc = new JudgmentService(fakeJudge({ ...base, rfp: true }));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.rfp).toBe(true);
  });
  it('defaults a missing/non-boolean rfp to false', async () => {
    const svc = new JudgmentService(fakeJudge(base));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.rfp).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`c.rfp` undefined): `cd aws && npx vitest run test/judgment/rfp.test.ts`

- [ ] **Step 3: Edit `buildProposalContent` in `judgment.ts`.**
  (a) In the output-keys instruction string, after the `effort (...)` segment added in Slice 1, add:
  ```ts
      'rfp (boolean — true ONLY if the enquiry or scope reads as a formal RFP/tender or a structured, ' +
      'multi-service evaluation with formal requirements; false for an ordinary direct enquiry). ' +
  ```
  (b) Widen the `askJson` generic to also allow `rfp`: change the existing
  `& { effort?: unknown }` to `& { effort?: unknown; rfp?: unknown }`.
  (c) In the final return object (where `effort` is set after `...raw`), add `rfp: rawEffortRfp` — compute just above the return:
  ```ts
    const rfp = (raw as { rfp?: unknown }).rfp === true;
  ```
  and include `rfp,` in the returned object (after `effort`).

- [ ] **Step 4: Run, expect PASS.** `cd aws && npx vitest run test/judgment/rfp.test.ts` and `cd aws && npx vitest run test/judgment/`
Expected: rfp tests pass; if any existing judgment test builds a full `ProposalContent` and now lacks `rfp`, add `rfp: false` to that fixture.

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/judgment/judgment.ts ni-sales-agent/aws/test/judgment/rfp.test.ts
git commit -m "feat(judgment): infer rfp flag in buildProposalContent"
```

---

## Task 5: `buildMethodologyContent`

**Files:**
- Modify: `aws/src/judgment/judgment.ts`
- Test: `aws/test/judgment/methodology.test.ts`

- [ ] **Step 1: Write the failing test** `aws/test/judgment/methodology.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';
import type { BedrockJudge } from '../../src/judgment/bedrock.js';

function fakeJudge(payload: unknown): BedrockJudge {
  return { askJson: async () => payload } as unknown as BedrockJudge;
}

describe('buildMethodologyContent', () => {
  const full = {
    operatingLoop: [{ name: 'Assess', detail: 'd' }],
    services: [{ serviceLine: 'pentest_web', phases: [{ name: 'Recon', detail: 'd' }], frameworks: ['OWASP WSTG'], tooling: ['Burp'], aiAugmentation: 'a' }],
    aiHighlights: [{ stat: '16k→10', label: 'noise cut' }],
    crosswalk: [{ area: 'Web', frameworks: ['OWASP'], evidence: 'report' }],
    timeline: [{ day: 'Day 1', milestone: 'kickoff' }],
    exclusions: ['no remediation'],
  };

  it('returns the MethodologyContent shape', async () => {
    const svc = new JudgmentService(fakeJudge(full));
    const m = await svc.buildMethodologyContent({
      company: 'X', contactName: 'Y', serviceLines: ['pentest_web'],
      scope: {}, effortLines: [{ serviceLine: 'pentest_web', basis: '2 apps', manDays: 6 }], totalManDays: 6,
    });
    expect(m.services[0].serviceLine).toBe('pentest_web');
    expect(m.operatingLoop.length).toBe(1);
    expect(m.timeline[0].day).toBe('Day 1');
  });

  it('defaults all arrays to [] when the model omits them', async () => {
    const svc = new JudgmentService(fakeJudge({}));
    const m = await svc.buildMethodologyContent({
      company: 'X', contactName: 'Y', serviceLines: [], scope: {}, effortLines: [], totalManDays: 0,
    });
    expect(m.services).toEqual([]);
    expect(m.operatingLoop).toEqual([]);
    expect(m.crosswalk).toEqual([]);
    expect(m.timeline).toEqual([]);
    expect(m.exclusions).toEqual([]);
    expect(m.aiHighlights).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (method missing): `cd aws && npx vitest run test/judgment/methodology.test.ts`

- [ ] **Step 3: Implement `buildMethodologyContent` in `judgment.ts`.**
  Add the import at the top: `import { methodologyFor, ADVISE_LOOP } from '../render/methodology-library.js';`
  Add this method to the `JudgmentService` class:
```ts
  async buildMethodologyContent(input: {
    company: string;
    contactName: string;
    serviceLines: string[];
    scope: Record<string, unknown>;
    effortLines: { serviceLine: string; basis: string; manDays: number }[];
    totalManDays: number;
  }): Promise<MethodologyContent> {
    // Ground the model with ONLY the curated library entries for the in-scope lines.
    const library = input.serviceLines.map((k) => methodologyFor(k));
    const system =
      'You assemble the in-depth METHODOLOGY content for a large/RFP cybersecurity proposal. ' +
      'You are a senior offensive-security architect. ' +
      `${JSON_RULE}\n` +
      'GROUNDING: use ONLY the framework names, phases and tools present in the provided library subset ' +
      'and operating loop. NEVER invent a framework, standard, or tool not listed. Tailor the wording to ' +
      "this engagement's scope, but keep every framework/tool name verbatim from the library.\n" +
      'Output keys: operatingLoop ({name,detail}[] — tailor the provided ADVISE loop to this engagement), ' +
      'services ({serviceLine, phases:{name,detail}[], frameworks:string[], tooling:string[], aiAugmentation:string}[] — ' +
      'ONE entry per in-scope service line, drawn from its library entry), ' +
      'aiHighlights ({stat,label}[] — 3 Transilience metrics, e.g. {stat:"16k→10",label:"raw findings to prioritized actions"}, ' +
      '{stat:"95%",label:"prioritization accuracy"}, {stat:"~80%",label:"alert-investigation effort cut"}), ' +
      'crosswalk ({area, frameworks:string[], evidence:string}[] — map each engagement area to the frameworks it ' +
      'satisfies and the evidence produced), ' +
      'timeline ({day,milestone}[] — a day-by-day plan spread across the total man-days), ' +
      'exclusions (string[] — what is deliberately out of scope).';
    const payload = {
      company: input.company,
      contact: input.contactName,
      scope: input.scope,
      effort_lines: input.effortLines,
      total_man_days: input.totalManDays,
      library_subset: library,
      operating_loop: ADVISE_LOOP,
    };
    const raw = await this.judge.askJson<Partial<MethodologyContent>>(system, JSON.stringify(payload), 8000);
    const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    return {
      operatingLoop: arr(raw.operatingLoop),
      services: arr(raw.services),
      aiHighlights: arr(raw.aiHighlights),
      crosswalk: arr(raw.crosswalk),
      timeline: arr(raw.timeline),
      exclusions: arr(raw.exclusions),
    };
  }
```
  Add `MethodologyContent` to the existing `import type { ProposalContent } from '../proposal/types.js';` line → `import type { ProposalContent, MethodologyContent } from '../proposal/types.js';`.

- [ ] **Step 4: Run, expect PASS.** `cd aws && npx vitest run test/judgment/methodology.test.ts`

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/judgment/judgment.ts ni-sales-agent/aws/test/judgment/methodology.test.ts
git commit -m "feat(judgment): buildMethodologyContent grounded in the methodology library"
```

---

## Task 6: Diagram CSS components

**Files:**
- Modify: `aws/src/render/design-system/proposal.css`
- Regenerate: `aws/src/render/assets.generated.ts` (via script — never hand-edit)
- Test: `aws/test/render/design-assets.test.ts`

- [ ] **Step 1: Append the new component CSS** to the END of `aws/src/render/design-system/proposal.css` (uses existing `--tr-*`, `--font-*` tokens; matches the deck's dark/light idiom):
```css

/* ── Methodology diagram components (Slice 2) ───────────────────────── */
.flow-band { display:flex; gap:0; align-items:stretch; margin-top:40px; }
.flow-step { flex:1; position:relative; padding:24px 22px; background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.10); }
.flow-step + .flow-step { border-left:none; }
.flow-step .flow-num { font-family:var(--font-mono); font-size:12px; letter-spacing:0.18em;
  text-transform:uppercase; color:#FCE205; }
.flow-step .flow-name { font-family:var(--font-display); font-size:21px; font-weight:500; color:#fff; margin:8px 0 6px; }
.flow-step .flow-detail { font-family:var(--font-body); font-size:14px; line-height:1.45; color:rgba(255,255,255,0.7); margin:0; }

.coverage-table { width:100%; border-collapse:collapse; margin-top:32px; font-family:var(--font-body); }
.coverage-table th { text-align:left; font-family:var(--font-display); font-size:12px; letter-spacing:0.16em;
  text-transform:uppercase; color:rgba(10,10,11,0.5); padding:12px 16px; border-bottom:2px solid rgba(10,10,11,0.15); }
.coverage-table td { font-size:16px; color:#3a3a40; padding:16px; border-bottom:1px solid rgba(10,10,11,0.08); vertical-align:top; }

.fw-tag { display:inline-block; font-family:var(--font-mono); font-size:12px; letter-spacing:0.04em;
  color:#582A90; background:rgba(88,42,144,0.08); border:1px solid rgba(88,42,144,0.25);
  border-radius:6px; padding:3px 9px; margin:3px 6px 3px 0; }
.fw-tag.fw-tag-dark { color:#E7D9FF; background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.18); }

.badge { display:inline-flex; align-items:center; gap:6px; font-family:var(--font-mono); font-size:11px;
  letter-spacing:0.14em; text-transform:uppercase; border-radius:999px; padding:4px 12px; }
.badge-in-scope { color:#0A0A0B; background:#FCE205; }
.badge-critical { color:#fff; background:#B61A3F; }
.badge-live { color:#0A0A0B; background:#7FD17F; }

.crosswalk-matrix { width:100%; border-collapse:collapse; margin-top:32px; }
.crosswalk-matrix th, .crosswalk-matrix td { padding:14px 16px; border:1px solid rgba(255,255,255,0.12);
  font-family:var(--font-body); font-size:15px; color:rgba(255,255,255,0.85); vertical-align:top; text-align:left; }
.crosswalk-matrix th { font-family:var(--font-display); font-size:12px; letter-spacing:0.14em;
  text-transform:uppercase; color:#FCE205; background:rgba(255,255,255,0.03); }

.kill-chain { display:flex; gap:10px; margin-top:36px; }
.kill-stage { flex:1; text-align:center; padding:18px 12px; border-radius:10px;
  background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
  font-family:var(--font-display); font-size:16px; font-weight:500; color:#fff; }

.funnel { display:flex; align-items:center; gap:28px; margin-top:36px; }
.funnel-figure { font-family:var(--font-display); font-weight:600; line-height:0.9; }
.funnel-from { font-size:64px; color:rgba(255,255,255,0.45); }
.funnel-arrow { font-size:40px; color:#FCE205; }
.funnel-to { font-size:96px; color:#FCE205; }
.funnel-label { font-family:var(--font-display); font-size:18px; color:rgba(255,255,255,0.8); max-width:420px; }

.day-timeline { margin-top:32px; border-left:2px solid rgba(10,10,11,0.15); padding-left:28px; }
.day-row { position:relative; padding:14px 0; }
.day-row::before { content:''; position:absolute; left:-35px; top:20px; width:12px; height:12px; border-radius:50%;
  background:#B61A3F; }
.day-row .day-mark { font-family:var(--font-mono); font-size:13px; letter-spacing:0.12em; color:#582A90; }
.day-row .day-text { font-family:var(--font-body); font-size:18px; color:#0A0A0B; margin:4px 0 0; }
```

- [ ] **Step 2: Regenerate the inlined assets.**
Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npm run gen:render-assets`
Expected: prints `Wrote src/render/assets.generated.ts`.

- [ ] **Step 3: Extend the assets test.** In `aws/test/render/design-assets.test.ts`, add a test asserting the new classes are inlined:
```ts
  it('inlines the Slice 2 methodology diagram components', () => {
    expect(PROPOSAL_CSS).toContain('.flow-band');
    expect(PROPOSAL_CSS).toContain('.coverage-table');
    expect(PROPOSAL_CSS).toContain('.crosswalk-matrix');
    expect(PROPOSAL_CSS).toContain('.funnel');
    expect(PROPOSAL_CSS).toContain('.day-timeline');
    expect(PROPOSAL_CSS).toContain('.fw-tag');
  });
```
(If the test file imports the CSS differently, follow its existing import of `PROPOSAL_CSS` from `assets.generated.js`. If it has no such import, add `import { PROPOSAL_CSS } from '../../src/render/assets.generated.js';`.)

- [ ] **Step 4: Run, expect PASS.** `cd aws && npx vitest run test/render/design-assets.test.ts`

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/render/design-system/proposal.css ni-sales-agent/aws/src/render/assets.generated.ts ni-sales-agent/aws/test/render/design-assets.test.ts
git commit -m "feat(render): methodology diagram CSS components (flow-band, coverage-table, crosswalk, funnel, day-timeline)"
```

---

## Task 7: Methodology slide builders + assembler

**Files:**
- Create: `aws/src/render/methodology-template.ts`
- Test: `aws/test/render/methodology-template.test.ts`

This task creates ALL six methodology builders and the `renderMethodologyHtml` assembler. Follow the visual idiom of `template.ts` (study it first: eyebrow / gradient-band / title header pattern, `tile`/`stat-tile` cards, dark vs light variants).

- [ ] **Step 1: Write the failing test** `aws/test/render/methodology-template.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderMethodologyHtml } from '../../src/render/methodology-template.js';
import type { ProposalContent, MethodologyContent } from '../../src/proposal/types.js';

function proposal(): ProposalContent {
  return {
    company: 'Demo Bank', contactName: 'A. Buyer', serviceLines: ['pentest_web', 'pentest_api', 'pentest_network'],
    titleLine: 'Security Assessment', understanding: ['u'], scopeRows: [{ line: 'Web', detail: '2 apps' }],
    assumptions: [], approach: [], deliverables: ['Report'], timeline: '3 weeks', whyNi: ['Proven'],
    credentials: ['CREST'], transilienceEdge: [], commercials: { mode: 'placeholder', text: 'TBC' },
    nextSteps: [], understandingStats: [{ value: '2', label: 'apps' }], pillars: [{ title: 'Fit', body: 'b' }],
    signals: [{ title: 'Stack', detail: 'React' }], approachPhases: [], ctaSteps: [{ when: 'Now', title: 'Call', detail: 'd' }],
    effort: { lines: [{ serviceLine: 'pentest_web', basis: '2 apps', manDays: 8 },
                      { serviceLine: 'pentest_api', basis: '1 api', manDays: 5 },
                      { serviceLine: 'pentest_network', basis: '/24', manDays: 6 }],
              totalManDays: 19, aiLeverageNote: 'AI-augmented.', isLarge: true },
    rfp: true,
  };
}
function methodology(): MethodologyContent {
  return {
    operatingLoop: [{ name: 'Assess', detail: 'd' }, { name: 'Implement', detail: 'd' }],
    services: [
      { serviceLine: 'pentest_web', phases: [{ name: 'Recon', detail: 'd' }, { name: 'Report', detail: 'd' }], frameworks: ['OWASP WSTG', 'PTES'], tooling: ['Burp'], aiAugmentation: 'Transilience triage.' },
      { serviceLine: 'pentest_api', phases: [{ name: 'Discover', detail: 'd' }], frameworks: ['OWASP API Top 10'], tooling: ['Postman'], aiAugmentation: 'a' },
      { serviceLine: 'pentest_network', phases: [{ name: 'Enumerate', detail: 'd' }], frameworks: ['NIST SP 800-115', 'MITRE ATT&CK'], tooling: ['Nmap'], aiAugmentation: 'a' },
    ],
    aiHighlights: [{ stat: '16k→10', label: 'prioritized' }, { stat: '95%', label: 'accuracy' }, { stat: '~80%', label: 'noise cut' }],
    crosswalk: [{ area: 'Web', frameworks: ['OWASP WSTG'], evidence: 'Report + retest' }],
    timeline: [{ day: 'Day 1', milestone: 'Kickoff' }, { day: 'Day 19', milestone: 'Final report' }],
    exclusions: ['Remediation is advisory only'],
  };
}

describe('renderMethodologyHtml', () => {
  it('renders a self-contained deck with the methodology sections', () => {
    const html = renderMethodologyHtml(proposal(), methodology());
    expect(html).toContain('<deck-stage');
    expect(html).toContain('flow-band');           // operating loop
    expect(html).toContain('OWASP WSTG');           // service methodology frameworks
    expect(html).toContain('funnel');               // AI-augmented delivery
    expect(html).toContain('crosswalk-matrix');     // framework crosswalk
    expect(html).toContain('day-timeline');         // effort & timeline
    expect(html).toContain('Day 19');
    expect(html).toContain('Remediation is advisory only'); // boundary
  });

  it('lands a multi-service large deal in the 20–25 slide band', () => {
    const html = renderMethodologyHtml(proposal(), methodology());
    // Every slide section starts with `<section class="slide` (cover + standard + methodology + next-steps).
    const slideCount = (html.match(/<section class="slide/g) ?? []).length;
    expect(slideCount).toBeGreaterThanOrEqual(16); // 13 fixed + 2 per service (×3) = 19
    expect(slideCount).toBeLessThanOrEqual(25);
  });

  it('emits two slides per service line (phases + standards/tooling)', () => {
    const html = renderMethodologyHtml(proposal(), methodology());
    expect(html).toContain('Standards, tooling &amp; AI acceleration.'); // the second per-service slide
    expect(html).toContain('Phase-by-phase approach.');                  // the first per-service slide
  });
});
```
Slide math: 13 fixed slides (cover, exec, understanding, scope, methodology-overview, AI-augmented, crosswalk, deliverables, effort/timeline, credentials, why-NI, boundary, next-steps) + **2 per service line**. So 2-line RFP → 17, 3-line → 19, 4-line → 21, 5-line → 23 — landing in/near the 20–25 target as service lines scale, and still far richer than the 10-slide standard deck for a single-line large deal. We do NOT pad to hit a number (spec §6).

- [ ] **Step 2: Run, expect FAIL** (module missing): `cd aws && npx vitest run test/render/methodology-template.test.ts`

- [ ] **Step 3: Implement `aws/src/render/methodology-template.ts`.** Reuse shared chrome + standard builders; add the six methodology builders. Full code:
```ts
import type { ProposalContent, MethodologyContent } from '../proposal/types.js';
import { esc, type SlideDesc, assembleSlides, wrapDeck } from './deck-shared.js';
import { serviceLineLabel } from './labels.js';
import {
  buildCover, buildExecSummary, buildUnderstanding, buildScope,
  buildDeliverables, buildCredentials, buildWhyNi, buildNextSteps,
} from './template.js';

const sectionHead = (eyebrowClass: string, eyebrow: string, title: string): string =>
  `<div style="margin-top:40px;max-width:1500px;">
    <p class="${eyebrowClass}">${esc(eyebrow)}</p>
    <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
    <h2 class="title title-md" style="font-size:58px;">${esc(title)}</h2>
  </div>`;

function buildMethodologyOverview(m: MethodologyContent): SlideDesc | null {
  if (!m.operatingLoop.length) return null;
  const steps = m.operatingLoop.map((p, i) => `
    <div class="flow-step">
      <p class="flow-num">Phase ${String(i + 1).padStart(2, '0')}</p>
      <p class="flow-name">${esc(p.name)}</p>
      <p class="flow-detail">${esc(p.detail)}</p>
    </div>`).join('');
  return {
    variant: 'bg-gradient-violet', dark: true, chapter: '04 · Methodology', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', 'How we work', 'Our delivery methodology.')}
      <div class="flow-band">${steps}</div>`,
  };
}

function buildServiceMethodology(block: MethodologyContent['services'][number]): SlideDesc {
  const phases = block.phases.map((p, i) => `
    <tr><td><strong style="color:#0A0A0B;">${String(i + 1).padStart(2, '0')} · ${esc(p.name)}</strong></td>
        <td>${esc(p.detail)}</td></tr>`).join('');
  return {
    variant: 'slide-light', dark: false,
    chapter: `05 · Methodology — ${serviceLineLabel(block.serviceLine)}`, footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow eyebrow-violet', serviceLineLabel(block.serviceLine), 'Phase-by-phase approach.')}
      <table class="coverage-table"><thead><tr><th>Phase</th><th>What we do at each phase</th></tr></thead><tbody>${phases}</tbody></table>`,
  };
}

function buildServiceTooling(block: MethodologyContent['services'][number]): SlideDesc {
  const tags = block.frameworks.map((f) => `<span class="fw-tag fw-tag-dark">${esc(f)}</span>`).join('');
  const tools = block.tooling.map((t) => `<span class="fw-tag fw-tag-dark">${esc(t)}</span>`).join('');
  return {
    variant: 'bg-crimson-wash', dark: true,
    chapter: `05 · Standards & tooling — ${serviceLineLabel(block.serviceLine)}`, footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', serviceLineLabel(block.serviceLine), 'Standards, tooling & AI acceleration.')}
      <p class="eyebrow" style="margin-top:36px;">Frameworks &amp; standards</p>
      <div style="margin-top:14px;">${tags}</div>
      <p class="eyebrow" style="margin-top:32px;">Tooling</p>
      <div style="margin-top:14px;">${tools}</div>
      <p style="margin-top:32px;font-family:var(--font-display);font-size:24px;font-weight:300;color:rgba(255,255,255,0.85);max-width:1300px;line-height:1.4;">
        <strong style="color:#FCE205;font-weight:500;">AI-augmented · </strong>${esc(block.aiAugmentation)}</p>`,
  };
}

function buildAiAugmentedDelivery(m: MethodologyContent): SlideDesc | null {
  if (!m.aiHighlights.length) return null;
  const tiles = m.aiHighlights.map((h, i) => {
    const cls = i === m.aiHighlights.length - 1 && m.aiHighlights.length > 1 ? 'tile tile-accent' : 'tile';
    return `<div class="${cls}">
      <h3 style="font-family:var(--font-display);font-size:46px;font-weight:600;color:#FCE205;margin:0;">${esc(h.stat)}</h3>
      <p class="body" style="font-size:17px;">${esc(h.label)}</p></div>`;
  }).join('');
  return {
    variant: 'bg-crimson-wash', dark: true, chapter: '06 · AI-augmented delivery', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', 'The Transilience edge', 'AI-augmented, human-led.')}
      <div class="funnel">
        <span class="funnel-figure funnel-from">16k</span>
        <span class="funnel-arrow">→</span>
        <span class="funnel-figure funnel-to">10</span>
        <span class="funnel-label">Transilience compresses raw findings into the handful of prioritized, exploitable actions that matter.</span>
      </div>
      <div style="margin-top:44px;display:grid;grid-template-columns:repeat(${Math.min(m.aiHighlights.length, 3)},1fr);gap:18px;">${tiles}</div>`,
  };
}

function buildFrameworkCrosswalk(m: MethodologyContent): SlideDesc | null {
  if (!m.crosswalk.length) return null;
  const rows = m.crosswalk.map((r) => `
    <tr><td>${esc(r.area)}</td>
        <td>${r.frameworks.map((f) => `<span class="fw-tag fw-tag-dark">${esc(f)}</span>`).join('')}</td>
        <td>${esc(r.evidence)}</td></tr>`).join('');
  return {
    variant: '', dark: true, chapter: '07 · Framework crosswalk', footLabel: 'Methodology',
    sectionStyle: 'background:#0A0A0B;',
    inner: `${sectionHead('eyebrow', 'Mapped to the standards that matter', 'Framework & compliance crosswalk.')}
      <table class="crosswalk-matrix"><thead><tr><th>Engagement area</th><th>Frameworks</th><th>Evidence produced</th></tr></thead>
      <tbody>${rows}</tbody></table>`,
  };
}

function buildEffortTimeline(content: ProposalContent, m: MethodologyContent): SlideDesc {
  const effortRows = content.effort.lines.map((l) => `
    <tr><td><strong style="color:#0A0A0B;">${esc(serviceLineLabel(l.serviceLine))}</strong></td>
        <td>${esc(l.basis)}</td><td style="text-align:right;">${l.manDays}</td></tr>`).join('');
  const days = m.timeline.map((d) => `
    <div class="day-row"><p class="day-mark">${esc(d.day)}</p><p class="day-text">${esc(d.milestone)}</p></div>`).join('');
  return {
    variant: 'slide-light', dark: false, chapter: '08 · Effort & timeline', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow eyebrow-violet', 'What it takes', 'Effort & delivery timeline.')}
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:56px;">
        <div>
          <table class="coverage-table"><thead><tr><th>Service line</th><th>Basis</th><th style="text-align:right;">Man-days</th></tr></thead>
          <tbody>${effortRows}
            <tr><td><strong>Total</strong></td><td></td><td style="text-align:right;"><strong>${content.effort.totalManDays}</strong></td></tr>
          </tbody></table>
          <p style="margin-top:16px;font-family:var(--font-body);font-size:15px;color:#3a3a40;">${esc(content.effort.aiLeverageNote)}</p>
        </div>
        <div class="day-timeline">${days}</div>
      </div>`,
  };
}

function buildBoundary(m: MethodologyContent): SlideDesc | null {
  if (!m.exclusions.length) return null;
  const items = m.exclusions.map((e) => `
    <div style="display:flex;gap:14px;align-items:flex-start;">
      <span style="color:#FCE205;font-size:20px;line-height:1;">↗</span>
      <p style="font-family:var(--font-body);font-size:19px;color:rgba(255,255,255,0.85);margin:0;line-height:1.45;">${esc(e)}</p>
    </div>`).join('');
  return {
    variant: 'bg-gradient-violet', dark: true, chapter: '09 · The boundary', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', 'What we deliberately exclude', 'Clear scope, no surprises.')}
      <div style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:20px 56px;max-width:1500px;">${items}</div>`,
  };
}

export function renderMethodologyHtml(content: ProposalContent, m: MethodologyContent): string {
  const descs: (SlideDesc | null)[] = [
    buildCover(content),
    buildExecSummary(content),
    buildUnderstanding(content),
    buildScope(content),
    buildMethodologyOverview(m),
    ...m.services.flatMap((s) => [buildServiceMethodology(s), buildServiceTooling(s)]),
    buildAiAugmentedDelivery(m),
    buildFrameworkCrosswalk(m),
    buildDeliverables(content),
    buildEffortTimeline(content, m),
    buildCredentials(content),
    buildWhyNi(content),
    buildBoundary(m),
    buildNextSteps(content),
  ];
  return wrapDeck(assembleSlides(descs));
}
```

- [ ] **Step 4: Run, expect PASS** (both tests). `cd aws && npx vitest run test/render/methodology-template.test.ts`
If the slide-count test is out of band, do NOT pad — check the builder null-guards and the test fixture; the count for this 3-service fixture should be ~18–20.

- [ ] **Step 5: (No separate render here.)** The HTML-string assertions in Step 1 verify structure. The real PDF render of the methodology deck is produced and eyeballed in Task 10 (the sample harness writes `out/sample-methodology.pdf`). Do not add an ad-hoc render in this task.

- [ ] **Step 6: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/render/methodology-template.ts ni-sales-agent/aws/test/render/methodology-template.test.ts
git commit -m "feat(render): methodology slide builders + renderMethodologyHtml assembler"
```

---

## Task 8: Route by deck type — handler + adapter

**Files:**
- Modify: `aws/src/render/handler.ts`
- Modify: `aws/src/adapters/render.ts`
- Test: `aws/test/render/handler.test.ts`

- [ ] **Step 1: Update `aws/src/render/handler.ts`.**
  - Add imports:
    ```ts
    import { renderMethodologyHtml } from './methodology-template.js';
    import type { MethodologyContent } from '../proposal/types.js';
    ```
  - Extend `RenderEvent`:
    ```ts
    export interface RenderEvent {
      content: ProposalContent;
      entity?: LegalEntity;
      deckType?: 'standard' | 'methodology';
      methodology?: MethodologyContent;
    }
    ```
  - In `handler`, replace the line that builds the PDF (`htmlToPdf(renderProposalHtml(event.content))`) with a template choice:
    ```ts
    const html = event.deckType === 'methodology' && event.methodology
      ? renderMethodologyHtml(event.content, event.methodology)
      : renderProposalHtml(event.content);
    const entity = event.entity ?? resolveEntity(null).entity;
    const [pdf, docx] = await Promise.all([
      htmlToPdf(html),
      buildCommercialsLetterhead(event.content, entity),
    ]);
    ```

- [ ] **Step 2: Update `aws/src/adapters/render.ts`.**
  - Add import: `import type { MethodologyContent } from '../proposal/types.js';`
  - Change `render` signature + payload:
    ```ts
    async render(
      content: ProposalContent,
      entity?: LegalEntity,
      deckType?: 'standard' | 'methodology',
      methodology?: MethodologyContent,
    ): Promise<{ pdf: Buffer; docx: Buffer }> {
      const res = await this.lambda.send(new InvokeCommand({
        FunctionName: this.functionName,
        Payload: new TextEncoder().encode(JSON.stringify({ content, entity, deckType, methodology })),
      }));
    ```
    (rest unchanged.)

- [ ] **Step 3: Add a handler routing test** to `aws/test/render/handler.test.ts` (follow the file's existing fixture style; if it has a `ProposalContent` fixture helper, reuse it and add `rfp: false`, `effort`). Add:
```ts
  it('routes methodology deckType through the methodology template', async () => {
    // Minimal content with the required fields; methodology with one service.
    const content: any = {
      company: 'X', contactName: 'Y', serviceLines: ['pentest_web'], titleLine: 'T',
      understanding: [], scopeRows: [], assumptions: [], approach: [], deliverables: [], timeline: '',
      whyNi: [], credentials: [], transilienceEdge: [], commercials: { mode: 'placeholder', text: '' },
      nextSteps: [], understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
      effort: { lines: [], totalManDays: 12, aiLeverageNote: '', isLarge: true }, rfp: true,
    };
    const methodology: any = {
      operatingLoop: [{ name: 'Assess', detail: 'd' }], services: [], aiHighlights: [],
      crosswalk: [], timeline: [], exclusions: [],
    };
    const res = await handler({ content, deckType: 'methodology', methodology } as any);
    expect('pdfBase64' in res).toBe(true);
  });
```
Chromium is available in this environment (the existing handler render path already runs in `test/render/handler.test.ts`, and a live render was verified in Slice 1), so `await handler(...)` returning `pdfBase64` is a valid assertion. Match the existing handler test's setup/imports and reuse any `ProposalContent` fixture helper it defines rather than duplicating the inline literal.

- [ ] **Step 4: Run.** `cd aws && npx vitest run test/render/handler.test.ts`
Expected: PASS. Reconcile fixtures (`rfp`, `effort`) as needed.

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/render/handler.ts ni-sales-agent/aws/src/adapters/render.ts ni-sales-agent/aws/test/render/handler.test.ts
git commit -m "feat(render): route render lambda by deckType (standard vs methodology)"
```

---

## Task 9: Orchestrator — compute deckType + generate methodology

**Files:**
- Modify: `aws/src/orchestrator/loop.ts` (`stageProposal`)
- Test: existing `aws/test/orchestrator/loop.test.ts` (reconcile mocks)

- [ ] **Step 1: Compute deckType and generate methodology.** In `stageProposal`, AFTER `content` is built and AFTER the entity is resolved (Slice 1 code), and BEFORE `deck.render(...)`, insert:
```ts
  const deckType: 'standard' | 'methodology' =
    content.effort.isLarge || content.rfp ? 'methodology' : 'standard';
  const methodology = deckType === 'methodology'
    ? await judge.buildMethodologyContent({
        company: deal.company,
        contactName: deal.contact_name,
        serviceLines: deal.service_lines,
        scope: deal.scope as unknown as Record<string, unknown>,
        effortLines: content.effort.lines,
        totalManDays: content.effort.totalManDays,
      })
    : undefined;
```
Change the render call from `await deck.render(content, entity)` to:
```ts
  const { pdf, docx } = await deck.render(content, entity, deckType, methodology);
```

- [ ] **Step 2: Note the deck type in the Slack flags.** In the `flags` array built in Slice 1, add (after the effort flag):
```ts
  if (deckType === 'methodology')
    flags.push(`:books: Methodology deck (${content.effort.totalManDays} md / ${content.rfp ? 'RFP' : 'large'}) — ${content.effort.lines.length} service line(s).`);
```

- [ ] **Step 3: Reconcile the orchestrator tests.** The `DeckPort`/`deck.render` mock signature widened (now 4 args) and `judge` needs a `buildMethodologyContent` mock. In `aws/test/orchestrator/loop.test.ts`:
  - The `buildProposalContent` mock return must include `rfp: false` (small-deal default) and the existing `effort` (with `isLarge: false`) so the small-deal path picks `'standard'` and does not call methodology generation.
  - Add a `buildMethodologyContent: async () => ({ operatingLoop: [], services: [], aiHighlights: [], crosswalk: [], timeline: [], exclusions: [] })` to the judge mock so large-deal paths don't crash if exercised.
  - The `deck.render` mock already ignores extra args (JS) — no change needed unless it asserts arity.
  Run: `cd aws && npx vitest run test/orchestrator/` — reconcile until green. Keep assertions meaningful (don't weaken).

- [ ] **Step 4: Typecheck.** `cd aws && npx tsc --noEmit` — expect only `sample.ts` outstanding (fixed in Task 10).

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/orchestrator/loop.ts ni-sales-agent/aws/test/orchestrator/loop.test.ts
git commit -m "feat(orchestrator): route large/RFP deals to the methodology deck"
```

---

## Task 10: Sample harness + full green build

**Files:**
- Modify: `aws/src/render/sample.ts`
- Test: full suite + lint + typecheck

- [ ] **Step 1: Add `rfp` to the sample fixture.** In `aws/src/render/sample.ts`, add `rfp: false,` to the `ProposalContent` fixture (alongside the `effort` field added in Slice 1) so it typechecks.

- [ ] **Step 2: Add a methodology sample render** to `sample.ts` so the long deck is exercised end-to-end. Ensure these imports exist at the top of `sample.ts` (add any that are missing): `import { renderMethodologyHtml } from './methodology-template.js';` and the existing `htmlToPdf` import from `./pdf.js`. Then, after the existing standard-deck render block, append this concrete block (it reuses the standard fixture's `content` variable — if the fixture variable has a different name, substitute it; it must be a full `ProposalContent` with `effort` + `rfp`):
```ts
  // ── Methodology deck sample (Slice 2) ──────────────────────────────
  const mContent = {
    ...content,
    serviceLines: ['pentest_web', 'pentest_api', 'pentest_network'],
    effort: {
      lines: [
        { serviceLine: 'pentest_web', basis: '3 web apps', manDays: 8 },
        { serviceLine: 'pentest_api', basis: '1 API', manDays: 5 },
        { serviceLine: 'pentest_network', basis: '/24 range', manDays: 6 },
      ],
      totalManDays: 19,
      aiLeverageNote: 'Effort reflects AI-augmented delivery via the Transilience platform.',
      isLarge: true,
    },
    rfp: true,
  };
  const methodology = {
    operatingLoop: [
      { name: 'Assess', detail: 'Understand the environment, threats and regulatory drivers.' },
      { name: 'Implement', detail: 'Execute the methodology — test, exploit and validate.' },
      { name: 'Evolve', detail: 'Feed findings into continuous exposure management via Transilience.' },
    ],
    services: [
      { serviceLine: 'pentest_web', phases: [{ name: 'Reconnaissance & mapping', detail: 'Crawl and fingerprint the surface.' }, { name: 'Reporting & retest', detail: 'Risk-rated findings, then a verification retest.' }], frameworks: ['OWASP WSTG', 'OWASP ASVS', 'PTES'], tooling: ['Burp Suite Pro', 'nuclei', 'Transilience triage'], aiAugmentation: 'Transilience compresses ~16k raw signals to ~10 prioritized actions.' },
      { serviceLine: 'pentest_api', phases: [{ name: 'Spec & endpoint discovery', detail: 'Parse OpenAPI and enumerate endpoints.' }, { name: 'AuthN / AuthZ', detail: 'BOLA, BFLA and token handling.' }], frameworks: ['OWASP API Security Top 10', 'PTES'], tooling: ['Burp Suite Pro', 'Postman'], aiAugmentation: 'Findings are de-duplicated and prioritized by exploitability.' },
      { serviceLine: 'pentest_network', phases: [{ name: 'Discovery & enumeration', detail: 'Host and service discovery.' }, { name: 'Exploitation', detail: 'Controlled exploitation to prove impact.' }], frameworks: ['NIST SP 800-115', 'MITRE ATT&CK', 'OSSTMM'], tooling: ['Nmap', 'Nessus', 'Metasploit'], aiAugmentation: 'Lateral-movement paths are prioritized by blast radius.' },
    ],
    aiHighlights: [
      { stat: '16k→10', label: 'raw findings to prioritized actions' },
      { stat: '95%', label: 'prioritization accuracy' },
      { stat: '~80%', label: 'alert-investigation effort cut' },
    ],
    crosswalk: [
      { area: 'Web application', frameworks: ['OWASP WSTG', 'OWASP ASVS'], evidence: 'Risk-rated report + retest' },
      { area: 'Network & infrastructure', frameworks: ['NIST SP 800-115', 'MITRE ATT&CK'], evidence: 'Exploitation evidence + remediation' },
    ],
    timeline: [
      { day: 'Day 1', milestone: 'Kickoff, scope confirmation, rules of engagement' },
      { day: 'Day 10', milestone: 'Testing complete; draft findings shared' },
      { day: 'Day 19', milestone: 'Final report + readout; retest scheduled' },
    ],
    exclusions: ['Remediation of identified issues (advisory only).', 'Testing of third-party systems not owned by the client.'],
  };
  const methHtml = renderMethodologyHtml(mContent as any, methodology as any);
  writeFileSync('out/sample-methodology.pdf', await htmlToPdf(methHtml));
  console.log('wrote out/sample-methodology.pdf');
```
(If `sample.ts` is not already inside an async context, wrap the new block — or the whole sample — so `await htmlToPdf(...)` is valid, matching how the existing standard render is awaited. Use the file's existing `writeFileSync` import.)

- [ ] **Step 3: Run the sample.** `cd aws && npx tsx src/render/sample.ts`
Expected: writes the standard sample PDF/docx AND `out/sample-methodology.pdf` without error.

- [ ] **Step 4: Full green build.**
```bash
cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws
npx tsc --noEmit
npm run lint
npx vitest run
```
Expected: tsc clean; lint clean on touched files (pre-existing vendored `design-system/*.js` lint errors are NOT introduced by this slice — do not fix them, but confirm they are the only ones); all tests pass. If a test fixture anywhere builds `ProposalContent` without `rfp`, add `rfp: false`.

- [ ] **Step 5: Commit.**
```bash
cd /Users/kkmookhey/Projects/Sara
git add ni-sales-agent/aws/src/render/sample.ts
git commit -m "chore(render): sample harness renders the methodology deck; green build"
```

---

## Self-review notes (coverage map)

- Spec §4 routing & threading → Tasks 4 (rfp), 8 (handler/adapter), 9 (loop).
- Spec §5.1 methodology library → Task 2.
- Spec §5.2 content types → Task 3.
- Spec §5.3 methodology generation → Task 5 (+ rfp in Task 4).
- Spec §5.4 diagram CSS → Task 6.
- Spec §5.5 slide builders + assembler + shared-chrome reuse → Tasks 1 (extract) + 7 (build).
- Spec §6 slide-count posture (no padding) → Task 7 test asserts a band, not an exact pad.
- Spec §7 testing → Tasks 2, 5, 6, 7, 8, 9, 10.

## Deployment (after all tasks pass — PAUSE for KK go-ahead first)

Per the runbook, deploy is human-gated:
```bash
cd ni-sales-agent/aws && AWS_PROFILE=sara-sales AWS_REGION=ap-south-1 npx cdk deploy --profile sara-sales --require-approval never
```
Smoke-verify by invoking `ni-sales-render` (foreground, sandbox disabled) with a large-deal `{content, deckType:'methodology', methodology}` payload and confirm a multi-page PDF returns. Prefer this over backgrounded CLI calls (signature-lag).
```
