import { describe, it, expect } from 'vitest';
import { JOST_400, JOST_600, ROBOTO_400, ROBOTO_500, NI_LOGO_PNG } from '../../src/render/assets.generated.js';

const isB64 = (s: string) => s.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(s);

describe('render assets', () => {
  it('exposes non-empty base64 woff2 + logo constants', () => {
    for (const c of [JOST_400, JOST_600, ROBOTO_400, ROBOTO_500, NI_LOGO_PNG]) {
      expect(isB64(c)).toBe(true);
    }
  });
});
