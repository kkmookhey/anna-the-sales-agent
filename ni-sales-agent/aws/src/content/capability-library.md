# Network Intelligence — Capability Library

> **Purpose.** This is the single grounding source the proposal generator reads when writing a
> proposal. Pull facts, credentials, service descriptions, proof points and voice from here.
> **Quote what's here; never invent.** If a client requirement isn't covered by anything below,
> say so plainly and propose a scoping call — do not fabricate a capability, a number, or a price.
>
> **Scope of this file.** Client-facing facts only. Investor/forward-looking material (ARR,
> revenue targets, fundraise, roadmap, cap table) is **deliberately excluded** — see §12.

---

## 0. How the generator should use this file

1. **Lead with the client's need, not our catalog.** The most important section of any proposal
   restates *their* requirement and deadline in their words. Capability content is the evidence
   that we can deliver it — not the opening act.
2. **Select, don't dump.** Pick the service modules (§4), credentials (§3) and proof points (§7)
   that match *this* enquiry. A pentest proposal does not need the full GRC catalog.
3. **Always include the four must-highlight credentials** (§3) when the engagement is technical
   security work — they are table stakes that differentiate us.
4. **Feature the Transilience AI edge (§5) when it strengthens the case** — managed/continuous
   work, cloud, compliance, AI security. Omit it from a pure one-off manual pentest where it adds
   nothing.
5. **Pricing discipline.** Never state a firm price the scope can't justify. An honest range tied
   to stated assumptions beats a confident wrong number. If you can't price responsibly, build the
   proposal through the value case and propose a short scoping call.
6. **Match the voice in §11.** Confident, precise, a little dry. Declarative, never breathless.
7. **Deep-reference files may be appended** below this library for offensive-security,
   brand/dark-web, or CISO-briefing enquiries. They carry extra grounded depth — the same
   "quote what's here, never invent" rule applies to them.

---

## 1. Who we are — the NI Group

Network Intelligence is an **AI-powered, human-centric cybersecurity services group** that has
defended the world's most regulated enterprises for over two decades. Founded in **2001** by
**K. K. Mookhey**, the group pairs deep human expertise with an AI-native automation layer.

**Tagline:** *Cybersecurity — Powered by AI, Delivered by Humans.*
**Mission:** Protecting enterprises with intelligent cybersecurity — the power of technology, the
precision of human insight.

The group operates as **one group with three specialist arms**, covering the *full* enterprise
security stack rather than a slice:

| Arm | What it is | Covers |
|-----|------------|--------|
| **Network Intelligence** (parent) | AI-driven consulting & managed security services | GRC & risk advisory · 24/7 Managed SOC / MDR · Offensive security (VAPT, red team) · Incident response & forensics · vCISO |
| **Transilience AI** | AI-native platform — *the Full Stack Security OS* | Cloud security (CSPM + CWPP) · AI-managed pen testing · Compliance automation (voice-enabled) · AI red-teaming |
| **Ilantus** | Identity & access, 20-year IAM heritage | SSO & MFA · access governance · privileged access (PAM) · identity analytics · non-human/AI identity |

**The "better together" story:** identity, cloud and AI security converge into one operational
fabric — shared telemetry in a single security graph, one accountable partner (one contract, one
SLA, one executive sponsor), and an always-on AI agent fabric powering posture, identity governance
and SOC analysis 24/7.

---

## 2. By the numbers

Use these as proof points. Pick the ones relevant to the client's vertical.

| Stat | Value |
|------|-------|
| Years in cybersecurity | **25+** (founded 2001) |
| Security professionals | **550+** |
| Active engagements (any given year) | **200+** |
| Global presence | **8** locations |
| 24/7 SOCs | **4** |
| Banking & financial-services clients | **170+** |
| Healthcare clients | **80+** |
| Identities managed (Ilantus) | **1M+** |
| Industries served | 6 (BFSI, healthcare/pharma, manufacturing/industrial, tech/digital, retail, public sector) |

**Institutional credibility:** SOC 2 Type II (since 2019), CERT-In empanelled, HITRUST, PCI QSA &
PIN Assessor, CREST accredited.

---

## 3. Credentials & accreditations

### Must-highlight (table stakes on technical engagements)
These four are the minimum to surface on any relevant proposal:

