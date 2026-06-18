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

  it('emits paragraph spacing, colour, and a top rule when requested', () => {
    const xml = para('Signatory', { bold: true, size: 22, color: '7A7A7A', before: 600, after: 120, topRule: true });
    expect(xml).toContain('<w:spacing w:before="600" w:after="120"/>');
    expect(xml).toContain('<w:pBdr><w:top w:val="single"'); // faint separator rule
    expect(xml).toContain('<w:color w:val="7A7A7A"/>');
    expect(xml).toContain('<w:sz w:val="22"/>');
  });

  it('omits paragraph properties when no spacing/rule is set (backward compatible)', () => {
    expect(para('plain')).toBe('<w:p><w:r><w:t xml:space="preserve">plain</w:t></w:r></w:p>');
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
