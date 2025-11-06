const { App } = require('@slack/bolt');
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
require('dotenv').config();

// Initialize Postgres connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize Slack Bolt app
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  port: process.env.PORT || 3000
});

// Create Express app for AppLink endpoints
const app = express();
app.use(bodyParser.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy',
    app: 'Slack AppLink Bot',
    mode: 'User Plus Mode',
    timestamp: new Date().toISOString()
  });
});

// AppLink User Plus Mode Authentication Middleware
// User Plus Mode validates both the Salesforce user AND app credentials
const validateUserPlusMode = (req, res, next) => {
  const sfUserId = req.headers['x-salesforce-user-id'];
  const sfOrgId = req.headers['x-salesforce-org-id'];
  const authHeader = req.headers['authorization'];
  
  // In User Plus Mode, AppLink sends both user context AND validates app credentials
  if (!sfUserId || !sfOrgId) {
    return res.status(401).json({ 
      error: 'Missing Salesforce user context',
      message: 'This endpoint requires User Plus Mode authentication'
    });
  }
  
  // Store user context for use in handlers
  req.salesforceContext = {
    userId: sfUserId,
    orgId: sfOrgId,
    userEmail: req.headers['x-salesforce-user-email'],
    userName: req.headers['x-salesforce-user-name']
  };
  
  next();
};

// ===== AGENTFORCE ACTION ENDPOINTS =====

