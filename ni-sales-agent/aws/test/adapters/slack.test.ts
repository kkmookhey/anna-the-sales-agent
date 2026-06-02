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
});
