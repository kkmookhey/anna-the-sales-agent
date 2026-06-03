# NI Sales Agent

A semi-autonomous sales-enquiry agent for **Network Intelligence**. It watches the shared
`sales@networkintelligence.ai` mailbox, scopes inbound enquiries, builds branded proposal
decks, follows up, and logs won deals to HubSpot — with a **human approving every outbound
action** (draft-and-hold; the agent never sends or writes on its own).

**Status: LIVE on AWS** (Lambda, every ~20 min, 24/7) in `DRY_RUN=false`. The full
enquiry → scope → proposal flow has been validated end-to-end against the live mailbox.

---

## What it does (the workflow)

1. **Enquiry arrives** → agent classifies it, scopes the service lines, and **creates an
   Outlook draft reply** with scoping questions + posts a staging card to Slack `#sales-test`
   → **you send the draft manually**.
2. **Client replies** → agent judges scope sufficiency (build / assume-and-build / ask-once-more).
   When sufficient it **generates a branded proposal deck**, stores it in S3, and **creates an
   Outlook draft with the deck attached** → **you send manually**.
3. **Client sends a PO / "we're proceeding"** → agent stages it → **you reply `SHIP-IT` in
   Slack** → agent writes the deal to HubSpot as Closed-Won.

The three irreversible actions (send email, write HubSpot, download an inbound attachment)
are **impossible by construction** — the only outbound-email path creates a *draft*, HubSpot
writes require a detected `SHIP-IT`, and inbound attachments are never fetched.

---

## Architecture

Headless **AWS Lambda** (Node 20 + TypeScript), triggered by EventBridge cron.

| Concern | Implementation |
|---|---|
| Trigger | EventBridge rule `ni-sales-agent-tick` — `cron(7/20 * * * ? *)` (every 20 min) |
| Mailbox I/O | Microsoft Graph (app-only, `Mail.ReadWrite`, scoped to `sales@`) |
| CRM I/O | HubSpot CRM API (service key) |
| Notify / approve | Slack bot ("Sara Sales Rep") → `#sales-test` + a pipeline Canvas |
| Judgment (copy) | Amazon Bedrock — Claude Sonnet 4.5 (`global.anthropic.claude-sonnet-4-5-20250929-v1:0`) |
| Proposal deck | `pptxgenjs` → `.pptx` → S3 → attached to the Outlook draft |
| State | DynamoDB table `ni-sales-deals` (one item per deal; `_meta#*` items for agent state) |
| Secrets | Secrets Manager: `ni-sales/graph`, `ni-sales/hubspot`, `ni-sales/slack` |

The **state machine and the safety gates are plain TypeScript**; Claude (via Bedrock) is
called only for judgment (scoping copy, sufficiency, proposal content, follow-ups, PO
classification). See `ni-sales-agent/CLAUDE.md` for the prototype's state-machine spec.

---

## Repo layout

```
ni-sales-agent/
  CLAUDE.md                  # the orchestrator spec / state machine (prototype source of truth)
  README.md                  # prototype overview
  skills/                    # judgment prompts: enquiry-scoping, scope-sufficiency,
                             #   proposal-assembly, deal-followup  (loaded by the Lambda)
  state/                     # prototype JSON state + schema
  docs/superpowers/plans/
    2026-06-02-lambda-port.md  # the full implementation plan (25 tasks)
  aws/                       # THE DEPLOYED LAMBDA (TypeScript)
    src/                     # config, gates, adapters (graph/slack/hubspot/s3),
                             #   judgment (bedrock), orchestrator (transitions + loop),
                             #   proposal (deck), canvas, handler, bootstrap
    test/                    # 61 vitest tests
    infra/cdk/               # AWS CDK stack
    RUNBOOK.md               # app registrations + deploy + cutover + rollback
    src/assets/ni-logo.png   # NI logo (bundled into the deck)
assets/                      # NI corporate deck + logo source (deck .pptx git-ignored)
```

---

## AWS deployment

- **Account:** `331145994818`  ·  **Region:** `ap-south-1` (Mumbai)  ·  **CLI profile:** `sara-sales`
- **Stack:** `NiSalesAgentStack` (CDK). Deploy: `cd ni-sales-agent/aws && npx cdk deploy --profile sara-sales`
- **Verify / test locally:** `npm test` (61 tests), `npm run typecheck`, `npm run lint`
- **Manual run:** `aws lambda invoke --function-name ni-sales-agent --profile sara-sales --region ap-south-1 /tmp/out.json`
- **Logs:** `aws logs tail /aws/lambda/ni-sales-agent --since 5m --profile sara-sales --region ap-south-1`
- **Pause / resume:** `aws events disable-rule|enable-rule --name ni-sales-agent-tick --profile sara-sales --region ap-south-1`

Full setup (Graph app registration, secrets, cutover) is in **`ni-sales-agent/aws/RUNBOOK.md`**.

### Config (Lambda env vars)
`MAILBOX`, `SLACK_CHANNEL_ID` (`C0B7KEP8D8W`), `APPROVAL_TOKEN` (`SHIP-IT`), `DRY_RUN`,
`FOLLOWUP_CADENCE_DAYS` (`3,7,14`), `MAX_FOLLOWUPS` (`3`), `BUSINESS_HOURS_ONLY` (`false` = 24/7),
HubSpot pipeline/stage/owner, `BEDROCK_MODEL_ID`, the three `*_SECRET_ID`s.

---

## Open items

- **Deck quality** (in progress) — the `pptxgenjs` deck is functional but design-capped.
  Direction chosen: keep editable PPTX but fill a **professionally-designed NI template**
  instead of drawing shapes. (See the next handoff / a forthcoming design spec.)
- **Graph access-policy scoping** — the app currently has tenant-wide mailbox read; the
  Exchange Application Access Policy must be restricted to `sales@` only (M365-side).
- **Rotate the Graph client secret** — it appeared in setup logs; rotate + update `ni-sales/graph`.
- **PO → HubSpot leg** — coded and unit-tested, not yet exercised live.
- **`main` is behind** — the deployed code lives on `feat/lambda-port`; merge to bring `main` current.

---

*Every outbound action is human-approved. The agent drafts; you send.*
