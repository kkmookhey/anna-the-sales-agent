import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HubSpotClient } from '../../src/adapters/hubspot.js';

function mockFetch(ok: boolean, json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => json, text: async () => JSON.stringify(json) });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('HubSpotClient', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('createDeal posts deal properties and returns the new id', async () => {
    const fetchMock = mockFetch(true, { id: '99001' });
    const hs = new HubSpotClient('pat-token');
    const id = await hs.createDeal({
      dealname: 'Novelty Wealth — Mobile VAPT',
      pipeline: 'default',
      dealstage: '39235007',
      hubspot_owner_id: '1667576553',
      amount: undefined,
    });
    expect(id).toBe('99001');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.hubapi.com/crm/v3/objects/deals');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.properties.dealstage).toBe('39235007');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer pat-token' });
  });

  it('throws on non-ok with the HubSpot message', async () => {
    mockFetch(false, { message: 'missing scopes' }, 403);
    const hs = new HubSpotClient('pat-token');
    await expect(
      hs.createDeal({ dealname: 'x', pipeline: 'default', dealstage: '39235007', hubspot_owner_id: '1' }),
    ).rejects.toThrow(/403|missing scopes/);
  });
});
