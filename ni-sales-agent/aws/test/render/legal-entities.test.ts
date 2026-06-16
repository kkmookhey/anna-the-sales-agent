import { describe, it, expect } from 'vitest';
import { resolveEntity } from '../../src/render/legal-entities.js';

describe('resolveEntity', () => {
  it('maps US / UK / Europe to Network Intelligence LLC with no tax id (USD)', () => {
    for (const r of ['United States', 'us', 'UK', 'Germany', 'Europe', 'EEA']) {
      const { entity, defaulted } = resolveEntity(r);
      expect(entity.key).toBe('us');
      expect(entity.legalName).toBe('Network Intelligence LLC');
      expect(entity.taxValue).toBeNull();
      expect(entity.currency).toBe('USD');
      expect(defaulted).toBe(false);
    }
  });

  it('maps Middle East / Africa to Network Intelligence Middle East LLC with VAT (AED)', () => {
    for (const r of ['UAE', 'Dubai', 'KSA', 'Saudi Arabia', 'Qatar', 'Africa', 'Kenya']) {
      const { entity } = resolveEntity(r);
      expect(entity.key).toBe('mea');
      expect(entity.legalName).toBe('Network Intelligence Middle East LLC');
      expect(entity.taxLabel).toBe('VAT');
      expect(entity.taxValue).toBe('104043215300003');
      expect(entity.currency).toBe('AED');
    }
  });

  it('maps India to Network Intelligence Pvt. Ltd. with GST (INR)', () => {
    const { entity, defaulted } = resolveEntity('India');
    expect(entity.key).toBe('india');
    expect(entity.legalName).toBe('Network Intelligence Pvt. Ltd.');
    expect(entity.taxLabel).toBe('GST');
    expect(entity.taxValue).toBe('27AABCN6183F1ZE');
    expect(entity.currency).toBe('INR');
    expect(defaulted).toBe(false);
  });

  it('defaults unknown / null region to India and flags it', () => {
    for (const r of [null, '', 'Mars', 'somewhere']) {
      const { entity, defaulted } = resolveEntity(r);
      expect(entity.key).toBe('india');
      expect(defaulted).toBe(true);
    }
  });
});
