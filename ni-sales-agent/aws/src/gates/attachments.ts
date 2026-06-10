//
// Attachment intake policy — part of the safety core (CLAUDE.md gate #3 exception).
// Decides whether an attachment may be downloaded + parsed. Pure: no I/O, no bytes.
//

/** ~4.5 MB raw: base64 (~1.37x) stays under the 6 MB Lambda sync-invoke payload limit. */
export const MAX_FILE_BYTES = 4_500_000;
export const MAX_FILES_PER_MESSAGE = 5;

const ALLOWED_EXT = new Set(['pdf', 'docx', 'xlsx', 'csv']);

export interface AttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
}

function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Decide whether to download + parse this attachment. */
export function decideAttachment(meta: AttachmentMeta): { parse: boolean; reason: string } {
  if (meta.isInline) return { parse: false, reason: 'inline attachment (not a document)' };
  if (!meta.size || meta.size <= 0) return { parse: false, reason: 'empty attachment' };
  if (meta.size > MAX_FILE_BYTES) return { parse: false, reason: `file too large (${meta.size} bytes > ${MAX_FILE_BYTES})` };
  const e = ext(meta.name);
  if (!ALLOWED_EXT.has(e)) {
    const legacy = ['doc', 'xls', 'ppt'].includes(e);
    const macro = ['docm', 'xlsm', 'pptm', 'xlsb'].includes(e);
    const why = legacy ? 'legacy binary format' : macro ? 'macro-enabled format' : `unsupported type .${e || '(none)'}`;
    return { parse: false, reason: why };
  }
  return { parse: true, reason: 'ok' };
}
