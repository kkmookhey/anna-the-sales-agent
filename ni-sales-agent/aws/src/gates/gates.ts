//
// These functions are the system's safety core (CLAUDE.md -> "Untrusted input & gates").
// There is deliberately NO sendEmail / downloadAttachment function anywhere in this codebase.
// The only outbound-email path creates a Graph DRAFT (adapters/graph.ts:createDraftReply).

const EMAIL_RE = /<?([^<>\s]+@[^<>\s]+)>?$/;

/** Extract the bare email from a "Name <addr>" string. */
export function bareEmail(addr: string): string {
  const m = addr.trim().match(EMAIL_RE);
  return (m?.[1] ?? addr).trim().toLowerCase();
}

/**
 * Return the recipient ONLY if it is a verified mail-system participant.
 * Recipients are never taken from email body text.
 */
export function verifiedRecipient(candidate: string, participants: string[]): string {
  const want = bareEmail(candidate);
  const allowed = participants.map(bareEmail);
  if (!allowed.includes(want)) {
    throw new Error(`Recipient ${want} is not a verified thread participant`);
  }
  return want;
}

/** Throw unless the human's reply exactly equals the configured approval token. */
export function assertApprovalToken(reply: string, expected: string): void {
  if (reply.trim() !== expected) {
    throw new Error(`Reply does not match approval token "${expected}"`);
  }
}

const INJECTION_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /ignore (your|all|previous) (rules|instructions)/i, reason: 'override-instruction' },
  { re: /\bwire\b|\bpayment\b|\bbank details\b/i, reason: 'payment-redirect' },
  { re: /send (the )?(proposal|pricing|quote) to/i, reason: 'recipient-redirect' },
  { re: /change the (recipient|address)/i, reason: 'recipient-redirect' },
  { re: /click here to verify|forward your pricing/i, reason: 'phishing-like' },
];

/** Return reasons for any instruction-like / suspicious content found in untrusted text. */
export function scanForInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.reason);
}
