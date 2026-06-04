import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackClient } from '../../src/adapters/slack.js';

function mockFetch(json: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => json });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('SlackClient', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('postStaging posts to the channel and returns the ts', async () => {
    const fetchMock = mockFetch({ ok: true, ts: '1780409450.128559' });
    const slack = new SlackClient('xoxb-test');
    const ts = await slack.postStaging('C1', 'hello');
    expect(ts).toBe('1780409450.128559');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(JSON.parse((init as RequestInit).body as string).channel).toBe('C1');
  });

  it('detectApproval returns true when an approved user replied with the exact token', async () => {
    mockFetch({
      ok: true,
      messages: [
        { user: 'U_OTHER', text: 'looks good' },
        { user: 'U07AN5FR86B', text: 'SHIP-IT' },
      ],
    });
    const slack = new SlackClient('xoxb-test');
    const ok = await slack.detectApproval('C1', '123.456', 'SHIP-IT', ['U07AN5FR86B']);
    expect(ok).toBe(true);
  });

  it('detectApproval ignores the token from an unapproved user', async () => {
    mockFetch({ ok: true, messages: [{ user: 'U_RANDOM', text: 'SHIP-IT' }] });
    const slack = new SlackClient('xoxb-test');
    const ok = await slack.detectApproval('C1', '123.456', 'SHIP-IT', ['U07AN5FR86B']);
    expect(ok).toBe(false);
  });

  it('throws when Slack returns ok:false', async () => {
    mockFetch({ ok: false, error: 'channel_not_found' });
    const slack = new SlackClient('xoxb-test');
    await expect(slack.postStaging('C1', 'hi')).rejects.toThrow(/channel_not_found/);
  });

  it('detectApproval sends a GET request with channel and ts as query params (not a JSON POST)', async () => {
    const fetchMock = mockFetch({
      ok: true,
      messages: [
        { user: 'U_PARENT', text: 'original message' },
        { user: 'U_OK', text: 'SHIP-IT' },
      ],
    });
    const slack = new SlackClient('xoxb-test');
    await slack.detectApproval('C1', '123.456', 'SHIP-IT', ['U_OK']);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('GET');
    const parsedUrl = new URL(url as string);
    expect(parsedUrl.pathname).toBe('/api/conversations.replies');
    expect(parsedUrl.searchParams.get('channel')).toBe('C1');
    expect(parsedUrl.searchParams.get('ts')).toBe('123.456');
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('detectApproval returns true when approved user replied with exact token (via GET)', async () => {
    mockFetch({
      ok: true,
      messages: [
        { user: 'U_PARENT', text: 'original message' },
        { user: 'U_OK', text: 'SHIP-IT' },
      ],
    });
    const slack = new SlackClient('xoxb-test');
    const result = await slack.detectApproval('C1', '123.456', 'SHIP-IT', ['U_OK']);
    expect(result).toBe(true);
  });

  it('detectApproval returns false when no approved user replied with the token (via GET)', async () => {
    mockFetch({
      ok: true,
      messages: [
        { user: 'U_PARENT', text: 'original message' },
        { user: 'U_OTHER', text: 'SHIP-IT' },
      ],
    });
    const slack = new SlackClient('xoxb-test');
    const result = await slack.detectApproval('C1', '123.456', 'SHIP-IT', ['U_OK']);
    expect(result).toBe(false);
  });

  it('upsertCanvas creates a canvas when no id is given and returns the new id', async () => {
    const fetchMock = mockFetch({ ok: true, canvas_id: 'F123' });
    const slack = new SlackClient('xoxb-test');
    const id = await slack.upsertCanvas(null, 'NI Sales — Pipeline', '# board');
    expect(id).toBe('F123');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://slack.com/api/canvases.create');
  });

  it('upsertCanvas edits the existing canvas when an id is given', async () => {
    const fetchMock = mockFetch({ ok: true });
    const slack = new SlackClient('xoxb-test');
    const id = await slack.upsertCanvas('F123', 'NI Sales — Pipeline', '# board v2');
    expect(id).toBe('F123');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://slack.com/api/canvases.edit');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.canvas_id).toBe('F123');
  });
});
