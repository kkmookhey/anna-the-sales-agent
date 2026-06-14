# Anna — NI Sales Agent (v1 prototype)

A semi-autonomous sales-enquiry agent for Network Intelligence. It watches a shared
Outlook mailbox, scopes inbound enquiries, builds branded proposal decks, follows up,
and on PO logs the deal into HubSpot — with a human approving every outbound action.

This is the **prototype** build: it runs as a **Claude Code routine** (scheduled, or
event-triggered) using the MCP connectors you already have wired (Microsoft 365,
HubSpot, Slack). Once the loop and prompts are stable, the same logic ports to a
Lambda — see "Porting to AWS" below.

## What it does (and doesn't)

It does: triage inbound enquiries, draft scoping questions, judge whether a reply is
enough to scope, fill reasonable assumptions, assemble a branded proposal deck, run a
follow-up cadence, and stage a HubSpot deal on PO.

It does **not** send anything to a customer or write to HubSpot on its own. Every
client-facing email and the HubSpot write are **draft-and-hold**: the agent prepares
the artifact and pings you in Slack; you do the irreversible click. That posture is
deliberate for v1 and is the single most important safety property of the system
(see CLAUDE.md → "Untrusted input & gates").

## The loop (one routine run)

```
1. Pull recent messages from the watched Outlook mailbox (M365 connector)
2. Load deal state from state/*.json
3. Match each new inbound message to an existing deal, or open a NEW one
4. For each deal: read its stage, take the ONE allowed transition, invoke the skill
5. Outbound actions are STAGED (Outlook draft + Slack ping), never auto-sent
6. Time-based: deals awaiting a decision get a follow-up drafted when due
7. Write state back; post a run summary to Slack
```

The full decision logic lives in `CLAUDE.md` — that file *is* the routine prompt.

## Components

| Piece | Where | Prototype binding | Lambda binding |
|---|---|---|---|
| Trigger | scheduler | Claude Code routine (cron/event) | EventBridge cron, or Graph webhook → API GW |
| Mailbox I/O | M365 | Microsoft 365 MCP connector | Microsoft Graph API + app registration |
| CRM I/O | HubSpot | HubSpot MCP connector | HubSpot REST API + private app token |
| Notify/approve | Slack | Slack MCP connector | Slack API (incoming webhook / bot token) |
| State | per-deal JSON | `state/*.json` files | DynamoDB, one item per deal |
| Judgment | skills | `skills/*/SKILL.md` | bundled in the deploy package, loaded via Agent SDK |
| Deck render | ni-branded-pptx | existing skill | same skill in the Agent SDK package |

## Skills

- `enquiry-scoping` — turn a raw enquiry into the right scoping questions across the
  full NI service catalog.
- `scope-sufficiency` — decide if a reply is enough to build a proposal; if not,
  what's missing; if borderline, what assumptions to make explicit.
- `proposal-assembly` — turn an agreed scope into a branded deck (delegates to
  `ni-branded-pptx`).
- `deal-followup` — the follow-up cadence and how each nudge is written.

Customer-facing drafts use a professional **NI sales register**, not `kk-voice`.
`kk-voice` is wired as an optional override for enquiries KK answers personally.

## Run it (prototype)

1. Confirm the M365, HubSpot, and Slack connectors are enabled for this routine.
2. Set the config block at the top of `CLAUDE.md` (mailbox address, Slack channel,
   approval token, service catalog owner).
3. Create a Claude Code routine pointed at this repo with the prompt: *"Run the NI
   Sales Agent loop per CLAUDE.md."* Schedule every 15–30 min during business hours.
4. Watch the Slack channel. Approve by sending the Outlook draft / replying with the
   approval token. The agent picks up your action on the next run.

Start it in **dry-run** (config flag) for the first day: it drafts and pings but you
read everything before any real send.

## Porting to AWS (later, not now)

Don't build CloudFormation around prompts you're still tuning. When the loop is
stable:

1. Wrap `CLAUDE.md` + `skills/` in a Claude Agent SDK handler (Python or TS).
2. Swap the three MCP connectors for direct Graph / HubSpot / Slack API calls with
   service credentials in Secrets Manager — for a headless server bot, direct APIs
   are more robust than connector OAuth.
3. Move state from `state/*.json` to DynamoDB (schema is 1:1 — see `state/_schema.md`).
4. Trigger: EventBridge cron to start; graduate to a Graph change-notification
   webhook for true event-driven behavior.
5. Keep the gates. Even in production, the two irreversible boundaries stay
   human-approved until you have real confidence.

## Open items before go-live

- Confirm the service catalog in `skills/enquiry-scoping/SKILL.md` against the real
  NI offering list (it's a first-pass draft, marked EDIT).
- Decide the HubSpot deal stage / pipeline / owner mapping (placeholders in CLAUDE.md).
- Decide whether routine follow-ups can eventually auto-send (they're gated in v1).
