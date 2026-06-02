export interface Config {
  mailbox: string;
  slackChannelId: string;
  approvalToken: string;
  dryRun: boolean;
  followupCadenceDays: number[];
  maxFollowups: number;
  businessHoursOnly: boolean;
  dealsTable: string;
  region: string;
  hubspotPipeline: string;
  hubspotDealStage: string;
  hubspotOwnerId: string;
  approvedSlackUserIds: string[];
}

function req(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  if (v === undefined || v === '') throw new Error(`Missing required env var: ${key}`);
  return v;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return {
    mailbox: req(env, 'MAILBOX'),
    slackChannelId: req(env, 'SLACK_CHANNEL_ID'),
    approvalToken: req(env, 'APPROVAL_TOKEN'),
    dryRun: req(env, 'DRY_RUN') === 'true',
    followupCadenceDays: req(env, 'FOLLOWUP_CADENCE_DAYS')
      .split(',')
      .map((s) => Number(s.trim())),
    maxFollowups: Number(req(env, 'MAX_FOLLOWUPS')),
    businessHoursOnly: req(env, 'BUSINESS_HOURS_ONLY') === 'true',
    dealsTable: req(env, 'DEALS_TABLE'),
    region: req(env, 'AWS_REGION'),
    hubspotPipeline: req(env, 'HUBSPOT_PIPELINE'),
    hubspotDealStage: req(env, 'HUBSPOT_DEAL_STAGE'),
    hubspotOwnerId: req(env, 'HUBSPOT_OWNER_ID'),
    approvedSlackUserIds: req(env, 'APPROVED_SLACK_USER_IDS')
      .split(',')
      .map((s) => s.trim()),
  };
}
