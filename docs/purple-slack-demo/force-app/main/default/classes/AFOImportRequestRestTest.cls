@isTest
private class AFOImportRequestRestTest {

    private static RestRequest buildPostRequest(String body) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/afo/import-request';
        req.httpMethod = 'POST';
        req.addHeader('Content-Type', 'application/json');
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        return req;
    }

    @isTest static void insertsNewRequest() {
        AFOImportRequestRest.ImportRequestPayload p = new AFOImportRequestRest.ImportRequestPayload();
        p.import_id        = 'GENAI-IMP-2026-0042';
        p.requested_by     = 'alan@example.com';
        p.status           = 'Validated';
        p.validation_notes = 'PASS — 1280 rows';
        p.afo_workflow_id  = 'wf-uuid-1';
        p.afo_task_id      = 'task-uuid-1';

        buildPostRequest(JSON.serialize(p));

        Test.startTest();
        AFOImportRequestRest.ImportRequestResponse resp = AFOImportRequestRest.upsertRequest(p);
        Test.stopTest();

        System.assertEquals(true, resp.success, 'expected success');
        System.assertNotEquals(null, resp.recordId, 'expected a record id');

        GenAIImportRequest__c row = [
            SELECT Status__c, Requested_By__c, AFO_Workflow_Id__c
            FROM GenAIImportRequest__c
            WHERE Import_Id__c = 'GENAI-IMP-2026-0042'
        ];
        System.assertEquals('Validated', row.Status__c);
        System.assertEquals('alan@example.com', row.Requested_By__c);
        System.assertEquals('wf-uuid-1', row.AFO_Workflow_Id__c);
    }

    @isTest static void upsertsExistingRequest() {
        insert new GenAIImportRequest__c(
            Import_Id__c = 'GENAI-IMP-2026-0099',
            Status__c    = 'Submitted'
        );

        AFOImportRequestRest.ImportRequestPayload p = new AFOImportRequestRest.ImportRequestPayload();
        p.import_id   = 'GENAI-IMP-2026-0099';
        p.status      = 'Approved';
        p.decided_by  = 'manager@example.com';
        p.decided_at  = Datetime.now();

        buildPostRequest(JSON.serialize(p));

        Test.startTest();
        AFOImportRequestRest.ImportRequestResponse resp = AFOImportRequestRest.upsertRequest(p);
        Test.stopTest();

        System.assertEquals(true, resp.success);
        GenAIImportRequest__c row = [
            SELECT Status__c, Decided_By__c, Decided_At__c
            FROM GenAIImportRequest__c
            WHERE Import_Id__c = 'GENAI-IMP-2026-0099'
        ];
        System.assertEquals('Approved', row.Status__c);
        System.assertEquals('manager@example.com', row.Decided_By__c);
        System.assertNotEquals(null, row.Decided_At__c);
    }

    @isTest static void rejectsMissingImportId() {
        AFOImportRequestRest.ImportRequestPayload p = new AFOImportRequestRest.ImportRequestPayload();
        p.status = 'Submitted';
        buildPostRequest(JSON.serialize(p));

        AFOImportRequestRest.ImportRequestResponse resp = AFOImportRequestRest.upsertRequest(p);

        System.assertEquals(false, resp.success);
        System.assertEquals(400, RestContext.response.statusCode);
    }

    @isTest static void getReturnsRecord() {
        insert new GenAIImportRequest__c(
            Import_Id__c = 'GENAI-IMP-GET',
            Status__c    = 'Approved'
        );

        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/afo/import-request/GENAI-IMP-GET';
        req.httpMethod = 'GET';
        RestContext.request = req;
        RestContext.response = new RestResponse();

        GenAIImportRequest__c row = AFOImportRequestRest.getRequest();
        System.assertNotEquals(null, row);
        System.assertEquals('Approved', row.Status__c);
    }

    @isTest static void getReturns404WhenMissing() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/afo/import-request/DOES-NOT-EXIST';
        req.httpMethod = 'GET';
        RestContext.request = req;
        RestContext.response = new RestResponse();

        GenAIImportRequest__c row = AFOImportRequestRest.getRequest();
        System.assertEquals(null, row);
        System.assertEquals(404, RestContext.response.statusCode);
    }
}
