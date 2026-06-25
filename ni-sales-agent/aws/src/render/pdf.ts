import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import type { Page } from 'puppeteer-core';
import { fitScale } from './fit.js';

const FIT_MIN_SCALE = 0.62; // never shrink a slide's content below this (readability floor)

// Design height (1080) minus the slide's top+bottom padding (100 each). Content within this
// band clears the absolutely-positioned footer; taller content overflows it.
const FIT_AVAILABLE_PX = 880;

// Minimal structural DOM shape used inside page.evaluate (the project's tsconfig omits the DOM lib).
type FitEl = {
  className: string;
  querySelector(sel: string): FitEl | null;
  scrollHeight: number;
  style: { transform: string };
};
type FitDoc = { querySelectorAll(sel: string): ArrayLike<FitEl> };

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function launchOptions(): Promise<{ args: string[]; executablePath: string; headless: true }> {
  // In Lambda, AWS sets AWS_LAMBDA_FUNCTION_NAME — use the bundled Linux Chromium.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return { args: chromium.args, executablePath: await chromium.executablePath(), headless: true };
  }
  // Local dev: the @sparticuz binary is Linux-only. Use a system Chrome.
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? MAC_CHROME;
  return { args: [], executablePath, headless: true };
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const opts = await launchOptions();
  const browser = await puppeteer.launch({ ...opts, defaultViewport: { width: 1920, height: 1080 } });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      const g = globalThis as unknown as { customElements: { whenDefined(n: string): Promise<unknown> }; document: { getElementById(id: string): unknown } };
      await Promise.race([g.customElements.whenDefined('deck-stage'), new Promise((r) => setTimeout(r, 8000))]);
      const deadline = Date.now() + 8000;
      while (!g.document.getElementById('deck-stage-print-page') && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 250));
    });
    await page.emulateMediaType('print');
    await fitSlides(page);
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Shrink-to-fit guard: measure each standard slide's flowed content (scrollHeight is reliable
 *  regardless of print pagination) and, if it exceeds the padding band, scale its .slide-content
 *  down (never below FIT_MIN_SCALE). Keeps the enlarged fonts everywhere they fit; only dense
 *  slides shrink. Bespoke "full" slides (cover, next-steps) have no wrapper and are skipped. */
async function fitSlides(page: Page): Promise<void> {
  const naturals = await page.evaluate(() => {
    const doc = (globalThis as unknown as { document: FitDoc }).document;
    return Array.from(doc.querySelectorAll('.slide')).map((slide) => {
      // Skip bespoke full-bleed slides (no wrapper, or slide-full with padding:0) — the padding
      // band budget doesn't apply to them; they manage their own centered layout.
      const content = slide.querySelector(':scope > .slide-content');
      if (!content || (slide.className || '').includes('slide-full')) return 0;
      return content.scrollHeight;
    });
  });

  const scales = naturals.map((n) => fitScale(n, FIT_AVAILABLE_PX, FIT_MIN_SCALE));
  // Surface slides so long they hit the readability floor and may still clip — a signal the
  // generated copy is over budget (Slice A trims this; this is the backstop's smoke alarm).
  const beyondFloor = naturals.filter((n) => n > FIT_AVAILABLE_PX / FIT_MIN_SCALE).length;
  if (beyondFloor) console.warn(`render: ${beyondFloor} slide(s) exceed the shrink-to-fit floor (content too long) — may still clip`);
  if (scales.every((s) => s === 1)) return; // nothing overflows — leave fonts at authored size

  await page.evaluate((s: number[]) => {
    const doc = (globalThis as unknown as { document: FitDoc }).document;
    Array.from(doc.querySelectorAll('.slide')).forEach((slide, i) => {
      const content = slide.querySelector(':scope > .slide-content');
      if (content && s[i]! < 1) content.style.transform = `scale(${s[i]})`;
    });
  }, scales);
}
