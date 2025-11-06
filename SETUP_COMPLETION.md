# Slack AppLink Bot - Setup Completion Guide

## Deployment Status: SUCCESS ✅

Your Slack Bolt app with AppLink User Plus Mode has been deployed to Heroku!

**App Name**: slack-heroku-demo-ars
**App URL**: https://slack-heroku-demo-ars.herokuapp.com/
**App UUID**: 826a7faf-002a-48e4-ba29-3d20253c70fd

## What's Been Completed

✅ Node.js Slack Bolt application with Express server
✅ Three Agentforce Action endpoints with User Plus Mode security
✅ Slack slash commands: /customer-lookup, /database-stats
✅ Heroku Postgres database attached (essential-0 plan)
✅ Database schema and seed data prepared (db/init.sql)
✅ Deployed to Heroku and running
✅ Comprehensive documentation

## Next Steps to Complete Setup

### 1. Create Your Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "AppLink Customer Bot" (or your choice)
4. Choose your workspace

**Configure OAuth & Permissions:**
- Bot Token Scopes needed:
  - `commands` - For slash commands
  - `chat:write` - To send messages
  - `app_mentions:read` - To respond to mentions

**Configure Slash Commands:**
Create these two commands pointing to your app URL:
- `/customer-lookup` → https://slack-heroku-demo-ars.herokuapp.com/slack/events
- `/database-stats` → https://slack-heroku-demo-ars.herokuapp.com/slack/events

**Enable Event Subscriptions:**
- Request URL: https://slack-heroku-demo-ars.herokuapp.com/slack/events
- Subscribe to bot events: `app_mention`

**Install App to Workspace** and copy your:
- Bot User OAuth Token (starts with `xoxb-`)
- Signing Secret (from Basic Information page)

### 2. Set Slack Environment Variables

Run these commands with your actual Slack credentials:

```bash
heroku config:set SLACK_BOT_TOKEN=xoxb-your-actual-token -a slack-heroku-demo-ars
heroku config:set SLACK_SIGNING_SECRET=your-actual-signing-secret -a slack-heroku-demo-ars
```

This will automatically restart your app.

### 3. Initialize the Database

Once the database is fully provisioned (it may still be provisioning), run:

```bash
heroku pg:psql -a slack-heroku-demo-ars < db/init.sql
```

This creates the `customers` and `orders` tables with sample data.

### 4. Attach Heroku AppLink

**Note**: Your team admin needs to enable AppLink for your team first.

Once enabled, run:

```bash
# Attach AppLink addon
heroku addons:create heroku-applink:free -a slack-heroku-demo-ars

# Set to User Plus Mode
heroku applink:auth:mode userplus -a slack-heroku-demo-ars

# View and sync actions to Salesforce
heroku applink:actions -a slack-heroku-demo-ars
heroku applink:actions:sync -a slack-heroku-demo-ars
```

### 5. Verify Everything Works

**Test Health Endpoint:**
```bash
curl https://slack-heroku-demo-ars.herokuapp.com/
```

**Check App Logs:**
```bash
heroku logs --tail -a slack-heroku-demo-ars
```

**Test in Slack:**
Once credentials are set, try:
- Mention the bot: `@AppLink Customer Bot`
- Run: `/database-stats`
- Run: `/customer-lookup alice`

## API Endpoints for Agentforce

Once AppLink is configured, these endpoints become Agentforce Actions:

### 1. Search Customers
**POST** `/api/customers/search`
```json
{
  "searchTerm": "alice",
  "limit": 10
}
```

### 2. Get Customer Orders
**POST** `/api/customers/:customerId/orders`
```json
{
  "days": 30
}
```

### 3. Customer Insights
**POST** `/api/analytics/customer-insights`
```json
{
  "email": "alice.johnson@example.com"
}
```

## User Plus Mode Security

All API endpoints are protected with User Plus Mode validation:
- Requires `x-salesforce-user-id` header
- Requires `x-salesforce-org-id` header
- Logs which Salesforce user made each request
- Returns 401 if headers are missing

## Architecture Highlights

- **Express Server**: Handles AppLink API endpoints
- **Slack Bolt**: Manages Slack interactions
- **Postgres**: Stores external customer/order data
- **AppLink User Plus Mode**: Bridges Salesforce Agentforce with controlled security

## Questions?

- Check the main README.md for detailed documentation
- See config/applink-setup.md for AppLink configuration details
- View logs: `heroku logs --tail -a slack-heroku-demo-ars`

## Common Issues

**App crashed on startup:**
- Ensure SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET are set
- Check: `heroku config -a slack-heroku-demo-ars`

**Database connection errors:**
- Wait for Postgres to finish provisioning
- Check: `heroku addons:info postgresql-parallel-86371`

**AppLink not available:**
- Contact your team admin to enable the AppLink addon

---

Built with ❤️ using Heroku, Slack Bolt, and AppLink User Plus Mode
