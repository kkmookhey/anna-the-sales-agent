# Design: Incorporate new Transilience capabilities into the proposal knowledge base

**Date:** 2026-06-19
**Status:** Approved — ready for implementation plan
**Author:** KK Mookhey (via Anna build session)

---

## 1. Problem

Three capabilities have matured and should show up in client proposals, but the
proposal generator's single grounding source doesn't cover them (or covers them as a
buried one-liner):

1. **Autonomous Pentester** — the AI pentest agent engine (23 tools, 118 on-demand
   capabilities across 8 buckets, continuous authenticated exploit chains, PoC
   generation, mobile-pentest subsystem, engagement-lifecycle automation). Source:
   `assets/AutonomousPentester-Capabilities.md` (25KB marketing brief).
2. **CISO Threat Briefing (mobile)** — environment-aware daily threat/vuln briefing
   pushed to a CISO's phone, stack-filtered from public intel (CISA KEV / NVD / EPSS /
   vendor advisories), with per-item "why it matters to you," a board-ready paragraph,
   and "Ask My Team" questions. Source: `~/CISOAlert` (README) and
   `~/Projects/CISOBrief/CISOBrief.md` (PRD "Sentinel Brief").
3. **Brand Protection & Dark-Web Monitoring** — credential-leak monitoring, deep/darknet
   surveillance, brand & executive impersonation, phishing/rogue-app takedown.
   (Competes with iZoologic / CloudSek — internal positioning only.)

## 2. Constraints (from the existing system)

- The generator reads exactly **one** file on every proposal:
  `aws/src/content/capability-library.md`, loaded by
  `loadContent('capability-library')` in `aws/src/judgment/judgment.ts:178`.
- That file is deliberately lean: *"Quote what's here; never invent,"* client-facing
  facts only, *"select, don't dump."* Bloating it dilutes that discipline and grows the
  per-proposal prompt.
- `loadContent(name)` reads `content/<name>.md`; `name` may contain a subdir
  (`deep/foo` → `content/deep/foo.md`). Implementation: `aws/src/judgment/skills.ts:33`.
- The CDK bundler already does a **recursive** copy of `src/content/.`
  (`aws/infra/cdk/ni-sales-agent-stack.ts:73`), so `src/content/deep/*.md` ships to the
  Lambda automatically. **No infra change required.**
- `buildProposalContent` receives `serviceLines: string[]` (set at scope time by
  `scopeEnquiry`), the natural key for selecting relevant depth.
- Guardrail §12 of the library excludes forward-looking/internal material. New content
  must be grounded strictly in what the products actually do today.

## 3. Chosen approach

**Curated summaries in the core file + curated deep-reference files pulled on demand,
wired into the generator in one pass (content + code + tests + deploy).**

Rejected alternatives:
- *Expand `capability-library.md` in place* — grows the always-loaded prompt and erodes
  "select, don't dump."
- *Summaries only, no deep files* — proposals can't cite real depth when an enquiry
  genuinely calls for it.

## 4. Content layer

### 4.1 `aws/src/content/capability-library.md` edits (always-loaded core)

- **§4.1 Offensive Security** — add a 6–8 line *Autonomous Pentester* block: AI agent
  engine, 23 tools, 118 on-demand capabilities across 8 buckets, continuous
  authenticated exploit chains, PoC-generation pipeline, mobile-pentest subsystem,
  engagement-lifecycle automation. End with a pointer that deeper detail exists.
- **§4.8 (NEW) — Brand Protection & Dark-Web Monitoring** — promote the buried
  §4.2 one-liner into a real module: credential-leak monitoring, deep/darknet
  surveillance, brand & executive impersonation, phishing/rogue-app takedown. Positioned
  by capability, **not** by naming competitors.
- **§4.9 (NEW) — CISO Threat Briefing (mobile)** — environment-aware daily briefing
  pushed to the CISO's phone; stack-filtered from CISA KEV / NVD / EPSS / vendor
  advisories; per-item "why it matters to you," board-ready paragraph, "Ask My Team"
  questions; privacy-first architecture. Grounded strictly in README/PRD facts — no
  invented SLAs or scale numbers.
- **§5 Transilience edge** — name Autonomous Pentester as a surface / refresh §5.2
  ("Continuous Pen-Test").
- **§0 usage rules** — one line: deep-reference files may be appended for matched
  enquiries; same "quote, never invent" rule applies to them.

### 4.2 Deep-reference files: `aws/src/content/deep/`

Curated, client-facing **grounding distillations** (~6–8KB each), proposal-shaped — NOT
copies of the 25KB marketing brief. The marketing source stays in `assets/` untouched.

- `deep/autonomous-pentester.md` — tools, capability buckets, exploitation depth, proof
  points, what may be claimed.
- `deep/brand-darkweb.md` — monitoring surfaces, takedown workflow, evidence/outputs.
- `deep/ciso-threat-briefing.md` — sources, filtering, per-item artifacts, privacy model.

## 5. Wiring layer (`aws/src/judgment/judgment.ts`)

- New pure function `selectDeepReferences(serviceLines: string[]): string[]` returning
  content names (e.g. `['deep/autonomous-pentester']`):
  - keyword map: `pentest|vapt|red.?team|offensive|exploit` → `deep/autonomous-pentester`;
    `brand|dark.?web|takedown|threat.?intel|impersonation` → `deep/brand-darkweb`;
    `ciso.?brief|threat.?brief|advisory.?feed|briefing` → `deep/ciso-threat-briefing`.
  - de-duplicated; **capped at 2** files to bound prompt tokens; returns `[]` on no match.
- `buildProposalContent` injects matched deep files after the capability-library block
  under a header like `## Deep Capability References (quote from here when the enquiry
  calls for this depth)`, then proceeds unchanged. No-match enquiries (e.g. MDR-only)
  stay lean.

## 6. Tests (test-gated)

New `aws/test/judgment/deep-references.test.ts`:
- selector mapping: pentest→autonomous-pentester; brand/dark-web→brand-darkweb;
  mdr-only→`[]`; cap of 2 respected when many lines match.
- `buildProposalContent` injects the matched deep file content into the system prompt on
  a matching serviceLine.
- `buildProposalContent` injects **no** deep header/content when no serviceLine matches.
- **cost-guard:** assembled system prompt length stays under a defined ceiling even with
  the 2-file maximum (asserts the curated files + cap keep the prompt bounded).

Existing `aws/test/judgment/grounding.test.ts` must continue to pass unchanged.

## 7. Build / deploy

- No CDK change (recursive content copy already covers `deep/`).
- Run the full `vitest` suite; then `cdk deploy`.

## 8. Risks & decisions

- **Competitor naming** — iZoologic/CloudSek kept OUT of client-facing grounding;
  positioning is by capability. (User to override if naming is wanted.)
- **CISOAlert positioning** — framed as a delivered capability but grounded strictly in
  README/PRD facts; no invented SLAs or scale.
- **Token budget** — mitigated by curated (not raw) deep files, a 2-file cap, and the
  cost-guard test.

## 9. Out of scope

- Enriching the `assets/` marketing docs themselves.
- Any change to the scope/sufficiency/follow-up skills.
- Non-proposal surfaces (Slack staging, HubSpot, render templates).
