# App Link Service Mesh Authentication Issue - Debug Retrospective

**Date**: December 15, 2025  
**App**: case-ranker-demo (Heroku Private Space)  
**Issue**: 401 Unauthorized errors when calling `/agent/infer` from Salesforce External Service

---

## Root Cause

The Python FastAPI application contained manual JWT validation code that was **incompatible with the App Link Service Mesh authentication model**.

### Incorrect Code (Lines 88-98 in src/api.py)

```python
def validate_applink_token(auth_header: Optional[str]) -> None:
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization")
    # TODO: validate JWT iss/aud/scopes against App Link config
    return

@app.post("/agent/infer")
def agent_infer(req: AgentInferRequest, authorization: Optional[str] = Header(default=None)):
    # AuthN via App Link Named Credential (JWT)
    validate_applink_token(authorization)
    # ... rest of endpoint
```

### Why This Code Was Written

The AI assistant **misunderstood the App Link Service Mesh architecture** and assumed the application needed to:

1. Extract and validate the JWT from request headers  
2. Implement manual authentication checks

This assumption was based on traditional OAuth/JWT patterns where the application is responsible for token validation.

---

## How This Prevented Service Mesh Authentication

### Expected Architecture (Correct)

```
Salesforce → [App Link Service Mesh] → Python App
             ↓
         Validates X-Request-Context JWT
         Strips auth headers
         Forwards authenticated request
```

### What Actually Happened

1. Salesforce sent request with `X-Request-Context` header containing JWT  
2. Service Mesh validated the JWT successfully (logs showed `level=INFO msg="Authenticated request!"`)  
3. Service Mesh forwarded request to Python app **without** `X-Request-Context` header (by design)  
4. Python app looked for `Authorization` header (which doesn't exist in App Link)  
5. Python app returned 401 because it couldn't find the header

### Debug Evidence

From application logs (v21):

```
INFO:src.api:Received x_request_context header: False
ERROR:src.api:Missing X-Request-Context. Available headers: ['host', 'user-agent', ..., 'x-client-context', 'x-client-id', ...]
```

**Key Finding**: The `X-Request-Context` header was present at the Service Mesh layer but **intentionally not forwarded** to the application.

---

## The Fix

### Corrected Code (v22)

```python
@app.post("/agent/infer")
def agent_infer(req: AgentInferRequest):
    # AuthN via App Link service mesh (acts as authentication gateway)
    # If request reaches here, it has been validated by the mesh
    logger.info("Request authenticated by App Link service mesh")
    # ... rest of endpoint
```

### Node/Express Equivalent (for this repository)

The app should trust the mesh and treat user headers as optional metadata:

```javascript
// Trust the mesh; populate optional context only
const validateUserPlusMode = (req, res, next) => {
  req.salesforceContext = {
    userId: req.headers['x-salesforce-user-id'] || null,
    orgId: req.headers['x-salesforce-org-id'] || null,
    userEmail: req.headers['x-salesforce-user-email'] || null,
    userName: req.headers['x-salesforce-user-name'] || 'AppLink Authenticated User'
  };
  next();
};
```

---

## Key Principle

**The App Link Service Mesh is an authentication gateway.** Applications behind the mesh should:

- ✅ **Trust** that any request reaching them has been authenticated  
- ❌ **NOT** attempt manual JWT validation  
- ❌ **NOT** look for `X-Request-Context` or `Authorization` headers

Note: If you need user context (org ID, user ID, etc.), use `X-Client-Context`, which **is** forwarded by the mesh. Treat its presence as optional and do not block requests if it’s missing.

---

## Lessons Learned

1. **App Link Service Mesh strips authentication headers by design** — this is a security best practice.  
2. **Applications should treat the mesh as a reverse proxy with built-in auth** — similar to AWS ALB with Cognito integration.  
3. **The AI made incorrect assumptions** about needing manual JWT validation based on traditional patterns.  
4. **Debug logging was critical** — logging the received headers immediately revealed the issue.

---

## Timeline

- **v17–v19**: Service mesh correctly authenticated requests, Python app rejected with 401  
- **v20**: Added explicit `X-Request-Context` header handling (incorrect approach)  
- **v21**: Added debug logging, discovered header was not being forwarded  
- **v22**: Removed all manual authentication checks → **SUCCESS** (200 OK)

---

## For Heroku Support

The issue was **entirely on the application side** — not with App Link or the Service Mesh. The mesh worked perfectly:

- JWT validation: ✅ Working  
- Authentication flow: ✅ Working  
- Request forwarding: ✅ Working

The application's manual authentication logic was the blocker.

---

## Correct Pattern for App Link Applications

```python
# NO authentication code needed at the endpoint level
@app.post("/protected-endpoint")
def protected_endpoint(req: RequestModel):
    # If this code executes, the request is already authenticated
    # by the App Link Service Mesh
    return handle_business_logic(req)
```

If you need user context (org ID, user ID, etc.), use the `X-Client-Context` header, which **is** forwarded by the mesh (presence not guaranteed).


