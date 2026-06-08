import type { ProposalContent } from '../proposal/types.js';
import {
  JOST_300, JOST_400, JOST_500, JOST_600, JOST_700,
  ROBOTO_300, ROBOTO_400, ROBOTO_500, ROBOTO_700,
  MONO_400, MONO_500,
  COLORS_CSS, DECK_CSS, PROPOSAL_CSS,
  DECK_STAGE_JS, LUCIDE_JS,
  LOGO_MARK_SVG,
} from './assets.generated.js';
import { serviceLineLabel } from './labels.js';

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const face = (family: string, weight: number, b64: string): string =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
  `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

const FONT_FACES = [
  face('Jost', 300, JOST_300),
  face('Jost', 400, JOST_400),
  face('Jost', 500, JOST_500),
  face('Jost', 600, JOST_600),
  face('Jost', 700, JOST_700),
  face('Roboto', 300, ROBOTO_300),
  face('Roboto', 400, ROBOTO_400),
  face('Roboto', 500, ROBOTO_500),
  face('Roboto', 700, ROBOTO_700),
  face('JetBrains Mono', 400, MONO_400),
  face('JetBrains Mono', 500, MONO_500),
].join('');

const STYLE = `<style>${FONT_FACES}${COLORS_CSS}${DECK_CSS}${PROPOSAL_CSS}</style>`;

/** Inline the SVG logo-mark, scaled to a given height while preserving aspect ratio. */
function logoMark(heightPx: number): string {
  // Replace any existing width/height on the <svg> tag with height=100% width=auto
  // so it scales correctly inside the wrapper span.
  const scaledSvg = LOGO_MARK_SVG.replace(
    /<svg([^>]*)>/,
    (_match, attrs: string) => {
      const cleaned = attrs
        .replace(/\s*width="[^"]*"/, '')
        .replace(/\s*height="[^"]*"/, '');
      return `<svg${cleaned} style="height:100%;width:auto;">`;
    },
  );
  return `<span style="display:inline-flex;align-items:center;height:${heightPx}px;">${scaledSvg}</span>`;
}

/** Shared header bar used on non-cover slides. */
function head(dark: boolean, chapter: string): string {
  const headClass = dark ? 'head' : 'head head-light';
  return (
    `<div class="${headClass}">` +
    `<div class="mark">${logoMark(32)}<span>Network Intelligence</span></div>` +
    `<div class="chapter">${esc(chapter)}</div>` +
    `</div>`
  );
}

/** Shared footer used on non-cover slides. n = 1-based slide index, total = kept slide count. */
function foot(dark: boolean, label: string, n: number, total: number): string {
  const footClass = dark ? 'foot' : 'foot foot-light';
  const nn = String(n).padStart(2, '0');
  const tt = String(total).padStart(2, '0');
  return (
    `<div class="${footClass}">` +
    `<span>NI · ${esc(label)}</span>` +
    `<span>${nn}<span class="dot"></span>${tt}</span>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────
// Firm-level cover stats (never changes)
// ─────────────────────────────────────────────
const COVER_STATS: Array<{ value: string; label: string }> = [
  { value: '25+', label: 'Years in cybersecurity' },
  { value: 'CERT-In', label: 'Empanelled auditor' },
  { value: '550+', label: 'Security professionals' },
  { value: '200+', label: 'Active engagements / yr' },
];

/** Renders the stat value with a trailing + highlighted in yellow if it ends with +. */
function statValue(v: string): string {
  if (v.endsWith('+')) {
    const base = esc(v.slice(0, -1));
    return `${base}<span style="color:#FCE205;">+</span>`;
  }
  return esc(v);
}

// ─────────────────────────────────────────────
// Slide descriptor returned by each builder
// ─────────────────────────────────────────────

