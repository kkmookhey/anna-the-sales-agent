import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { loadConfig } from './config.js';
import { DealRepo } from './state/repo.js';
import { GraphClient } from './adapters/graph.js';
import { SlackClient } from './adapters/slack.js';
import { HubSpotClient } from './adapters/hubspot.js';
import { DeckStore } from './adapters/s3.js';
import { BedrockJudge } from './judgment/bedrock.js';
import { JudgmentService } from './judgment/judgment.js';
import { RenderClient } from './adapters/render.js';
import { dryRunRepo, dryRunS3, dryRunHubspot } from './dry-run-guards.js';
import type { LoopDeps } from './orchestrator/loop.js';

async function secret(client: SecretsManagerClient, id: string): Promise<Record<string, string>> {
  const res = await client.send(new GetSecretValueCommand({ SecretId: id }));
  return JSON.parse(res.SecretString ?? '{}') as Record<string, string>;
}

export async function buildDeps(env: Record<string, string | undefined> = process.env): Promise<LoopDeps> {
  const config = loadConfig(env);
  const sm = new SecretsManagerClient({ region: config.region });
  const [graphCreds, hubspotCreds, slackCreds] = await Promise.all([
    secret(sm, env['GRAPH_SECRET_ID']!),
    secret(sm, env['HUBSPOT_SECRET_ID']!),
    secret(sm, env['SLACK_SECRET_ID']!),
  ]);

  const graph = new GraphClient(
    {
      tenantId: graphCreds['tenantId']!,
      clientId: graphCreds['clientId']!,
      clientSecret: graphCreds['clientSecret']!,
    },
    config.mailbox,
  );
  const slack = new SlackClient(slackCreds['botToken']!);
  const judge = new JudgmentService(BedrockJudge.fromEnv(config.region, env['BEDROCK_MODEL_ID']!));

  // In dry-run, wrap the write-capable adapters so no persistent write can leak (DynamoDB,
  // S3, HubSpot). Reads pass through. Enforced at the seam so no loop call site can regress.
  const realHubspot = new HubSpotClient(hubspotCreds['token']!);
  const realRepo = DealRepo.fromEnv(config.dealsTable, config.region);
  const realS3 = DeckStore.fromEnv(env['DECKS_BUCKET']!, config.region);
  const hubspot = config.dryRun ? dryRunHubspot(realHubspot) : realHubspot;
  const repo = config.dryRun ? dryRunRepo(realRepo) : realRepo;
  const s3 = config.dryRun ? dryRunS3(realS3) : realS3;

  return {
    config,
    now: new Date(),
    lastRunIso: env['LAST_RUN_ISO'] ?? new Date(Date.now() - 30 * 60_000).toISOString(),
    graph,
    slack,
    hubspot,
    judge: {
      scopeEnquiry: (i) => judge.scopeEnquiry(i),
      assessSufficiency: (i) => judge.assessSufficiency(i),
      draftFollowup: (i) => judge.draftFollowup(i),
      classifyInbound: (i) => judge.classifyInbound(i),
      buildProposalContent: (i) => judge.buildProposalContent(i),
      buildMethodologyContent: (i) => judge.buildMethodologyContent(i),
      classifyProposalReply: (i) => judge.classifyProposalReply(i),
    },
    repo,
    s3,
    deck: RenderClient.fromEnv(env['RENDER_FUNCTION_NAME']!, config.region),
  };
}
