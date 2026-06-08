import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

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
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
