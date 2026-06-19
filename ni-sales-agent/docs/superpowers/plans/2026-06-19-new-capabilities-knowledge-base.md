# New Capabilities Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the proposal generator able to cite three matured capabilities — Autonomous Pentester, Brand/Dark-Web Monitoring, and CISO Threat Briefing — by adding curated summaries to the always-loaded capability library plus on-demand deep-reference files wired into `buildProposalContent`.

**Architecture:** The generator reads one grounding file today (`loadContent('capability-library')`). We keep that file lean (add 3 curated summaries) and add three curated *deep-reference* files under `src/content/deep/`. A new pure selector maps the enquiry's `serviceLines` to at most two relevant deep files, which `buildProposalContent` appends to its system prompt only when relevant. No infra change — the CDK bundler already recursively copies `src/content/`.

**Tech Stack:** TypeScript (Node 22, ESM), Vitest, existing `loadContent`/`loadSkill` loaders in `aws/src/judgment/skills.ts`.

---

## File Structure

- **Create** `aws/src/judgment/deep-references.ts` — pure `selectDeepReferences(serviceLines)` selector. One responsibility: enquiry → deep-file content names.
- **Create** `aws/src/content/deep/autonomous-pentester.md` — client-facing distillation of the Autonomous Pentester brief.
- **Create** `aws/src/content/deep/brand-darkweb.md` — Brand Protection & Dark-Web Monitoring grounding.
- **Create** `aws/src/content/deep/ciso-threat-briefing.md` — CISO Threat Briefing grounding.
- **Modify** `aws/src/judgment/judgment.ts` — import the selector; inject matched deep files into the `buildProposalContent` system prompt after the capability-library block.
- **Modify** `aws/src/content/capability-library.md` — §0 rule, §4.1 Autonomous Pentester bullet, §4.2 trim, new §4.8 + §4.9, §5.2 refresh.
- **Create** `aws/test/judgment/deep-references.test.ts` — selector + injection + cost-guard tests.
- **Modify** `aws/test/judgment/deep-content.test.ts` (new) — deep-file sanity (loadable, size cap, required anchors).

**Conventions confirmed from the codebase:**
- ESM imports use a `.js` extension on local paths (e.g. `import { loadContent } from './skills.js'`).
- `loadContent(name)` reads `content/<name>.md`; `name` may include a subdir, so `loadContent('deep/autonomous-pentester')` resolves `content/deep/autonomous-pentester.md`.
- Tests mock `judge.askJson` and read `system = askJson.mock.calls[0][0]` (see `aws/test/judgment/grounding.test.ts`).
- Run tests from `aws/`: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws`.

---

## Task 1: Deep-reference selector

**Files:**
- Create: `aws/src/judgment/deep-references.ts`
- Test: `aws/test/judgment/deep-references.test.ts`

- [ ] **Step 1: Write the failing test**

Create `aws/test/judgment/deep-references.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { selectDeepReferences } from '../../src/judgment/deep-references.js';

