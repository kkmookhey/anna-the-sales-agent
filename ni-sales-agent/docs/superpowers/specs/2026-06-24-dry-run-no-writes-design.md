# Design: Make dry-run non-mutating (no persistent writes)

**Date:** 2026-06-24
**Status:** Approved — bugfix
**Author:** KK Mookhey (via Anna build session)

## Problem

`DRY_RUN=true` is meant to be a safe diagnostic ("post the would-be actions to Slack and
stop"), but it still performs persistent writes. In `orchestrator/loop.ts`, only Outlook
**draft creation** is guarded by `!config.dryRun`; the writes next to it are not:

- `repo.putDeal` — ~8 call sites (DynamoDB) advance and persist deal stage in dry-run.
- `s3.put` ×2 (`stageProposal:505-506`) upload the deck + commercials to S3 in dry-run.
- `hubspot.createDeal` (`WRITE_HUBSPOT:353`) writes to the CRM if a SHIP-IT approval is
  detected during a dry run.

This caused a real incident on 2026-06-24: a diagnostic dry-run advanced 5 deals to
`SCOPING_PENDING_APPROVAL` and recorded `scoping_staged` **without creating any drafts** —
phantom deals that then blocked re-staging.

## Fix

Enforce the invariant **"dry-run performs no persistent external write"** at the adapter
seam, not at each call site. Add three small decorators and apply them in `bootstrap.ts`
when `config.dryRun` is true:

- `dryRunRepo(repo)` — `putDeal` and `putMeta` become no-ops; `listDeals`/`getDeal`/`getMeta`
  pass through.
- `dryRunS3(s3)` — `put` becomes a no-op, returning a `s3://dry-run/<key>` pseudo-URI so
  callers still receive a string.
- `dryRunHubspot(hubspot)` — `createDeal` becomes a no-op, returning a `dry-run` pseudo-id.

The loop still mutates its **in-memory** deal objects, so the Slack "would-be" summary is
unchanged — but nothing is persisted. Graph draft creation is left as-is: it is already
guarded at every call site.

**Rejected alternative:** scatter `if (!config.dryRun)` around each write. 10+ edits, easy
to miss one, and the exact pattern that caused the bug. The seam enforces the invariant
centrally so no future call-site can reintroduce the leak.

## Scope of work

- Create `aws/src/dry-run-guards.ts` (three decorators over `RepoPort`/`S3Port`/`HubSpotPort`
  from `orchestrator/loop.ts`).
- Wire into `aws/src/bootstrap.ts`: wrap `repo`/`s3`/`hubspot` when `config.dryRun`.
- `aws/test/dry-run-guards.test.ts`: writes no-op (underlying not called), reads pass
  through, pseudo-return shapes.

No infra change.

## Out of scope

- Wrapping the Graph adapter (its writes are already guarded).
- Changing what dry-run renders or classifies (render/Bedrock have no persistent side
  effect; only the writes above do).
