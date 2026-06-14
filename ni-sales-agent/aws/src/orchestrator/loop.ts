import type { Config } from '../config.js';
import type { Deal, Scope, Stage } from '../state/types.js';
import { emptyScope } from '../state/types.js';
import { decideTransition, resolveScopeReview, resolveProposalReply } from './transitions.js';
import { bareEmail, bodyDerivedRecipient, scanForInjection, verifiedRecipient } from '../gates/gates.js';
import { decideAttachment, MAX_FILES_PER_MESSAGE } from '../gates/attachments.js';
import type { AttachmentMeta } from '../adapters/graph.js';
import { isAutomatedSender } from './intake.js';
import { logger } from '../logging.js';
import { renderPipelineBoard } from '../canvas/board.js';
import type { ProposalContent } from '../proposal/types.js';

const escHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Canonical sign-off appended to every outbound customer email (drafts + proposal cover).
 *  The LLM is told NOT to write its own sign-off; this is the single source of truth. */
const EMAIL_SIGN_OFF = '<p>Best regards,<br/>Anna · Network Intelligence</p>';

export interface GraphPort {
  listInbound(sinceIso: string): Promise<InboundMessage[]>;
  createDraftReply(messageId: string, bodyHtml: string): Promise<string>;
  createDraftToExternal(messageId: string, bodyHtml: string, toAddress: string): Promise<string>;
  wasReplySent(conversationId: string, afterIso: string): Promise<boolean>;
  draftExistsInConversation(conversationId: string): Promise<boolean>;
  latestInboundInConversation(conversationId: string, afterIso: string): Promise<InboundMessage | null>;
  addAttachment(messageId: string, name: string, content: Buffer, contentType?: string): Promise<void>;
  listAttachments(messageId: string): Promise<AttachmentMeta[]>;
  getAttachmentBytes(messageId: string, attachmentId: string): Promise<Buffer>;
}
export interface InboundMessage {
  id: string; conversationId: string; subject: string; fromName: string; fromAddress: string;
  participants: string[]; receivedDateTime: string; bodyPreview: string; bodyFull: string; hasAttachments: boolean;
}
export interface SlackPort {
  postStaging(channelId: string, text: string, threadTs?: string): Promise<string>;
  detectApproval(channelId: string, threadTs: string, token: string, approvedUserIds: string[]): Promise<boolean>;
  upsertCanvas(canvasId: string | null, title: string, markdown: string): Promise<string>;
}
export interface HubSpotPort {
  createDeal(props: { dealname: string; pipeline: string; dealstage: string; hubspot_owner_id: string; amount?: string }): Promise<string>;
}
export interface JudgePort {
  scopeEnquiry(i: { fromName: string; subject: string; bodyPreview: string; attachmentText?: string }): Promise<{ service_lines: string[]; draft_subject: string; draft_body_html: string; company: string; scope: Partial<Scope> }>;
  assessSufficiency(i: { scopeSoFar: Record<string, unknown>; reply: string; attachmentText?: string }): Promise<{ sufficient: boolean; missing: string[]; assumptions: string[]; clarifying_subject?: string; clarifying_body_html?: string; scope_updates?: Partial<Scope> }>;
  draftFollowup(i: { company: string; contactName: string; followupNumber: number; scopeSummary: Record<string, unknown> }): Promise<{ draft_subject: string; draft_body_html: string }>;
  classifyInbound(i: { fromName: string; fromAddress: string; subject: string; body: string }): Promise<{ category: 'enquiry' | 'forwarded_enquiry' | 'not_enquiry'; original_sender?: { name: string; email: string }; confidence: 'high' | 'low'; reason: string }>;
  classifyProposalReply(i: { subject: string; reply: string }): Promise<{ kind: 'meeting' | 'po' | 'clarification' | 'none' }>;
  buildProposalContent(i: { company: string; contactName: string; serviceLines: string[]; scope: Record<string, unknown>; assumptions: string[] }): Promise<ProposalContent>;
}
export interface RepoPort {
  listDeals(): Promise<Deal[]>;
  getDeal(id: string): Promise<Deal | null>;
  putDeal(d: Deal): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  putMeta(key: string, value: string): Promise<void>;
}
export interface S3Port {
  put(key: string, body: Buffer, contentType?: string): Promise<string>;
}
export interface DeckPort {
  render(content: ProposalContent): Promise<{ pdf: Buffer; docx: Buffer }>;
  parseAttachment(file: { name: string; contentType: string; bytes: Buffer }): Promise<{ name: string; text: string; truncated: boolean; error?: string }>;
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
  s3: S3Port;
  deck: DeckPort;
}

