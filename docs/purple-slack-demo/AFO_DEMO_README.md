# GenAI Data Import — AFO + Slack + Salesforce Demo

A back-office process orchestrated by **Agentforce Operations (AFO / Regrello)**, with a human-in-the-loop approval delivered via **Slack**, audited in **Salesforce** (`purple-slack-demo` org), and powered by a **Heroku** Node app.

## Use case

GenAI generates structured datasets (catalog updates, supplier records, AI-classified inventory adjustments). Letting them land in production unsupervised is risky; routing every record through tickets kills the speed advantage. This demo shows the right balance: AI proposes, human disposes (in Slack), system records (in Salesforce).

## Architecture

```
   ┌─────────── AFO Blueprint: GenAI Data Import ───────────┐
   │   Stage A         Stage B (Approval)        Stage C    │
   │   Validate    →   Manager Approval      →   Commit     │
   └──────────────┬──────────────┬──────────────────┬───────┘
                  │              │ Custom HTTP      │
              (auto)             ▼                  ▼
                       ┌───────────────────┐  ┌─────────────┐
                       │ Heroku            │  │ Heroku      │
                       │ /api/afo/         │  │ /api/afo/   │
                       │ approve-request   │  │ commit-     │
                       └─────────┬─────────┘  │ import      │
                                 │            └─────────────┘
                                 ▼
                          Slack #channel  ──[Approve / Reject]──┐
                                                                │
                              POST /slack/events ──► AFO REST: complete task
                                                                │
                                                                ▼
                              Heroku ──► Salesforce Apex REST
                                          /afo/import-request
                                          → upsert GenAIImportRequest__c
                                          → Flow posts Chatter
```

## Live components

| Layer | Resource |
|---|---|
| Heroku app | `slack-heroku-demo-ars` — https://slack-heroku-demo-ars-185a8cef5ba3.herokuapp.com/ |
| Postgres | `heroku-postgresql:essential-0` — seeded from [`db/init.sql`](../../db/init.sql) |
| AppLink | `applink-pointy-49240` (free) |
| Salesforce org | `purple-slack-demo` (alan+purple-slack@salesforce.com) |
| AFO blueprint spec | [`../afo/genai-import-blueprint.json`](../afo/genai-import-blueprint.json) |
| AFO LLM-builder prompt | [`../afo/genai-import-blueprint-prompt.md`](../afo/genai-import-blueprint-prompt.md) (PDF [here](./genai-import-blueprint-prompt.pdf)) |

## Salesforce metadata

Deployed under [`force-app/main/default/`](./force-app/main/default/):

- **`GenAIImportRequest__c`** — audit object with 8 fields (Import_Id__c external id, Status__c picklist, etc.)
- **`AFOImportRequestRest`** — `@RestResource('/afo/import-request/*')` Apex class with @HttpPost upsert and @HttpGet lookup
- **`AFO_Import_Status_Notify`** — record-triggered Flow that Chatter-posts on Approved/Rejected
- **`AFO_Import_Audit`** — permission set granting access to the object + Apex class

## AFO Stage 2 HTTP node — paste this in

The blueprint LLM builder won't get the HTTP node right. After it generates, edit Stage 2 (Manager Approval) and paste these four fields **exactly**:

### Field 1 — Method

```
POST
```

### Field 2 — URL / Path

If the AFO node asks for a full URL:
```
https://slack-heroku-demo-ars-185a8cef5ba3.herokuapp.com/api/afo/approve-request
```

If it asks for a path (because the integration `heroku_slack_app` already has the base):
```
/api/afo/approve-request
```

### Field 3 — Headers

| Name | Value |
|---|---|
| `Content-Type` | `application/json` |

### Field 4 — Body (JSON)

Mode must be **JSON** / **Raw / application/json** (NOT form, NOT none).

```json
{
  "blueprint": "genai-data-import",
  "workflow_id": "{{workflow.id}}",
  "stage": "manager-approval",
  "task_id": "{{task.id}}",
  "import_id": "{{import_id}}",
  "requested_by": { "name": "{{requested_by.name}}", "email": "{{requested_by.email}}" },
  "action_required": "approve|reject",
  "validation": { "status": "{{validation_status}}", "row_errors_count": "{{row_errors_count}}", "record_count": "{{record_count}}" },
  "complete_url": "https://YOUR-REGRELLO-TENANT.regrello.com/api/v1/tasks/{{task.id}}/complete"
}
```

If AFO's editor is key/value rows instead of raw JSON, use this table (dot-notation for nested objects):

| Key | Value |
|---|---|
| `blueprint` | `genai-data-import` |
| `workflow_id` | `{{workflow.id}}` |
| `stage` | `manager-approval` |
| `task_id` | `{{task.id}}` |
| `import_id` | `{{import_id}}` |
| `requested_by.name` | `{{requested_by.name}}` |
| `requested_by.email` | `{{requested_by.email}}` |
| `action_required` | `approve\|reject` |
| `validation.status` | `{{validation_status}}` |
| `validation.row_errors_count` | `{{row_errors_count}}` |
| `validation.record_count` | `{{record_count}}` |
| `complete_url` | `https://YOUR-REGRELLO-TENANT.regrello.com/api/v1/tasks/{{task.id}}/complete` |

