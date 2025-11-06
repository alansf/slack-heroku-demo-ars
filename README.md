# Slack AppLink Bot with User Plus Mode + ERP Gateway

A Slack Bolt application integrated with Heroku AppLink in User Plus Mode, enabling secure Salesforce Agentforce Actions to query both CRM and external ERP data. This app demonstrates the **secure gateway pattern** for connecting Salesforce to internal enterprise systems.

## Overview

This application demonstrates the power of Heroku AppLink's **User Plus Mode** - a unique security model that validates both Salesforce user credentials AND application credentials for each request. This ensures that Agentforce Actions maintain Salesforce user permissions while accessing external data sources.

The app includes two complete use cases:
1. **Customer & Order Management**: Query external customer database
2. **ERP Inventory Gateway**: Check stock levels across warehouses

### Key Features

- **User Plus Mode Security**: Strongest AppLink authentication combining user and app validation
- **Agentforce Integration**: Exposes APIs as Agentforce Actions for natural language queries
- **ERP Gateway Pattern**: Secure microservice for internal system access
- **Cross-Database Queries**: Query both Salesforce CRM and external Postgres data
- **Slack Commands**: Interactive Slack bot with slash commands
- **Inventory Management**: Real-time stock checks across multiple warehouses
- **Audit Trail**: Complete logging of all access with user context
- **Automatic Action Generation**: AppLink auto-generates Apex, Flow, and Agentforce actions

## Architecture

```
Salesforce Agentforce
       |
       | (User Plus Mode - validates user + app)
       |
   AppLink Layer
       |
       v
  Heroku Microservice Gateway (this app)
       |
       +---> Postgres DB (external customer data)
       +---> Postgres DB (ERP inventory system)
       +---> Slack API (bot interactions)
```

This app acts as a **secure gateway** between Salesforce and internal systems, providing:
- Authentication & authorization via User Plus Mode
- Data transformation between systems
- Audit logging of all access
- Rate limiting and caching capabilities

## What is User Plus Mode?

User Plus Mode is unique to Heroku AppLink and provides:

1. **User Context**: Every request includes Salesforce user information
2. **App Authentication**: Application credentials are validated
3. **Permission Enforcement**: Maintains Salesforce security model
4. **Audit Trail**: Track which Salesforce user made each request

Headers sent with each request:
```
x-salesforce-user-id: 005xx000001X8Uz
x-salesforce-org-id: 00Dxx0000001gEK  
x-salesforce-user-email: user@company.com
x-salesforce-user-name: John Doe
authorization: Bearer <token>
```

## API Endpoints (Agentforce Actions)

### 1. Search Customers
**POST** `/api/customers/search`

Search for customers in the external database by name or email.

**Request Body**:
```json
{
  "searchTerm": "alice",
  "limit": 10
}
```

**Response**:
```json
{
  "success": true,
  "requestedBy": "John Doe",
  "results": [...],
  "count": 3
}
```

### 2. Get Customer Orders
**POST** `/api/customers/:customerId/orders`

Retrieve order history for a specific customer.

**Request Body**:
```json
{
  "days": 30
}
```

**Response**:
```json
{
  "success": true,
  "requestedBy": "John Doe",
  "customerId": "123",
  "orders": [...],
  "count": 5
}
```

### 3. Customer Insights
**POST** `/api/analytics/customer-insights`

Get comprehensive analytics about a customer across CRM and external data.

**Request Body**:
```json
{
  "email": "alice.johnson@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "found": true,
  "insights": {
    "customerId": 1,
    "name": "Alice Johnson",
    "totalOrders": 8,
    "lifetimeValue": 1234.56,
    "status": "VIP",
    "requestedBy": "John Doe"
  }
}
```

### 4. Check Stock Levels (ERP Gateway)
**POST** `/api/inventory/check-stock`

Query inventory levels for a product across warehouses.

**Request Body**:
```json
{
  "sku": "LAPTOP-PRO-15",
  "warehouse_code": "WH-SF-001"
}
```

**Response**:
```json
{
  "success": true,
  "product": {
    "sku": "LAPTOP-PRO-15",
    "name": "Professional Laptop 15\"",
    "unitPrice": 1299.99
  },
  "inventory": {
    "totalAvailable": 102,
    "warehouses": [...]
  }
}
```

### 5. Get Low Stock Alerts (ERP Gateway)
**POST** `/api/inventory/low-stock-alerts`

Retrieve products at or below reorder levels.

**Request Body**:
```json
{
  "category": "Electronics",
  "limit": 20
}
```

### 6. Get Inventory Transaction History (ERP Gateway)
**POST** `/api/inventory/transaction-history`

View audit trail of inventory movements.

