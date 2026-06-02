# NI Sales Agent — Deployment Runbook

**Status:** AWS account `331145994818`, region `ap-south-1`, profile `sara-sales`,
CDK bootstrapped ✓, Bedrock model `global.anthropic.claude-sonnet-4-5-20250929-v1:0`
invocation confirmed ✓.

---

## 1. Microsoft Graph app registration

1. Open Entra admin centre → **App registrations** → **New registration**.
   Name it `ni-sales-agent`; single-tenant is fine.
2. **API permissions** → Add a permission → Microsoft Graph → **Application permissions**
   → `Mail.ReadWrite`. Do **not** add `Mail.Send` — the agent stages Outlook drafts;
   a human clicks Send.
3. **Grant admin consent** for the tenant.
4. Create a **client secret** (12-month expiry). Copy the value immediately — it won't
   show again.
5. Scope the app to the sales mailbox only (prevents it reading all mailboxes):

   ```powershell
   # Run in Exchange Online PowerShell
   New-ApplicationAccessPolicy \
     -AppId <clientId> \
     -PolicyScopeGroupId sales@networkintelligence.ai \
     -AccessRight RestrictAccess \
     -Description "ni-sales-agent: restrict to sales mailbox"
   ```

6. Store credentials in Secrets Manager secret `ni-sales/graph`:

   ```json
   {
     "tenantId": "<your-tenant-id>",
     "clientId": "<app-client-id>",
     "clientSecret": "<client-secret-value>"
   }
   ```

---

## 2. HubSpot private app

1. HubSpot → Settings → Integrations → **Private Apps** → Create private app.
2. Required scopes:
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
   - `crm.objects.owners.read`
3. Create the app and copy the access token.
4. Store in secret `ni-sales/hubspot`:

   ```json
   { "token": "pat-..." }
   ```

Pipeline: `default` | Deal stage on close: `39235007` | Default owner: `1667576553`
(kkmookhey@networkintelligence.ai).

---

## 3. Slack app

1. api.slack.com → **Create New App** → From scratch → workspace: SecGPT.
2. **OAuth & Permissions** → Bot Token Scopes:
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `canvases:write`
3. **Install to workspace** → copy the Bot User OAuth Token (`xoxb-...`).
4. Invite the bot to `#sales-test` (channel ID `C0B7KEP8D8W`):
   `/invite @ni-sales-agent`
5. Store in secret `ni-sales/slack`:

   ```json
   { "botToken": "xoxb-..." }
   ```

Approved Slack user for HubSpot write approvals: `U07AN5FR86B`.
Approval token (bot watches for this exact string): `SHIP-IT`.

---

## 4. Brand asset

NI logo is already committed at `src/assets/ni-logo.png`. The CDK bundling hook copies
`src/assets/` into the Lambda zip automatically — no manual step needed.

---

## 5. Deploy

```bash
cd ni-sales-agent/aws
npm install
npm test
npx cdk deploy --profile sara-sales
```

CDK creates three **empty** Secrets Manager secrets (`ni-sales/graph`,
`ni-sales/hubspot`, `ni-sales/slack`). After the stack completes, paste the real values
via the console or CLI:

```bash
# Example — repeat for hubspot and slack secrets
aws secretsmanager put-secret-value \
  --secret-id ni-sales/graph \
  --secret-string '{"tenantId":"...","clientId":"...","clientSecret":"..."}' \
  --profile sara-sales
```

The Lambda will not start processing until all three secrets are populated.

---

## 6. Cutover

1. Leave `DRY_RUN=true` for the first day. In dry-run mode the agent posts draft text
   to `#sales-test` but does **not** create Outlook drafts and does not write to HubSpot.
   (Note: when `DRY_RUN=false`, Outlook drafts ARE created in the mailbox — the human
   still clicks Send manually.)
2. Watch `#sales-test`, the HubSpot pipeline canvas, and CloudWatch Logs
   (`/aws/lambda/ni-sales-agent`).
3. Once satisfied, flip to live by updating the Lambda environment variable:

   ```bash
   # Instant flip without redeployment
   aws lambda update-function-configuration \
     --function-name ni-sales-agent \
     --environment "Variables={DRY_RUN=false,...}" \
     --profile sara-sales
   ```

   Or redeploy with `DRY_RUN=false` in the CDK stack environment map.

---

## Rollback

Both options are instant and reversible:

```bash
# Option A — disable the EventBridge trigger (Lambda stays deployed, just not invoked)
aws events disable-rule \
  --name ni-sales-agent-tick \
  --profile sara-sales

# Option B — revert to dry-run (agent keeps running but takes no irreversible actions)
aws lambda update-function-configuration \
  --function-name ni-sales-agent \
  --environment "Variables={DRY_RUN=true,...}" \
  --profile sara-sales
```

To re-enable after Option A: `aws events enable-rule --name ni-sales-agent-tick --profile sara-sales`.