interface SlideDesc {
  /** The outer section element as a complete string (for special/full-bleed slides). */
  full?: string;
  /** Inner body HTML (without head/foot) — used for standard slides. */
  inner?: string;
  /** CSS variant class on the section, e.g. "slide-light", "bg-crimson-wash". */
  variant?: string;
  /** Whether the slide uses dark styling for head/foot. */
  dark?: boolean;
  /** Chapter label rendered in the header right side. */
  chapter?: string;
  /** Left-hand label in the footer "NI · <label>". */
  footLabel?: string;
  /** Additional inline style for the section element. */
  sectionStyle?: string;
}

// ─────────────────────────────────────────────
// Slide builders
// ─────────────────────────────────────────────

function buildCover(content: ProposalContent): SlideDesc {
  const serviceLabels = content.serviceLines.map((k) => serviceLineLabel(k)).join(' · ');
  const statsHtml = COVER_STATS.map((s) => `
      <div>
        <div style="font-family:var(--font-display);font-size:80px;font-weight:500;line-height:0.9;">${statValue(s.value)}</div>
        <p style="font-family:var(--font-display);font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.55);margin:14px 0 0;">${esc(s.label)}</p>
      </div>`).join('');

  return {
    full: `<section class="slide slide-full" data-screen-label="01 Cover" style="padding:0;">
    <div style="position:absolute;inset:0;background:#0A0A0B;"></div>
    <div style="position:absolute;right:-340px;top:-180px;width:1500px;height:1500px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#B61A3F 0%,#A01855 25%,#731E7A 55%,#582A90 80%,transparent 100%);opacity:0.85;"></div>
    <div style="position:absolute;right:-120px;top:80px;width:980px;height:980px;border-radius:50%;background:radial-gradient(circle at 35% 35%,rgba(255,234,77,0.18) 0%,transparent 50%);"></div>
    <div class="bg-grid" style="position:absolute;inset:0;opacity:0.6;"></div>

    <div style="position:absolute;left:120px;top:80px;display:flex;align-items:center;gap:18px;z-index:3;">
      ${logoMark(54)}
      <div>
        <div style="font-family:var(--font-display);font-weight:500;font-size:24px;line-height:1;">Network Intelligence</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:0.18em;margin-top:6px;text-transform:uppercase;">The Digital Security Company</div>
      </div>
    </div>

    <div style="position:absolute;right:120px;top:90px;z-index:3;text-align:right;">
      <div style="font-family:var(--font-mono);font-size:11px;color:#FCE205;letter-spacing:0.22em;text-transform:uppercase;">● Confidential</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.45);letter-spacing:0.22em;text-transform:uppercase;margin-top:4px;">Technical Proposal</div>
    </div>

    <div style="position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 120px;">
      <p class="eyebrow" style="margin-bottom:28px;">Proposal for ${esc(content.company)}</p>
      <h1 class="title" style="font-size:150px;line-height:0.96;max-width:1500px;letter-spacing:-0.025em;">${esc(content.titleLine)}</h1>
      <p style="font-family:var(--font-display);font-size:40px;font-weight:300;color:rgba(255,255,255,0.85);margin:48px 0 0;max-width:1300px;line-height:1.2;">
        ${esc(serviceLabels)}
      </p>
    </div>

    <div style="position:absolute;left:120px;right:120px;bottom:80px;z-index:3;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding-top:32px;border-top:1px solid rgba(255,255,255,0.12);">
      ${statsHtml}
    </div>

    <div style="position:absolute;left:120px;bottom:32px;z-index:3;font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.18em;">
      NI / ${esc(content.company)} / v1.0
    </div>
  </section>`,
  };
}