- **PCI QSA** — Qualified Security Assessor; we perform and sign off PCI DSS assessments.
- **PCI PIN Assessor** — accredited to assess PIN security requirements for payment environments.
- **CREST Accredited** — penetration testing to CREST's internationally recognised standard.
- **HITRUST Assessor** — authorised to perform HITRUST assessments (incl. r2).

### Full accreditation set (select what fits the engagement)
HITRUST r2 · CERT-In Empanelled · CREST · PCI QSA · PCI PIN Assessor · SWIFT CSP · CSA Trusted ·
SOC 2 Type II (since 2019) · ISO 27001 · ISO 42001 (AI management) · DPDPA · GDPR.

> Framing line that works: *"Every accreditation is independently audited and renewed annually.
> Not a checkbox — an operating standard."*

---

## 4. Service catalog — the full stack

We cover **any enterprise cybersecurity requirement**, not just VAPT. For each domain: what it is,
our approach/standards, and typical deliverables. Select the domain(s) matching the enquiry.

### 4.1 Offensive Security
- **Vulnerability Assessment & Penetration Testing (VAPT)** — web, mobile (iOS/Android), API,
  network, thick-client, cloud. Standards: OWASP (Top 10, ASVS), OWASP MASVS/MSTG (mobile),
  PTES, NIST SP 800-115, CERT-In guidelines.
- **Continuous Red Teaming** — objective-based adversary emulation against people, process and tech.
- **Breach & Attack Simulation (BAS)** — continuous validation of detection and response controls.
- **AI Model Testing / AI red-teaming** — LLM and agent security: prompt injection, jailbreak,
  data-leakage, model abuse (MITRE ATLAS, OWASP LLM Top 10).
- **Autonomous Pentester (Transilience AI)** — an AI-driven autonomous testing platform that runs
  real attacks on a real Kali attack box, decides the next move, and loops — validated to strip
  false positives. 23 agent tools, 118 on-demand capabilities, ~36 skills / 448+ exploitation
  scenarios; **100% (104/104) on the XBOW CTF benchmark** and 100% OWASP Top 10 / OWASP LLM Top 10.
  NI's senior pentesters stay on the rail for scope and sign-off. *(See deep reference when offensive
  security is in scope.)*
- *Typical deliverables:* prioritised findings (by exploitability, not just CVSS), reproduction
  steps, business-risk narrative, remediation guidance, re-test of fixed findings, executive readout.

### 4.2 Managed Security — MDR / SOC
- **24/7 Managed Detection & Response (MDR)** run from 4 global SOCs.
- **Extended Detection & Response (XDR)**, **SOAR-as-a-Service**, threat hunting.
  (For external-threat, brand and dark-web monitoring, see §4.8.)
- AI-enriched triage: drift/anomaly → narrative + anomaly score + MITRE technique + next-step
  actions, with human-in-the-loop approval.
- *Typical deliverables:* onboarding & use-case engineering, 24/7 monitoring & response, monthly
  executive review, quarterly red-team exercise, measurable MTTR reduction.

### 4.3 GRC — Governance, Risk & Compliance
- Cybersecurity strategy & operating model, SOC maturity assessment, cloud architecture review,
  gap analysis against a target framework.
- **Compliance & audit:** PCI DSS (we are QSA + PIN Assessor), HITRUST certification, SOC 2 audit
  services, ISO 27001/42001, SWIFT CSP, DPDPA/GDPR privacy program implementation.
- **vCISO** advisory.
- *Typical deliverables:* maturity assessment, prioritised remediation roadmap, control design,
  evidence collection, audit support through certification.

### 4.4 Cloud Security
- Cloud security implementation, CSPM + CWPP, cloud architecture review, DevSecOps, Zero Trust
  architecture, SASE. Coverage across **AWS, Azure, GCP** (and Oracle Cloud).
- Continuous posture management with recommended remediations as code/CLI.
- *Typical deliverables:* posture baseline, misconfiguration remediation, IaC guardrails,
  continuous drift detection.

### 4.5 Identity & Access (Ilantus)
- SSO & adaptive MFA (passkeys), access governance (provisioning, recertification, SoD), PAM
  (just-in-time elevation, session recording, vaulting), identity analytics.
- **AI & agent identity (NHI):** non-human identities governed with the same rigour as humans —
  rotate, audit, revoke.

### 4.6 AI Security (Transilience-led)
- AI-SPM for models and agents, LLM endpoint red-teaming, shadow-AI discovery (named-user, not just
  egress), AI code scanning (model SDKs, embeddings, frameworks, vector DBs, MCP servers, agentic
  flows), non-human identity governance.
