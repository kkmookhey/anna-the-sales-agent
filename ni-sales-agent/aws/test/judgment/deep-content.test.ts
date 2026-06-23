import { describe, it, expect } from 'vitest';
import { loadContent } from '../../src/judgment/skills.js';

const DEEP_FILES: { name: string; anchors: string[] }[] = [
  { name: 'deep/autonomous-pentester', anchors: ['104/104', '118', 'OWASP'] },
  { name: 'deep/brand-darkweb', anchors: ['dark', 'takedown', 'credential'] },
  { name: 'deep/ciso-threat-briefing', anchors: ['CISA KEV', 'Ask My Team', 'board-ready'] },
];

describe('deep-reference content files', () => {
  for (const { name, anchors } of DEEP_FILES) {
    it(`${name} loads, is within the 8KB cap, and contains its grounded anchors`, () => {
      const body = loadContent(name);
      expect(body.length).toBeGreaterThan(500);
      expect(body.length).toBeLessThanOrEqual(8000);
      for (const anchor of anchors) {
        expect(body).toContain(anchor);
      }
    });
  }
});