function buildExecSummary(content: ProposalContent): SlideDesc | null {
  if (!content.pillars.length) return null;

  const pillarsHtml = content.pillars.slice(0, 3).map((p, i) => `
      <div class="pillar-card">
        <div class="pillar-accent"></div>
        <div class="pillar-icon"><i data-lucide="badge-check"></i></div>
        <p class="pillar-num">0${i + 1} / Pillar</p>
        <h3 class="pillar-title">${esc(p.title)}</h3>
        <p class="pillar-body">${esc(p.body)}</p>
      </div>`).join('');

  return {
    variant: 'slide-light',
    dark: false,
    chapter: '01 · Executive summary',
    footLabel: `${content.company} Proposal`,
    inner: `
    <div style="position:absolute;left:0;top:0;bottom:0;width:8px;background:linear-gradient(180deg,#582A90 0%,#A01855 50%,#B61A3F 100%);"></div>

    <div style="margin-top:48px;max-width:1500px;">
      <p class="eyebrow eyebrow-violet">Why Network Intelligence for ${esc(content.company)}</p>
      <div class="gradient-band" style="width:160px;margin:24px 0 28px;"></div>
      <h2 class="title title-md" style="font-size:62px;font-weight:500;">A proposal built around your requirement.</h2>
    </div>

    <div style="margin-top:48px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
      ${pillarsHtml}
    </div>`,
  };
}

function buildUnderstanding(content: ProposalContent): SlideDesc | null {
  const hasStats = content.understandingStats.length > 0;
  const hasSignals = content.signals.length > 0;
  if (!hasStats && !hasSignals) return null;

  const statsHtml = hasStats
    ? `<div style="margin-top:44px;display:grid;grid-template-columns:repeat(${Math.min(content.understandingStats.length, 4)},1fr);gap:18px;">
        ${content.understandingStats.map((s, i) => {
          const accentClass = i === content.understandingStats.length - 1 && content.understandingStats.length > 1
            ? 'stat-tile stat-tile-accent'
            : 'stat-tile';
          return `<div class="${accentClass}"><div class="stat-tile-num">${esc(s.value)}</div><p class="stat-tile-lbl">${esc(s.label)}</p></div>`;
        }).join('')}
      </div>`
    : '';

  const signalsHtml = hasSignals
    ? `<div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        ${content.signals.map((s, i) => {
          const accentClass = i === content.signals.length - 1 && content.signals.length % 2 === 0
            ? 'signal-row signal-row-accent'
            : 'signal-row';
          return `<div class="${accentClass}">
            <div class="signal-icon"><i data-lucide="server"></i></div>
            <div><div class="signal-title">${esc(s.title)}</div><p class="signal-desc">${esc(s.detail)}</p></div>
          </div>`;
        }).join('')}
      </div>`
    : '';

  return {
    variant: 'bg-crimson-wash',
    dark: true,
    chapter: '02 · Understanding your environment',
    footLabel: `${content.company} Proposal`,
    inner: `
    <div style="margin-top:40px;max-width:1500px;">
      <p class="eyebrow">The application we are assessing</p>
      <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
      <h2 class="title title-md" style="font-size:60px;">Understanding your environment.</h2>
    </div>

    ${statsHtml}
    ${signalsHtml}`,
  };
}

function buildScope(content: ProposalContent): SlideDesc | null {
  if (!content.scopeRows.length) return null;

  const rowsHtml = content.scopeRows.map((r) =>
    `<div style="display:grid;grid-template-columns:360px 1fr;gap:32px;padding:26px 8px;border-bottom:1px solid rgba(10,10,11,0.1);">
      <div style="font-family:var(--font-display);font-size:24px;font-weight:500;color:#0A0A0B;">${esc(r.line)}</div>
      <div style="font-family:var(--font-body);font-size:19px;color:#3a3a40;line-height:1.5;">${esc(r.detail)}</div>
    </div>`,
  ).join('');

  return {
    variant: 'slide-light',
    dark: false,
    chapter: '03 · Scope of work',
    footLabel: `${content.company} Proposal`,
    inner: `
    <div style="margin-top:44px;max-width:1500px;">
      <p class="eyebrow eyebrow-violet">In scope</p>
      <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
      <h2 class="title title-md" style="font-size:60px;">Exactly what we will test.</h2>
    </div>

    <div style="margin-top:40px;display:flex;flex-direction:column;gap:0;max-width:1680px;border-top:1px solid rgba(10,10,11,0.12);">
      ${rowsHtml}
    </div>`,
  };
}

