import { describe, it, expect, vi } from 'vitest';
import { runLoop, type LoopDeps } from '../../src/orchestrator/loop.js';
import type { Deal } from '../../src/state/types.js';

function baseDeps(overrides: Partial<LoopDeps>): LoopDeps {
  const stored: Record<string, Deal> = {};
  return {
    config: {
      mailbox: 'sales@networkintelligence.ai', slackChannelId: 'C1', approvalToken: 'SHIP-IT',
      dryRun: false, followupCadenceDays: [3, 7, 14], maxFollowups: 3, businessHoursOnly: false,
      dealsTable: 't', region: 'ap-south-1', hubspotPipeline: 'default', hubspotDealStage: '39235007',
      hubspotOwnerId: '1', approvedSlackUserIds: ['U1'],
    },
    now: new Date('2026-06-02T15:00:00Z'),
    lastRunIso: '2026-06-02T00:00:00Z',
    graph: {
      listInbound: vi.fn().mockResolvedValue([
        {
          id: 'm1', conversationId: 'conv-1', subject: 'VAPT Enquiry', fromName: 'Shashank',
          fromAddress: 'kkmookhey@gmail.com', participants: ['kkmookhey@gmail.com', 'sales@networkintelligence.ai'],
          receivedDateTime: '2026-06-02T14:07:28Z', bodyPreview: 'Mobile VAPT, CERT-In, 30 days', hasAttachments: false,
        },
      ]),
      createDraftReply: vi.fn().mockResolvedValue('draft-1'),
      wasReplySent: vi.fn().mockResolvedValue(false),
      latestInboundInConversation: vi.fn().mockResolvedValue(null),
      addAttachment: vi.fn().mockResolvedValue(undefined),
    },
    slack: { postStaging: vi.fn().mockResolvedValue('111.222'), detectApproval: vi.fn().mockResolvedValue(false), upsertCanvas: vi.fn().mockResolvedValue('F123') },
    hubspot: { createDeal: vi.fn().mockResolvedValue('99001') },
    judge: {
      scopeEnquiry: vi.fn().mockResolvedValue({ service_lines: ['pentest_mobile'], draft_subject: 'Re: VAPT Enquiry', draft_body_html: '<p>Hi</p>' }),
      assessSufficiency: vi.fn().mockResolvedValue({ sufficient: true, missing: [], assumptions: ['~95 screens'] }),
      buildProposalContent: vi.fn().mockResolvedValue({ company: 'Novelty Wealth', contactName: 'Shashank', serviceLines: ['pentest_mobile'], titleLine: 'Mobile VAPT Proposal for Novelty Wealth', understanding: ['x'], scopeRows: [{ line: 'Mobile', detail: 'A+i' }], assumptions: ['~95 screens'], approach: ['OWASP MASVS'], deliverables: ['report'], timeline: '4w', whyNi: ['CERT-In'], commercials: { mode: 'placeholder', text: 'TBC' }, nextSteps: ['NDA'] }),
      draftFollowup: vi.fn(),
    },
    repo: {
      listDeals: vi.fn(async () => Object.values(stored)),
      getDeal: vi.fn(async (id: string) => stored[id] ?? null),
      putDeal: vi.fn(async (d: Deal) => { stored[d.deal_id] = d; }),
      getMeta: vi.fn(async () => null),
      putMeta: vi.fn(async () => {}),
    },
    s3: { put: vi.fn().mockResolvedValue('s3://ni-decks/proposals/novelty-wealth-v1.pptx') },
    deck: { render: vi.fn().mockResolvedValue(Buffer.from('PK deck')) },
    ...overrides,
  } as LoopDeps;
}

