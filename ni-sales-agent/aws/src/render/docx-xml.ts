// Minimal WordprocessingML emitters for splicing body content into a letterhead template.
// These produce raw OOXML strings; callers concatenate them and insert before <w:sectPr>.

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function run(text: string, opts: { bold?: boolean; size?: number } = {}): string {
  const rpr =
    opts.bold || opts.size
      ? `<w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ''}</w:rPr>`
      : '';
  return `<w:r>${rpr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

export function para(text: string, opts: { bold?: boolean; size?: number } = {}): string {
  return `<w:p>${run(text, opts)}</w:p>`;
}

export function heading(text: string): string {
  return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${run(text, { bold: true, size: 26 })}</w:p>`;
}

export function title(text: string): string {
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${run(text, { bold: true, size: 36 })}</w:p>`;
}

// Bullet list uses Word's default bullet numbering definition id 1 — present in the
// letterhead template's numbering.xml. If absent at render time the text still shows,
// just without the glyph, so this is safe.
export function bullet(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
}

function cell(text: string, opts: { bold?: boolean } = {}): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(text, opts)}</w:tc>`;
}

export function table(headers: string[], rows: string[][]): string {
  const borders =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
      .join('') +
    '</w:tblBorders>';
  const tblPr = `<w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>`;
  const headerRow = `<w:tr>${headers.map((h) => cell(h, { bold: true })).join('')}</w:tr>`;
  const bodyRows = rows.map((r) => `<w:tr>${r.map((c) => cell(c)).join('')}</w:tr>`).join('');
  return `<w:tbl>${tblPr}${headerRow}${bodyRows}</w:tbl>`;
}
