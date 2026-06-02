import pptxgen from 'pptxgenjs';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ProposalContent } from './types.js';

const PURPLE = '582A90';
const CRIMSON = 'B61A3F';
const YELLOW = 'FCE205';
const BLACK = '0A0A0B';
const WHITE = 'FFFFFF';
const INK = '1E1E22';
// Fonts match the real NI corporate deck (Office theme: major Calibri Light, minor Calibri).
const DISPLAY = 'Calibri Light';
const BODY = 'Calibri';

const here = dirname(fileURLToPath(import.meta.url));
const LOGO_CANDIDATES = [
  join(here, 'assets', 'ni-logo.png'), // Lambda bundle: /var/task/assets/ni-logo.png
  ...(process.env.LAMBDA_TASK_ROOT ? [join(process.env.LAMBDA_TASK_ROOT, 'assets', 'ni-logo.png')] : []),
  join(here, '..', 'assets', 'ni-logo.png'),
  join(here, '..', '..', 'src', 'assets', 'ni-logo.png'),
];

function logoData(): string | null {
  const path = LOGO_CANDIDATES.find(existsSync);
  if (!path) return null;
  return `image/png;base64,${readFileSync(path).toString('base64')}`;
}

type Slide = ReturnType<pptxgen['addSlide']>;

function brandMark(slide: Slide, onDark: boolean): void {
  const data = logoData();
  if (data) {
    slide.addImage({ data: `data:${data}`, x: 0.7, y: 0.45, w: 2.4, h: 0.55 });
    return;
  }
  slide.addText(
    [
      { text: 'NETWORK ', options: { color: onDark ? WHITE : BLACK, bold: true } },
      { text: 'INTELLIGENCE', options: { color: CRIMSON, bold: true } },
    ],
    { x: 0.7, y: 0.4, w: 6, h: 0.5, fontFace: DISPLAY, fontSize: 16, charSpacing: 2 },
  );
}

function bullets(slide: Slide, items: string[], y: number, color: string): void {
  if (items.length === 0) return;
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true } })),
    { x: 0.7, y, w: 11.9, h: 7.5 - y - 0.5, fontFace: BODY, fontSize: 16, color, lineSpacingMultiple: 1.3, valign: 'top' },
  );
}

function heading(slide: Slide, title: string, onDark: boolean): void {
  slide.addText(title, {
    x: 0.7, y: 1.2, w: 11.9, h: 0.8, fontFace: DISPLAY, fontSize: 26, bold: true,
    color: onDark ? WHITE : BLACK,
  });
  slide.addShape('rect', { x: 0.7, y: 1.95, w: 2.2, h: 0.08, fill: { color: CRIMSON } });
}

function lightSlide(pptx: pptxgen, title: string, items: string[]): void {
  const s = pptx.addSlide();
  s.background = { color: WHITE };
  brandMark(s, false);
  heading(s, title, false);
  bullets(s, items, 2.4, INK);
}

function darkSlide(pptx: pptxgen, title: string, items: string[]): void {
  const s = pptx.addSlide();
  s.background = { color: BLACK };
  brandMark(s, true);
  heading(s, title, true);
  bullets(s, items, 2.4, WHITE);
}

export async function renderDeck(content: ProposalContent): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'Network Intelligence';
  pptx.company = 'Network Intelligence';

  const title = pptx.addSlide();
  title.background = { color: BLACK };
  brandMark(title, true);
  title.addText(content.titleLine, {
    x: 0.7, y: 2.7, w: 12, h: 1.6, fontFace: DISPLAY, fontSize: 34, bold: true, color: WHITE,
  });
  title.addShape('rect', { x: 0.7, y: 4.25, w: 3.4, h: 0.12, fill: { color: CRIMSON } });
  title.addText(content.serviceLines.join('   ·   ').toUpperCase(), {
    x: 0.7, y: 4.5, w: 12, h: 0.4, fontFace: BODY, fontSize: 12, color: YELLOW, charSpacing: 2,
  });

  lightSlide(pptx, 'Understanding your need', content.understanding);

  const scope = pptx.addSlide();
  scope.background = { color: WHITE };
  brandMark(scope, false);
  heading(scope, 'Scope', false);
  scope.addTable(
    [
      [
        { text: 'Service line', options: { bold: true, color: WHITE, fill: { color: PURPLE } } },
        { text: 'In scope', options: { bold: true, color: WHITE, fill: { color: PURPLE } } },
      ],
      ...content.scopeRows.map((r) => [
        { text: r.line, options: { color: INK, bold: true } },
        { text: r.detail, options: { color: INK } },
      ]),
    ],
    { x: 0.7, y: 2.4, w: 11.9, fontFace: BODY, fontSize: 14, border: { type: 'solid', pt: 1, color: 'E4E4E7' }, colW: [3.5, 8.4] },
  );

  lightSlide(
    pptx,
    'Assumptions',
    content.assumptions.map((a) => `${a}  —  tell us if this isn't right`),
  );

  darkSlide(pptx, 'Approach & methodology', content.approach);
  lightSlide(pptx, 'Deliverables & timeline', [...content.deliverables, `Timeline: ${content.timeline}`]);
  darkSlide(pptx, 'Why Network Intelligence', content.whyNi);
  lightSlide(pptx, 'Commercials', [content.commercials.text]);
  darkSlide(pptx, 'Next steps', content.nextSteps);

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return out as Buffer;
}
