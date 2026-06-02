import type { Deal, Stage } from '../state/types.js';

const STAGE_ORDER: Stage[] = [
  'NEW', 'SCOPING_PENDING_APPROVAL', 'SCOPING_SENT', 'SCOPE_REVIEW',
  'PROPOSAL_PENDING_APPROVAL', 'PROPOSAL_SENT', 'FOLLOWUP_PENDING_APPROVAL',
  'PO_PENDING_APPROVAL', 'MEETING_BOOKED', 'WON', 'STALLED', 'DISQUALIFIED',
];

const LABEL: Record<Stage, string> = {
  NEW: 'New',
  SCOPING_PENDING_APPROVAL: 'Awaiting scoping approval',
  SCOPING_SENT: 'Scoping sent',
  SCOPE_REVIEW: 'Scope review',
  PROPOSAL_PENDING_APPROVAL: 'Awaiting proposal approval',
  PROPOSAL_SENT: 'Proposal sent',
  FOLLOWUP_PENDING_APPROVAL: 'Awaiting follow-up approval',
  PO_PENDING_APPROVAL: 'Awaiting PO / HubSpot approval',
  MEETING_BOOKED: 'Meeting booked',
  WON: 'Won',
  STALLED: 'Stalled',
  DISQUALIFIED: 'Disqualified',
};

export function renderPipelineBoard(deals: Deal[], nowIso: string): string {
  const lines: string[] = ['# NI Sales — Pipeline', '', `_Updated ${nowIso}_`, ''];
  let any = false;
  for (const stage of STAGE_ORDER) {
    const group = deals.filter((d) => d.stage === stage);
    if (group.length === 0) continue;
    any = true;
    lines.push(`## ${LABEL[stage]} (${group.length})`, '');
    lines.push('| Company | Contact | Service lines | Last activity |');
    lines.push('| --- | --- | --- | --- |');
    for (const d of group) {
      const sl = d.service_lines.join(', ') || '—';
      lines.push(`| ${d.company} | ${d.contact_name} | ${sl} | ${d.last_inbound_at} |`);
    }
    lines.push('');
  }
  if (!any) lines.push('_No active deals._');
  return lines.join('\n');
}
