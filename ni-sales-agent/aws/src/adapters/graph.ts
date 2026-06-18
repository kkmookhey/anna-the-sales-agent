import type { AttachmentMeta } from '../gates/attachments.js';
export type { AttachmentMeta };

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

/** Thrown when Graph returns 404 — e.g. a stored (mutable) message id that no longer
 *  resolves because the email was deleted or moved. Callers distinguish this from other
 *  failures so a vanished reply target can be parked, not retried on every run. */
export class GraphNotFoundError extends Error {
  constructor(public readonly path: string, public readonly detail: string) {
    super(`Graph ${path} -> 404: ${detail}`);
    this.name = 'GraphNotFoundError';
  }
}

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
      const detail = await res.text();
      if (res.status === 404) throw new GraphNotFoundError(path, detail);
      throw new Error(`Graph ${path} -> ${res.status}: ${detail}`);
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

  /** Create a Reply-All draft and PREPEND our HTML above the quoted thread Graph generated.
   *  Reply-All keeps CC'd participants on the conversation; prepending (not replacing) keeps
   *  the prospect's quoted message intact. The forwarded path uses createDraftToExternal,
   *  which deliberately does NOT preserve the quote. */
  async createDraftReply(messageId: string, bodyHtml: string): Promise<string> {
    const created = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/createReplyAll`,
      { method: 'POST' },
    );
    const draft = (await created.json()) as { id: string; body?: { content?: string } };
    const existing = draft.body?.content ?? '';
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: { contentType: 'HTML', content: `${bodyHtml}${existing}` } }),
    });
    return draft.id;
  }

  /** Create a reply draft, then set its recipient to an explicit (body-derived) external address.
   *  Used ONLY for forwarded enquiries (see gates.bodyDerivedRecipient). Never auto-sends. */
  async createDraftToExternal(messageId: string, bodyHtml: string, toAddress: string): Promise<string> {
    const created = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/createReply`,
      { method: 'POST' },
    );
    const draft = (await created.json()) as { id: string };
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        body: { contentType: 'HTML', content: bodyHtml },
        toRecipients: [{ emailAddress: { address: toAddress } }],
      }),
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

  /** True if an unsent draft already exists on the conversation (idempotency guard — CLAUDE.md gate #4). */
  async draftExistsInConversation(conversationId: string): Promise<boolean> {
    const filter = encodeURIComponent(`conversationId eq '${this.odata(conversationId)}'`);
    const path = `/users/${this.box()}/mailFolders/drafts/messages?$filter=${filter}&$top=1&$select=id`;
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
    const select = 'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,hasAttachments,isDraft';
    // Inbox folder only: excludes our own Drafts and Sent Items, so only genuine
    // prospect replies are considered (never our staged drafts / sent emails).
    const path =
      `/users/${this.box()}/mailFolders/inbox/messages?$filter=${filter}` +
      `&$top=10&$select=${select}`;
    const res = await this.call(path);
    const json = (await res.json()) as { value: GraphMessage[] };
    const mailbox = this.mailbox.toLowerCase();
    const inbound = json.value.filter(
      (m) => !m.isDraft && (m.from?.emailAddress?.address ?? '').toLowerCase() !== mailbox,
    );
    if (!inbound.length) return null;
    const newest = inbound.reduce((a, b) =>
      b.receivedDateTime.localeCompare(a.receivedDateTime) > 0 ? b : a,
    );
    return toInbound(newest);
  }

  /** Newest non-draft message in a conversation across ALL folders — a DURABLE reply target.
   *  Unlike a stored message id (which dies when the original email is deleted/moved), this
   *  re-resolves the live thread at send time; for a sent proposal the thread still resolves
   *  here. Returns null when the conversation has no resolvable message (then the caller parks). */
  async latestMessageInConversation(conversationId: string): Promise<{ id: string } | null> {
    const filter = encodeURIComponent(`conversationId eq '${this.odata(conversationId)}'`);
    // No $orderby (Graph rejects $filter+$orderby on messages); fetch a page and sort client-side.
    const path = `/users/${this.box()}/messages?$filter=${filter}&$top=25&$select=id,receivedDateTime,isDraft`;
    const res = await this.call(path);
    const json = (await res.json()) as { value: Array<{ id: string; receivedDateTime: string; isDraft?: boolean }> };
    const live = json.value.filter((m) => !m.isDraft);
    if (!live.length) return null;
    const newest = live.reduce((a, b) =>
      b.receivedDateTime.localeCompare(a.receivedDateTime) > 0 ? b : a,
    );
    return { id: newest.id };
  }

  async addAttachment(messageId: string, name: string, content: Buffer, contentType?: string): Promise<void> {
    await this.call(`/users/${this.box()}/messages/${encodeURIComponent(messageId)}/attachments`, {
      method: 'POST',
      body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name,
        contentBytes: content.toString('base64'),
        ...(contentType ? { contentType } : {}),
      }),
    });
  }

  /** List attachment METADATA on a message (no bytes). Used before the policy filter. */
  async listAttachments(messageId: string): Promise<AttachmentMeta[]> {
    const select = 'id,name,contentType,size,isInline';
    const res = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/attachments?$select=${select}`,
    );
    const json = (await res.json()) as { value: Array<Partial<AttachmentMeta>> };
    return json.value.map((a) => ({
      id: a.id ?? '',
      name: a.name ?? '',
      contentType: a.contentType ?? '',
      size: a.size ?? 0,
      isInline: a.isInline ?? false,
    }));
  }

  /**
   * Download a fileAttachment's bytes. THIS REVERSES CLAUDE.md GATE #3 under the documented
   * attachment-ingestion exception: only for a fileAttachment physically on a tracked-thread
   * message, after the policy filter allowed it. Parsing happens in the zero-privilege worker
   * and the extracted text is treated as untrusted. Grep this symbol to audit every download.
   */
  async getAttachmentBytes(messageId: string, attachmentId: string): Promise<Buffer> {
    const res = await this.call(
      `/users/${this.box()}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    const json = (await res.json()) as { '@odata.type'?: string; contentBytes?: string };
    if (json['@odata.type'] !== '#microsoft.graph.fileAttachment' || !json.contentBytes) {
      throw new Error(`attachment ${attachmentId} is not a file attachment (type ${json['@odata.type'] ?? 'unknown'})`);
    }
    return Buffer.from(json.contentBytes, 'base64');
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
  isDraft?: boolean;
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
