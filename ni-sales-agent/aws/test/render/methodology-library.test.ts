import { describe, it, expect } from 'vitest';
import { methodologyFor, ADVISE_LOOP, LIBRARY_KEYS } from '../../src/render/methodology-library.js';

describe('methodology-library', () => {
  it('has the core service lines, each with phases and frameworks', () => {
    for (const k of ['pentest_web', 'pentest_api', 'pentest_mobile', 'pentest_network',
                     'red_team', 'cloud_security', 'config_review', 'compliance']) {
      const m = methodologyFor(k);
      expect(m.phases.length).toBeGreaterThanOrEqual(4);
      expect(m.frameworks.length).toBeGreaterThanOrEqual(2);
      expect(m.aiAugmentation.length).toBeGreaterThan(10);
      expect(LIBRARY_KEYS).toContain(k);
    }
  });

  it('falls back to GENERIC for an unknown line but keeps the requested key label', () => {
    const m = methodologyFor('exotic_unlisted_service');
    expect(m.phases.length).toBeGreaterThanOrEqual(4);
    expect(m.frameworks.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes the ADVISE operating loop', () => {
    expect(ADVISE_LOOP.length).toBe(6);
    expect(ADVISE_LOOP[0].name).toBe('Assess');
  });
});
