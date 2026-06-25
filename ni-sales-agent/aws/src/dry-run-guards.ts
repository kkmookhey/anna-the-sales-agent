import type { RepoPort, S3Port, HubSpotPort } from './orchestrator/loop.js';

// Dry-run decorators: enforce the invariant "a dry run performs no persistent external
// write" at the adapter seam, so no call site in the loop can leak a write. Writes become
// no-ops; reads pass through. The loop still mutates its in-memory deal objects, so the
// Slack "would-be" summary is unchanged — nothing is persisted.

/** Wrap a repo so writes (putDeal/putMeta) are no-ops; reads pass through. */
export function dryRunRepo(repo: RepoPort): RepoPort {
  return {
    listDeals: () => repo.listDeals(),
    getDeal: (id) => repo.getDeal(id),
    getMeta: (key) => repo.getMeta(key),
    putDeal: async () => {},
    putMeta: async () => {},
  };
}

/** Wrap S3 so put is a no-op; returns a pseudo-URI so callers still get a string. */
export function dryRunS3(_s3: S3Port): S3Port {
  return {
    put: async (key: string) => `s3://dry-run/${key}`,
  };
}

/** Wrap HubSpot so createDeal is a no-op; returns a pseudo-id. */
export function dryRunHubspot(_hubspot: HubSpotPort): HubSpotPort {
  return {
    createDeal: async () => 'dry-run',
  };
}
