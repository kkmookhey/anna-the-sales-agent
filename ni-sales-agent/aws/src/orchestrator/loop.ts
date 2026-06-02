import type { Config } from '../config.js';
import type { Deal, Stage } from '../state/types.js';
import { emptyScope } from '../state/types.js';
import { decideTransition, resolveScopeReview } from './transitions.js';
import { scanForInjection, verifiedRecipient } from '../gates/gates.js';
import { logger } from '../logging.js';

export interface GraphPort {
  listInbound(sinceIso: string): Promise<InboundMessage[]>;
  createDraftReply(messageId: string, bodyHtml: string): Promise<string>;
  wasReplySent(conversationId: string, afterIso: string): Promise<boolean>;
  latestInboundInConversation(conversationId: string, afterIso: string): Promise<InboundMessage | null>;
}
export interface InboundMessage {
  id: string; conversationId: string; subject: string; fromName: string; fromAddress: string;
  participants: string[]; receivedDateTime: string; bodyPreview: string; hasAttachments: boolean;
}
export interface SlackPort {
  postStaging(channelId: string, text: string, threadTs?: string): Promise<string>;
  detectApproval(channelId: string, threadTs: string, token: string, approvedUserIds: string[]): Promise<boolean>;
}
export interface HubSpotPort {
  createDeal(props: { dealname: string; pipeline: string; dealstage: string; hubspot_owner_id: string; amount?: string }): Promise<string>;
}
export interface JudgePort {
  scopeEnquiry(i: { fromName: string; subject: string; bodyPreview: string }): Promise<{ service_lines: string[]; draft_subject: string; draft_body_html: string }>;
  assessSufficiency(i: { scopeSoFar: Record<string, unknown>; reply: string }): Promise<{ sufficient: boolean; missing: string[]; assumptions: string[]; clarifying_subject?: string; clarifying_body_html?: string }>;
  draftFollowup(i: { company: string; contactName: string; followupNumber: number; scopeSummary: Record<string, unknown> }): Promise<{ draft_subject: string; draft_body_html: string }>;
}
export interface RepoPort {
  listDeals(): Promise<Deal[]>;
  getDeal(id: string): Promise<Deal | null>;
  putDeal(d: Deal): Promise<void>;
}

export interface LoopDeps {
  config: Config;
  now: Date;
  lastRunIso: string;
  graph: GraphPort;
  slack: SlackPort;
  hubspot: HubSpotPort;
  judge: JudgePort;
  repo: RepoPort;
}

export interface RunSummary {
  processed: number;
  staged: number;
  advanced: number;
  disqualified: number;
  flagged: number;
}

const INTERNAL_DOMAIN = 'networkintelligence.ai';

function isGenuineEnquiry(m: InboundMessage): boolean {
  const internal = m.fromAddress.endsWith(`@${INTERNAL_DOMAIN}`);
  const hasContent = m.bodyPreview.trim().length > 20;
  return !internal && hasContent;
}

function action(from: Stage, to: Stage, type: string, note: string, nowIso: string): Deal['actions'][number] {
  return { ts: nowIso, type, stage_from: from, stage_to: to, note };
}

