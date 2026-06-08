import { describe, it, expect } from 'vitest';
import { serviceLineLabel } from '../../src/render/labels.js';

describe('serviceLineLabel', () => {
  it('maps known keys to human labels', () => {
    expect(serviceLineLabel('pentest_web')).toBe('Web Application VAPT');
    expect(serviceLineLabel('pentest_mobile')).toBe('Mobile Application VAPT');
    expect(serviceLineLabel('mdr')).toBe('Managed Detection & Response');
    expect(serviceLineLabel('compliance')).toBe('Compliance & Audit');
  });
  it('falls back to a title-cased version of unknown keys', () => {
    expect(serviceLineLabel('cloud_security')).toBe('Cloud Security');
    expect(serviceLineLabel('red_team')).toBe('Red Team');
  });
});
