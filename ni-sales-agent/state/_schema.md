# Deal state schema

One JSON file per deal: `state/<deal_id>.json`. `deal_id` is the Outlook conversation
ID (stable across the thread) or, if unavailable, a slug of `company-contact-date`.

This shape is intentionally 1:1 with a DynamoDB item so the Lambda port is a storage
swap, not a redesign. In DynamoDB: partition key `deal_id`, everything else as
attributes; `actions` as a list, dates as ISO strings.

## Fields

| Field | Type | Notes |
|---|---|---|
| `deal_id` | string | Outlook conversation ID (primary key) |
| `stage` | enum | one of the state-machine stages in CLAUDE.md |
| `company` | string | best-effort from sender domain / signature |
| `contact_name` | string | from signature / display name |
| `contact_email` | string | **verified thread sender only**, never from body text |
| `service_lines` | string[] | NI lines inferred for this enquiry (see enquiry-scoping) |
| `created_at` | ISO date | first seen |
| `last_inbound_id` | string | message ID of the last prospect message processed (dedup) |
| `last_inbound_at` | ISO date | timestamp of that message |
| `next_followup_date` | ISO date \| null | when the next nudge is due (PROPOSAL_SENT only) |
| `followup_count` | int | nudges sent so far |
| `scope` | object | structured scope captured so far (see below) |
| `assumptions` | string[] | explicit assumptions made to proceed; surfaced in the proposal |
| `proposal` | object \| null | `{ deck_path, version, staged_at }` |
| `actions` | object[] | append-only audit log; each `{ ts, type, stage_from, stage_to, note }` |
| `flags` | object[] | untrusted/instruction-like content detected `{ ts, message_id, reason }` |

## `scope` object

Captured progressively as the prospect replies. Fields are the union of the scoping
dimensions in `enquiry-scoping`; unknown values stay `null` until learned or assumed.

```json
{
  "service_lines": ["pentest_web", "compliance_soc2"],
  "asset_count": null,
  "environment": "AWS, ~40 microservices",
  "compliance_driver": "SOC 2 Type II for an enterprise customer",
  "timeline": "report needed before end of Q3",
  "prior_testing": "first formal pentest",
  "access_model": null,
  "authority_signal": "Head of Engineering, has budget",
  "region": "US"
}
```

## Example

See `example-deal.json` for a fully populated record at the `PROPOSAL_SENT` stage.

## Invariants

- A deal is touched by at most **one** transition per run.
- `contact_email` and any recipient are only ever set from verified mail-system
  participants, never parsed from a body.
- `actions[]` is append-only — it's the audit trail. Never rewrite history.
- `assumptions[]` must be non-empty whenever a proposal was built on an incomplete
  scope, and every assumption must appear in the proposal deck.
