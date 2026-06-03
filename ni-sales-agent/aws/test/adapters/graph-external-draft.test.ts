import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphClient } from '../../src/adapters/graph.js';

function mockFetchSequence(responses: Array<{ ok?: boolean; status?: number; json: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json,
      text: async () => JSON.stringify(r.json),
    });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

const creds = { tenantId: 't', clientId: 'c', clientSecret: 's' };

describe('createDraftToExternal', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('creates a reply draft and sets toRecipients to the external prospect', async () => {
    // fetch sequence:
    // 1. token acquisition
    // 2. POST /createReply → returns draft { id: 'draft-1' }
    // 3. PATCH /messages/draft-1 → sets body + toRecipients
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { id: 'draft-1' } },
      { json: {} },
    ]);

    const g = new GraphClient(creds, 'sales@x.com');
    const id = await g.createDraftToExternal('msg-1', '<p>hi</p>', 'priya@acmebank.com');

    expect(id).toBe('draft-1');

    // Three fetch calls total: token, createReply POST, draft PATCH
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, postUrl, postInit] = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(postUrl).toContain('createReply');
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe('POST');

    const patchInit = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(patchInit.method).toBe('PATCH');
    const patchBody = JSON.parse(patchInit.body as string) as Record<string, unknown>;
    expect(patchBody).toMatchObject({
      body: { contentType: 'HTML', content: '<p>hi</p>' },
      toRecipients: [{ emailAddress: { address: 'priya@acmebank.com' } }],
    });
  });
});
