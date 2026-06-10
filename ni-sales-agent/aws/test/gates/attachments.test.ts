import { describe, it, expect } from 'vitest';
import { decideAttachment, MAX_FILE_BYTES, MAX_FILES_PER_MESSAGE, type AttachmentMeta } from '../../src/gates/attachments.js';

const meta = (over: Partial<AttachmentMeta>): AttachmentMeta => ({
  id: 'a1', name: 'rfp.pdf', contentType: 'application/pdf', size: 1000, isInline: false, ...over,
});

describe('decideAttachment', () => {
  it('allows pdf/docx/xlsx/csv within the size cap', () => {
    for (const name of ['rfp.pdf', 'rfp.docx', 'scope.xlsx', 'scope.csv']) {
      expect(decideAttachment(meta({ name })).parse).toBe(true);
    }
  });
  it('refuses legacy binary office formats', () => {
    for (const name of ['old.doc', 'old.xls', 'deck.ppt']) {
      const d = decideAttachment(meta({ name }));
      expect(d.parse).toBe(false);
      expect(d.reason).toMatch(/legacy|unsupported/i);
    }
  });
  it('refuses macro-enabled formats', () => {
    for (const name of ['m.docm', 'm.xlsm', 'm.pptm']) {
      expect(decideAttachment(meta({ name })).parse).toBe(false);
    }
  });
  it('refuses an oversized file', () => {
    const d = decideAttachment(meta({ size: MAX_FILE_BYTES + 1 }));
    expect(d.parse).toBe(false);
    expect(d.reason).toMatch(/size|large/i);
  });
  it('refuses zero-byte and inline attachments', () => {
    expect(decideAttachment(meta({ size: 0 })).parse).toBe(false);
    expect(decideAttachment(meta({ isInline: true })).parse).toBe(false);
  });
  it('refuses unknown extensions', () => {
    expect(decideAttachment(meta({ name: 'thing.zip' })).parse).toBe(false);
  });
  it('exposes a sane file-count cap', () => {
    expect(MAX_FILES_PER_MESSAGE).toBeGreaterThan(0);
    expect(MAX_FILE_BYTES).toBeLessThanOrEqual(4_500_000);
  });
});