describe('selectDeepReferences', () => {
  it('maps offensive-security lines to the pentester deep file', () => {
    expect(selectDeepReferences(['penetration testing'])).toEqual(['deep/autonomous-pentester']);
    expect(selectDeepReferences(['VAPT'])).toEqual(['deep/autonomous-pentester']);
    expect(selectDeepReferences(['red team'])).toEqual(['deep/autonomous-pentester']);
  });

  it('maps brand / dark-web lines to the brand-darkweb deep file', () => {
    expect(selectDeepReferences(['brand monitoring'])).toEqual(['deep/brand-darkweb']);
    expect(selectDeepReferences(['dark web monitoring'])).toEqual(['deep/brand-darkweb']);
  });

  it('maps briefing lines to the ciso-threat-briefing deep file', () => {
    expect(selectDeepReferences(['CISO threat briefing'])).toEqual(['deep/ciso-threat-briefing']);
  });

  it('returns [] when nothing matches (stays lean)', () => {
    expect(selectDeepReferences(['mdr'])).toEqual([]);
    expect(selectDeepReferences([])).toEqual([]);
  });

  it('de-duplicates when multiple lines map to the same file', () => {
    expect(selectDeepReferences(['vapt', 'penetration testing'])).toEqual(['deep/autonomous-pentester']);
  });

  it('caps the result at two deep files, in priority order', () => {
    expect(selectDeepReferences(['red team', 'brand monitoring', 'CISO threat briefing']))
      .toEqual(['deep/autonomous-pentester', 'deep/brand-darkweb']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/deep-references.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/judgment/deep-references.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `aws/src/judgment/deep-references.ts`:

```typescript
// Maps an enquiry's service lines to the curated deep-reference files worth injecting
// into the proposal grounding prompt. Order here is the priority order used by the cap.
const DEEP_REFERENCES: { name: string; pattern: RegExp }[] = [
  { name: 'deep/autonomous-pentester', pattern: /pen.?test|vapt|red.?team|offensive|exploit/i },
  { name: 'deep/brand-darkweb', pattern: /brand|dark.?web|darknet|takedown|threat.?intel|impersonation/i },
  { name: 'deep/ciso-threat-briefing', pattern: /ciso.?brief|threat.?brief|briefing|advisory.?feed/i },
];

const MAX_DEEP_REFERENCES = 2;

/**
 * Select the deep-reference content names relevant to these service lines.
 * Pure and deterministic. De-duplicated, capped at MAX_DEEP_REFERENCES, returned in
 * the fixed priority order of DEEP_REFERENCES. Returns [] when nothing matches.
 */
export function selectDeepReferences(serviceLines: string[]): string[] {
  const haystack = serviceLines.join(' ');
  return DEEP_REFERENCES
    .filter((ref) => ref.pattern.test(haystack))
    .map((ref) => ref.name)
    .slice(0, MAX_DEEP_REFERENCES);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/deep-references.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/kkmookhey/Projects/Sara/ni-sales-agent
git add aws/src/judgment/deep-references.ts aws/test/judgment/deep-references.test.ts
git commit -m "feat: deep-reference selector for proposal grounding"
```

---

## Task 2: Author the three deep-reference files

**Files:**
- Create: `aws/src/content/deep/autonomous-pentester.md`
- Create: `aws/src/content/deep/brand-darkweb.md`
- Create: `aws/src/content/deep/ciso-threat-briefing.md`
- Test: `aws/test/judgment/deep-content.test.ts`

> All content below is grounded in: `assets/AutonomousPentester-Capabilities.md`,
> `assets/network-intelligence-capabilities.md`, `~/CISOAlert/README.md`, and
> `~/Projects/CISOBrief/CISOBrief.md`. Do not add facts beyond these sources.

- [ ] **Step 1: Write the failing test**

Create `aws/test/judgment/deep-content.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadContent } from '../../src/judgment/skills.js';

const DEEP_FILES: { name: string; anchors: string[] }[] = [
  { name: 'deep/autonomous-pentester', anchors: ['104/104', '118', 'OWASP'] },
  { name: 'deep/brand-darkweb', anchors: ['dark', 'takedown', 'credential'] },
  { name: 'deep/ciso-threat-briefing', anchors: ['CISA KEV', 'Ask My Team', 'board-ready'] },
];

describe('deep-reference content files', () => {
  for (const { name, anchors } of DEEP_FILES) {
    it(`${name} loads, is within the 8KB cap, and contains its grounded anchors`, () => {
      const body = loadContent(name);
      expect(body.length).toBeGreaterThan(500);
      expect(body.length).toBeLessThanOrEqual(8000);
      for (const anchor of anchors) {
        expect(body).toContain(anchor);
      }
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/deep-content.test.ts`
Expected: FAIL — `Content not found: deep/autonomous-pentester`.

- [ ] **Step 3: Create `aws/src/content/deep/autonomous-pentester.md`**

```markdown
# Autonomous Pentester — Deep Capability Reference (Transilience AI)

> Grounding for proposals where the engagement is offensive security (pentest / VAPT /
> red team). Quote what's here; never invent. Source: AutonomousPentester capability brief.

## What it is
An AI-driven autonomous penetration-testing platform. You point it at an authorized
target; it connects to a real Kali attack box, runs the tools, reads the raw output,
decides the next move, and loops — without manual nudging between steps. A true agentic
red-teamer, not a passive scanner and not a command-suggestion assistant.

## Why it's different
- **True agentic execution** — commands run on a live Kali Linux box; the agent ingests
  real output and autonomously decides the next action.
- **Real tooling, real infrastructure** — Kali, Burp Suite (Repeater / Intruder /
  Collaborator), and a real Chromium browser driven by natural-language goals. Not a
  simulated sandbox.
- **Capability as portable skill, not model weights** — offensive methodology lives in
  ~36 markdown skills backed by 448+ exploitation scenario files; runs on any frontier
  model, with no fine-tuning.
- **Disciplined multi-agent orchestration** — a P0–P5 methodology (Recon → Hypothesize →
  Execute → Integrate → Validate + Report) with parallel subagents, an experiments
  ledger, and mandatory skeptic checkpoints.
- **Safety by design** — destructive operations raise an explicit consent gate; testing
  is strictly bounded to authorized scope.

## Headline proof points (quote exactly)
- **104/104 — 100% on the XBOW CTF benchmark**, with pure-markdown skills and no
  fine-tuning (baseline 89.4% → 100% with the full skill set).
- **100% OWASP Top 10** and **100% OWASP LLM Top 10** coverage.
- Additional standards: CWE Top 25, SANS, MASVS (mobile).
- Every finding passes a validator that refutes false positives before it reaches a
  report; findings are scored with CVSS 3.1 + CWE + MITRE ATT&CK.

## What it can do
- **23 autonomous agent tools** the agent composes itself: bash / Python execution on
  Kali, persistent interactive shells, parallel subagents, Burp Suite actions, an agentic
  browser, mobile scanning, listeners, on-demand tool install, skill loading, CVE search.
- **118 on-demand capabilities across 8 buckets** (core, network & recon, web, reverse
  engineering, binary exploitation, cryptography, forensics, stego) — installed only when
  needed (nmap, sqlmap, ffuf, nuclei, impacket, pwntools, ghidra, hashcat, and more).
- **~36 offensive skills / 448+ exploitation scenarios** spanning recon / OSINT, web & API
  vulns, infrastructure & system (Linux / Windows / Active Directory privilege
  escalation), cryptography, reverse engineering, cloud & containers, AI / LLM threat
  testing, and DFIR.

## Exploit & PoC generation
- CVE ID → NVD lookup (CVSS vector, CWE, CPE, advisories) → vendor / exploit research → a
  standalone, runnable proof-of-concept plus a report. Least-harm by default (read-only;
  destructive steps require explicit confirmation); source attribution required; no
  fabricated CVE detail.
- Synthesizes and syntax-validates exploit / automation scripts (Python / PowerShell /
  Bash) rather than executing them blindly.

## Mobile pentesting
- APK / IPA static analysis with 18 analyzers → deterministic attack-chain correlation →
  multi-pass deduplication → MASVS-v2 checklist validation, CVSS 3.1 + CWE per finding,
  and working PoCs (adb / Frida / objection) with real package and component names.

## Reporting
- Validator-gated findings → CVSS 3.1 + CWE + MITRE ATT&CK → a branded Transilience PDF
  with executive and technical sections, deterministic risk prioritization, and
  attack-path graphs.

## How to position it in a proposal
Lead with outcome: continuous, evidence-rich offensive testing that runs real attacks on
real infrastructure, validated to strip false positives, delivered faster than pure-human
testing while NI's senior pentesters stay on the rail for scoping, judgement, and sign-off.
Use the XBOW 104/104 and OWASP 100% figures as the credibility anchors. Always pair with
the authorized-testing, scope-bounded framing.
```

- [ ] **Step 4: Create `aws/src/content/deep/brand-darkweb.md`**

```markdown
# Brand Protection & Dark-Web Monitoring — Deep Capability Reference

> Grounding for proposals involving brand protection, anti-phishing, dark-web / credential
> monitoring, or executive impersonation risk. Quote what's here; never invent specific
> feeds, volumes, or SLAs not stated. Position by capability — do not name competitors.

## What it is
A continuous external-threat monitoring and takedown service that watches the open, deep,
and dark web plus social and app channels for threats to the organization's brand,
customers, and credentials — and acts on them.

## Monitoring surfaces
- **Dark-web & deep-web monitoring** — credential monitoring and darknet surveillance for
  leaked employee and customer credentials, data dumps, and chatter naming the
  organization.
- **Brand monitoring** — detection of digital fraud, lookalike / typosquat domains,
  fraudulent use of brand and logos, and rogue mobile apps.
- **Social-media monitoring** — scams, fraud, impersonation of the brand and its
  executives, and reputation risks across social platforms.

## Action — not just alerts
- **Takedown support** for phishing sites, impersonation profiles, lookalike domains, and
  rogue apps — the response layer, not only detection.
- Prioritized, validated alerts so security teams act on real exposure rather than noise.

## How to position it in a proposal
Frame it as continuous digital-risk protection that extends defense beyond the perimeter:
catch leaked credentials before they are used, and shut down brand abuse and phishing
before customers are harmed. It pairs naturally with MDR / SOC (feed confirmed external
threats into monitoring) and with credential-exposure findings from offensive testing.
Position by capability and outcome. Do not state specific data-source names, detection
volumes, or takedown SLAs unless the scope confirms them.
```

- [ ] **Step 5: Create `aws/src/content/deep/ciso-threat-briefing.md`**

```markdown
# CISO Threat Briefing (mobile) — Deep Capability Reference

> Grounding for proposals where the prospect wants executive-level, environment-aware
> threat intelligence delivered to leadership. Quote what's here; never invent scale,
> SLAs, or sources not listed.

## What it is
A daily, environment-aware threat-and-vulnerability briefing delivered straight to a
CISO's mobile phone, plus out-of-band push alerts for urgent items. The CISO declares
their tech stack once (clouds, identity providers, endpoint, key software and security
vendors); the service filters the global firehose of vulnerabilities and threat news down
to what actually touches their environment.

## The problem it solves
Every CISO already drowns in CVEs, advisories, and threat-intel feeds — none of it
filtered to their actual stack. The unsolved problem is relevance, not volume. Knowing the
organization runs (for example) Okta + CrowdStrike + AWS + Microsoft 365 lets the service
ignore most of the noise and surface the few items that matter.

## What each briefing contains
- **Stack-filtered priority items** drawn from authoritative public sources — CISA KEV,
  NVD, EPSS, and vendor advisories — ranked by exploit signal, not raw severity.
- For each priority item: a **"why this matters to you"** explanation tied to the stack, a
  **board-ready paragraph** leadership can use directly, and a set of **"Ask My Team"**
  questions the CISO can forward to Infrastructure / SOC / Vulnerability-Management.
- A useful / not-useful feedback signal that tunes future relevance.

## Privacy posture
Privacy-first by design: anonymous identity, no personal data required to operate, and
deletion of stored data as a first-class feature. Upstream intelligence API keys never sit
on the device. Lead with this when the prospect is privacy- or compliance-sensitive.

## How to position it in a proposal
Position it as the executive layer on top of NI's monitoring and vulnerability services:
the same intelligence the SOC acts on, distilled into a five-minute, stack-aware briefing
the CISO and board can act on. Measure success on action taken, not items surfaced. Do not
promise specific feed coverage, delivery SLAs, or user numbers unless the scope confirms
them.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/deep-content.test.ts`
Expected: PASS (3 tests). If a file exceeds 8000 chars, trim the "How to position" section — do not drop a grounded anchor.

- [ ] **Step 7: Commit**

```bash
cd /Users/kkmookhey/Projects/Sara/ni-sales-agent
git add aws/src/content/deep/ aws/test/judgment/deep-content.test.ts
git commit -m "feat: add curated deep-reference grounding files"
```

---

## Task 3: Wire deep references into buildProposalContent

**Files:**
- Modify: `aws/src/judgment/judgment.ts` (import near line 2; inject near line 178)
- Test: `aws/test/judgment/deep-references.test.ts` (append injection + cost-guard tests)

- [ ] **Step 1: Write the failing tests** (append to `aws/test/judgment/deep-references.test.ts`)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';

function stubJudge() {
  const askJson = vi.fn().mockResolvedValue({
    titleLine: 't', understanding: [], scopeRows: [], assumptions: [], approach: [],
    deliverables: [], timeline: '', whyNi: [], credentials: [], transilienceEdge: [],
    commercials: { mode: 'placeholder', text: 'x' }, nextSteps: [],
    understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
  });
  return { askJson, svc: new JudgmentService({ askJson } as never) };
}

describe('buildProposalContent deep-reference injection', () => {
  it('injects the matched deep file when a service line matches', async () => {
    const { askJson, svc } = stubJudge();
    await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo', serviceLines: ['penetration testing'], scope: {}, assumptions: [],
    });
    const system = askJson.mock.calls[0][0] as string;
    expect(system).toContain('Deep Capability References');
    expect(system).toContain('104/104'); // a grounded anchor from autonomous-pentester.md
  });

  it('does NOT inject a deep block when no service line matches', async () => {
    const { askJson, svc } = stubJudge();
    await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo', serviceLines: ['mdr'], scope: {}, assumptions: [],
    });
    const system = askJson.mock.calls[0][0] as string;
    expect(system).not.toContain('Deep Capability References');
  });

  it('keeps the assembled prompt under the cost-guard ceiling at the 2-file max', async () => {
    const { askJson, svc } = stubJudge();
    await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo',
      serviceLines: ['penetration testing', 'brand monitoring'], scope: {}, assumptions: [],
    });
    const system = askJson.mock.calls[0][0] as string;
    // Baseline assembled prompt ~24KB + two ~5KB deep files; 48000 leaves headroom and
    // still catches accidental bloat (e.g. dumping a raw 25KB marketing brief into a file).
    expect(system.length).toBeLessThan(48000);
    expect(system).toContain('104/104');     // pentester anchor
    expect(system).toContain('takedown');    // brand-darkweb anchor
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/deep-references.test.ts`
Expected: FAIL — the injection and cost-guard tests fail because `system` does not contain `Deep Capability References`.

- [ ] **Step 3: Add the import** in `aws/src/judgment/judgment.ts`

Find (line 2):

```typescript
import { loadSkill, loadContent } from './skills.js';
```

Add immediately below it:

```typescript
import { selectDeepReferences } from './deep-references.js';
```

- [ ] **Step 4: Inject the deep block** in `buildProposalContent`

Find this block (around lines 174–179):

```typescript
    const system =
      `${loadSkill('proposal-assembly')}\n\n` +
      `## Capability Library (grounding — quote facts from here; never invent)\n` +
      `Use ONLY credentials, services, proof points and clients stated below. If the client's need ` +
      `isn't covered here, say so plainly — do not fabricate.\n\n${loadContent('capability-library')}\n\n` +
      `${JSON_RULE}\n` +
```

Replace it with:

```typescript
    const deepRefs = selectDeepReferences(input.serviceLines);
    const deepBlock = deepRefs.length
      ? `## Deep Capability References (quote from here when the enquiry calls for this depth; ` +
        `the same never-invent rule applies)\n\n` +
        deepRefs.map((name) => loadContent(name)).join('\n\n---\n\n') + `\n\n`
      : '';
    const system =
      `${loadSkill('proposal-assembly')}\n\n` +
      `## Capability Library (grounding — quote facts from here; never invent)\n` +
      `Use ONLY credentials, services, proof points and clients stated below. If the client's need ` +
      `isn't covered here, say so plainly — do not fabricate.\n\n${loadContent('capability-library')}\n\n` +
      deepBlock +
      `${JSON_RULE}\n` +
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/deep-references.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 6: Run the existing grounding test (must still pass)**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/grounding.test.ts`
Expected: PASS — the MDR-only case in that test must not gain a deep block.

- [ ] **Step 7: Commit**

```bash
cd /Users/kkmookhey/Projects/Sara/ni-sales-agent
git add aws/src/judgment/judgment.ts aws/test/judgment/deep-references.test.ts
git commit -m "feat: inject matched deep references into proposal grounding prompt"
```

---

## Task 4: Enrich the capability library

**Files:**
- Modify: `aws/src/content/capability-library.md`
- Test: `aws/test/judgment/grounding.test.ts` (add assertions for the new module anchors)

- [ ] **Step 1: Add failing assertions** to `aws/test/judgment/grounding.test.ts`

Inside the existing `it('injects the capability library …')` test, after the line `expect(system).toContain('PCI PIN Assessor');`, add:

```typescript
    // New capability modules must be present in the always-loaded library.
    expect(system).toContain('Autonomous Pentester');
    expect(system).toContain('Brand Protection & Dark-Web Monitoring');
    expect(system).toContain('CISO Threat Briefing');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/grounding.test.ts`
Expected: FAIL — `expect(system).toContain('Autonomous Pentester')` fails.

- [ ] **Step 3: Edit §0** — add a 7th usage rule.

In `aws/src/content/capability-library.md`, find:

```markdown
6. **Match the voice in §11.** Confident, precise, a little dry. Declarative, never breathless.
```

Replace with:

```markdown
6. **Match the voice in §11.** Confident, precise, a little dry. Declarative, never breathless.
7. **Deep-reference files may be appended** below this library for offensive-security,
   brand/dark-web, or CISO-briefing enquiries. They carry extra grounded depth — the same
   "quote what's here, never invent" rule applies to them.
```

- [ ] **Step 4: Edit §4.1** — add the Autonomous Pentester bullet.

Find:

```markdown
- **AI Model Testing / AI red-teaming** — LLM and agent security: prompt injection, jailbreak,
  data-leakage, model abuse (MITRE ATLAS, OWASP LLM Top 10).
```

Replace with:

```markdown
- **AI Model Testing / AI red-teaming** — LLM and agent security: prompt injection, jailbreak,
  data-leakage, model abuse (MITRE ATLAS, OWASP LLM Top 10).
- **Autonomous Pentester (Transilience AI)** — an AI-driven autonomous testing platform that runs
  real attacks on a real Kali attack box, decides the next move, and loops — validated to strip
  false positives. 23 agent tools, 118 on-demand capabilities, ~36 skills / 448+ exploitation
  scenarios; **100% (104/104) on the XBOW CTF benchmark** and 100% OWASP Top 10 / OWASP LLM Top 10.
  NI's senior pentesters stay on the rail for scope and sign-off. *(See deep reference when offensive
  security is in scope.)*
```

- [ ] **Step 5: Edit §4.2** — trim the brand/dark-web one-liner (it becomes its own module).

Find:

```markdown
- **Extended Detection & Response (XDR)**, **SOAR-as-a-Service**, threat hunting, dark-web
  monitoring, social-media & brand monitoring.
```

Replace with:

```markdown
- **Extended Detection & Response (XDR)**, **SOAR-as-a-Service**, threat hunting.
  (External-threat, brand and dark-web monitoring now have their own module — see §4.8.)
```

- [ ] **Step 6: Add §4.8 and §4.9** — insert the two new modules after §4.7.

Find:

```markdown
### 4.7 Specialized practices
- Application Security & DevSecOps · Data Security · Privileged Identity Management ·
  IoT and OT Security · Responsible AI · Secure Digital Transformation · Privacy program
  implementation.

---

## 5. The Transilience AI edge
```

Replace with:

```markdown
### 4.7 Specialized practices
- Application Security & DevSecOps · Data Security · Privileged Identity Management ·
  IoT and OT Security · Responsible AI · Secure Digital Transformation · Privacy program
  implementation.

### 4.8 Brand Protection & Dark-Web Monitoring
- **Dark-web & deep-web monitoring** — credential monitoring and darknet surveillance for leaked
  employee/customer credentials and data dumps.
- **Brand & social-media monitoring** — lookalike/typosquat domains, brand and logo abuse, rogue
  apps, and impersonation of the brand and its executives.
- **Takedown support** — the response layer, not just alerts: phishing sites, impersonation
  profiles, lookalike domains and rogue apps taken down.
- *Typical deliverables:* continuous external-threat monitoring, prioritised validated alerts,
  takedown action, periodic exposure reporting. *(See deep reference when this is in scope.)*

### 4.9 CISO Threat Briefing (mobile)
- A daily, environment-aware threat-and-vulnerability briefing delivered to the CISO's phone, plus
  push alerts for urgent items. The CISO declares their stack once; the service filters global
  intel (CISA KEV, NVD, EPSS, vendor advisories) to what touches their environment.
- Each priority item carries a "why this matters to you" explanation, a board-ready paragraph, and
  "Ask My Team" questions — ranked by exploit signal, not raw severity.
- Privacy-first by design (anonymous identity, data deletion as a feature).
- *Typical deliverables:* daily stack-filtered briefing, out-of-band alerts, executive/board-ready
  write-ups. *(See deep reference when this is in scope.)*

---

## 5. The Transilience AI edge
```

- [ ] **Step 7: Edit §5.2** — name the Autonomous Pentester / XBOW result.

Find:

```markdown
2. **Continuous Pen-Test:** authenticated exploit chains run continuously against staging and
   production; findings prioritised by *exploitability*, not severity score.
```

Replace with:

```markdown
2. **Continuous Pen-Test (Autonomous Pentester):** authenticated exploit chains run continuously
   against staging and production by an autonomous agent on a real attack box — **100% (104/104) on
   the XBOW CTF benchmark**; findings prioritised by *exploitability*, not severity score.
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run test/judgment/grounding.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/kkmookhey/Projects/Sara/ni-sales-agent
git add aws/src/content/capability-library.md aws/test/judgment/grounding.test.ts
git commit -m "feat: add Autonomous Pentester, brand/dark-web, CISO briefing to capability library"
```

---

## Task 5: Full verification and deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx vitest run`
Expected: PASS — entire suite green (no regressions in `grounding`, `judgment`, `rfp`, `effort`, `methodology`, render, gates).

- [ ] **Step 2: Typecheck / build**

Run: `cd /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws && npx tsc -p tsconfig.json --noEmit`
Expected: no type errors.

- [ ] **Step 3: Confirm deep files bundle (no infra change needed)**

Verify the CDK bundler recursively copies content: `aws/infra/cdk/ni-sales-agent-stack.ts` line ~73 runs `cp -R ${i}/src/content/. ${o}/content/`, which includes `src/content/deep/`. No edit required — just confirm the line is present.

Run: `grep -n "src/content" /Users/kkmookhey/Projects/Sara/ni-sales-agent/aws/infra/cdk/ni-sales-agent-stack.ts`
Expected: the recursive copy line is present.

- [ ] **Step 4: Deploy**

Deploy per the project's standard flow (CDK). Confirm the stack reaches `UPDATE_COMPLETE` and the Lambda bundle contains `content/deep/*.md`.

- [ ] **Step 5: Commit any deploy-output changes** (if the repo tracks `cdk.out` or similar); otherwise stop.

---

## Self-Review notes (completed during planning)

- **Spec coverage:** §4.1/§4.8/§4.9/§5 edits → Task 4; deep files → Task 2; selector → Task 1; wiring → Task 3; cost-guard → Task 3 Step 1; no infra change → Task 5 Step 3. All spec sections covered.
- **Type consistency:** `selectDeepReferences(serviceLines: string[]): string[]` defined in Task 1 and called identically in Task 3. Content names (`deep/autonomous-pentester`, `deep/brand-darkweb`, `deep/ciso-threat-briefing`) are identical across selector, content files, and tests.
- **Anchors consistency:** test anchors (`104/104`, `118`, `OWASP`, `dark`, `takedown`, `credential`, `CISA KEV`, `Ask My Team`, `board-ready`) all appear verbatim in the Task 2 content blocks. Verified.
```