function buildApproach(content: ProposalContent): SlideDesc | null {
  if (!content.approachPhases.length) return null;

  const tilesHtml = content.approachPhases.map((p, i) => {
    const isLast = i === content.approachPhases.length - 1;
    const tileClass = isLast ? 'tile tile-accent' : 'tile';
    const phaseNum = String(i + 1).padStart(2, '0');
    return `<div class="${tileClass}">
      <p class="mono" style="color:#FCE205;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;">Phase ${phaseNum}</p>
      <h3 style="font-family:var(--font-display);font-size:26px;font-weight:500;color:#fff;margin:0;">${esc(p.name)}</h3>
      <p class="body" style="font-size:17px;">${esc(p.detail)}</p>
    </div>`;
  }).join('');

  return {
    variant: 'bg-gradient-violet',
    dark: true,
    chapter: '04 · Approach &amp; methodology',
    footLabel: `${content.company} Proposal`,
    inner: `
    <div style="margin-top:40px;max-width:1500px;">
      <p class="eyebrow">How we work</p>
      <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
      <h2 class="title title-md" style="font-size:60px;">A standards-led approach.</h2>
    </div>

    <div style="margin-top:48px;display:grid;grid-template-columns:repeat(${Math.min(content.approachPhases.length, 4)},1fr);gap:18px;">
      ${tilesHtml}
    </div>`,
  };
}

function buildDeliverables(content: ProposalContent): SlideDesc | null {
  if (!content.deliverables.length && !content.timeline) return null;

  const deliverablesHtml = content.deliverables.map((d) =>
    `<div style="display:flex;gap:16px;align-items:flex-start;">
      <i data-lucide="file-check-2" style="color:#582A90;width:28px;height:28px;stroke-width:1.5;flex:none;"></i>
      <p style="font-family:var(--font-body);font-size:20px;color:#3a3a40;margin:0;line-height:1.5;"><strong style="color:#0A0A0B;">${esc(d)}</strong></p>
    </div>`,
  ).join('');

  const timelineHtml = content.timeline
    ? `<div style="margin-top:52px;display:inline-flex;align-items:center;gap:20px;background:#fff;border:1px solid rgba(10,10,11,0.1);border-radius:16px;padding:28px 40px;">
        <i data-lucide="calendar-clock" style="color:#B61A3F;width:36px;height:36px;stroke-width:1.5;"></i>
        <div>
          <p style="font-family:var(--font-display);font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(10,10,11,0.5);margin:0;">Indicative timeline</p>
          <p style="font-family:var(--font-display);font-size:30px;font-weight:500;color:#0A0A0B;margin:6px 0 0;">${esc(content.timeline)}</p>
        </div>
      </div>`
    : '';

  return {
    variant: 'slide-light',
    dark: false,
    chapter: '05 · Deliverables &amp; timeline',
    footLabel: `${content.company} Proposal`,
    inner: `
    <div style="margin-top:44px;max-width:1500px;">
      <p class="eyebrow eyebrow-violet">What you get</p>
      <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
      <h2 class="title title-md" style="font-size:60px;">Audit-ready outputs.</h2>
    </div>

    <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:18px 56px;max-width:1600px;">
      ${deliverablesHtml}
    </div>

    ${timelineHtml}`,
  };
}

function buildCredentials(content: ProposalContent): SlideDesc | null {
  if (!content.credentials.length) return null;

  const chipsHtml = content.credentials.map((c) =>
    `<span class="chip"><span class="dot"></span>${esc(c)}</span>`,
  ).join('');

  return {
    variant: '',
    dark: true,
    chapter: '06 · Credentials',
    footLabel: `${content.company} Proposal`,
    sectionStyle: 'background:#0A0A0B;',
    inner: `
    <div style="margin-top:44px;max-width:1500px;">
      <p class="eyebrow">Why us — proven, independently audited</p>
      <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
      <h2 class="title title-md" style="font-size:60px;">Credentials</h2>
    </div>

    <div style="margin-top:48px;display:flex;flex-wrap:wrap;gap:16px;max-width:1600px;">
      ${chipsHtml}
    </div>

    <p style="margin-top:48px;font-family:var(--font-display);font-size:26px;font-weight:300;color:rgba(255,255,255,0.8);max-width:1200px;line-height:1.4;">
      Every accreditation is independently audited and renewed annually. Not a checkbox — an operating standard.
    </p>`,
  };
}

