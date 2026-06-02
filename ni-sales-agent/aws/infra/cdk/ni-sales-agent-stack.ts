import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

export class NiSalesAgentStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const deals = new dynamodb.Table(this, 'Deals', {
      tableName: 'ni-sales-deals',
      partitionKey: { name: 'deal_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    const graphSecret = new secrets.Secret(this, 'GraphSecret', { secretName: 'ni-sales/graph' });
    const hubspotSecret = new secrets.Secret(this, 'HubSpotSecret', { secretName: 'ni-sales/hubspot' });
    const slackSecret = new secrets.Secret(this, 'SlackSecret', { secretName: 'ni-sales/slack' });

    const decks = new s3.Bucket(this, 'Decks', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: Duration.days(365) }],
    });

    const fn = new nodejs.NodejsFunction(this, 'AgentFn', {
      functionName: 'ni-sales-agent',
      entry: 'src/handler.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(5),
      memorySize: 512,
      // NOTE: reservedConcurrentExecutions omitted — new accounts have a Lambda
      // concurrency limit of 10 and won't allow reserving below that. The 20-min
      // cron + idempotent stage guards make overlapping ticks a non-issue. Request a
      // concurrency quota increase and re-add `reservedConcurrentExecutions: 1` later if desired.
      bundling: { format: nodejs.OutputFormat.ESM, commandHooks: {
        beforeBundling: () => [],
        beforeInstall: () => [],
        afterBundling: (i: string, o: string) => [
          `cp -R ${i}/../skills ${o}/skills`,
          `mkdir -p ${o}/assets && cp -R ${i}/assets/. ${o}/assets/ 2>/dev/null || true`,
        ],
      } },
      environment: {
        MAILBOX: 'sales@networkintelligence.ai',
        SLACK_CHANNEL_ID: 'C0B7KEP8D8W',
        APPROVAL_TOKEN: 'SHIP-IT',
        DRY_RUN: 'true',
        FOLLOWUP_CADENCE_DAYS: '3,7,14',
        MAX_FOLLOWUPS: '3',
        BUSINESS_HOURS_ONLY: 'false',
        DEALS_TABLE: deals.tableName,
        DECKS_BUCKET: decks.bucketName,
        HUBSPOT_PIPELINE: 'default',
        HUBSPOT_DEAL_STAGE: '39235007',
        HUBSPOT_OWNER_ID: '1667576553',
        APPROVED_SLACK_USER_IDS: 'U07AN5FR86B',
        GRAPH_SECRET_ID: graphSecret.secretName,
        HUBSPOT_SECRET_ID: hubspotSecret.secretName,
        SLACK_SECRET_ID: slackSecret.secretName,
        BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
      },
    });

    deals.grantReadWriteData(fn);
    decks.grantReadWrite(fn);
    graphSecret.grantRead(fn);
    hubspotSecret.grantRead(fn);
    slackSecret.grantRead(fn);

    // Bedrock invoke. The global inference profile routes across regions, so the
    // underlying foundation-model invoke perm must span regions. Action-scoped; tighten later.
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream', 'bedrock:Converse', 'bedrock:ConverseStream'],
      resources: [
        `arn:aws:bedrock:*:331145994818:inference-profile/global.anthropic.claude-sonnet-4-5-20250929-v1:0`,
        `arn:aws:bedrock:*::foundation-model/anthropic.*`,
      ],
    }));

    new events.Rule(this, 'Schedule', {
      ruleName: 'ni-sales-agent-tick',
      schedule: events.Schedule.expression('cron(7/20 * * * ? *)'),
      targets: [new targets.LambdaFunction(fn)],
    });
  }
}
