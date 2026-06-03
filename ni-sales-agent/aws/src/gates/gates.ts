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

/**
 * DELIBERATELY UNVERIFIED recipient extracted from an email BODY (forwarded enquiry only).
 * This bypasses participant verification on purpose — its safety rests on the draft-and-hold
 * gate (no auto-send) plus a mandatory Slack flag at the call site. Do not use for the normal
 * reply path; use verifiedRecipient there. Grep this symbol to audit every body-derived recipient.
 */
export function bodyDerivedRecipient(candidate: string): string {
  const email = bareEmail(candidate);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`bodyDerivedRecipient: not a usable email: ${candidate}`);
  }
  return email;
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
