# NI Sales Agent

> Built by the team at **[Transilience AI](https://www.transilience.ai)** — the AI-native security
> platform powering automation across the Network Intelligence group.

A semi-autonomous sales-enquiry agent for **Network Intelligence**. It watches the shared
`sales@networkintelligence.ai` mailbox, classifies inbound mail, scopes genuine enquiries, builds
**brand-faithful PDF proposals**, follows up, and logs won deals to HubSpot — with a **human
approving every outbound action** (draft-and-hold; the agent never sends an email or writes to a CRM
on its own).

**Status: LIVE on AWS** (Lambda, every ~20 min, 24/7, `DRY_RUN=false`). The full
enquiry → scope → proposal flow, forwarded-enquiry handling, and the PO → HubSpot leg have all been
validated end-to-end against the live mailbox.

---

## What it does (the workflow)

1. **Inbound mail arrives** → a cheap sender prefilter drops automated mail, then a Bedrock
   classifier labels it **enquiry / forwarded-enquiry / not-enquiry** (with a low-confidence
   "review" bucket). Non-enquiries are dropped; genuine enquiries open a deal.
2. **Direct enquiry** → the agent scopes the service lines and **creates an Outlook draft reply**
   with scoping questions + posts a staging card to Slack `#sales-test` → **you send the draft**.
3. **Forwarded enquiry** (sales/marketing forward a prospect's mail in) → the agent extracts the
   **original sender** from the forwarded body and drafts the reply **to the prospect**, with a loud
   ⚠️ "verify this body-derived recipient before sending" flag.
4. **Client replies** → the agent judges scope sufficiency (build / assume-and-build / ask-once-more).
   When sufficient it **generates a branded PDF proposal**, stores it in S3, and **creates an Outlook
   draft with the PDF attached** → **you send manually**.
5. **Client sends a PO / "we're proceeding"** → the agent stages it → **you reply `SHIP-IT` in the
   Slack thread** → the agent writes the deal to HubSpot as Closed-Won.

The three irreversible actions (send email, write HubSpot, download an inbound attachment) are
**impossible by construction** — the only outbound-email path creates a *draft*, HubSpot writes
require a detected `SHIP-IT` from an approved user, and inbound attachments are never fetched. The one
deliberate, documented exception is the *forwarded-enquiry* recipient (drafted, never auto-sent,
always flagged for human verification).

---

## Proposal quality

Proposals are **grounded** and **designed**:

- **Content** is grounded in a curated capability library (`aws/src/content/capability-library.md`)
  — real credentials (PCI QSA & PIN Assessor, CREST, HITRUST, CERT-In, ISO 27001…), the full service
  stack (VAPT, MDR/SOC, GRC, cloud, identity, AI security), the Transilience AI edge, proof points
  and clients. The generator **quotes from this library and never invents** facts.
- **Visuals** are rendered as a **16:9 PDF** from HTML/CSS in the **Transilience design system**
  (Rich Black, violet→crimson gradient, Bumblebee-yellow accent, Jost + Roboto) via headless Chrome.

---

## Architecture

Two headless **AWS Lambdas** (Node 20 + TypeScript), deployed via CDK.

| Concern | Implementation |
|---|---|
| Trigger | EventBridge rule `ni-sales-agent-tick` — `cron(7/20 * * * ? *)` (every 20 min) |
| Orchestrator | `ni-sales-agent` Lambda — intake classification, state machine, gates, staging |
| Proposal renderer | `ni-sales-render` Lambda — fills the HTML template, prints to PDF (`puppeteer-core` + `@sparticuz/chromium`); invoked synchronously by the orchestrator |
| Mailbox I/O | Microsoft Graph (app-only, `Mail.ReadWrite`, scoped to `sales@`) |
| CRM I/O | HubSpot CRM API (service key) |
| Notify / approve | Slack bot ("Sara Sales Rep") → `#sales-test` + a pipeline Canvas |
| Judgment & classification | Amazon Bedrock — Claude Sonnet 4.5 (`global.anthropic.claude-sonnet-4-5-20250929-v1:0`) |
| Proposal artifact | HTML/CSS (Transilience design system) → 16:9 PDF → S3 → attached to the Outlook draft |
| State | DynamoDB table `ni-sales-deals` (one item per deal; `_meta#*` items for agent state) |
| Secrets | Secrets Manager: `ni-sales/graph`, `ni-sales/hubspot`, `ni-sales/slack` |

The **state machine and the safety gates are plain TypeScript**; Claude (via Bedrock) is called only
for judgment — inbound classification, scoping copy, sufficiency, proposal content, follow-ups, PO
classification. See `ni-sales-agent/CLAUDE.md` for the orchestrator spec and gate definitions.

---

## Repo layout

```
ni-sales-agent/
  CLAUDE.md                  # orchestrator spec / state machine + untrusted-input gates
  skills/                    # judgment prompts: enquiry-scoping, scope-sufficiency,
                             #   proposal-assembly, deal-followup  (loaded by the Lambda)
  docs/superpowers/
    specs/                   # design specs (proposal rendering v2, smart intake)
    plans/                   # phased, test-gated implementation plans
  aws/                       # THE DEPLOYED LAMBDAS (TypeScript)
    src/
      orchestrator/          # loop (intake + state machine), transitions, intake prefilter
      judgment/              # bedrock, judgment (incl. classifyInbound), skill/content loaders
      adapters/              # graph, slack, hubspot, s3, render (invoke the render Lambda)
      gates/                 # the safety core (verifiedRecipient, bodyDerivedRecipient, injection scan)
      render/                # HTML template, PDF (puppeteer), Lambda handler, inlined font/logo assets
      content/               # capability-library.md (proposal grounding)
      proposal/, config, logging, state/, handler, bootstrap
    test/                    # 95 vitest tests
    infra/cdk/               # AWS CDK stack (both Lambdas)
    RUNBOOK.md               # app registrations + deploy + cutover + rollback
    src/assets/ni-logo.png   # NI logo (inlined into the PDF)
assets/                      # NI corporate deck + collateral (large .pptx git-ignored)
```

---

## AWS deployment

- **Account:** `331145994818`  ·  **Region:** `ap-south-1` (Mumbai)  ·  **CLI profile:** `sara-sales`
- **Stack:** `NiSalesAgentStack` (CDK). Deploy: `cd ni-sales-agent/aws && npx cdk deploy --profile sara-sales`
- **Verify locally:** `npm test` (95 tests), `npm run typecheck`, `npm run lint`, `npm run render:sample`
- **Manual run:** `aws lambda invoke --function-name ni-sales-agent --profile sara-sales --region ap-south-1 /tmp/out.json`
- **Logs:** `aws logs tail /aws/lambda/ni-sales-agent --since 5m --profile sara-sales --region ap-south-1`
- **Pause / resume:** `aws events disable-rule|enable-rule --name ni-sales-agent-tick --profile sara-sales --region ap-south-1`

Full setup (Graph app registration, secrets, cutover) is in **`ni-sales-agent/aws/RUNBOOK.md`**.

### Config (Lambda env vars)
`MAILBOX`, `SLACK_CHANNEL_ID`, `APPROVAL_TOKEN` (`SHIP-IT`), `DRY_RUN`, `FOLLOWUP_CADENCE_DAYS`
(`3,7,14`), `MAX_FOLLOWUPS` (`3`), `BUSINESS_HOURS_ONLY` (`false` = 24/7), the HubSpot
pipeline/stage/owner, `BEDROCK_MODEL_ID`, `RENDER_FUNCTION_NAME`, and the three `*_SECRET_ID`s.
`LAST_RUN_ISO` is normally unset (defaults to a 30-min lookback); set it only for manual back-fills.

---

## Open items

- **Read inbound attachments** (e.g. a customer's scope `.xlsx`) — not supported today by design
  (attachment download is a gated action). A future, narrowly-gated parse-only capability would let
  the agent ingest scope from attachments as untrusted data. Design TBD.
- **Graph access-policy scoping** — restrict the Exchange Application Access Policy to `sales@` only.
- **Rotate the Graph client secret** — it appeared in early setup logs; rotate + update `ni-sales/graph`.
- **`main` is behind** — the deployed code lives on `feat/lambda-port`; merge to bring `main` current.

---

*Every outbound action is human-approved. The agent drafts; you send.*
