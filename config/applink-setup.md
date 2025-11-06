# Heroku AppLink User Plus Mode Configuration

## What is User Plus Mode?

User Plus Mode is a unique AppLink security mode that combines:
- **User authentication**: Validates the Salesforce user making the request
- **App authentication**: Validates the application credentials
- **User context**: Passes Salesforce user information with each request

This provides the strongest security model, ensuring that only authenticated Salesforce users with proper permissions can access your app's APIs through Agentforce.

## Setup Steps

### 1. Attach AppLink Addon

```bash
heroku addons:create heroku-applink:free -a slack-heroku-demo-ars
```

### 2. Configure User Plus Mode

```bash
# Set authentication mode to User Plus
heroku applink:auth:mode userplus -a slack-heroku-demo-ars

# This enables both user and app credential validation
```

### 3. Generate API Actions for Agentforce

AppLink will automatically discover your API endpoints and generate:
- Apex Actions
- Flow Actions  
- Agentforce Actions
- Data Cloud Actions

```bash
# View available actions
heroku applink:actions -a slack-heroku-demo-ars

# Sync actions to Salesforce
heroku applink:actions:sync -a slack-heroku-demo-ars
```

### 4. Configure Slack Credentials

The app requires Slack credentials to be set as environment variables:

```bash
heroku config:set SLACK_BOT_TOKEN=xoxb-your-token -a slack-heroku-demo-ars
heroku config:set SLACK_SIGNING_SECRET=your-signing-secret -a slack-heroku-demo-ars
```

## Available Agentforce Actions

Once configured, the following actions will be available in Agentforce:

### 1. Search Customers
**Endpoint**: POST /api/customers/search
**Purpose**: Search for customers in external database
**Parameters**:
- searchTerm (string): Name or email to search for
- limit (number): Maximum results to return

### 2. Get Customer Orders
**Endpoint**: POST /api/customers/:customerId/orders
**Purpose**: Retrieve order history for a customer
**Parameters**:
- customerId (string): Customer ID
- days (number): Number of days to look back

### 3. Customer Insights
**Endpoint**: POST /api/analytics/customer-insights
**Purpose**: Get comprehensive insights about a customer
**Parameters**:
- email (string): Customer email address

## Security Headers

All requests from Agentforce through AppLink User Plus Mode include:

```
x-salesforce-user-id: 005xx000001X8Uz
x-salesforce-org-id: 00Dxx0000001gEK
x-salesforce-user-email: user@company.com
x-salesforce-user-name: John Doe
authorization: Bearer <token>
```

The app validates these headers to ensure secure access.

## Testing

You can test the endpoints directly:

```bash
# Get app URL
heroku info -a slack-heroku-demo-ars

# Test health check
curl https://slack-heroku-demo-ars.herokuapp.com/

# Test with User Plus Mode headers (simulated)
curl -X POST https://slack-heroku-demo-ars.herokuapp.com/api/customers/search \
  -H "Content-Type: application/json" \
  -H "x-salesforce-user-id: test-user-id" \
  -H "x-salesforce-org-id: test-org-id" \
  -H "x-salesforce-user-name: Test User" \
  -d '{"searchTerm": "alice", "limit": 5}'
```
