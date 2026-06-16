import { describe, it, expect } from 'vitest';
import { buildCommercialsLetterhead } from '../../src/render/commercials-letterhead.js';
import { ENTITIES } from '../../src/render/legal-entities.js';
import type { ProposalContent } from '../../src/proposal/types.js';

const content: ProposalContent = {
  company: 'IICA', contactName: 'IT Department', serviceLines: ['pentest_web', 'compliance'],
  titleLine: 'Web Application Security Audit',
  understanding: [], scopeRows: [], assumptions: [], approach: [],
  deliverables: [], timeline: '2–3 weeks', whyNi: [], credentials: [], transilienceEdge: [],
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after a scoping call.' },
  nextSteps: [], understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
  effort: { lines: [], totalManDays: 0, aiLeverageNote: '', isLarge: false },
};

describe('buildCommercialsLetterhead (via commercials.test)', () => {
  it('produces a valid .docx (zip) of reasonable size', async () => {
    const buf = await buildCommercialsLetterhead(content, ENTITIES.INDIA);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf[0]).toBe(0x50); expect(buf[1]).toBe(0x4b); // PK zip signature
    const head = buf.toString('latin1');
    expect(head).toContain('[Content_Types].xml'); // real OOXML package
  });
});