export async function runLoop(deps: LoopDeps): Promise<RunSummary> {
  const { config, now, graph, slack, repo } = deps;
  const nowIso = now.toISOString();
  const summary: RunSummary = { processed: 0, staged: 0, advanced: 0, disqualified: 0, flagged: 0 };

  if (config.businessHoursOnly && !withinBusinessHours(now)) {
    logger.info('skip_outside_business_hours', { now: nowIso });
    return summary;
  }

  const inbound = await graph.listInbound(deps.lastRunIso);
  const deals = await repo.listDeals();
  const byConversation = new Map(deals.map((d) => [d.deal_id, d]));
  const stagingLines: string[] = [];

  for (const m of inbound) {
    summary.processed++;
    const existing = byConversation.get(m.conversationId);
    if (existing) continue;
    if (!isGenuineEnquiry(m)) {
      summary.disqualified++;
      stagingLines.push(`*Disqualified:* "${m.subject}" from \`${m.fromAddress}\` — internal/no enquiry content.`);
      continue;
    }
    const flags = scanForInjection(m.bodyPreview);
    if (flags.length) summary.flagged++;
    const fresh: Deal = {
      deal_id: m.conversationId,
      stage: 'NEW',
      company: domainToCompany(m.fromAddress),
      contact_name: m.fromName,
      contact_email: verifiedRecipient(m.fromAddress, m.participants),
      service_lines: [],
      created_at: m.receivedDateTime,
      last_inbound_id: m.id,
      last_inbound_at: m.receivedDateTime,
      next_followup_date: null,
      followup_count: 0,
      scope: emptyScope(),
      assumptions: [],
      proposal: null,
      actions: [],
      flags: flags.map((reason) => ({ ts: nowIso, message_id: m.id, reason })),
    };
    byConversation.set(fresh.deal_id, fresh);
  }

  for (const deal of byConversation.values()) {
    const line = await advanceDeal(deal, deps, nowIso);
    if (line) {
      stagingLines.push(line.text);
      if (line.staged) summary.staged++;
      if (line.advanced) summary.advanced++;
    }
  }

  const header = `:robot_face: *NI Sales Agent — run summary*${config.dryRun ? ' (dry-run)' : ''}\n` +
    `_${summary.processed} inbound · ${summary.staged} staged · ${summary.advanced} advanced · ` +
    `${summary.disqualified} disqualified · ${summary.flagged} flagged_`;
  await slack.postStaging(config.slackChannelId, [header, ...stagingLines].join('\n\n'));

  return summary;
}

interface AdvanceResult { text: string; staged: boolean; advanced: boolean }

async function advanceDeal(deal: Deal, deps: LoopDeps, nowIso: string): Promise<AdvanceResult | null> {
  const { config, graph, slack, hubspot, judge, repo } = deps;

  const replySent =
    deal.stage.endsWith('PENDING_APPROVAL') && deal.stage !== 'PO_PENDING_APPROVAL'
      ? await graph.wasReplySent(deal.deal_id, deal.last_inbound_at)
      : false;
  const latest = await graph.latestInboundInConversation(deal.deal_id, deal.last_inbound_at);
  const newInbound = latest !== null;
  const approvalDetected =
    deal.stage === 'PO_PENDING_APPROVAL'
      ? await slack.detectApproval(config.slackChannelId, slackThreadFor(deal), config.approvalToken, config.approvedSlackUserIds)
      : false;

  const t = decideTransition(deal, { newInbound, replySent, approvalDetected }, deps.now, {
    maxFollowups: config.maxFollowups,
    cadenceDays: config.followupCadenceDays,
  });

  switch (t.kind) {
    case 'NOOP': {
      if (deal.stage === 'SCOPE_REVIEW' && latest) {
        const verdict = await judge.assessSufficiency({ scopeSoFar: deal.scope as unknown as Record<string, unknown>, reply: latest.bodyPreview });
        const branch = resolveScopeReview(verdict.sufficient);
        if (branch.kind === 'STAGE_CLARIFY') {
          return stageDraft(deal, branch.nextStage, verdict.clarifying_subject ?? `Re: ${latest.subject}`, verdict.clarifying_body_html ?? '', 'clarify_staged', deps, nowIso, latest);
        }
        if (branch.kind === 'STAGE_PROPOSAL') {
          deal.assumptions = verdict.assumptions;
          return stageDraft(deal, branch.nextStage, `Proposal — ${deal.company}`, '<p>Proposal cover note.</p>', 'proposal_staged', deps, nowIso, latest);
        }
      }
      return null;
    }

    case 'ADVANCE': {
      const from = deal.stage;
      deal.stage = t.nextStage;
      if (newInbound && latest) {
        deal.last_inbound_id = latest.id;
        deal.last_inbound_at = latest.receivedDateTime;
      }
      if (t.nextStage === 'PROPOSAL_SENT') deal.next_followup_date = addBusinessDays(deps.now, config.followupCadenceDays[Math.min(deal.followup_count, config.followupCadenceDays.length - 1)]!).toISOString();
      deal.actions.push(action(from, t.nextStage, 'advance', `signal-driven advance`, nowIso));
      await repo.putDeal(deal);
      return { text: `*Advanced* ${deal.company}: ${from} → ${t.nextStage}`, staged: false, advanced: true };
    }

    case 'STAGE_SCOPING': {
      const scoped = await judge.scopeEnquiry({ fromName: deal.contact_name, subject: subjectFor(deal), bodyPreview: deal.scope.environment ?? lastBodyPreview(deal) });
      deal.service_lines = scoped.service_lines;
      deal.scope.service_lines = scoped.service_lines;
      return stageDraft(deal, t.nextStage, scoped.draft_subject, scoped.draft_body_html, 'scoping_staged', deps, nowIso, null);
    }

    case 'STAGE_FOLLOWUP': {
      const f = await judge.draftFollowup({ company: deal.company, contactName: deal.contact_name, followupNumber: deal.followup_count + 1, scopeSummary: deal.scope as unknown as Record<string, unknown> });
      deal.followup_count++;
      return stageDraft(deal, t.nextStage, f.draft_subject, f.draft_body_html, 'followup_staged', deps, nowIso, null);
    }

    case 'WRITE_HUBSPOT': {
      const from = deal.stage;
      const id = await hubspot.createDeal({
        dealname: `${deal.company} — ${deal.service_lines.join(', ')}`,
        pipeline: config.hubspotPipeline,
        dealstage: config.hubspotDealStage,
        hubspot_owner_id: config.hubspotOwnerId,
      });
      deal.stage = t.nextStage;
      deal.actions.push(action(from, t.nextStage, 'hubspot_write', `HubSpot deal ${id} created on SHIP-IT`, nowIso));
      await repo.putDeal(deal);
      return { text: `*HubSpot deal created* ${deal.company} (id ${id}) → WON`, staged: false, advanced: true };
    }

    default:
      return null;
  }
}

