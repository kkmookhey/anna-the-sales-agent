import { describe, it, expect } from 'vitest';
import { selectDeepReferences } from '../../src/judgment/deep-references.js';

describe('selectDeepReferences', () => {
  it('maps offensive-security lines to the pentester deep file', () => {
    expect(selectDeepReferences(['penetration testing'])).toEqual(['deep/autonomous-pentester']);
    expect(selectDeepReferences(['VAPT'])).toEqual(['deep/autonomous-pentester']);
    expect(selectDeepReferences(['red team'])).toEqual(['deep/autonomous-pentester']);
  });

  it('maps brand / dark-web lines to the brand-darkweb deep file', () => {
    expect(selectDeepReferences(['brand monitoring'])).toEqual(['deep/brand-darkweb']);
    expect(selectDeepReferences(['dark web monitoring'])).toEqual(['deep/brand-darkweb']);
  });

  it('maps briefing lines to the ciso-threat-briefing deep file', () => {
    expect(selectDeepReferences(['CISO threat briefing'])).toEqual(['deep/ciso-threat-briefing']);
  });

  it('returns [] when nothing matches', () => {
    expect(selectDeepReferences(['mdr'])).toEqual([]);
    expect(selectDeepReferences([])).toEqual([]);
  });

  it('de-duplicates when multiple lines map to the same file', () => {
    expect(selectDeepReferences(['vapt', 'penetration testing'])).toEqual(['deep/autonomous-pentester']);
  });

  it('caps the result at two deep files, in priority order', () => {
    expect(selectDeepReferences(['red team', 'brand monitoring', 'CISO threat briefing']))
      .toEqual(['deep/autonomous-pentester', 'deep/brand-darkweb']);
  });
});
