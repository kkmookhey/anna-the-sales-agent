import { describe, it, expect } from 'vitest';
import { bodyDerivedRecipient, verifiedRecipient } from '../../src/gates/gates.js';

describe('bodyDerivedRecipient', () => {
  it('returns a normalized email WITHOUT requiring it be a verified participant', () => {
    expect(bodyDerivedRecipient('Priya <Priya@AcmeBank.com>')).toBe('priya@acmebank.com');
  });

  it('rejects an empty/garbage value', () => {
    expect(() => bodyDerivedRecipient('')).toThrow();
    expect(() => bodyDerivedRecipient('not-an-email')).toThrow();
  });

  it('verifiedRecipient still throws for a non-participant (unchanged safety core)', () => {
    expect(() => verifiedRecipient('x@evil.com', ['a@b.com'])).toThrow();
  });
});
