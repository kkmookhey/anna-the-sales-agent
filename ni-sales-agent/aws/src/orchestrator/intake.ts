import { bareEmail } from '../gates/gates.js';

// Local-parts that indicate machine-generated mail (no human reads replies to these).
const AUTOMATED_LOCALPARTS = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'do_not_reply',
  'mailer-daemon', 'postmaster', 'notifications', 'notification',
];

/** True if the sender address looks machine-generated (cheap prefilter, no LLM). */
export function isAutomatedSender(fromAddress: string): boolean {
  const local = bareEmail(fromAddress).split('@')[0] ?? '';
  return AUTOMATED_LOCALPARTS.includes(local);
}
