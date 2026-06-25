import {
  JOST_300, JOST_400, JOST_500, JOST_600, JOST_700,
  ROBOTO_300, ROBOTO_400, ROBOTO_500, ROBOTO_700,
  MONO_400, MONO_500,
  COLORS_CSS, DECK_CSS, PROPOSAL_CSS,
  DECK_STAGE_JS, LUCIDE_JS,
  LOGO_MARK_SVG,
} from './assets.generated.js';

// Total HTML-escaper: coerces non-string input (e.g. a model-returned number) to a string
// so a stray non-string field can never crash rendering at the escaping boundary.
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const face = (family: string, weight: number, b64: string): string =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
  `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

const FONT_FACES = [
  face('Jost', 300, JOST_300), face('Jost', 400, JOST_400), face('Jost', 500, JOST_500),
  face('Jost', 600, JOST_600), face('Jost', 700, JOST_700),
  face('Roboto', 300, ROBOTO_300), face('Roboto', 400, ROBOTO_400),
  face('Roboto', 500, ROBOTO_500), face('Roboto', 700, ROBOTO_700),
  face('JetBrains Mono', 400, MONO_400), face('JetBrains Mono', 500, MONO_500),
].join('');

export const STYLE = `<style>${FONT_FACES}${COLORS_CSS}${DECK_CSS}${PROPOSAL_CSS}</style>`;

export function logoMark(heightPx: number): string {
  const scaledSvg = LOGO_MARK_SVG.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s*width="[^"]*"/, '').replace(/\s*height="[^"]*"/, '');
    return `<svg${cleaned} style="height:100%;width:auto;">`;
  });
  return `<span style="display:inline-flex;align-items:center;height:${heightPx}px;">${scaledSvg}</span>`;
}

export function head(dark: boolean, chapter: string): string {
  const headClass = dark ? 'head' : 'head head-light';
  return `<div class="${headClass}">` +
    `<div class="mark">${logoMark(32)}<span>Network Intelligence</span></div>` +
    `<div class="chapter">${esc(chapter)}</div></div>`;
}

export function foot(dark: boolean, label: string, n: number, total: number): string {
  const footClass = dark ? 'foot' : 'foot foot-light';
  const nn = String(n).padStart(2, '0');
  const tt = String(total).padStart(2, '0');
  return `<div class="${footClass}">` +
    `<span>NI · ${esc(label)}</span>` +
    `<span>${nn}<span class="dot"></span>${tt}</span></div>`;
}

export interface SlideDesc {
  full?: string;
  inner?: string;
  variant?: string;
  dark?: boolean;
  chapter?: string;
  footLabel?: string;
  sectionStyle?: string;
}

/** Wrap an assembled deck body in the document shell + deck-stage + scripts. */
export function wrapDeck(deck: string): string {
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${STYLE}</head>` +
    `<body><deck-stage width="1920" height="1080">${deck}</deck-stage>` +
    `<script>${DECK_STAGE_JS}</script>` +
    `<script>${LUCIDE_JS}</script>` +
    `<script>window.lucide&&lucide.createIcons()</script>` +
    `</body></html>`
  );
}

/** Filter nulls, compute total, wrap each SlideDesc with numbered head/foot. */
export function assembleSlides(descs: (SlideDesc | null)[]): string {
  const kept = descs.filter((d): d is SlideDesc => d !== null);
  const total = kept.length;
  return kept.map((d, i) => {
    const n = i + 1;
    if (d.full !== undefined) return d.full;
    const variantClass = d.variant ? `slide ${d.variant}` : 'slide';
    const styleAttr = d.sectionStyle ? ` style="${d.sectionStyle}"` : '';
    const dark = d.dark ?? false;
    // Flowed content lives in a .slide-content wrapper (head/foot are absolute siblings) so the
    // render step can measure it and shrink-to-fit any slide that would overflow the footer.
    return `<section class="${variantClass}"${styleAttr}>` +
      head(dark, d.chapter ?? '') +
      `<div class="slide-content">${d.inner ?? ''}</div>` +
      foot(dark, d.footLabel ?? '', n, total) +
      `</section>`;
  }).join('');
}
