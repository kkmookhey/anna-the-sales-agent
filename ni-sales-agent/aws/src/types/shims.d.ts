// Ambient declarations for packages that ship no TypeScript types.

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }
  function pdfParse(buffer: Buffer | Uint8Array): Promise<PdfData>;
  export default pdfParse;
}

declare module 'pdfkit' {
  import { EventEmitter } from 'events';
  class PDFDocument extends EventEmitter {
    constructor(options?: Record<string, unknown>);
    text(text: string, options?: Record<string, unknown>): this;
    end(): void;
  }
  export default PDFDocument;
}