**Request Body**:
```json
{
  "sku": "LAPTOP-PRO-15",
  "days": 30
}
```

## Slack Commands

### Customer Management

#### `/customer-lookup <name or email>`
Search for customers directly from Slack.

Example: `/customer-lookup alice`

#### `/database-stats`
View database statistics including total customers, orders, and revenue.

### ERP Inventory Management

#### `/stock <SKU>`
Check inventory levels for a product across all warehouses.

Example: `/stock LAPTOP-PRO-15`

Shows:
- Product details (name, category, price)
- Total available quantities
- Breakdown by warehouse with status indicators
- Low stock warnings

#### `/low-stock`
View all products at or below reorder levels.

Shows products needing reorder with warehouse locations and quantities.

## Setup Instructions

### Prerequisites

- Heroku account
- Slack workspace with admin access
- Salesforce org with Agentforce enabled

### 1. Create Slack App

1. Go to https://api.slack.com/apps
2. Create a new app from manifest
3. Enable the following:
   - Slash Commands: `/customer-lookup`, `/database-stats`
   - Bot Token Scopes: `commands`, `chat:write`, `app_mentions:read`
   - Event Subscriptions: `app_mention`
4. Install app to your workspace
5. Copy the **Bot Token** and **Signing Secret**

### 2. Deploy to Heroku

```bash
# Clone or navigate to project
cd slack-applink-bot

# Create Heroku app (already created as sorbet-vibes-b1eea)
# heroku create sorbet-vibes-b1eea

# Add Postgres
heroku addons:create heroku-postgresql:essential-0 -a sorbet-vibes-b1eea

# Set Slack credentials
heroku config:set SLACK_BOT_TOKEN=xoxb-your-token -a sorbet-vibes-b1eea
heroku config:set SLACK_SIGNING_SECRET=your-secret -a sorbet-vibes-b1eea

# Deploy
git push heroku main

# Initialize database
heroku pg:psql -a sorbet-vibes-b1eea < db/init.sql
```

### 3. Configure AppLink User Plus Mode

```bash
# Attach AppLink addon
heroku addons:create heroku-applink:free -a sorbet-vibes-b1eea

# Set to User Plus Mode
heroku applink:auth:mode userplus -a sorbet-vibes-b1eea

# View available actions
heroku applink:actions -a sorbet-vibes-b1eea

# Sync actions to Salesforce
heroku applink:actions:sync -a sorbet-vibes-b1eea
```

### 4. Configure in Salesforce

1. Go to Setup > AppLink
2. Find your connected app
3. Configure permissions for which users/profiles can access
4. Test actions in Agentforce

### 5. Update Slack App URLs

Get your Heroku app URL and update Slack:

```bash
heroku info -a sorbet-vibes-b1eea | grep "Web URL"
```

In Slack App settings:
- **Request URL**: `https://your-app.herokuapp.com/slack/events`
- **Slash Command URLs**: `https://your-app.herokuapp.com/slack/events`

## Using with Agentforce

Once configured, you can ask Agentforce questions like:

- "Search for customers named Alice"
- "Get order history for customer 123"
- "Show me insights for alice.johnson@example.com"
- "Find all VIP customers"

Agentforce will automatically call your app's APIs through AppLink, maintaining user permissions throughout.

## Database Schema

The app includes sample customer and order data:

**customers table**:
- id, name, email, phone
- created_at, total_orders, last_order_date

**orders table**:
- id, customer_id, order_date
- total_amount, status, items_count

## Security Considerations

- All API endpoints validate Salesforce user context
- Requests without proper headers are rejected (401)
- User Plus Mode ensures both user AND app authentication
- Database credentials are stored securely in Heroku config
- Slack credentials are environment variables only

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials

# Run locally
npm start
```

## Monitoring

```bash
# View logs
heroku logs --tail -a sorbet-vibes-b1eea

# Check app status
heroku ps -a sorbet-vibes-b1eea

# View AppLink status
heroku applink:info -a sorbet-vibes-b1eea
```

## Troubleshooting

### Actions not appearing in Salesforce
```bash
heroku applink:actions:sync -a sorbet-vibes-b1eea
```

### Database connection issues
```bash
heroku pg:info -a sorbet-vibes-b1eea
heroku config:get DATABASE_URL -a sorbet-vibes-b1eea
```

### Slack commands not working
- Verify Request URLs in Slack app settings
- Check that bot is invited to channels
- Verify SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET

## Learn More

- [Heroku AppLink Documentation](https://devcenter.heroku.com/articles/heroku-applink)
- [Slack Bolt Framework](https://slack.dev/bolt-js/)
- [Salesforce Agentforce](https://www.salesforce.com/agentforce/)

## License

MIT