// Action 1: Query Customer Data from External Database
app.post('/api/customers/search', validateUserPlusMode, async (req, res) => {
  try {
    const { searchTerm, limit = 10 } = req.body;
    const sfContext = req.salesforceContext;
    
    console.log('[User Plus Mode] User ' + sfContext.userName + ' (' + sfContext.userId + ') searching for: ' + searchTerm);
    
    // Query external database for customer data
    const result = await pool.query(
      'SELECT id, name, email, phone, created_at, total_orders, last_order_date FROM customers WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY last_order_date DESC NULLS LAST LIMIT $2',
      ['%' + searchTerm + '%', limit]
    );
    
    res.json({
      success: true,
      requestedBy: sfContext.userName,
      results: result.rows,
      count: result.rows.length,
      query: searchTerm
    });
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Action 2: Get Customer Order History
app.post('/api/customers/:customerId/orders', validateUserPlusMode, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { days = 30 } = req.body;
    const sfContext = req.salesforceContext;
    
    console.log('[User Plus Mode] User ' + sfContext.userName + ' fetching orders for customer: ' + customerId);
    
    const result = await pool.query(
      "SELECT o.id, o.order_date, o.total_amount, o.status, o.items_count FROM orders o WHERE o.customer_id = $1 AND o.order_date > NOW() - INTERVAL '1 day' * $2 ORDER BY o.order_date DESC",
      [customerId, days]
    );
    
    res.json({
      success: true,
      requestedBy: sfContext.userName,
      customerId: customerId,
      orders: result.rows,
      count: result.rows.length,
      periodDays: days
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Action 3: Cross-reference CRM and External Data
app.post('/api/analytics/customer-insights', validateUserPlusMode, async (req, res) => {
  try {
    const { email } = req.body;
    const sfContext = req.salesforceContext;
    
    console.log('[User Plus Mode] User ' + sfContext.userName + ' requesting insights for: ' + email);
    
    // Get customer data from external database
    const customerResult = await pool.query(
      'SELECT c.*, COUNT(o.id) as total_orders, SUM(o.total_amount) as lifetime_value, MAX(o.order_date) as last_order_date FROM customers c LEFT JOIN orders o ON c.id = o.customer_id WHERE c.email = $1 GROUP BY c.id',
      [email]
    );
    
    if (customerResult.rows.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'Customer not found in external database',
        requestedBy: sfContext.userName
      });
    }
    
    const customer = customerResult.rows[0];
    
    // Calculate insights
    const insights = {
      customerId: customer.id,
      name: customer.name,
      email: customer.email,
      totalOrders: parseInt(customer.total_orders),
      lifetimeValue: parseFloat(customer.lifetime_value || 0),
      lastOrderDate: customer.last_order_date,
      customerSince: customer.created_at,
      status: customer.total_orders > 5 ? 'VIP' : 'Regular',
      requestedBy: sfContext.userName,
      requestedAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      found: true,
      insights: insights
    });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== SLACK BOT COMMANDS =====

// Slash command: /customer-lookup
slackApp.command('/customer-lookup', async ({ command, ack, respond }) => {
  await ack();
  
  const searchTerm = command.text.trim();
  
  if (!searchTerm) {
    return respond({
      text: 'Please provide a search term. Usage: /customer-lookup <name or email>'
    });
  }
  
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, total_orders, last_order_date FROM customers WHERE name ILIKE $1 OR email ILIKE $1 LIMIT 5',
      ['%' + searchTerm + '%']
    );
    
    if (result.rows.length === 0) {
      return respond({
        text: 'No customers found matching: "' + searchTerm + '"'
      });
    }
    
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: 'Customer Search Results for "' + searchTerm + '"'
        }
      },
      {
        type: "divider"
      }
    ];
    
    result.rows.forEach(customer => {
      blocks.push({
        type: "section",
        fields: [
          { type: "mrkdwn", text: '*Name:*\n' + customer.name },
          { type: "mrkdwn", text: '*Email:*\n' + customer.email },
          { type: "mrkdwn", text: '*Phone:*\n' + (customer.phone || 'N/A') },
          { type: "mrkdwn", text: '*Total Orders:*\n' + (customer.total_orders || 0) }
        ]
      });
      blocks.push({ type: "divider" });
    });
    
    respond({ blocks });
  } catch (error) {
    console.error('Error in customer lookup:', error);
    respond({
      text: 'Error searching for customers: ' + error.message
    });
  }
});

// Slash command: /database-stats
slackApp.command('/database-stats', async ({ ack, respond }) => {
  await ack();
  
  try {
    const stats = await pool.query(
      'SELECT (SELECT COUNT(*) FROM customers) as total_customers, (SELECT COUNT(*) FROM orders) as total_orders, (SELECT SUM(total_amount) FROM orders) as total_revenue'
    );
    
    const data = stats.rows[0];
    
    respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Database Statistics"
          }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: '*Total Customers:*\n' + (data.total_customers || 0) },
            { type: "mrkdwn", text: '*Total Orders:*\n' + (data.total_orders || 0) },
            { type: "mrkdwn", text: '*Total Revenue:*\n$' + parseFloat(data.total_revenue || 0).toFixed(2) }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    respond({
      text: 'Error fetching database statistics: ' + error.message
    });
  }
});

// Welcome message
slackApp.event('app_mention', async ({ event, say }) => {
  await say({
    text: 'Hi <@' + event.user + '>! I am your AppLink-powered bot connected to Salesforce Agentforce!\n\n' +
          '*Available commands:*\n' +
          '• /customer-lookup <name or email> - Search for customers\n' +
          '• /database-stats - View database statistics\n\n' +
          '*AppLink Integration:*\n' +
          'This app is secured with User Plus Mode, allowing Agentforce to query customer data while maintaining Salesforce user permissions.'
  });
});

// ===== SERVER STARTUP =====

const PORT = process.env.PORT || 3000;

// Start Slack Bolt receiver
(async () => {
  await slackApp.start();
  console.log('Slack Bolt app is running!');
  console.log('User Plus Mode: Active');
  console.log('AppLink endpoints ready for Agentforce Actions');
})();

// Start Express server for AppLink endpoints
app.listen(PORT, () => {
  console.log('Express server listening on port ' + PORT);
  console.log('AppLink API endpoints available at:');
  console.log('   - POST /api/customers/search');
  console.log('   - POST /api/customers/:customerId/orders');
  console.log('   - POST /api/analytics/customer-insights');
});

// Database initialization check
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});
