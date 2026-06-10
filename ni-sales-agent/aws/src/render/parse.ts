import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

/** Hard cap on extracted text returned to the orchestrator (DoS / context guard). */
export const MAX_TEXT_CHARS = 200_000;

export interface ParseInput { name: string; contentType: string; bytes: Buffer }
export interface ParseResult { name: string; text: string; truncated: boolean; error?: string }

function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}
function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
}
async function extractPdf(bytes: Buffer): Promise<string> {
  // Pass as Uint8Array: pdfjs v1.10.100 accumulates internal state when given a Buffer
  // directly, causing failures on repeated calls in the same process. Uint8Array avoids it.
  const out = await pdfParse(new Uint8Array(bytes));
  return out.text ?? '';
}
async function extractDocx(bytes: Buffer): Promise<string> {
  const out = await mammoth.extractRawText({ buffer: bytes });
  return out.value ?? '';
}
function extractXlsx(bytes: Buffer): string {
  // sheetRows caps rows at parse time (defence-in-depth; the 4.5MB file cap upstream is the primary bound).
  const wb = XLSX.read(bytes, { type: 'buffer', sheetRows: 50_000 });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    parts.push(`# ${name}`);
    parts.push(XLSX.utils.sheet_to_csv(sheet));
  }
  return parts.join('\n');
}

/** Parse one attachment to text. NEVER throws — failures come back as { error }. */
export async function parseDocument(input: ParseInput): Promise<ParseResult> {
  const e = ext(input.name);
  try {
    let raw: string;
    switch (e) {
      case 'pdf': raw = await extractPdf(input.bytes); break;
      case 'docx': raw = await extractDocx(input.bytes); break;
      case 'xlsx': raw = extractXlsx(input.bytes); break;
      case 'csv': raw = input.bytes.toString('utf-8'); break;
      default: return { name: input.name, text: '', truncated: false, error: `unsupported file type: .${e || '(none)'}` };
    }
    const { text, truncated } = cap(raw.trim());
    return { name: input.name, text, truncated };
  } catch (err) {
    return { name: input.name, text: '', truncated: false, error: err instanceof Error ? err.message : String(err) };
  }
}
