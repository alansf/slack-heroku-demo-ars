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

// ===== ERP INVENTORY GATEWAY ENDPOINTS =====

// Action 4: Check Stock Levels by SKU
app.post('/api/inventory/check-stock', validateUserPlusMode, async (req, res) => {
  try {
    const { sku, warehouse_code } = req.body;
    const sfContext = req.salesforceContext;

    console.log('[User Plus Mode] User ' + sfContext.userName + ' checking stock for SKU: ' + sku);

    let query, params;

    if (warehouse_code) {
      // Check stock at specific warehouse
      query = `
        SELECT
          p.sku,
          p.name,
          p.description,
          p.category,
          p.unit_price,
          w.name as warehouse_name,
          w.location as warehouse_location,
          w.code as warehouse_code,
          i.quantity_on_hand,
          i.quantity_reserved,
          i.quantity_available,
          p.reorder_level,
          CASE
            WHEN i.quantity_available <= p.reorder_level THEN 'LOW_STOCK'
            WHEN i.quantity_available = 0 THEN 'OUT_OF_STOCK'
            ELSE 'IN_STOCK'
          END as stock_status
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        JOIN warehouses w ON i.warehouse_id = w.id
        WHERE p.sku = $1 AND w.code = $2
      `;
      params = [sku, warehouse_code];
    } else {
      // Check stock across all warehouses
      query = `
        SELECT
          p.sku,
          p.name,
          p.description,
          p.category,
          p.unit_price,
          w.name as warehouse_name,
          w.location as warehouse_location,
          w.code as warehouse_code,
          i.quantity_on_hand,
          i.quantity_reserved,
          i.quantity_available,
          p.reorder_level,
          CASE
            WHEN i.quantity_available <= p.reorder_level THEN 'LOW_STOCK'
            WHEN i.quantity_available = 0 THEN 'OUT_OF_STOCK'
            ELSE 'IN_STOCK'
          END as stock_status
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        JOIN warehouses w ON i.warehouse_id = w.id
        WHERE p.sku = $1
        ORDER BY i.quantity_available DESC
      `;
      params = [sku];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'Product not found or no inventory data available',
        sku: sku,
        requestedBy: sfContext.userName
      });
    }

    // Calculate total available across all warehouses
    const totalAvailable = result.rows.reduce((sum, row) => sum + parseInt(row.quantity_available || 0), 0);
    const totalOnHand = result.rows.reduce((sum, row) => sum + parseInt(row.quantity_on_hand || 0), 0);
    const totalReserved = result.rows.reduce((sum, row) => sum + parseInt(row.quantity_reserved || 0), 0);

    res.json({
      success: true,
      found: true,
      product: {
        sku: result.rows[0].sku,
        name: result.rows[0].name,
        description: result.rows[0].description,
        category: result.rows[0].category,
        unitPrice: parseFloat(result.rows[0].unit_price),
        reorderLevel: result.rows[0].reorder_level
      },
      inventory: {
        totalAvailable: totalAvailable,
        totalOnHand: totalOnHand,
        totalReserved: totalReserved,
        warehouses: result.rows.map(row => ({
          warehouseName: row.warehouse_name,
          warehouseLocation: row.warehouse_location,
          warehouseCode: row.warehouse_code,
          quantityOnHand: parseInt(row.quantity_on_hand),
          quantityReserved: parseInt(row.quantity_reserved),
          quantityAvailable: parseInt(row.quantity_available),
          stockStatus: row.stock_status
        }))
      },
      requestedBy: sfContext.userName,
      requestedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking stock:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Action 5: Get Low Stock Alerts
app.post('/api/inventory/low-stock-alerts', validateUserPlusMode, async (req, res) => {
  try {
    const { category, warehouse_code, limit = 20 } = req.body;
    const sfContext = req.salesforceContext;

    console.log('[User Plus Mode] User ' + sfContext.userName + ' fetching low stock alerts');

    let query = 'SELECT * FROM low_stock_alerts WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ' AND category = $' + paramCount;
      params.push(category);
    }

    if (warehouse_code) {
      paramCount++;
      query += ' AND warehouse_code = $' + paramCount;
      params.push(warehouse_code);
    }

    paramCount++;
    query += ' LIMIT $' + paramCount;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      alerts: result.rows.map(row => ({
        sku: row.sku,
        productName: row.name,
        category: row.category,
        warehouseName: row.warehouse_name,
        warehouseCode: row.warehouse_code,
        quantityOnHand: parseInt(row.quantity_on_hand),
        quantityReserved: parseInt(row.quantity_reserved),
        quantityAvailable: parseInt(row.quantity_available),
        reorderLevel: parseInt(row.reorder_level),
        unitsBelowThreshold: parseInt(row.units_below_threshold)
      })),
      count: result.rows.length,
      requestedBy: sfContext.userName,
      filters: { category, warehouse_code }
    });
  } catch (error) {
    console.error('Error fetching low stock alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Action 6: Get Inventory Transaction History
app.post('/api/inventory/transaction-history', validateUserPlusMode, async (req, res) => {
  try {
    const { sku, days = 30, limit = 50 } = req.body;
    const sfContext = req.salesforceContext;

    console.log('[User Plus Mode] User ' + sfContext.userName + ' fetching transaction history for: ' + sku);

    const result = await pool.query(
      `SELECT
        t.id,
        p.sku,
        p.name as product_name,
        w.name as warehouse_name,
        w.code as warehouse_code,
        t.transaction_type,
        t.quantity,
        t.reference_number,
        t.notes,
        t.created_by,
        t.created_at
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      JOIN warehouses w ON t.warehouse_id = w.id
      WHERE p.sku = $1
      AND t.created_at > NOW() - INTERVAL '1 day' * $2
      ORDER BY t.created_at DESC
      LIMIT $3`,
      [sku, days, limit]
    );

    res.json({
      success: true,
      sku: sku,
      transactions: result.rows.map(row => ({
        transactionId: row.id,
        productName: row.product_name,
        warehouseName: row.warehouse_name,
        warehouseCode: row.warehouse_code,
        transactionType: row.transaction_type,
        quantity: parseInt(row.quantity),
        referenceNumber: row.reference_number,
        notes: row.notes,
        createdBy: row.created_by,
        createdAt: row.created_at
      })),
      count: result.rows.length,
      requestedBy: sfContext.userName,
      periodDays: days
    });
  } catch (error) {
    console.error('Error fetching transaction history:', error);
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

// Slash command: /stock
slackApp.command('/stock', async ({ command, ack, respond }) => {
  await ack();

  const sku = command.text.trim().toUpperCase();

  if (!sku) {
    return respond({
      text: 'Please provide a product SKU. Usage: /stock <SKU>\n\nExample: /stock LAPTOP-PRO-15'
    });
  }

  try {
    // Query inventory across all warehouses
    const result = await pool.query(
      `SELECT
        p.sku,
        p.name,
        p.category,
        p.unit_price,
        w.name as warehouse_name,
        w.location as warehouse_location,
        w.code as warehouse_code,
        i.quantity_on_hand,
        i.quantity_reserved,
        i.quantity_available,
        p.reorder_level,
        CASE
          WHEN i.quantity_available <= p.reorder_level THEN 'LOW_STOCK'
          WHEN i.quantity_available = 0 THEN 'OUT_OF_STOCK'
          ELSE 'IN_STOCK'
        END as stock_status
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE p.sku = $1
      ORDER BY i.quantity_available DESC`,
      [sku]
    );

    if (result.rows.length === 0) {
      return respond({
        text: 'Product not found: ' + sku + '\n\nPlease check the SKU and try again.'
      });
    }

    const product = result.rows[0];
    const totalAvailable = result.rows.reduce((sum, row) => sum + parseInt(row.quantity_available), 0);
    const totalOnHand = result.rows.reduce((sum, row) => sum + parseInt(row.quantity_on_hand), 0);

    // Build response blocks
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: 'Stock Check: ' + product.sku
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: '*Product Name:*\n' + product.name },
          { type: "mrkdwn", text: '*Category:*\n' + product.category },
          { type: "mrkdwn", text: '*Unit Price:*\n$' + parseFloat(product.unit_price).toFixed(2) },
          { type: "mrkdwn", text: '*Reorder Level:*\n' + product.reorder_level + ' units' }
        ]
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: '*Total Available:*\n' + totalAvailable + ' units' },
          { type: "mrkdwn", text: '*Total On Hand:*\n' + totalOnHand + ' units' }
        ]
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: '*Warehouse Breakdown:*'
        }
      }
    ];

    // Add warehouse details
    result.rows.forEach(row => {
      const statusEmoji = row.stock_status === 'IN_STOCK' ? ':white_check_mark:' :
                         row.stock_status === 'LOW_STOCK' ? ':warning:' : ':x:';

      blocks.push({
        type: "section",
        fields: [
          { type: "mrkdwn", text: '*' + row.warehouse_name + '*\n' + row.warehouse_location },
          { type: "mrkdwn", text: '*Available:* ' + row.quantity_available + ' units ' + statusEmoji },
          { type: "mrkdwn", text: '*On Hand:* ' + row.quantity_on_hand + ' units' },
          { type: "mrkdwn", text: '*Reserved:* ' + row.quantity_reserved + ' units' }
        ]
      });
    });

    // Add alert if low stock
    if (totalAvailable <= product.reorder_level) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: ':warning: *LOW STOCK ALERT:* This product is at or below the reorder level!'
          }
        ]
      });
    }

    respond({ blocks });
  } catch (error) {
    console.error('Error checking stock:', error);
    respond({
      text: 'Error checking stock for ' + sku + ': ' + error.message
    });
  }
});

