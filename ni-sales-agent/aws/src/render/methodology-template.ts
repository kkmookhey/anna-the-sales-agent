import type { ProposalContent, MethodologyContent } from '../proposal/types.js';
import { esc, type SlideDesc, assembleSlides, wrapDeck } from './deck-shared.js';
import { serviceLineLabel } from './labels.js';
import {
  buildCover, buildExecSummary, buildUnderstanding, buildScope,
  buildDeliverables, buildCredentials, buildWhyNi, buildNextSteps,
} from './template.js';

const sectionHead = (eyebrowClass: string, eyebrow: string, title: string): string =>
  `<div style="margin-top:40px;max-width:1500px;">
    <p class="${eyebrowClass}">${esc(eyebrow)}</p>
    <div class="gradient-band" style="width:160px;margin:22px 0 26px;"></div>
    <h2 class="title title-md" style="font-size:58px;">${esc(title)}</h2>
  </div>`;

function buildMethodologyOverview(m: MethodologyContent): SlideDesc | null {
  if (!m.operatingLoop.length) return null;
  const steps = m.operatingLoop.map((p, i) => `
    <div class="flow-step">
      <p class="flow-num">Phase ${String(i + 1).padStart(2, '0')}</p>
      <p class="flow-name">${esc(p.name)}</p>
      <p class="flow-detail">${esc(p.detail)}</p>
    </div>`).join('');
  return {
    variant: 'bg-gradient-violet', dark: true, chapter: '04 · Methodology', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', 'How we work', 'Our delivery methodology.')}
      <div class="flow-band">${steps}</div>`,
  };
}

function buildServiceMethodology(block: MethodologyContent['services'][number], idx: number): SlideDesc {
  const phases = block.phases.map((p, i) => `
    <tr><td><strong style="color:#0A0A0B;">${String(i + 1).padStart(2, '0')} · ${esc(p.name)}</strong></td>
        <td>${esc(p.detail)}</td></tr>`).join('');
  return {
    variant: 'slide-light', dark: false,
    chapter: `05.${idx + 1} · Methodology — ${serviceLineLabel(block.serviceLine)}`, footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow eyebrow-violet', serviceLineLabel(block.serviceLine), 'Phase-by-phase approach.')}
      <table class="coverage-table"><thead><tr><th>Phase</th><th>What we do at each phase</th></tr></thead><tbody>${phases}</tbody></table>`,
  };
}

function buildServiceTooling(block: MethodologyContent['services'][number], idx: number): SlideDesc {
  const tags = block.frameworks.map((f) => `<span class="fw-tag fw-tag-dark">${esc(f)}</span>`).join('');
  const tools = block.tooling.map((t) => `<span class="fw-tag fw-tag-dark">${esc(t)}</span>`).join('');
  return {
    variant: 'bg-crimson-wash', dark: true,
    chapter: `05.${idx + 1} · Standards & tooling — ${serviceLineLabel(block.serviceLine)}`, footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', serviceLineLabel(block.serviceLine), 'Standards, tooling & AI acceleration.')}
      <p class="eyebrow" style="margin-top:36px;">Frameworks &amp; standards</p>
      <div style="margin-top:14px;">${tags}</div>
      <p class="eyebrow" style="margin-top:32px;">Tooling</p>
      <div style="margin-top:14px;">${tools}</div>
      <p style="margin-top:32px;font-family:var(--font-display);font-size:24px;font-weight:300;color:rgba(255,255,255,0.85);max-width:1300px;line-height:1.4;">
        <strong style="color:#FCE205;font-weight:500;">AI-augmented · </strong>${esc(block.aiAugmentation)}</p>`,
  };
}

// Parse an arrow-style stat like "16k→10" / "16k -> 10" into its before/after halves.
function parseArrowStat(stat: string): { from: string; to: string } | null {
  const match = /^(.+?)\s*(?:→|->)\s*(.+)$/.exec(stat.trim());
  return match ? { from: (match[1] ?? '').trim(), to: (match[2] ?? '').trim() } : null;
}

function buildAiAugmentedDelivery(m: MethodologyContent): SlideDesc | null {
  if (!m.aiHighlights.length) return null;
  // Drive the funnel figures from the model's first highlight when it is arrow-shaped,
  // so the funnel never contradicts the tile beside it; otherwise fall back to the
  // canonical Transilience reduction metric.
  const funnel = (m.aiHighlights[0] && parseArrowStat(m.aiHighlights[0].stat)) || { from: '16k', to: '10' };
  const tiles = m.aiHighlights.map((h, i) => {
    const cls = i === m.aiHighlights.length - 1 && m.aiHighlights.length > 1 ? 'tile tile-accent' : 'tile';
    return `<div class="${cls}">
      <h3 style="font-family:var(--font-display);font-size:46px;font-weight:600;color:#FCE205;margin:0;">${esc(h.stat)}</h3>
      <p class="body" style="font-size:17px;">${esc(h.label)}</p></div>`;
  }).join('');
  return {
    variant: 'bg-crimson-wash', dark: true, chapter: '06 · AI-augmented delivery', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', 'The Transilience edge', 'AI-augmented, human-led.')}
      <div class="funnel">
        <span class="funnel-figure funnel-from">${esc(funnel.from)}</span>
        <span class="funnel-arrow">→</span>
        <span class="funnel-figure funnel-to">${esc(funnel.to)}</span>
        <span class="funnel-label">Transilience compresses raw findings into the handful of prioritized, exploitable actions that matter.</span>
      </div>
      <div style="margin-top:44px;display:grid;grid-template-columns:repeat(${Math.min(m.aiHighlights.length, 3)},1fr);gap:18px;">${tiles}</div>`,
  };
}

