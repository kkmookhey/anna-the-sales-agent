import { describe, it, expect } from 'vitest';
import { buildCommercialsDocx } from '../../src/render/commercials.js';
import type { ProposalContent } from '../../src/proposal/types.js';

const content = {
  company: 'IICA', contactName: 'IT Department', serviceLines: ['pentest_web', 'compliance'],
  titleLine: 'Web Application Security Audit',
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after a scoping call.' },
} as unknown as ProposalContent;

describe('buildCommercialsDocx', () => {
  it('produces a valid .docx (zip) of reasonable size', async () => {
    const buf = await buildCommercialsDocx(content);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf[0]).toBe(0x50); expect(buf[1]).toBe(0x4b); // PK zip signature
    const head = buf.toString('latin1');
    expect(head).toContain('[Content_Types].xml'); // real OOXML package
  });
});
