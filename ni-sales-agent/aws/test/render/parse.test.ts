import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import { parseDocument, MAX_TEXT_CHARS } from '../../src/render/parse.js';

function makePdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
  });
}
async function makeDocx(text: string): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] });
  return Packer.toBuffer(doc);
}
function makeXlsx(rows: string[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scope');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseDocument', () => {
  it('extracts text from a PDF', async () => {
    const buf = await makePdf('SCOPE: 95 mobile screens, CERT-In report');
    const r = await parseDocument({ name: 'rfp.pdf', contentType: 'application/pdf', bytes: buf });
    expect(r.error).toBeUndefined();
    expect(r.text).toContain('95 mobile screens');
  });
  it('extracts text from a DOCX', async () => {
    const buf = await makeDocx('Web application VAPT for 3 portals');
    const r = await parseDocument({ name: 'rfp.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: buf });
    expect(r.error).toBeUndefined();
    expect(r.text).toContain('Web application VAPT for 3 portals');
  });
  it('extracts cell text from an XLSX across sheets', async () => {
    const buf = makeXlsx([['Asset', 'Count'], ['Mobile app', '2'], ['API endpoints', '40']]);
    const r = await parseDocument({ name: 'scope.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: buf });
    expect(r.error).toBeUndefined();
    expect(r.text).toContain('API endpoints');
    expect(r.text).toContain('40');
  });
  it('returns CSV content as text', async () => {
    const r = await parseDocument({ name: 'scope.csv', contentType: 'text/csv', bytes: Buffer.from('item,count\nportal,3\n', 'utf-8') });
    expect(r.error).toBeUndefined();
    expect(r.text).toContain('portal');
  });
  it('truncates very long extracted text and sets truncated=true', async () => {
    const big = 'x'.repeat(MAX_TEXT_CHARS + 5000);
    const r = await parseDocument({ name: 'big.csv', contentType: 'text/csv', bytes: Buffer.from(big, 'utf-8') });
    expect(r.text.length).toBe(MAX_TEXT_CHARS);
    expect(r.truncated).toBe(true);
  });
  it('returns an error result (does not throw) for an unparseable/corrupt PDF', async () => {
    const r = await parseDocument({ name: 'bad.pdf', contentType: 'application/pdf', bytes: Buffer.from('not a pdf', 'utf-8') });
    expect(r.error).toBeTruthy();
    expect(r.text).toBe('');
  });
  it('returns an error result for an unsupported extension', async () => {
    const r = await parseDocument({ name: 'weird.bin', contentType: 'application/octet-stream', bytes: Buffer.from('x') });
    expect(r.error).toMatch(/unsupported/i);
  });
});
