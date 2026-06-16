import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { LETTERHEAD_DOCX_BASE64 } from '../../src/render/assets/letterhead-docx.js';

describe('letterhead asset', () => {
  it('is a valid docx with the branded header and logo image preserved', async () => {
    const zip = await JSZip.loadAsync(Buffer.from(LETTERHEAD_DOCX_BASE64, 'base64'));
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('word/header2.xml')).toBeTruthy();        // default header carries the logo
    expect(zip.file('word/media/image1.emf')).toBeTruthy();   // the EMF banner logo
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('<w:sectPr');                       // section props (header/footer bindings) present
    expect(doc).toContain('w:type="default" r:id="rId8"');    // default headerReference intact
  });
});
