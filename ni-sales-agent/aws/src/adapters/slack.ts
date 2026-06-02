const SLACK = 'https://slack.com/api';

interface SlackMessage {
  user?: string;
  text?: string;
}

export class SlackClient {
  constructor(private readonly botToken: string) {}

  private async call(method: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`${SLACK}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!json.ok) throw new Error(`Slack ${method} error: ${String(json.error)}`);
    return json;
  }

  async postStaging(channelId: string, text: string, threadTs?: string): Promise<string> {
    const json = await this.call('chat.postMessage', {
      channel: channelId,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });
    return String(json.ts);
  }

  async detectApproval(
    channelId: string,
    threadTs: string,
    token: string,
    approvedUserIds: string[],
  ): Promise<boolean> {
    const json = await this.call('conversations.replies', { channel: channelId, ts: threadTs });
    const messages = (json.messages as SlackMessage[] | undefined) ?? [];
    return messages.some(
      (m) => m.user !== undefined && approvedUserIds.includes(m.user) && (m.text ?? '').trim() === token,
    );
  }
}
