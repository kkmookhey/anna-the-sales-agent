import { describe, it, expect } from 'vitest';
import { handler } from '../../src/render/handler.js';

describe('render handler — parse action', () => {
  it('parses a CSV file passed as base64 and returns text', async () => {
    const bytesBase64 = Buffer.from('item,count\nportal,3\n', 'utf-8').toString('base64');
    const res = await handler({ action: 'parse', file: { name: 'scope.csv', contentType: 'text/csv', bytesBase64 } });
    expect('text' in res).toBe(true);
    if ('text' in res) {
      expect(res.text).toContain('portal');
      expect(res.name).toBe('scope.csv');
      expect(res.truncated).toBe(false);
    }
  });

  it('returns an error result for an unsupported type without throwing', async () => {
    const bytesBase64 = Buffer.from('x').toString('base64');
    const res = await handler({ action: 'parse', file: { name: 'a.bin', contentType: 'application/octet-stream', bytesBase64 } });
    expect('error' in res && res.error).toBeTruthy();
  });

  it('still requires content for a render request (backward compatible)', async () => {
    await expect(handler({} as never)).rejects.toThrow(/missing content/);
  });

  it('returns an error result when a parse event has no file', async () => {
    const res = await handler({ action: 'parse' } as never);
    expect('error' in res && res.error).toBeTruthy();
  });

  it('routes methodology deckType through the methodology template', async () => {
    const content: any = {
      company: 'X', contactName: 'Y', serviceLines: ['pentest_web'], titleLine: 'T',
      understanding: [], scopeRows: [], assumptions: [], approach: [], deliverables: [], timeline: '',
      whyNi: [], credentials: [], transilienceEdge: [], commercials: { mode: 'placeholder', text: '' },
      nextSteps: [], understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
      effort: { lines: [], totalManDays: 12, aiLeverageNote: '', isLarge: true }, rfp: true,
    };
    const methodology: any = {
      operatingLoop: [{ name: 'Assess', detail: 'd' }], services: [], aiHighlights: [],
      crosswalk: [], timeline: [], exclusions: [],
    };
    const res = await handler({ content, deckType: 'methodology', methodology } as any);
    expect('pdfBase64' in res).toBe(true);
  }, 30_000);
});
