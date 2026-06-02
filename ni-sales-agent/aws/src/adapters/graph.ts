export interface GraphCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface InboundMessage {
  id: string;
  conversationId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  participants: string[];
  receivedDateTime: string;
  bodyPreview: string;
  bodyFull: string;
  hasAttachments: boolean;
}

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class GraphClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly creds: GraphCreds,
    private readonly mailbox: string,
  ) {}

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 60_000) return this.token.value;
    const body = new URLSearchParams({
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const res = await fetch(
      `https://login.microsoftonline.com/${this.creds.tenantId}/oauth2/v2.0/token`,
      { method: 'POST', body },
    );
    if (!res.ok) throw new Error(`Graph token error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: now + json.expires_in * 1000 };
    return this.token.value;
  }

  private async call(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.getToken();
    const res = await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Graph ${path} -> ${res.status}: ${await res.text()}`);
    }
    return res;
  }

  private box(): string {
    return encodeURIComponent(this.mailbox);
  }

  private odata(v: string): string {
    return v.replace(/'/g, "''");
  }

  async listInbound(sinceIso: string): Promise<InboundMessage[]> {
    const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
    const select = 'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,hasAttachments';
    const path =
      `/users/${this.box()}/mailFolders/inbox/messages` +
      `?$filter=${filter}&$top=25&$select=${select}`;
    const res = await this.call(path);
    const json = (await res.json()) as { value: GraphMessage[] };
    return json.value
      .map(toInbound)
      .sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
  }

  async createDraftReply(messageId: string, bodyHtml: string): Promise<string> {
    const created = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/createReply`,
      { method: 'POST' },
    );
    const draft = (await created.json()) as { id: string };
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: { contentType: 'HTML', content: bodyHtml } }),
    });
    return draft.id;
  }

  async wasReplySent(conversationId: string, afterIso: string): Promise<boolean> {
    const filter = encodeURIComponent(
      `conversationId eq '${this.odata(conversationId)}' and sentDateTime ge ${afterIso}`,
    );
    const path = `/users/${this.box()}/mailFolders/sentitems/messages?$filter=${filter}&$top=1&$select=id`;
    const res = await this.call(path);
    const json = (await res.json()) as { value: unknown[] };
    return json.value.length > 0;
  }

  async latestInboundInConversation(
    conversationId: string,
    afterIso: string,
  ): Promise<InboundMessage | null> {
    const filter = encodeURIComponent(
      `conversationId eq '${this.odata(conversationId)}' and receivedDateTime gt ${afterIso}`,
    );
    const select = 'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,hasAttachments';
    const path =
      `/users/${this.box()}/messages?$filter=${filter}` +
      `&$top=10&$select=${select}`;
    const res = await this.call(path);
    const json = (await res.json()) as { value: GraphMessage[] };
    if (!json.value.length) return null;
    const newest = json.value.reduce((a, b) =>
      b.receivedDateTime.localeCompare(a.receivedDateTime) > 0 ? b : a,
    );
    return toInbound(newest);
  }

  async addAttachment(messageId: string, name: string, content: Buffer): Promise<void> {
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(messageId)}/attachments`, {
      method: 'POST',
      body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name,
        contentBytes: content.toString('base64'),
      }),
    });
  }
}

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  ccRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime: string;
  bodyPreview: string;
  body?: { contentType?: string; content?: string };
  hasAttachments: boolean;
}

function toInbound(m: GraphMessage): InboundMessage {
  const fromAddress = (m.from?.emailAddress?.address ?? '').toLowerCase();
  const recipients = [
    ...(m.toRecipients ?? []),
    ...(m.ccRecipients ?? []),
  ].map((r) => (r.emailAddress?.address ?? '').toLowerCase());
  const participants = [fromAddress, ...recipients].filter(Boolean);
  return {
    id: m.id,
    conversationId: m.conversationId,
    subject: m.subject ?? '',
    fromName: m.from?.emailAddress?.name ?? '',
    fromAddress,
    participants,
    receivedDateTime: m.receivedDateTime,
    bodyPreview: m.bodyPreview ?? '',
    bodyFull: m.body?.content ?? '',
    hasAttachments: m.hasAttachments,
  };
}
