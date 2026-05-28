# Blueprint: GenAI Data Import

## Process summary
A back-office process for safely committing GenAI-generated datasets (e.g., LLM-extracted product attributes, AI-generated catalog updates, AI-classified inventory adjustments) to a system of record. Validation runs unattended; commit is gated by a manager approval delivered via Slack.

## Roles
- **Requester** — kicks off a workflow when a GenAI batch is ready. Provides the import payload.
- **Import Managers** (group) — receives approval requests in Slack. Approves or rejects.
- **System** — the Heroku-hosted system of record (`slack-heroku-demo-ars`).

## Stages

### Stage 1 — Validate (Automation Task)
- Agent: Regrello Agent
- Inputs (form):
  - `import_id` — text, required, external id
  - `source_dataset` — text (e.g. S3 URI), required
  - `requested_by` — email, required
  - `record_count` — number, required
- Steps:
  1. Look up `source_dataset` in the inventory database via SQL.
  2. Verify referential integrity (every SKU must exist; every warehouse must exist).
  3. Verify count matches `record_count`.
- Outputs:
  - `validation_status` — picklist: `PASS` | `FAIL`
  - `validation_notes` — long text (human-readable summary)
  - `row_errors_count` — number
- Branching:
  - `validation_status = FAIL` → end workflow with outcome **Rejected** (don't waste manager time).
  - `validation_status = PASS` → proceed to Stage 2.

### Stage 2 — Manager Approval (Approval Task with Slack delivery)
- Approver: group **Import Managers**
- Due: 24 hours after assignment.
- On task assigned, fire Custom HTTP webhook to `heroku_slack_app`:
  - Method: POST
  - Path: `/api/afo/approve-request`
  - Body (JSON):
    ```
    {
      "blueprint": "genai-data-import",
      "workflow_id": "{{workflow.id}}",
      "stage": "manager-approval",
      "task_id": "{{task.id}}",
      "import_id": "{{import_id}}",
      "requested_by": {
        "name":  "{{requested_by.name}}",
        "email": "{{requested_by.email}}"
      },
      "action_required": "approve|reject",
      "validation": {
        "status":           "{{validation_status}}",
        "row_errors_count": "{{row_errors_count}}",
        "record_count":     "{{record_count}}"
      },
      "complete_url":   "${REGRELLO_API_BASE}/api/v1/tasks/{{task.id}}/complete",
      "callback_token": "{{task.callback_token}}"
    }
    ```
- The approval task waits open until the Heroku app calls AFO's `complete_url` with the manager's decision (Slack button → Heroku → AFO REST).
- On task complete, fire Custom HTTP webhook to `salesforce_apex_rest`:
  - Method: POST
  - Path: `/afo/import-request`
  - Body:
    ```
    {
      "import_id": "{{import_id}}",
      "status":    "{{decision == 'approve' ? 'Approved' : 'Rejected'}}",
      "decided_by":"{{decided_by.email}}",
      "decided_at":"{{now}}",
      "afo_workflow_id": "{{workflow.id}}",
      "afo_task_id":     "{{task.id}}"
    }
    ```
- Branching:
  - Reject → end workflow with outcome **Rejected**.
  - Approve → proceed to Stage 3.

### Stage 3 — Commit (Automation Task)
- Custom HTTP integration: `heroku_slack_app`
- Request:
  - Method: POST
  - Path: `/api/afo/commit-import`
  - Body:
    ```
    {
      "import_id":      "{{import_id}}",
      "source_dataset": "{{source_dataset}}",
      "approved_by":    "{{decided_by.email}}",
      "workflow_id":    "{{workflow.id}}"
    }
    ```
- Outputs (form):
  - `committed_at` — datetime
  - `committed_by` — email
  - `result_summary` — long text
- On task complete, fire Custom HTTP webhook to `salesforce_apex_rest` with `status: Committed`.

## Workspace integrations to set up first
1. **`heroku_slack_app`** (Custom HTTP)
   - Base URL: `https://slack-heroku-demo-ars-185a8cef5ba3.herokuapp.com`
   - Auth: Bearer token (use `AFO_BEARER_TOKEN` you provision on Heroku) or no auth for demo
2. **`salesforce_apex_rest`** (Custom HTTP)
   - Base URL: `https://purple-slack-demo.my.salesforce.com/services/apexrest`
   - Auth: Bearer (Salesforce session token; for production swap to Connected App OAuth)
3. **`Import Managers`** (User Group)
   - Members: yourself for the demo.

## Outcomes
- `committed` — happy path
- `rejected` — manager rejected or validation failed
- `failed` — system error (wire to AFO's default failure handling)
