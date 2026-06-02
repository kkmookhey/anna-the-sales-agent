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
    },
    slack: { postStaging: vi.fn().mockResolvedValue('111.222'), detectApproval: vi.fn().mockResolvedValue(false) },
    hubspot: { createDeal: vi.fn().mockResolvedValue('99001') },
    judge: {
      scopeEnquiry: vi.fn().mockResolvedValue({ service_lines: ['pentest_mobile'], draft_subject: 'Re: VAPT Enquiry', draft_body_html: '<p>Hi</p>' }),
      assessSufficiency: vi.fn(), draftFollowup: vi.fn(),
    },
    repo: {
      listDeals: vi.fn(async () => Object.values(stored)),
      getDeal: vi.fn(async (id: string) => stored[id] ?? null),
      putDeal: vi.fn(async (d: Deal) => { stored[d.deal_id] = d; }),
    },
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

  it('respects dry_run: posts staging but never creates an Outlook draft', async () => {
    const deps = baseDeps({});
    deps.config.dryRun = true;
    await runLoop(deps);
    expect(deps.slack.postStaging).toHaveBeenCalledOnce();
    expect(deps.graph.createDraftReply).not.toHaveBeenCalled();
  });
});
