import { describe, it, expect } from 'vitest';
import { loadSkill, loadContent } from '../../src/judgment/skills.js';

describe('loadSkill', () => {
  it('loads the enquiry-scoping skill markdown', () => {
    const md = loadSkill('enquiry-scoping');
    expect(md).toContain('Enquiry Scoping');
    expect(md).toContain('Service catalog');
  });

  it('throws for an unknown skill', () => {
    expect(() => loadSkill('does-not-exist')).toThrow(/does-not-exist/);
  });

  it('loads the capability library content file', () => {
    const lib = loadContent('capability-library');
    expect(lib).toContain('Capability Library');
    expect(lib).toContain('PCI PIN Assessor');
  });
});
