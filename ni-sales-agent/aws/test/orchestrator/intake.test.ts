import { describe, it, expect } from 'vitest';
import { isAutomatedSender } from '../../src/orchestrator/intake.js';

describe('isAutomatedSender', () => {
  it('flags common automated local-parts', () => {
    for (const a of [
      'no-reply@amazon.com', 'noreply@aws.amazon.com', 'donotreply@bank.com',
      'do-not-reply@x.com', 'mailer-daemon@mail.com', 'postmaster@x.com', 'notifications@github.com',
    ]) {
      expect(isAutomatedSender(a)).toBe(true);
    }
  });

  it('does not flag a normal human sender', () => {
    for (const a of ['priya@acmebank.com', 'kk@networkintelligence.ai', 'cto@startup.io']) {
      expect(isAutomatedSender(a)).toBe(false);
    }
  });

  it('is case-insensitive and tolerates display-name form', () => {
    expect(isAutomatedSender('No-Reply@AWS.com')).toBe(true);
    expect(isAutomatedSender('AWS <no-reply@aws.com>')).toBe(true);
  });
});