- Compliance for the AI body of regulation: NIST AI RMF, ISO 42001, EU AI Act, NIST AI 600-1
  (GenAI), MITRE ATLAS, OWASP LLM Top 10.

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

When to feature: managed/continuous engagements, cloud, compliance, AI security — anywhere
"continuous" and "AI-native" strengthen the case. **Transilience is what makes our delivery
faster, continuous and evidence-rich; NI's human experts remain on the rail.**

**What it is:** the **Full Stack Security OS** — cloud, AI, SOC and compliance in *one* platform
(not stitched-together modules), operated by AI agents with humans in the loop.

**Four product surfaces:**
1. **Cloud Posture (CSPM):** 800+ controls across AWS/Azure/GCP, continuous drift detection,
   remediations as code/CLI.
2. **Continuous Pen-Test (Autonomous Pentester):** authenticated exploit chains run continuously
   against staging and production by an autonomous agent on a real attack box (100% / 104/104 on
   the XBOW CTF benchmark); findings prioritised by *exploitability*, not severity score.
3. **Compliance Automation:** SOC 2, ISO 27001, HIPAA, PCI, EU AI Act, NIST AI RMF — evidence
   collected automatically, audit-ready continuously; voice + chat interface.
4. **AI Security:** LLM red-teaming, AI-SPM, non-human identity governance.

**Three-layer architecture:**
- **L1 — Specialist agents:** recon, pen-test, evidence, access-drift, NHI audit, AI red team.
- **L2 — Unified security graph:** identity ↔ cloud ↔ risk ↔ compliance, streamed live
  (~2.4M nodes / 14M edges per deployment).
- **L3 — Human-in-the-loop SOC:** approve, investigate, escalate — every autonomous action
  surfaces its reasoning.

**Trust-by-architecture (the differentiator):**
- **Read-only by default** — every action surfaces as code/CLI/runbook for a human to approve;
  nothing executes without consent.
- **Explainable by default** — every recommendation carries its reasoning trail (the *why*, not
  just the *what*).
- **Tenant-isolated by default** — customer data never trains shared models. Architectural, not
  policy.

**Differentiating capabilities:** 9 AI-specific code detectors, a 30-app shadow-AI catalog matched
to named users via identity sign-ins, auto-mapped compliance with per-finding provenance, and a
real-time voice + chat interface to query your stack.

---

## 6. How we engage — ADVISE framework & delivery model

**The ADVISE framework** (customer-centric lifecycle):
**A**ssess · **D**esign · **V**isualise · **I**mplement · **S**ustain · **E**volve — AI-powered
assessment, tailored strategy, AI-driven threat visualisation, strategic deployment, continuous
protection, adaptive response.

**Four-phase engagement (value in weeks, not quarters):**
1. **Assess (Weeks 1–2):** maturity assessment, attack-surface mapping, gap analysis vs target
   framework.
2. **Deploy (Weeks 3–6):** onboarding across cloud, identity, endpoints; first remediations ship
   in week 4.
3. **Operate (Ongoing):** 24/7 managed SOC, monthly executive review, quarterly red-team,
   continuous compliance.
4. **Evolve (Quarterly):** new capabilities as threats shift; posture score compounds.

---

## 7. Outcomes & proof points

Customer-observed results (use the ones relevant to the engagement type):
- **↓ 38% mean time to fix** (6.8h → 4.2h across the fleet; agents remediate low-risk findings
  autonomously).
- **94% average SOC 2 posture** across Transilience-managed environments, evidence collected
  continuously.
- **3,000+ monthly auto-remediations** — misconfigurations closed before a human sees them.
- **1 pane instead of 14 tools** — average customer retires 6+ point products in year one.
- **~22% security-spend reduction** in year one (vendor consolidation).
- **95%+ alert accuracy** in AI-enriched detection.

**Flagship case study — "The Impossible Login":** an impossible-travel scenario (CFO logins from
Chicago and São Paulo 8 seconds apart — 5,200 miles, 2.3M mph) that traditional tools logged as a
false negative. Transilience identified session-token theft via phishing, recognised the MFA-bypass
pattern, mapped a 5-stage attack chain and surfaced 20+ days of "ghost" activity — investigation
cut from weeks to 2 days, **$0 financial loss**.

