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
  const browser = await puppeteer.launch({ ...opts, defaultViewport: { width: 1280, height: 720 } });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