export interface RunSummary {
  processed: number;
  staged: number;
  advanced: number;
  disqualified: number;
  flagged: number;
  errors: number;
}

function action(from: Stage, to: Stage, type: string, note: string, nowIso: string): Deal['actions'][number] {
  return { ts: nowIso, type, stage_from: from, stage_to: to, note };
}

export async function runLoop(deps: LoopDeps): Promise<RunSummary> {
  const { config, now, graph, slack, repo } = deps;
  const nowIso = now.toISOString();
  const summary: RunSummary = { processed: 0, staged: 0, advanced: 0, disqualified: 0, flagged: 0, errors: 0 };

  if (config.businessHoursOnly && !withinBusinessHours(now)) {
    logger.info('skip_outside_business_hours', { now: nowIso });
    return summary;
  }

  const inbound = await graph.listInbound(deps.lastRunIso);
  const deals = await repo.listDeals();
  const byConversation = new Map(deals.map((d) => [d.deal_id, d]));
  const originatingContext = new Map<string, { subject: string; body: string; hasAttachments: boolean }>();
  const stagingLines: string[] = [];

  const reviewLines: string[] = [];

  for (const m of inbound) {
    summary.processed++;
    if (byConversation.get(m.conversationId)) continue;

    if (isAutomatedSender(m.fromAddress)) {
      summary.disqualified++;
      stagingLines.push(`*Disqualified:* "${m.subject}" from \`${m.fromAddress}\` — automated sender.`);
      continue;
    }

    const body = htmlToText(m.bodyFull);
    const verdict = await deps.judge.classifyInbound({
      fromName: m.fromName, fromAddress: m.fromAddress, subject: m.subject, body,
    });

    if (verdict.category === 'not_enquiry') {
      summary.disqualified++;
      stagingLines.push(`*Disqualified:* "${m.subject}" from \`${m.fromAddress}\` — ${verdict.reason}.`);
      continue;
    }
    if (verdict.confidence === 'low') {
      reviewLines.push(`*Review (low-confidence):* "${m.subject}" from \`${m.fromAddress}\` — ${verdict.reason}. Not auto-drafted.`);
      continue;
    }

    const flags = scanForInjection(body);
    if (flags.length) summary.flagged++;

    const forwarded = verdict.category === 'forwarded_enquiry';
    const prospect = forwarded ? verdict.original_sender : undefined;

    const fresh: Deal = {
      deal_id: m.conversationId,
      stage: 'NEW',
      company: prospect?.email ? domainToCompany(prospect.email) : domainToCompany(m.fromAddress),
      contact_name: prospect?.name ?? m.fromName,
      contact_email: forwarded
        ? (prospect?.email ?? '')
        : verifiedRecipient(m.fromAddress, m.participants),
      service_lines: [],
      created_at: m.receivedDateTime,
      last_inbound_id: m.id,
      last_inbound_at: m.receivedDateTime,
      next_followup_date: null,
      followup_count: 0,
      scope: emptyScope(),
      assumptions: [],
      proposal: null,
      parked_at: null,
      actions: [],
      flags: flags.map((reason) => ({ ts: nowIso, message_id: m.id, reason })),
      intake: forwarded
        ? { source: 'forwarded', forwarded_by: bareEmail(m.fromAddress), proposed_recipient: prospect?.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(prospect.email.trim()) ? prospect.email.trim() : undefined, recipient_verified: false }
        : { source: 'direct', recipient_verified: true },
    };
    byConversation.set(fresh.deal_id, fresh);
    originatingContext.set(fresh.deal_id, { subject: m.subject, body, hasAttachments: m.hasAttachments });
  }

  for (const deal of byConversation.values()) {
    try {
      const line = await advanceDeal(deal, deps, nowIso, originatingContext.get(deal.deal_id) ?? null);
      if (line) {
        stagingLines.push(line.text);
        if (line.staged) summary.staged++;
        if (line.advanced) summary.advanced++;
        if (line.newFlags) summary.flagged += line.newFlags;
      }
    } catch (err) {
      summary.errors++;
      logger.error('advance_deal_failed', { deal_id: deal.deal_id, error: err instanceof Error ? err.message : String(err) });
      stagingLines.push(`:x: *Error advancing* ${deal.company} (\`${deal.deal_id}\`): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const board = renderPipelineBoard([...byConversation.values()], nowIso);
  const existingCanvasId = await repo.getMeta('canvas_id');
  const canvasId = await slack.upsertCanvas(existingCanvasId, 'Anna — Pipeline', board);
  if (!existingCanvasId) await repo.putMeta('canvas_id', canvasId);

  logger.info('run_done', { ...summary });

  const hasActivity = stagingLines.length > 0 || reviewLines.length > 0;
  if (hasActivity) {
    const header = `:robot_face: *Anna — run summary*${config.dryRun ? ' (dry-run)' : ''}\n` +
      `_${summary.processed} inbound · ${summary.staged} staged · ${summary.advanced} advanced · ` +
      `${summary.disqualified} disqualified · ${summary.flagged} flagged · ${summary.errors} errors_`;
    await slack.postStaging(config.slackChannelId, [header, ...stagingLines, ...reviewLines].join('\n\n'));
  }

  return summary;
}

interface AdvanceResult { text: string; staged: boolean; advanced: boolean; newFlags?: number }

async function advanceDeal(
  deal: Deal,
  deps: LoopDeps,
  nowIso: string,
  originating: { subject: string; body: string; hasAttachments: boolean } | null,
): Promise<AdvanceResult | null> {
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
        // Both outcomes (clarify, proposal) create an Outlook draft. If an unsent draft is already
        // on the thread, park instead of doing expensive judge work — leave the reply UNCONSUMED.
        const park = await parkIfDraftPending(deal, deps, nowIso);
        if (park.parked) return park.line;
        deal.parked_at = null;
        const att = latest.hasAttachments ? await extractAttachmentText(deps, latest.id) : { text: '', note: null, flags: [] };
        if (att.flags.length) deal.flags.push(...att.flags.map((reason) => ({ ts: nowIso, message_id: latest.id, reason })));
        const verdict = await judge.assessSufficiency({ scopeSoFar: deal.scope as unknown as Record<string, unknown>, reply: htmlToText(latest.bodyFull), attachmentText: att.text || undefined });
        const branch = resolveScopeReview(verdict.sufficient);
        if (verdict.scope_updates) deal.scope = { ...deal.scope, ...verdict.scope_updates };
        // consume the reply we just ran sufficiency on (persisted by stageDraft/stageProposal)
        deal.last_inbound_id = latest.id;
        deal.last_inbound_at = latest.receivedDateTime;
        if (branch.kind === 'STAGE_CLARIFY') {
          const r = await stageDraft(deal, branch.nextStage, verdict.clarifying_subject ?? `Re: ${latest.subject}`, verdict.clarifying_body_html ?? '', 'clarify_staged', deps, nowIso, latest, att.note);
          if (r && att.flags.length) r.newFlags = att.flags.length ? 1 : 0;
          return r;
        }
        if (branch.kind === 'STAGE_PROPOSAL') {
          const r = await stageProposal(deal, deps, nowIso, latest, verdict, att.note);
          if (r && att.flags.length) r.newFlags = att.flags.length ? 1 : 0;
          return r;
        }
      }
      if (deal.stage === 'PROPOSAL_SENT' && latest) {
        const { kind } = await judge.classifyProposalReply({ subject: latest.subject, reply: htmlToText(latest.bodyFull) });
        const branch = resolveProposalReply(kind);

        if (branch.kind === 'STAGE_FOLLOWUP') {
          // A clarification reply would draft a follow-up. If an unsent draft is already on the
          // thread, park instead of stacking one — leave the reply UNCONSUMED so we resume here.
          const park = await parkIfDraftPending(deal, deps, nowIso);
          if (park.parked) return park.line;
          deal.parked_at = null;
          deal.last_inbound_id = latest.id;
          deal.last_inbound_at = latest.receivedDateTime;
          const f = await judge.draftFollowup({
            company: deal.company, contactName: deal.contact_name,
            followupNumber: deal.followup_count + 1,
            scopeSummary: deal.scope as unknown as Record<string, unknown>,
          });
          return stageDraft(deal, 'FOLLOWUP_PENDING_APPROVAL', f.draft_subject, f.draft_body_html, 'clarification_staged', deps, nowIso, latest);
        }

        // meeting / po / none never create an Outlook draft, so a pending draft does not block them.
        deal.parked_at = null;
        // consume the reply so we don't reclassify it next run
        deal.last_inbound_id = latest.id;
        deal.last_inbound_at = latest.receivedDateTime;

        if (branch.kind === 'ADVANCE' && branch.nextStage === 'MEETING_BOOKED') {
          const from = deal.stage;
          deal.stage = 'MEETING_BOOKED';
          deal.actions.push(action(from, 'MEETING_BOOKED', 'meeting_booked', 'prospect proposed/accepted a meeting; human handoff', nowIso));
          await repo.putDeal(deal);
          return { text: `*Meeting* ${deal.company}: prospect wants to meet — automation off, human handoff. \`${deal.deal_id}\``, staged: false, advanced: true };
        }
        if (branch.kind === 'ADVANCE' && branch.nextStage === 'PO_PENDING_APPROVAL') {
          return stagePoApproval(deal, deps, nowIso);
        }
        // kind === 'none' → record the consumed reply, no action
        await repo.putDeal(deal);
        return null;
      }
      return null;
    }

    case 'ADVANCE': {
      const from = deal.stage;
      deal.stage = t.nextStage;
      if (t.nextStage === 'PROPOSAL_SENT') deal.next_followup_date = addBusinessDays(deps.now, config.followupCadenceDays[Math.min(deal.followup_count, config.followupCadenceDays.length - 1)]!).toISOString();
      deal.actions.push(action(from, t.nextStage, 'advance', `signal-driven advance`, nowIso));
      await repo.putDeal(deal);
      return { text: `*Advanced* ${deal.company}: ${from} → ${t.nextStage}`, staged: false, advanced: true };
    }

    case 'STAGE_SCOPING': {
      const att = originating?.hasAttachments
        ? await extractAttachmentText(deps, deal.last_inbound_id)
        : { text: '', note: null, flags: [] };
      if (att.flags.length) deal.flags.push(...att.flags.map((reason) => ({ ts: nowIso, message_id: deal.last_inbound_id, reason })));
      const scoped = await judge.scopeEnquiry({
        fromName: deal.contact_name,
        subject: originating?.subject ?? '',
        bodyPreview: originating?.body ?? '',
        attachmentText: att.text || undefined,
      });
      deal.service_lines = scoped.service_lines;
      deal.scope = { ...deal.scope, ...scoped.scope, service_lines: scoped.service_lines };
      // For direct enquiries prefer the LLM-extracted company over the email-domain guess.
      // For forwarded enquiries the prospect's email domain is already set; don't override it.
      if (scoped.company?.trim() && deal.intake.source !== 'forwarded') deal.company = scoped.company.trim();
      const draftResult = await stageDraft(deal, t.nextStage, scoped.draft_subject, scoped.draft_body_html, 'scoping_staged', deps, nowIso, null, att.note);
      if (draftResult && att.flags.length) draftResult.newFlags = att.flags.length ? 1 : 0;
      return draftResult;
    }

    case 'STAGE_FOLLOWUP': {
      const f = await judge.draftFollowup({ company: deal.company, contactName: deal.contact_name, followupNumber: deal.followup_count + 1, scopeSummary: deal.scope as unknown as Record<string, unknown> });
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

/**
 * If an unsent Outlook draft is already on the thread, the deal cannot create another draft —
 * park it: leave the reply UNCONSUMED and the stage unchanged so it resumes once the human
 * sends/discards the draft. `parked` tells the caller to stop; `line` is the one-time Slack
 * notice (null on repeat parks and in dry-run, where no real draft is ever created).
 */
async function parkIfDraftPending(
  deal: Deal,
  deps: LoopDeps,
  nowIso: string,
): Promise<{ parked: boolean; line: AdvanceResult | null }> {
  const { config, graph, repo } = deps;
  if (config.dryRun) return { parked: false, line: null };
  // A Graph error here surfaces as a per-deal error (logged + flagged in Slack) and recovers next run — intentional, not swallowed.
  if (!(await graph.draftExistsInConversation(deal.deal_id))) return { parked: false, line: null };
  if (deal.parked_at) return { parked: true, line: null }; // already notified — stay silent
  deal.parked_at = nowIso;
  await repo.putDeal(deal);
  return {
    parked: true,
    line: {
      text: `:hourglass_flowing_sand: *Parked* ${deal.company} (\`${deal.deal_id}\`): an unsent draft is already on this thread. Send or discard it before the agent can proceed.`,
      staged: false,
      advanced: false,
    },
  };
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
  attachmentNote?: string | null,
): Promise<AdvanceResult | null> {
  const { config, graph, repo } = deps;
  if (!config.dryRun && (await graph.draftExistsInConversation(deal.deal_id))) {
    logger.info('skip_duplicate_draft', { deal_id: deal.deal_id, stage: deal.stage, action: actionType });
    return null;
  }
  const replyToMessageId = latest?.id ?? deal.last_inbound_id;
  const fwd = deal.intake.source === 'forwarded';
  const toProspect = fwd ? deal.intake.proposed_recipient : undefined;
  const body = `${bodyHtml}${EMAIL_SIGN_OFF}`;

  let draftRef = '(dry-run — text below)';
  let recipientFlag = '';
  if (!config.dryRun) {
    if (toProspect) {
      const to = bodyDerivedRecipient(toProspect);
      const draftId = await graph.createDraftToExternal(replyToMessageId, body, to);
      draftRef = `Outlook draft created (id ${draftId})`;
      recipientFlag = `\n:warning: Recipient \`${to}\` was extracted from a FORWARDED body — verify before sending. Forwarded by \`${deal.intake.forwarded_by ?? 'unknown'}\`.`;
    } else {
      const draftId = await graph.createDraftReply(replyToMessageId, body);
      draftRef = `Outlook draft created (id ${draftId})`;
      if (fwd) recipientFlag = `\n:warning: Couldn't determine the prospect's address from the forward — set the recipient manually before sending.`;
    }
  } else if (fwd) {
    recipientFlag = toProspect
      ? `\n:warning: (dry-run) Would draft to body-derived recipient \`${toProspect}\` — verify before sending.`
      : `\n:warning: (dry-run) Forwarded enquiry with no extractable prospect address — set recipient manually.`;
  }

  const from = deal.stage;
  deal.stage = nextStage;
  if (actionType === 'followup_staged') deal.followup_count++;
  deal.actions.push(action(from, nextStage, actionType, `staged: ${subject}`, nowIso));
  await repo.putDeal(deal);

  const text =
    `*[STAGING — ${actionType}]* ${deal.company} / ${deal.contact_name}\n` +
    `Deal: \`${deal.deal_id}\`  Stage: ${from} → ${nextStage}\n` +
    `Summary: ${subject}\n` +
    `Outlook draft: ${draftRef}${recipientFlag}\n` +
    `Approve by: sending the draft${nextStage === 'PO_PENDING_APPROVAL' ? '  |  replying SHIP-IT for HubSpot writes' : ''}\n` +
    `Flags: ${deal.flags.length ? deal.flags.map((f) => f.reason).join(', ') : 'none'}\n` +
    (attachmentNote ? `${attachmentNote}\n` : '') +
    `\n> *Subject:* ${subject}\n> ${htmlToText(body).slice(0, 1500)}`;

  return { text, staged: true, advanced: false };
}

async function stageProposal(
  deal: Deal,
  deps: LoopDeps,
  nowIso: string,
  latest: InboundMessage | null,
  verdict: { assumptions: string[] },
  attachmentNote?: string | null,
): Promise<AdvanceResult | null> {
  const { config, graph, repo, judge, deck, s3 } = deps;
  if (!config.dryRun && (await graph.draftExistsInConversation(deal.deal_id))) {
    logger.info('skip_duplicate_draft', { deal_id: deal.deal_id, stage: deal.stage, action: 'proposal' });
    return null;
  }

  deal.assumptions = verdict.assumptions;
  const content = await judge.buildProposalContent({
    company: deal.company,
    contactName: deal.contact_name,
    serviceLines: deal.service_lines,
    scope: deal.scope as unknown as Record<string, unknown>,
    assumptions: deal.assumptions,
  });

  const version = (deal.proposal?.version ?? 0) + 1;
  const { pdf, docx } = await deck.render(content);
  const slug = deal.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const pdfName = `${slug}-proposal-v${version}.pdf`;
  const docxName = `${slug}-commercials-v${version}.docx`;
  const deckUri = await s3.put(`proposals/${pdfName}`, pdf);
  const docxUri = await s3.put(`proposals/${docxName}`, docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  deal.proposal = { deck_path: deckUri, version, staged_at: nowIso };

  const firstName = deal.contact_name.split(' ')[0] ?? deal.contact_name;
  const coverHtml =
    `<p>Hi ${escHtml(firstName)},</p>` +
    `<p>Please find attached our proposal for ${deal.service_lines.map(escHtml).join(', ')}. ` +
    `It lists the assumptions we made so you can correct anything that's off. ` +
    `The deck contains the engagement overview and the commercials document contains pricing. ` +
    `Happy to walk through it on a short call.</p>` +
    EMAIL_SIGN_OFF;

  let draftRef = `(dry-run — no draft; deck stored at ${deckUri})`;
  if (!config.dryRun) {
    const draftId = await graph.createDraftReply(latest?.id ?? deal.last_inbound_id, coverHtml);
    await graph.addAttachment(draftId, pdfName, pdf, 'application/pdf');
    await graph.addAttachment(draftId, docxName, docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    draftRef = `Outlook draft ${draftId} (deck + commercials attached)`;
  }

  const from = deal.stage;
  deal.stage = 'PROPOSAL_PENDING_APPROVAL';
  deal.actions.push({
    ts: nowIso, type: 'proposal_staged', stage_from: from, stage_to: 'PROPOSAL_PENDING_APPROVAL',
    note: `deck v${version} -> ${deckUri}`,
  });
  await repo.putDeal(deal);

  const priceFlag =
    content.commercials.mode === 'placeholder'
      ? '\n:warning: Commercials are a PLACEHOLDER — a human must set pricing before sending.'
      : '';
  const text =
    `*[STAGING — proposal]* ${deal.company} / ${deal.contact_name}\n` +
    `Deal: \`${deal.deal_id}\`  Stage: ${from} → PROPOSAL_PENDING_APPROVAL\n` +
    `Deck: ${deckUri} (v${version})\n` +
    `Commercials: ${docxUri} (v${version})\n` +
    `Outlook draft: ${draftRef}\n` +
    `Approve by: sending the draft${priceFlag}\n` +
    (attachmentNote ? `${attachmentNote}\n` : '') +
    `Assumptions: ${deal.assumptions.join('; ') || 'none'}`;

  return { text, staged: true, advanced: false };
}

async function stagePoApproval(deal: Deal, deps: LoopDeps, nowIso: string): Promise<AdvanceResult> {
  const { config, slack, repo } = deps;
  const from = deal.stage;
  deal.stage = 'PO_PENDING_APPROVAL';
  const msg =
    `*[STAGING — HubSpot write]* ${deal.company} / ${deal.contact_name}\n` +
    `Deal: \`${deal.deal_id}\`  Stage: ${from} → PO_PENDING_APPROVAL\n` +
    `Prospect signalled a PO / go-ahead. Reply *${config.approvalToken}* in THIS thread to log the deal to HubSpot (Closed-Won).`;
  const ts = await slack.postStaging(config.slackChannelId, msg);
  deal.actions.push(action(from, 'PO_PENDING_APPROVAL', 'po_staged', `thread:${ts}`, nowIso));
  await repo.putDeal(deal);
  return { text: `*PO received* ${deal.company} → PO_PENDING_APPROVAL (awaiting ${config.approvalToken})`, staged: true, advanced: false };
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
interface AttachmentExtract { text: string; note: string | null; flags: string[] }

/**
 * Download + parse the allowed attachments on a message and return aggregated UNTRUSTED text.
 * Never throws: any per-file failure degrades to a Slack note and is skipped. note=null when
 * there was nothing worth mentioning.
 */
async function extractAttachmentText(deps: LoopDeps, messageId: string): Promise<AttachmentExtract> {
  const { graph, deck } = deps;
  let metas: AttachmentMeta[];
  try {
    metas = await graph.listAttachments(messageId);
  } catch (err) {
    logger.error('attachment_list_failed', { messageId, error: err instanceof Error ? err.message : String(err) });
    return { text: '', note: null, flags: [] };
  }

  const parsedNames: string[] = [];
  const skipped: string[] = [];
  const blocks: string[] = [];
  const flags: string[] = [];
  let processed = 0;

  for (const meta of metas) {
    const decision = decideAttachment(meta);
    if (!decision.parse) { skipped.push(`${meta.name} (${decision.reason})`); continue; }
    if (processed >= MAX_FILES_PER_MESSAGE) { skipped.push(`${meta.name} (over ${MAX_FILES_PER_MESSAGE}-file limit)`); continue; }
    processed++;
    try {
      const bytes = await graph.getAttachmentBytes(messageId, meta.id);
      const result = await deck.parseAttachment({ name: meta.name, contentType: meta.contentType, bytes });
      if (result.error || !result.text) { skipped.push(`${meta.name} (${result.error ?? 'no text extracted'})`); continue; }
      blocks.push(`--- ${meta.name}${result.truncated ? ' (truncated)' : ''} ---\n${result.text}`);
      parsedNames.push(meta.name);
      for (const reason of scanForInjection(result.text)) if (!flags.includes(reason)) flags.push(reason);
    } catch (err) {
      logger.error('attachment_parse_failed', { messageId, name: meta.name, error: err instanceof Error ? err.message : String(err) });
      skipped.push(`${meta.name} (download/parse error)`);
    }
  }

  const noteParts: string[] = [];
  if (parsedNames.length) noteParts.push(`:paperclip: Scope includes content extracted from attachment(s): ${parsedNames.join(', ')} — customer-provided, verify.`);
  if (skipped.length) noteParts.push(`:warning: Attachment(s) not read (extract manually): ${skipped.join('; ')}.`);

  return { text: blocks.join('\n\n'), note: noteParts.length ? noteParts.join('\n') : null, flags };
}

/** Strip HTML tags and decode the common entities so the Slack preview reads cleanly. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
