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

describe('GraphClient', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('fetches a token then lists inbox messages for the shared mailbox', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      {
        json: {
          value: [
            {
              id: 'm1',
              conversationId: 'conv-1',
              subject: 'VAPT Enquiry',
              from: { emailAddress: { name: 'Sam', address: 'sam@acme.example' } },
              toRecipients: [{ emailAddress: { address: 'sales@networkintelligence.ai' } }],
              ccRecipients: [],
              receivedDateTime: '2026-06-02T14:07:28Z',
              bodyPreview: 'Hi',
              hasAttachments: false,
            },
          ],
        },
      },
    ]);

    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const msgs = await g.listInbound('2026-06-02T00:00:00Z');

    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.conversationId).toBe('conv-1');
    expect(msgs[0]!.fromAddress).toBe('sam@acme.example');
    expect(msgs[0]!.participants).toContain('sam@acme.example');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const listUrl = fetchMock.mock.calls[1]![0] as string;
    expect(listUrl).toContain('/users/sales%40networkintelligence.ai/mailFolders/inbox/messages');
    expect(listUrl).toContain('receivedDateTime%20ge%202026-06-02T00%3A00%3A00Z');
  });

  it('latestInboundInConversation returns the newest message via client-side sort and omits $orderby', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      {
        json: {
          value: [
            {
              id: 'old', conversationId: 'conv-1', subject: 'Re: VAPT',
              from: { emailAddress: { name: 'Sam', address: 'sam@acme.example' } },
              toRecipients: [], ccRecipients: [],
              receivedDateTime: '2026-06-02T10:00:00Z', bodyPreview: 'old', hasAttachments: false,
            },
            {
              id: 'new', conversationId: 'conv-1', subject: 'Re: VAPT',
              from: { emailAddress: { name: 'Sam', address: 'sam@acme.example' } },
              toRecipients: [], ccRecipients: [],
              receivedDateTime: '2026-06-02T18:00:00Z', bodyPreview: 'new', hasAttachments: false,
            },
            {
              id: 'mid', conversationId: 'conv-1', subject: 'Re: VAPT',
              from: { emailAddress: { name: 'Sam', address: 'sam@acme.example' } },
              toRecipients: [], ccRecipients: [],
              receivedDateTime: '2026-06-02T14:00:00Z', bodyPreview: 'mid', hasAttachments: false,
            },
          ],
        },
      },
    ]);

    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const latest = await g.latestInboundInConversation('conv-1', '2026-06-02T00:00:00Z');

    expect(latest!.id).toBe('new');
    const url = fetchMock.mock.calls[1]![0] as string;
    expect(url).not.toContain('%24orderby');
  });

  it('escapes single quotes in conversationId for wasReplySent and omits $orderby', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { value: [{ id: 'x' }] } },
    ]);

    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const sent = await g.wasReplySent("conv'1", '2026-06-02T00:00:00Z');

    expect(sent).toBe(true);
    const url = fetchMock.mock.calls[1]![0] as string;
    expect(url).not.toContain('%24orderby');
    expect(decodeURIComponent(url)).toContain("conversationId eq 'conv''1'");
  });

  it('throws a useful error when Graph returns non-ok', async () => {
    mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { ok: false, status: 403, json: { error: { message: 'Access denied' } } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    await expect(g.listInbound('2026-06-02T00:00:00Z')).rejects.toThrow(/403/);
  });

  it('addAttachment posts a base64 fileAttachment to the draft', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: {} },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    await g.addAttachment('draft-1', 'proposal.pptx', Buffer.from('PK'));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toContain('/messages/draft-1/attachments');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body['@odata.type']).toBe('#microsoft.graph.fileAttachment');
    expect(body.name).toBe('proposal.pptx');
    expect(typeof body.contentBytes).toBe('string');
  });
});
