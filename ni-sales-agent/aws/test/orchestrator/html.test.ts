import { describe, it, expect } from 'vitest';
import { htmlToText } from '../../src/orchestrator/loop.js';

describe('htmlToText', () => {
  it('strips tags and decodes the common entities', () => {
    const out = htmlToText('<p>Driver &amp; deadline &lt;urgent&gt; &quot;SOC 2&quot; it&#39;s&nbsp;due</p>');
    expect(out).toBe('Driver & deadline <urgent> "SOC 2" it\'s due');
  });

  it('leaves plain text untouched', () => {
    expect(htmlToText('just text')).toBe('just text');
  });
});
