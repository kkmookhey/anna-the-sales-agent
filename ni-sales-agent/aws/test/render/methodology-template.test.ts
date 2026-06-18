import { describe, it, expect } from 'vitest';
import { renderMethodologyHtml } from '../../src/render/methodology-template.js';
import type { ProposalContent, MethodologyContent } from '../../src/proposal/types.js';

function proposal(): ProposalContent {
  return {
    company: 'Demo Bank', contactName: 'A. Buyer', serviceLines: ['pentest_web', 'pentest_api', 'pentest_network'],
    titleLine: 'Security Assessment', understanding: ['u'], scopeRows: [{ line: 'Web', detail: '2 apps' }],
    assumptions: [], approach: [], deliverables: ['Report'], timeline: '3 weeks', whyNi: ['Proven'],
    credentials: ['CREST'], transilienceEdge: [], commercials: { mode: 'placeholder', text: 'TBC' },
    nextSteps: [], understandingStats: [{ value: '2', label: 'apps' }], pillars: [{ title: 'Fit', body: 'b' }],
    signals: [{ title: 'Stack', detail: 'React' }], approachPhases: [], ctaSteps: [{ when: 'Now', title: 'Call', detail: 'd' }],
    effort: { lines: [{ serviceLine: 'pentest_web', basis: '2 apps', manDays: 8 },
                      { serviceLine: 'pentest_api', basis: '1 api', manDays: 5 },
                      { serviceLine: 'pentest_network', basis: '/24', manDays: 6 }],
              totalManDays: 19, aiLeverageNote: 'AI-augmented.', isLarge: true },
    rfp: true,
  };
}
function methodology(): MethodologyContent {
  return {
    operatingLoop: [{ name: 'Assess', detail: 'd' }, { name: 'Implement', detail: 'd' }],
    services: [
      { serviceLine: 'pentest_web', phases: [{ name: 'Recon', detail: 'd' }, { name: 'Report', detail: 'd' }], frameworks: ['OWASP WSTG', 'PTES'], tooling: ['Burp'], aiAugmentation: 'Transilience triage.' },
      { serviceLine: 'pentest_api', phases: [{ name: 'Discover', detail: 'd' }], frameworks: ['OWASP API Top 10'], tooling: ['Postman'], aiAugmentation: 'a' },
      { serviceLine: 'pentest_network', phases: [{ name: 'Enumerate', detail: 'd' }], frameworks: ['NIST SP 800-115', 'MITRE ATT&CK'], tooling: ['Nmap'], aiAugmentation: 'a' },
    ],
    aiHighlights: [{ stat: '16k→10', label: 'prioritized' }, { stat: '95%', label: 'accuracy' }, { stat: '~80%', label: 'noise cut' }],
    crosswalk: [{ area: 'Web', frameworks: ['OWASP WSTG'], evidence: 'Report + retest' }],
    timeline: [{ day: 'Day 1', milestone: 'Kickoff' }, { day: 'Day 19', milestone: 'Final report' }],
    exclusions: ['Remediation is advisory only'],
  };
}

describe('renderMethodologyHtml', () => {
  it('renders a self-contained deck with the methodology sections', () => {
    const html = renderMethodologyHtml(proposal(), methodology());
    expect(html).toContain('<deck-stage');
    expect(html).toContain('flow-band');
    expect(html).toContain('OWASP WSTG');
    expect(html).toContain('funnel');
    expect(html).toContain('crosswalk-matrix');
    expect(html).toContain('day-timeline');
    expect(html).toContain('Day 19');
    expect(html).toContain('Remediation is advisory only');
  });

  it('lands a multi-service large deal in the slide band', () => {
    const html = renderMethodologyHtml(proposal(), methodology());
    const slideCount = (html.match(/<section class="slide/g) ?? []).length;
    expect(slideCount).toBeGreaterThanOrEqual(16); // 13 fixed + 2 per service (×3) = 19
    expect(slideCount).toBeLessThanOrEqual(25);
  });

  it('emits two slides per service line (phases + standards/tooling)', () => {
    const html = renderMethodologyHtml(proposal(), methodology());
    expect(html).toContain('Standards, tooling &amp; AI acceleration.');
    expect(html).toContain('Phase-by-phase approach.');
  });

  it('numbers per-service chapters distinctly (05.1, 05.2, 05.3)', () => {
    const html = renderMethodologyHtml(proposal(), methodology());
    expect(html).toContain('05.1 · Methodology');
    expect(html).toContain('05.2 · Methodology');
    expect(html).toContain('05.3 · Methodology');
  });

  it('derives the funnel figures from the model first highlight (no hardcoded contradiction)', () => {
    const m = methodology();
    m.aiHighlights = [{ stat: '12k→8', label: 'prioritized' }, { stat: '95%', label: 'accuracy' }];
    const html = renderMethodologyHtml(proposal(), m);
    expect(html).toContain('funnel-from">12k<');
    expect(html).toContain('funnel-to">8<');
  });

  it('falls back to the canonical 16k→10 funnel when the first highlight is not arrow-shaped', () => {
    const m = methodology();
    m.aiHighlights = [{ stat: '95%', label: 'accuracy' }];
    const html = renderMethodologyHtml(proposal(), m);
    expect(html).toContain('funnel-from">16k<');
    expect(html).toContain('funnel-to">10<');
  });
});
