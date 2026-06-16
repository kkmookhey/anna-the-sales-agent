import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildCommercialsLetterhead } from '../../src/render/commercials-letterhead.js';
import { ENTITIES } from '../../src/render/legal-entities.js';
import type { ProposalContent } from '../../src/proposal/types.js';

function content(overrides: Partial<ProposalContent> = {}): ProposalContent {
  return {
    company: 'Acme & Co', contactName: 'Jane Roe', serviceLines: ['pentest_web'],
    titleLine: 'X', understanding: [], scopeRows: [], assumptions: [], approach: [],
    deliverables: [], timeline: '4 weeks', whyNi: [], credentials: [], transilienceEdge: [],
    commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed.' },
    nextSteps: [], understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
    effort: {
      lines: [{ serviceLine: 'pentest_web', basis: '2 web apps', manDays: 6 }],
      totalManDays: 6, aiLeverageNote: 'Delivered AI-augmented via Transilience.', isLarge: false,
    },
    ...overrides,
  };
}

async function bodyText(buf: Buffer): Promise<{ zip: JSZip; doc: string }> {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file('word/document.xml')!.async('string');
  return { zip, doc };
}

describe('buildCommercialsLetterhead', () => {
  it('preserves the letterhead header + logo image and the section properties', async () => {
    const { zip, doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.INDIA));
    expect(zip.file('word/header2.xml')).toBeTruthy();
    expect(zip.file('word/media/image1.emf')).toBeTruthy();
    expect(doc).toContain('<w:sectPr');                    // header/footer bindings preserved
    expect(doc).toContain('w:type="default" r:id="rId8"');
  });

  it('renders the India entity with GST and NOT VAT', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.INDIA));
    expect(doc).toContain('27AABCN6183F1ZE');
    expect(doc).toContain('GST');
    expect(doc).not.toContain('VAT');
    expect(doc).toContain('jurisdiction of the courts at Mumbai');
  });

  it('renders the Middle East entity with VAT and NOT GST', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.MEA));
    expect(doc).toContain('104043215300003');
    expect(doc).toContain('VAT');
    expect(doc).not.toContain('GST');
    expect(doc).not.toContain('27AABCN6183F1ZE');
  });

  it('renders the US entity with no tax id at all', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.US));
    expect(doc).not.toContain('VAT');
    expect(doc).not.toContain('GST:');
    expect(doc).toContain('Network Intelligence LLC');
  });

  it('includes the effort table rows, the total, and escapes the company name', async () => {
    const { doc } = await bodyText(await buildCommercialsLetterhead(content(), ENTITIES.INDIA));
    expect(doc).toContain('2 web apps');
    expect(doc).toContain('Total');
    expect(doc).toContain('Acme &amp; Co');                // XML-escaped, no raw &
    expect(doc).not.toContain('Acme & Co');
  });
});
