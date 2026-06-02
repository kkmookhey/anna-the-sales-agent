import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DealRepo } from '../../src/state/repo.js';
import type { Deal } from '../../src/state/types.js';

const send = vi.fn();
const fakeDoc = { send } as unknown as import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient;

const deal: Deal = {
  deal_id: 'conv-1', stage: 'NEW', company: 'Acme', contact_name: 'Sam',
  contact_email: 'sam@acme.example', service_lines: [], created_at: '2026-06-02T00:00:00Z',
  last_inbound_id: 'm1', last_inbound_at: '2026-06-02T00:00:00Z', next_followup_date: null,
  followup_count: 0, scope: { service_lines: [], asset_count: null, environment: null,
    compliance_driver: null, timeline: null, prior_testing: null, access_model: null,
    authority_signal: null, region: null }, assumptions: [], proposal: null, actions: [], flags: [],
};

describe('DealRepo', () => {
  beforeEach(() => send.mockReset());

  it('getDeal returns the item or null', async () => {
    send.mockResolvedValueOnce({ Item: deal });
    const repo = new DealRepo(fakeDoc, 'deals');
    expect(await repo.getDeal('conv-1')).toEqual(deal);

    send.mockResolvedValueOnce({});
    expect(await repo.getDeal('missing')).toBeNull();
  });

  it('listDeals scans and returns all items', async () => {
    send.mockResolvedValueOnce({ Items: [deal], LastEvaluatedKey: undefined });
    const repo = new DealRepo(fakeDoc, 'deals');
    expect(await repo.listDeals()).toEqual([deal]);
  });

  it('putDeal writes the item with the table name', async () => {
    send.mockResolvedValueOnce({});
    const repo = new DealRepo(fakeDoc, 'deals');
    await repo.putDeal(deal);
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('deals');
    expect(cmd.input.Item).toEqual(deal);
  });

  it('putMeta/getMeta round-trips a value under a _meta key', async () => {
    send.mockResolvedValueOnce({});
    const repo = new DealRepo(fakeDoc, 'deals');
    await repo.putMeta('canvas_id', 'F123');
    expect(send.mock.calls[0]![0].input.Item).toEqual({ deal_id: '_meta#canvas_id', value: 'F123' });

    send.mockResolvedValueOnce({ Item: { deal_id: '_meta#canvas_id', value: 'F123' } });
    expect(await repo.getMeta('canvas_id')).toBe('F123');
  });

  it('listDeals excludes _meta# items', async () => {
    send.mockResolvedValueOnce({
      Items: [deal, { deal_id: '_meta#canvas_id', value: 'F123' }],
      LastEvaluatedKey: undefined,
    });
    const repo = new DealRepo(fakeDoc, 'deals');
    const out = await repo.listDeals();
    expect(out).toEqual([deal]);
  });
});