function buildFrameworkCrosswalk(m: MethodologyContent): SlideDesc | null {
  if (!m.crosswalk.length) return null;
  const rows = m.crosswalk.map((r) => `
    <tr><td>${esc(r.area)}</td>
        <td>${r.frameworks.map((f) => `<span class="fw-tag fw-tag-dark">${esc(f)}</span>`).join('')}</td>
        <td>${esc(r.evidence)}</td></tr>`).join('');
  return {
    variant: '', dark: true, chapter: '07 · Framework crosswalk', footLabel: 'Methodology',
    sectionStyle: 'background:#0A0A0B;',
    inner: `${sectionHead('eyebrow', 'Mapped to the standards that matter', 'Framework & compliance crosswalk.')}
      <table class="crosswalk-matrix"><thead><tr><th>Engagement area</th><th>Frameworks</th><th>Evidence produced</th></tr></thead>
      <tbody>${rows}</tbody></table>`,
  };
}

function buildEffortTimeline(content: ProposalContent, m: MethodologyContent): SlideDesc {
  const effortRows = content.effort.lines.map((l) => `
    <tr><td><strong style="color:#0A0A0B;">${esc(serviceLineLabel(l.serviceLine))}</strong></td>
        <td>${esc(l.basis)}</td><td style="text-align:right;">${l.manDays}</td></tr>`).join('');
  const days = m.timeline.map((d) => `
    <div class="day-row"><p class="day-mark">${esc(d.day)}</p><p class="day-text">${esc(d.milestone)}</p></div>`).join('');
  return {
    variant: 'slide-light', dark: false, chapter: '08 · Effort & timeline', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow eyebrow-violet', 'What it takes', 'Effort & delivery timeline.')}
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:56px;">
        <div>
          <table class="coverage-table"><thead><tr><th>Service line</th><th>Basis</th><th style="text-align:right;">Man-days</th></tr></thead>
          <tbody>${effortRows}
            <tr><td><strong>Total</strong></td><td></td><td style="text-align:right;"><strong>${content.effort.totalManDays}</strong></td></tr>
          </tbody></table>
          <p style="margin-top:16px;font-family:var(--font-body);font-size:15px;color:#3a3a40;">${esc(content.effort.aiLeverageNote)}</p>
        </div>
        <div class="day-timeline">${days}</div>
      </div>`,
  };
}

function buildBoundary(m: MethodologyContent): SlideDesc | null {
  if (!m.exclusions.length) return null;
  const items = m.exclusions.map((e) => `
    <div style="display:flex;gap:14px;align-items:flex-start;">
      <span style="color:#FCE205;font-size:20px;line-height:1;">↗</span>
      <p style="font-family:var(--font-body);font-size:19px;color:rgba(255,255,255,0.85);margin:0;line-height:1.45;">${esc(e)}</p>
    </div>`).join('');
  return {
    variant: 'bg-gradient-violet', dark: true, chapter: '09 · The boundary', footLabel: 'Methodology',
    inner: `${sectionHead('eyebrow', 'What we deliberately exclude', 'Clear scope, no surprises.')}
      <div style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:20px 56px;max-width:1500px;">${items}</div>`,
  };
}

export function renderMethodologyHtml(content: ProposalContent, m: MethodologyContent): string {
  const descs: (SlideDesc | null)[] = [
    buildCover(content),
    buildExecSummary(content),
    buildUnderstanding(content),
    buildScope(content),
    buildMethodologyOverview(m),
    ...m.services.flatMap((s, i) => [buildServiceMethodology(s, i), buildServiceTooling(s, i)]),
    buildAiAugmentedDelivery(m),
    buildFrameworkCrosswalk(m),
    buildDeliverables(content),
    buildEffortTimeline(content, m),
    buildCredentials(content),
    buildWhyNi(content),
    buildBoundary(m),
    buildNextSteps(content),
  ];
  return wrapDeck(assembleSlides(descs));
}