function buildWhyNi(content: ProposalContent): SlideDesc | null {
  if (!content.whyNi.length) return null;

  const tilesHtml = content.whyNi.slice(0, 3).map((item, i) => {
    const isLast = i === Math.min(content.whyNi.length, 3) - 1;
    const tileClass = isLast ? 'tile tile-accent' : 'tile';
    return `<div class="${tileClass}">
      <div class="pillar-icon"><i data-lucide="shield-check"></i></div>
      <h3 style="font-family:var(--font-display);font-size:28px;font-weight:500;color:#fff;margin:0;">${esc(item)}</h3>
    </div>`;
  }).join('');

  return {
    variant: 'bg-gradient-violet',
    dark: true,
    chapter: '07 · Why Network Intelligence',
    footLabel: `${content.company} Proposal`,
    inner: `
    <div style="margin-top:40px;max-width:1500px;">
      <p class="eyebrow">The fit</p>
      <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
      <h2 class="title title-md" style="font-size:60px;">Why Network Intelligence.</h2>
    </div>

    <div style="margin-top:48px;display:grid;grid-template-columns:repeat(${Math.min(content.whyNi.length, 3)},1fr);gap:20px;">
      ${tilesHtml}
    </div>`,
  };
}

function buildCommercials(content: ProposalContent): SlideDesc {
  return {
    variant: 'slide-light',
    dark: false,
    chapter: '08 · Commercials',
    footLabel: `${content.company} Proposal`,
    inner: `
    <div style="margin-top:44px;max-width:1500px;">
      <p class="eyebrow eyebrow-violet">Commercials</p>
      <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
      <h2 class="title title-md" style="font-size:60px;">Commercial details.</h2>
    </div>
    <p style="margin-top:36px;font-family:var(--font-body);font-size:22px;line-height:1.55;color:#3a3a40;max-width:1300px;">
      Detailed commercials, terms, and PO details are provided in the attached document.
    </p>
    <div style="margin-top:36px;display:inline-flex;align-items:center;gap:14px;background:#fff;border:1px solid rgba(10,10,11,0.1);border-radius:12px;padding:18px 26px;">
      <i data-lucide="info" style="color:#582A90;width:22px;height:22px;stroke-width:1.5;"></i>
      <span style="font-family:var(--font-body);font-size:17px;color:#3a3a40;">Pricing follows scope confirmation — no surprises, no per-finding charges.</span>
    </div>`,
  };
}

