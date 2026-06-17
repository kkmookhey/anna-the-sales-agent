import { describe, it, expect } from 'vitest';
import * as A from '../../src/render/assets.generated.js';

const b64 = (s: string) => s.length > 500 && /^[A-Za-z0-9+/=]+$/.test(s);

describe('design-system generated assets', () => {
  it('exposes all required font weights as base64', () => {
    for (const k of ['JOST_300','JOST_400','JOST_500','JOST_600','JOST_700','ROBOTO_300','ROBOTO_400','ROBOTO_500','ROBOTO_700','MONO_400','MONO_500']) {
      expect(b64((A as Record<string,string>)[k] ?? ''), k).toBe(true);
    }
  });
  it('exposes the design-system CSS + JS + logo strings', () => {
    expect(A.COLORS_CSS).toContain('--tr-crimson');
    expect(A.COLORS_CSS).not.toContain('fonts.googleapis.com');
    expect(A.DECK_CSS).toContain('.slide');
    expect(A.PROPOSAL_CSS).toContain('.pillar-card');
    expect(A.DECK_STAGE_JS).toContain('deck-stage');
    expect(A.LUCIDE_JS.length).toBeGreaterThan(1000);
    expect(A.LOGO_MARK_SVG).toContain('<svg');
  });
  it('inlines the Slice 2 methodology diagram components', () => {
    expect(A.PROPOSAL_CSS).toContain('.flow-band');
    expect(A.PROPOSAL_CSS).toContain('.coverage-table');
    expect(A.PROPOSAL_CSS).toContain('.crosswalk-matrix');
    expect(A.PROPOSAL_CSS).toContain('.funnel');
    expect(A.PROPOSAL_CSS).toContain('.day-timeline');
    expect(A.PROPOSAL_CSS).toContain('.fw-tag');
  });
});
