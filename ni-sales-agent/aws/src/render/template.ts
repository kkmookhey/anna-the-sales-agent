import type { ProposalContent } from '../proposal/types.js';
import { JOST_400, JOST_600, ROBOTO_400, ROBOTO_500, NI_LOGO_PNG } from './assets.generated.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const face = (family: string, weight: number, b64: string): string =>
  `@font-face{font-family: '${family}';font-weight:${weight};font-style:normal;` +
  `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

const FONTS = [
  face('Jost', 400, JOST_400), face('Jost', 600, JOST_600),
  face('Roboto', 400, ROBOTO_400), face('Roboto', 500, ROBOTO_500),
].join('');

const CSS = `
${FONTS}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size: 1280px 720px;margin:0;}
html,body{font-family:'Roboto',sans-serif;color:#E7E7EA;background:#0A0A0B;}
.page{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;
  background:#0A0A0B;padding:72px 88px;}
.page:last-child{page-break-after:auto;}
h1,h2,.eyebrow{font-family:'Jost',sans-serif;}
.eyebrow{font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#FCE205;font-weight:600;margin-bottom:18px;}
h1{font-size:54px;font-weight:600;line-height:1.05;max-width:900px;}
h2{font-size:34px;font-weight:600;margin-bottom:28px;}
.accent{height:6px;width:280px;background:linear-gradient(90deg,#582A90,#731E7A,#A01855,#B61A3F);margin:24px 0;}
.logo{height:40px;}
.cover{display:flex;flex-direction:column;justify-content:center;}
.cover .meta{font-family:'Jost',sans-serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#9A9AA2;margin-top:28px;}
ul{list-style:none;display:flex;flex-direction:column;gap:16px;margin-top:8px;}
li{font-size:20px;line-height:1.4;padding-left:26px;position:relative;}
li::before{content:'';position:absolute;left:0;top:11px;width:8px;height:8px;border-radius:999px;background:#B61A3F;}
table{width:100%;border-collapse:collapse;margin-top:8px;}
th,td{text-align:left;padding:16px 18px;font-size:18px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top;}
th{font-family:'Jost',sans-serif;background:#582A90;color:#fff;font-weight:600;}
td.line{font-weight:500;color:#fff;width:30%;}
.chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;}
.chip{font-family:'Jost',sans-serif;font-size:16px;font-weight:600;border:1px solid rgba(255,255,255,.16);
  border-radius:999px;padding:12px 20px;color:#fff;}
.foot{position:absolute;bottom:40px;left:88px;right:88px;display:flex;justify-content:space-between;
  font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6A6A72;}
.para{font-size:20px;line-height:1.5;max-width:920px;margin-top:8px;}
`;

const logoTag = `<img class="logo" src="data:image/png;base64,${NI_LOGO_PNG}" alt="Network Intelligence"/>`;
const foot = (n: number, total: number) =>
  `<div class="foot"><span>Network Intelligence · Confidential</span><span>${n} / ${total}</span></div>`;

const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

function listSection(eyebrow: string, title: string, items: string[]): string | null {
  if (!items.length) return null;
  return `<section class="body"><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2>${ul(items)}</section>`;
}

export function renderProposalHtml(content: ProposalContent): string {
  const pages: (string | null)[] = [];

  // 1. Cover
  pages.push(
    `<div class="cover">${logoTag}<div class="accent"></div>` +
    `<h1>${esc(content.titleLine)}</h1>` +
    `<div class="meta">Prepared for ${esc(content.company)} · ${esc(content.contactName)}</div>` +
    `<div class="meta">${content.serviceLines.map(esc).join(' · ').toUpperCase()}</div></div>`,
  );

  // 2. Understanding
  pages.push(listSection('What we heard', 'Understanding your need', content.understanding));

  // 3. Scope (table)
  if (content.scopeRows.length) {
    const rows = content.scopeRows
      .map((r) => `<tr><td class="line">${esc(r.line)}</td><td>${esc(r.detail)}</td></tr>`)
      .join('');
    pages.push(
      `<section><div class="eyebrow">In scope</div><h2>Scope</h2>` +
      `<table><thead><tr><th>Service line</th><th>In scope</th></tr></thead><tbody>${rows}</tbody></table></section>`,
    );
  }

  // 4. Approach
  pages.push(listSection('How we work', 'Approach & methodology', content.approach));

  // 5. Deliverables & timeline
  if (content.deliverables.length || content.timeline) {
    pages.push(listSection('What you get', 'Deliverables & timeline',
      [...content.deliverables, ...(content.timeline ? [`Timeline: ${content.timeline}`] : [])]));
  }

  // 6. Credentials (chips)
  if (content.credentials.length) {
    pages.push(
      `<section><div class="eyebrow">Why us</div><h2>Credentials</h2>` +
      `<div class="chips">${content.credentials.map((c) => `<span class="chip">${c}</span>`).join('')}</div></section>`,
    );
  }

  // 7. Transilience edge (conditional)
  pages.push(listSection('AI-native delivery', 'The Transilience AI edge', content.transilienceEdge));

  // 8. Why NI
  pages.push(listSection('The fit', 'Why Network Intelligence', content.whyNi));

  // 9. Assumptions
  pages.push(listSection('Please correct anything off', 'Assumptions',
    content.assumptions.map((a) => `${a} — tell us if this isn't right`)));

  // 10. Commercials
  if (content.commercials.text) {
    pages.push(
      `<section><div class="eyebrow">Commercials</div><h2>Commercials</h2>` +
      `<p class="para">${esc(content.commercials.text)}</p></section>`,
    );
  }

  // 11. Next steps
  pages.push(listSection('From here', 'Next steps', content.nextSteps));

  const kept = pages.filter((p): p is string => p !== null);
  const total = kept.length;
  const body = kept
    .map((p, i) => `<div class="page">${p}${foot(i + 1, total)}</div>`)
    .join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
}