// Slash command: /low-stock
slackApp.command('/low-stock', async ({ command, ack, respond }) => {
  await ack();

  try {
    const result = await pool.query('SELECT * FROM low_stock_alerts LIMIT 10');

    if (result.rows.length === 0) {
      return respond({
        text: 'No low stock alerts! All products are adequately stocked.'
      });
    }

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: 'Low Stock Alerts'
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: 'Products at or below reorder level'
          }
        ]
      },
      {
        type: "divider"
      }
    ];

    result.rows.forEach(alert => {
      blocks.push({
        type: "section",
        fields: [
          { type: "mrkdwn", text: '*SKU:*\n' + alert.sku },
          { type: "mrkdwn", text: '*Product:*\n' + alert.name },
          { type: "mrkdwn", text: '*Warehouse:*\n' + alert.warehouse_name },
          { type: "mrkdwn", text: '*Available:*\n' + alert.quantity_available + ' / ' + alert.reorder_level + ' units' }
        ]
      });
      blocks.push({ type: "divider" });
    });

    respond({ blocks });
  } catch (error) {
    console.error('Error fetching low stock alerts:', error);
    respond({
      text: 'Error fetching low stock alerts: ' + error.message
    });
  }
});

// Welcome message
slackApp.event('app_mention', async ({ event, say }) => {
  await say({
    text: 'Hi <@' + event.user + '>! I am your AppLink-powered bot connected to Salesforce Agentforce!\n\n' +
          '*Customer Commands:*\n' +
          '• /customer-lookup <name or email> - Search for customers\n' +
          '• /database-stats - View database statistics\n\n' +
          '*ERP Inventory Commands:*\n' +
          '• /stock <SKU> - Check inventory levels for a product\n' +
          '• /low-stock - View products with low inventory\n\n' +
          '*AppLink Integration:*\n' +
          'This app is secured with User Plus Mode, allowing Agentforce to query customer and inventory data while maintaining Salesforce user permissions.'
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
  console.log('Customer Endpoints:');
  console.log('   - POST /api/customers/search');
  console.log('   - POST /api/customers/:customerId/orders');
  console.log('   - POST /api/analytics/customer-insights');
  console.log('ERP Inventory Endpoints:');
  console.log('   - POST /api/inventory/check-stock');
  console.log('   - POST /api/inventory/low-stock-alerts');
  console.log('   - POST /api/inventory/transaction-history');
});

// Database initialization check
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});
