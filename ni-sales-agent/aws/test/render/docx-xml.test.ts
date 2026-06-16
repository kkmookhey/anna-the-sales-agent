import { describe, it, expect } from 'vitest';
import { xmlEscape, para, heading, bullet, table } from '../../src/render/docx-xml.js';

describe('docx-xml emitters', () => {
  it('escapes XML-significant characters', () => {
    expect(xmlEscape('a & b < c > d " e')).toBe('a &amp; b &lt; c &gt; d &quot; e');
  });

  it('emits a paragraph run with escaped text', () => {
    const xml = para('Liability & scope');
    expect(xml).toContain('<w:p>');
    expect(xml).toContain('<w:t xml:space="preserve">Liability &amp; scope</w:t>');
  });

  it('emits a heading with bold styling', () => {
    expect(heading('Payment terms')).toContain('<w:b/>');
    expect(heading('Payment terms')).toContain('Payment terms');
  });

  it('emits a bullet paragraph referencing a numbering id', () => {
    expect(bullet('one exclusion')).toContain('<w:numPr>');
  });

  it('emits a table with a header row and one body row', () => {
    const xml = table(['Service line', 'Effort (man-days)'], [['Web App VAPT', '6']]);
    expect(xml.startsWith('<w:tbl>')).toBe(true);
    expect(xml).toContain('<w:tblBorders>');
    expect(xml).toContain('Service line');
    expect(xml).toContain('Web App VAPT');
    expect(xml).toContain('preserve">6</w:t>'); // cell value present
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(2); // header + 1 body row
  });
});
