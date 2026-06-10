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
              body: { contentType: 'html', content: '<p>Full enquiry body here</p>' },
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
    expect(msgs[0]!.bodyFull).toContain('Full enquiry body');
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
            {
              id: 'our-draft', conversationId: 'conv-1', subject: 'Re: VAPT', isDraft: true,
              from: { emailAddress: { address: 'sales@networkintelligence.ai' } },
              toRecipients: [], ccRecipients: [],
              receivedDateTime: '2026-06-02T20:00:00Z', bodyPreview: 'our draft', hasAttachments: false,
            },
            {
              id: 'our-sent', conversationId: 'conv-1', subject: 'Re: VAPT',
              from: { emailAddress: { address: 'sales@networkintelligence.ai' } },
              toRecipients: [], ccRecipients: [],
              receivedDateTime: '2026-06-02T19:00:00Z', bodyPreview: 'our sent', hasAttachments: false,
            },
          ],
        },
      },
    ]);

    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const latest = await g.latestInboundInConversation('conv-1', '2026-06-02T00:00:00Z');

    // 'our-draft' (20:00) and 'our-sent' (19:00) are newer but excluded — returns the real inbound 'new'.
    expect(latest!.id).toBe('new');
    const url = fetchMock.mock.calls[1]![0] as string;
    expect(url).toContain('/mailFolders/inbox/messages');
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

  it('createDraftReply uses Reply-All and prepends our HTML above the quoted thread', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { id: 'draft-9', body: { contentType: 'HTML', content: '<div class="quote">--- original thread ---</div>' } } },
      { json: {} },
    ]);

    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const id = await g.createDraftReply('m1', '<p>Our reply</p>');

    expect(id).toBe('draft-9');
    const createUrl = fetchMock.mock.calls[1]![0] as string;
    expect(createUrl).toContain('/messages/m1/createReplyAll');
    const patchBody = JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string);
    expect(patchBody.body.content).toBe('<p>Our reply</p><div class="quote">--- original thread ---</div>');
  });

  it('createDraftReply tolerates a draft response with no body content', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { id: 'draft-10' } },
      { json: {} },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const id = await g.createDraftReply('m1', '<p>Our reply</p>');
    expect(id).toBe('draft-10');
    const patchBody = JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string);
    expect(patchBody.body.content).toBe('<p>Our reply</p>');
  });

  it('draftExistsInConversation queries the drafts folder, escapes quotes, and returns true when a draft exists', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { value: [{ id: 'existing-draft' }] } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const exists = await g.draftExistsInConversation("conv'1");
    expect(exists).toBe(true);
    const url = fetchMock.mock.calls[1]![0] as string;
    expect(url).toContain('/mailFolders/drafts/messages');
    expect(decodeURIComponent(url)).toContain("conversationId eq 'conv''1'");
  });

  it('draftExistsInConversation returns false when no draft exists', async () => {
    mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { value: [] } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    expect(await g.draftExistsInConversation('conv-2')).toBe(false);
  });

  it('listAttachments returns metadata only (no bytes) via $select', async () => {
    const fetchMock = mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { value: [
        { id: 'att1', name: 'rfp.pdf', contentType: 'application/pdf', size: 1234, isInline: false },
        { id: 'att2', name: 'logo.png', contentType: 'image/png', size: 50, isInline: true },
      ] } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const out = await g.listAttachments('m1');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: 'att1', name: 'rfp.pdf', contentType: 'application/pdf', size: 1234, isInline: false });
    const url = fetchMock.mock.calls[1]![0] as string;
    expect(url).toContain('/messages/m1/attachments');
    expect(decodeURIComponent(url)).toContain('$select=id,name,contentType,size,isInline');
  });

  it('getAttachmentBytes decodes a fileAttachment contentBytes to a Buffer', async () => {
    const payload = Buffer.from('hello pdf bytes', 'utf-8').toString('base64');
    mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { '@odata.type': '#microsoft.graph.fileAttachment', id: 'att1', name: 'rfp.pdf', contentBytes: payload } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    const buf = await g.getAttachmentBytes('m1', 'att1');
    expect(buf.toString('utf-8')).toBe('hello pdf bytes');
  });

  it('getAttachmentBytes rejects a non-file attachment (e.g. itemAttachment)', async () => {
    mockFetchSequence([
      { json: { access_token: 'tok', expires_in: 3600 } },
      { json: { '@odata.type': '#microsoft.graph.itemAttachment', id: 'att1', name: 'forwarded.eml' } },
    ]);
    const g = new GraphClient(creds, 'sales@networkintelligence.ai');
    await expect(g.getAttachmentBytes('m1', 'att1')).rejects.toThrow(/not a file attachment/i);
  });
});