function buildNextSteps(content: ProposalContent): SlideDesc {
  const steps = content.ctaSteps.length
    ? content.ctaSteps
    : [{ when: 'This week', title: "Let's talk", detail: `Contact us at sales@networkintelligence.ai` }];

  const cols = Math.min(steps.length, 3);
  const ctaHtml = steps.slice(0, 3).map((s, i) => `
    <div class="cta-card">
      <div class="cta-icon"><i data-lucide="phone-call"></i></div>
      <p class="cta-num">0${i + 1} · ${esc(s.when)}</p>
      <h4 class="cta-title">${esc(s.title)}</h4>
      <p>${esc(s.detail)}</p>
    </div>`).join('');

  // Full-bleed slide: pre-built including its own head (dark, chapter) but no standard foot.
  // The assembler wraps it via the `full` path, passing the section string as-is after
  // injecting the numbered head/foot at render time. Since the Next Steps slide uses a
  // custom layout (centered content, logo mark, etc.) we embed it as a pre-built `full`
  // section with placeholders handled by the assembler's numbering injection.
  // We use a special `fullBuilder` approach: return inner + variant so the assembler can
  // inject numbered head. There is no standard footer on this slide (design choice).
  return {
    variant: 'slide-full',
    dark: true,
    chapter: '09 · Next steps',
    footLabel: `${content.company} Proposal`,
    sectionStyle: 'padding:0;',
    inner: `
    <div style="position:absolute;inset:0;background:#0A0A0B;"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:1200px;height:1200px;border-radius:50%;background:radial-gradient(circle,rgba(88,42,144,0.35) 0%,rgba(182,26,63,0.18) 40%,transparent 70%);"></div>
    <div class="bg-grid" style="position:absolute;inset:0;opacity:0.5;"></div>

    <div style="position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;padding:120px;">
      ${logoMark(80)}
      <p class="eyebrow" style="margin:36px 0 18px;">● Next steps</p>
      <h2 class="title" style="font-size:88px;font-weight:500;text-align:center;max-width:1500px;line-height:1.05;letter-spacing:-0.02em;">
        Let's work together, ${esc(content.company)}.
      </h2>
      <div class="gradient-band" style="width:240px;margin:36px 0 52px;"></div>

      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:18px;width:100%;max-width:1500px;">
        ${ctaHtml}
      </div>

      <div style="margin-top:52px;display:flex;gap:48px;flex-wrap:wrap;justify-content:center;padding:24px 56px;border-top:1px solid rgba(255,255,255,0.1);border-bottom:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;align-items:center;gap:12px;font-family:var(--font-display);font-size:18px;color:rgba(255,255,255,0.85);">
          <i data-lucide="mail" style="color:#FCE205;width:20px;height:20px;stroke-width:1.5;"></i>
          sales@networkintelligence.ai
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-family:var(--font-display);font-size:18px;color:rgba(255,255,255,0.85);">
          <i data-lucide="globe" style="color:#FCE205;width:20px;height:20px;stroke-width:1.5;"></i>
          networkintelligence.ai
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-family:var(--font-display);font-size:18px;color:rgba(255,255,255,0.85);">
          <i data-lucide="badge-check" style="color:#FCE205;width:20px;height:20px;stroke-width:1.5;"></i>
          CERT-In Empanelled · CREST Accredited
        </div>
      </div>

      <p style="margin-top:28px;font-family:var(--font-display);font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.45);">
        Network Intelligence · The Digital Security Company
      </p>
    </div>`,
  };
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────

export function renderProposalHtml(content: ProposalContent): string {
  const descs: (SlideDesc | null)[] = [
    buildCover(content),
    buildExecSummary(content),
    buildUnderstanding(content),
    buildScope(content),
    buildApproach(content),
    buildDeliverables(content),
    buildCredentials(content),
    buildWhyNi(content),
    buildCommercials(content),
    buildNextSteps(content),
  ];

  // Filter nulls first so we can compute total for dynamic slide numbering.
  const kept = descs.filter((d): d is SlideDesc => d !== null);
  const total = kept.length;

  const deck = kept.map((d, i) => {
    const n = i + 1;

    // Full-bleed slides with pre-built HTML (cover): emitted as-is.
    if (d.full !== undefined) {
      return d.full;
    }

    // Standard slides: assembler wraps inner with head + foot.
    const variantClass = d.variant ? `slide ${d.variant}` : 'slide';
    const styleAttr = d.sectionStyle ? ` style="${d.sectionStyle}"` : '';
    const chapterLabel = d.chapter ?? '';
    const footLabel = d.footLabel ?? '';
    const dark = d.dark ?? false;

    return (
      `<section class="${variantClass}"${styleAttr}>` +
      head(dark, chapterLabel) +
      (d.inner ?? '') +
      foot(dark, footLabel, n, total) +
      `</section>`
    );
  }).join('');

  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${STYLE}</head>` +
    `<body><deck-stage width="1920" height="1080">${deck}</deck-stage>` +
    `<script>${DECK_STAGE_JS}</script>` +
    `<script>${LUCIDE_JS}</script>` +
    `<script>window.lucide&&lucide.createIcons()</script>` +
    `</body></html>`
  );
}
