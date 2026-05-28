@RestResource(urlMapping='/afo/import-request/*')
global with sharing class AFOImportRequestRest {

    global class ImportRequestPayload {
        public String import_id;
        public String requested_by;
        public String status;
        public String validation_notes;
        public String afo_workflow_id;
        public String afo_task_id;
        public String decided_by;
        public Datetime decided_at;
    }

    global class ImportRequestResponse {
        public Boolean success;
        public Id recordId;
        public String importId;
        public String status;
        public String message;
    }

    @HttpPost
    global static ImportRequestResponse upsertRequest() {
        ImportRequestResponse resp = new ImportRequestResponse();

        ImportRequestPayload payload;
        try {
            String body = RestContext.request.requestBody == null ? '' : RestContext.request.requestBody.toString();
            payload = (ImportRequestPayload) JSON.deserialize(body, ImportRequestPayload.class);
        } catch (Exception e) {
            RestContext.response.statusCode = 400;
            resp.success = false;
            resp.message = 'Invalid JSON body: ' + e.getMessage();
            return resp;
        }

        if (payload == null || String.isBlank(payload.import_id)) {
            RestContext.response.statusCode = 400;
            resp.success = false;
            resp.message = 'import_id is required';
            return resp;
        }

        GenAIImportRequest__c rec = new GenAIImportRequest__c(
            Import_Id__c = payload.import_id
        );
        if (String.isNotBlank(payload.requested_by))      rec.Requested_By__c     = payload.requested_by;
        if (String.isNotBlank(payload.status))            rec.Status__c           = payload.status;
        if (String.isNotBlank(payload.validation_notes))  rec.Validation_Notes__c = payload.validation_notes;
        if (String.isNotBlank(payload.afo_workflow_id))   rec.AFO_Workflow_Id__c  = payload.afo_workflow_id;
        if (String.isNotBlank(payload.afo_task_id))       rec.AFO_Task_Id__c      = payload.afo_task_id;
        if (String.isNotBlank(payload.decided_by))        rec.Decided_By__c       = payload.decided_by;
        if (payload.decided_at != null)                   rec.Decided_At__c       = payload.decided_at;

        Database.UpsertResult ur = Database.upsert(rec, GenAIImportRequest__c.Import_Id__c, false);
        if (!ur.isSuccess()) {
            RestContext.response.statusCode = 500;
            resp.success = false;
            resp.message = ur.getErrors()[0].getMessage();
            return resp;
        }

        resp.success  = true;
        resp.recordId = ur.getId();
        resp.importId = payload.import_id;
        resp.status   = rec.Status__c;
        return resp;
    }

    @HttpGet
    global static GenAIImportRequest__c getRequest() {
        String importId = RestContext.request.params.get('import_id');
        if (String.isBlank(importId)) {
            String uri = RestContext.request.requestURI;
            if (uri != null && uri.contains('/')) {
                importId = uri.substring(uri.lastIndexOf('/') + 1);
            }
        }
        if (String.isBlank(importId)) {
            RestContext.response.statusCode = 400;
            return null;
        }

        List<GenAIImportRequest__c> rows = [
            SELECT Id, Name, Import_Id__c, Status__c, Requested_By__c, Decided_By__c,
                   Decided_At__c, AFO_Workflow_Id__c, AFO_Task_Id__c, Validation_Notes__c
            FROM GenAIImportRequest__c
            WHERE Import_Id__c = :importId
            LIMIT 1
        ];
        if (rows.isEmpty()) {
            RestContext.response.statusCode = 404;
            return null;
        }
        return rows[0];
    }
}