---

## 8. Clients & industries

**Industries:** Banking & Finance · Healthcare & Pharma · Manufacturing & Industrial ·
Tech & Digital · Retail · Public Sector. *"The regulated ones pick us first."*

**Representative clients** (use logos appropriate to the prospect's vertical; respect any
confidentiality):
Airtel · FICO · FIS · American Express / Amex GBT · TCS · Standard Chartered · Saint-Gobain ·
Capgemini · Jack Henry · Western Union · Morgan Stanley · Kotak Bank / Kotak Securities · Marriott ·
SRS Distribution · Emirates NBD · Sharjah Islamic Bank · Lupin Labs · eClinicalWorks · Aucctus ·
Wellcove · Straive · SquareX (acquired by Zscaler).

**Testimonials:**
- *"Thanks to Transilience agents, we got SOC 2 certification along with threat monitoring and
  vulnerability management without maintaining any resources internally — we dedicated 100% of our
  time to building our product."* — **Vincent Atallah, President, Aucctus.**
- *"Transilience delivered our audit certification on time and with exceptional quality. Exactly
  what you need when compliance timelines are non-negotiable."* — **John Carse, Field CISO,
  SquareX (acquired by Zscaler).**

---

## 9. Partner ecosystem & integrations

*We plug into what you already run.*
- **Cloud:** AWS · Azure · Google Cloud · Oracle Cloud.
- **Identity:** Okta · Microsoft Entra · Ping · CyberArk · SailPoint · Saviynt.
- **Detection & response:** CrowdStrike · SentinelOne · Splunk · Palo Alto XSIAM · IBM QRadar.
- **AI & data:** OpenAI · Anthropic · Databricks · Snowflake · HashiCorp Vault.
- **Security tooling partners:** Tenable · Palo Alto · Checkmarx · Imperva · AccuKnox.

---

## 10. Methodologies & standards reference

Map the relevant standards into the approach section per service line:
- **App / API / web:** OWASP Top 10, OWASP ASVS, PTES, NIST SP 800-115.
- **Mobile:** OWASP MASVS / MSTG.
- **Network / infrastructure:** PTES, NIST SP 800-115, CERT-In.
- **Cloud:** CIS Benchmarks, CSA, provider Well-Architected security pillars.
- **Compliance:** PCI DSS, HITRUST CSF, SOC 2, ISO 27001, ISO 42001, SWIFT CSP, DPDPA, GDPR.
- **AI security:** NIST AI RMF, ISO 42001, EU AI Act, NIST AI 600-1, MITRE ATLAS, OWASP LLM Top 10.

---

## 11. Voice & tone for proposals

Write like a seasoned security operator — **confident, precise, and a little dry.** Security is
serious; the product carries the weight.

- **Declarative, never breathless.** "Scan complete. 14 findings across 3 services." Not "Let's
  dive into your security journey!"
- **Numbers stated, not softened.** "3 critical, 11 high" — not "a few issues to review."
- **Person:** "you" for the client's situation; "we" for what NI does.
- **Casing:** sentence case for headings and body; UPPERCASE with wide tracking only for eyebrows,
  tags and status chips. Never Title Case, never ALL-CAPS shouting in body.
- **No emoji.** Unicode separators (·, →, •) are fine.
- **Honesty as a sales tool** (the winning pattern from real proposals): name where we're a fit and
  where a phased/pilot approach de-risks the client. Tie every claim to evidence.
- **Structure that wins:** (1) restate their need, (2) scope precisely, (3) approach & standards,
  (4) deliverables & timeline, (5) credentials, (6) why NI / Transilience edge, (7) honest
  assumptions, (8) commercials with discipline, (9) clear next steps.

---

## 12. Guardrails — what NOT to include

Never put the following in a client proposal (these are investor/internal-only or unverified):
- ARR, revenue, pipeline, fundraise, valuation, cap table, use-of-funds, growth targets.
- Product roadmap / "on the roadmap" admissions framed as commitments.
- Internal competitive teardown language beyond what's appropriate for the specific deal.
- Pricing the captured scope cannot justify.
- Any credential, client name, or statistic not present in this file.

---

## 13. V2 — planned enrichment (not yet wired)

- **HubSpot similar-customer pull:** surface clients with closed-won orders in the **last 18 months**
  in the prospect's vertical, to tailor the "clients & proof" section automatically. Deferred to V2.
