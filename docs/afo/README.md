# AFO GenAI Data Import — Blueprint Spec

This folder contains a **representative** Agentforce Operations (AFO / Regrello) blueprint spec.

## What this is

`genai-import-blueprint.json` describes a 3-stage process:

1. **Validate** — automation task; Regrello Agent validates the dataset.
2. **Manager Approval** — approval task; on assignment AFO calls `POST /api/afo/approve-request` on the Heroku app, which posts a Slack message with Approve/Reject buttons.
3. **Commit** — automation task; on approval AFO calls `POST /api/afo/commit-import`.

Every stage also fires an `on_complete_webhook` to the Salesforce Apex REST endpoint `/services/apexrest/afo/import-request` for an audit trail in the `purple-slack-demo` org.

## What this is NOT

Regrello does **not** expose a public blueprint-import API today. You cannot `curl` this file into AFO. Use it as:

- a handoff document for the Regrello blueprint creator
- input to AFO's "prompt with industry context" LLM blueprint builder
- a stable contract for the Heroku endpoints and Slack payloads

## Endpoint contracts

The Heroku app exposes (additive — see [../../src/app.js](../../src/app.js)):

- `POST /api/afo/approve-request` — AFO → Heroku for Stage B kickoff. Posts a Slack Block Kit message with `afo_approve` / `afo_reject` buttons.
- `POST /api/afo/commit-import` — AFO → Heroku for Stage C commit.

Slack interactive payloads land on the existing `/slack/events` mount and call the AFO REST `complete_url` carried in the task payload.

## Salesforce metadata

See [../purple-slack-demo/force-app/main/default/](../purple-slack-demo/force-app/main/default/):

- `objects/GenAIImportRequest__c/` — audit object
- `classes/AFOImportRequestRest.cls` — `@RestResource('/afo/import-request')` upsert handler
- `flows/AFO_Import_Status_Notify.flow-meta.xml` — record-triggered Chatter notification
- `permissionsets/AFO_Import_Audit.permissionset-meta.xml`