**Required by Heroku** (others are nice-to-have): `task_id`, `import_id`, `complete_url`. If a `{{...}}` variable doesn't autocomplete, drop it; the handler is forgiving.

**Replace** `YOUR-REGRELLO-TENANT.regrello.com` with your actual tenant hostname.

## AFO Stage 3 HTTP node — Commit

Same shape, simpler body.

| Field | Value |
|---|---|
| Method | `POST` |
| Path | `/api/afo/commit-import` |
| Header | `Content-Type: application/json` |

Body:
```json
{
  "import_id": "{{import_id}}",
  "source_dataset": "{{source_dataset}}",
  "approved_by": "{{decided_by.email}}",
  "workflow_id": "{{workflow.id}}"
}
```

## Heroku config vars

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_AFO_APPROVAL_CHANNEL=C0...        # the channel id where approval cards land
SF_APEX_REST_BASE_URL=https://purple-slack-demo.my.salesforce.com/services/apexrest
SF_BEARER_TOKEN=...                     # session token from `sf org display`; expires ~2h
DATABASE_URL=...                        # provisioned automatically by Postgres addon
```

Refresh the SF token any time:
```bash
heroku config:set \
  SF_BEARER_TOKEN=$(sf org display --target-org purple-slack-demo --json | jq -r .result.accessToken) \
  -a slack-heroku-demo-ars
```

## Smoke test (without AFO)

Fire the same payload AFO would send, directly:

```bash
curl -i -X POST https://slack-heroku-demo-ars-185a8cef5ba3.herokuapp.com/api/afo/approve-request \
  -H 'Content-Type: application/json' \
  -d '{
    "blueprint":"genai-data-import",
    "workflow_id":"wf-test-001",
    "task_id":"task-test-001",
    "import_id":"GENAI-IMP-DEMO-0001",
    "requested_by":{"name":"Alan","email":"alan@example.com"},
    "action_required":"approve|reject",
    "validation":{"status":"PASS","row_errors_count":0,"record_count":1280},
    "complete_url":"https://httpbin.org/post"
  }'
```

A Slack Block Kit card with Approve/Reject buttons should appear in the configured channel. Click Approve, then verify in Salesforce:

```sql
SELECT Id, Import_Id__c, Status__c, Decided_By__c, AFO_Workflow_Id__c
FROM GenAIImportRequest__c
ORDER BY LastModifiedDate DESC LIMIT 5
```

The most recent row should show `Status__c = Approved` with your Slack identity in `Decided_By__c`.

## End-to-end demo flow

1. **Start a workflow** in AFO with sample inputs:
   - `import_id`: `GENAI-IMP-DEMO-0001`
   - `source_dataset`: `s3://example/2026-05-28.csv`
   - `requested_by`: your email
   - `record_count`: `1280`
2. **Stage 1** auto-runs (Regrello Agent marks it PASS for the demo).
3. **Stage 2** fires the webhook → Slack message lands.
4. Click **Approve** in Slack:
   - Heroku → AFO `complete_url` (advances workflow)
   - Heroku → Salesforce `/afo/import-request` (audit row + Chatter)
   - Slack message updates to ":white_check_mark: GenAI Import Approved"
5. **Stage 3** auto-runs the commit step. Final SF status = `Committed`.

## Troubleshooting

- **Heroku 400 on `/api/afo/approve-request`**: empty body or missing `Content-Type: application/json`. Recheck the Stage 2 node body mode.
- **Heroku 200 but no Slack message**: missing scopes or wrong channel id. Check `heroku logs --tail` while you fire the request.
- **Approve clicks but no SF row**: `SF_BEARER_TOKEN` expired (session tokens last ~2h). Refresh per the config-vars section.
- **AFO task doesn't advance after Approve**: `complete_url` template is wrong. The pattern is your tenant + `/api/v1/tasks/{{task.id}}/complete`. Check `heroku logs` for "AFO task completion failed".
- **Slack message but Approve button does nothing**: Slack interactivity not enabled. Slack app config → Interactivity & Shortcuts → Request URL = `https://slack-heroku-demo-ars-185a8cef5ba3.herokuapp.com/slack/events`.

## Files of interest

- [`../../src/app.js`](../../src/app.js) — Heroku app: `/api/afo/*` handlers and Slack action handlers
- [`../afo/genai-import-blueprint.json`](../afo/genai-import-blueprint.json) — full blueprint spec (reference, not deployable)
- [`./force-app/main/default/classes/AFOImportRequestRest.cls`](./force-app/main/default/classes/AFOImportRequestRest.cls) — Apex REST upsert
- [`./force-app/main/default/objects/GenAIImportRequest__c/`](./force-app/main/default/objects/GenAIImportRequest__c/) — audit object metadata