async function stageDraft(
  deal: Deal,
  nextStage: Stage,
  subject: string,
  bodyHtml: string,
  actionType: string,
  deps: LoopDeps,
  nowIso: string,
  latest: InboundMessage | null,
): Promise<AdvanceResult> {
  const { config, graph, repo } = deps;
  const replyToMessageId = latest?.id ?? deal.last_inbound_id;

  let draftRef = '(dry-run — text below)';
  if (!config.dryRun) {
    const draftId = await graph.createDraftReply(replyToMessageId, bodyHtml);
    draftRef = `Outlook draft created (id ${draftId})`;
  }

  const from = deal.stage;
  deal.stage = nextStage;
  deal.actions.push(action(from, nextStage, actionType, `staged: ${subject}`, nowIso));
  await repo.putDeal(deal);

  const text =
    `*[STAGING — ${actionType}]* ${deal.company} / ${deal.contact_name}\n` +
    `Deal: \`${deal.deal_id}\`  Stage: ${from} → ${nextStage}\n` +
    `Summary: ${subject}\n` +
    `Outlook draft: ${draftRef}\n` +
    `Approve by: sending the draft${nextStage === 'PO_PENDING_APPROVAL' ? '  |  replying SHIP-IT for HubSpot writes' : ''}\n` +
    `Flags: ${deal.flags.length ? deal.flags.map((f) => f.reason).join(', ') : 'none'}\n\n` +
    `> *Subject:* ${subject}\n> ${bodyHtml.replace(/<[^>]+>/g, '').slice(0, 1500)}`;

  return { text, staged: true, advanced: false };
}

function withinBusinessHours(now: Date): boolean {
  const istHour = (now.getUTCHours() + 5) % 24 + (now.getUTCMinutes() >= 30 ? 0.5 : 0);
  const day = now.getUTCDay();
  return day >= 1 && day <= 5 && istHour >= 9 && istHour < 19;
}
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}
function domainToCompany(addr: string): string {
  const domain = addr.split('@')[1] ?? '';
  const base = domain.split('.')[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function slackThreadFor(deal: Deal): string {
  const po = [...deal.actions].reverse().find((a) => a.note.startsWith('thread:'));
  return po ? po.note.replace('thread:', '') : '';
}
function subjectFor(deal: Deal): string {
  return deal.actions.length ? deal.actions[deal.actions.length - 1]!.note : 'Enquiry';
}
function lastBodyPreview(deal: Deal): string {
  return deal.scope.environment ?? deal.company;
}