describe('runLoop — NEW enquiry slice', () => {
  it('opens a NEW deal, scopes it, creates a draft, posts staging, and stores SCOPING_PENDING_APPROVAL', async () => {
    const deps = baseDeps({});
    const summary = await runLoop(deps);

    expect(deps.judge.scopeEnquiry).toHaveBeenCalledOnce();
    expect(deps.graph.createDraftReply).toHaveBeenCalledWith('m1', '<p>Hi</p>');
    expect(deps.slack.postStaging).toHaveBeenCalledOnce();
    expect(deps.repo.putDeal).toHaveBeenCalledOnce();

    const stored = (deps.repo.putDeal as ReturnType<typeof vi.fn>).mock.calls[0][0] as Deal;
    expect(stored.stage).toBe('SCOPING_PENDING_APPROVAL');
    expect(stored.contact_email).toBe('kkmookhey@gmail.com');
    expect(stored.deal_id).toBe('conv-1');
    expect(summary.staged).toBe(1);
  });

  it('disqualifies an internal sender with no enquiry content and takes no action', async () => {
    const deps = baseDeps({});
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'm2', conversationId: 'conv-2', subject: 'Test', fromName: 'Suraj',
        fromAddress: 'suraj.palsamkar@networkintelligence.ai',
        participants: ['suraj.palsamkar@networkintelligence.ai', 'sales@networkintelligence.ai'],
        receivedDateTime: '2026-06-02T06:48:47Z', bodyPreview: 'This is Test ID.', hasAttachments: true,
      },
    ]);
    const summary = await runLoop(deps);
    expect(deps.judge.scopeEnquiry).not.toHaveBeenCalled();
    expect(deps.graph.createDraftReply).not.toHaveBeenCalled();
    expect(summary.disqualified).toBe(1);
  });

  it('updates the pipeline canvas every run and persists the canvas id on first creation', async () => {
    const deps = baseDeps({});
    await runLoop(deps);
    expect(deps.slack.upsertCanvas).toHaveBeenCalledOnce();
    expect(deps.repo.putMeta).toHaveBeenCalledWith('canvas_id', 'F123');
  });

  it('respects dry_run: posts staging but never creates an Outlook draft', async () => {
    const deps = baseDeps({});
    deps.config.dryRun = true;
    await runLoop(deps);
    expect(deps.slack.postStaging).toHaveBeenCalledOnce();
    expect(deps.graph.createDraftReply).not.toHaveBeenCalled();
  });
});

describe('runLoop — SCOPE_REVIEW proposal slice', () => {
  it('SCOPE_REVIEW + sufficient scope builds a deck, stores it, attaches it, and stages the proposal', async () => {
    const deps = baseDeps({});
    (deps.repo.listDeals as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        deal_id: 'conv-1', stage: 'SCOPE_REVIEW', company: 'Novelty Wealth', contact_name: 'Shashank',
        contact_email: 'kkmookhey@gmail.com', service_lines: ['pentest_mobile'], created_at: '2026-06-01T00:00:00Z',
        last_inbound_id: 'm1', last_inbound_at: '2026-06-02T10:00:00Z', next_followup_date: null, followup_count: 0,
        scope: { service_lines: ['pentest_mobile'], asset_count: null, environment: null, compliance_driver: null,
          timeline: null, prior_testing: null, access_model: null, authority_signal: null, region: null },
        assumptions: [], proposal: null, actions: [], flags: [],
      },
    ]);
    (deps.graph.listInbound as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.graph.latestInboundInConversation as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'm2', conversationId: 'conv-1', subject: 'Re: VAPT', fromName: 'Shashank',
      fromAddress: 'kkmookhey@gmail.com', participants: ['kkmookhey@gmail.com'], receivedDateTime: '2026-06-02T12:00:00Z',
      bodyPreview: 'Answers: 3 roles, staging env, first VAPT', hasAttachments: false,
    });

    await runLoop(deps);

    expect(deps.judge.buildProposalContent).toHaveBeenCalledOnce();
    expect(deps.deck.render).toHaveBeenCalledOnce();
    expect(deps.s3.put).toHaveBeenCalledOnce();
    expect(deps.graph.createDraftReply).toHaveBeenCalledOnce();
    expect(deps.graph.addAttachment).toHaveBeenCalledOnce();

    const stored = (deps.repo.putDeal as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(stored.stage).toBe('PROPOSAL_PENDING_APPROVAL');
    expect(stored.proposal.deck_path).toBe('s3://ni-decks/proposals/novelty-wealth-v1.pptx');
    expect(stored.proposal.version).toBe(1);
  });
});
