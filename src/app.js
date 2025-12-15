const { App, ExpressReceiver } = require('@slack/bolt');
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
require('dotenv').config();

// Initialize Postgres connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize Slack Bolt via ExpressReceiver at the standard endpoint
let slackApp = null;
let app = null;
const hasSlackCredentials = process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET;

if (hasSlackCredentials) {
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/slack/events',
    processBeforeResponse: true
  });
  slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver
  });
  app = receiver.app;
  console.log('Slack credentials found - Slack integration enabled (ExpressReceiver at /slack/events)');
} else {
  console.log('Slack credentials not found - Running without Slack integration');
  console.log('Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET to enable Slack features');
  app = express();
}

// Create Express app middleware for AppLink endpoints and UI
// IMPORTANT: Do NOT apply JSON parser globally; Slack uses urlencoded with signature verification.
// Limit JSON body parsing to our REST API routes to avoid interfering with Slack requests.
app.use('/api', bodyParser.json());

// Serve static files
app.use(express.static('public'));

// ===== Helpers =====
// Resolve a human-friendly input into a definitive SKU.
// Strategy:
// 1) Exact SKU match (case-insensitive)
// 2) Name contains search (ILIKE %term%)
// 3) If multiple name matches, pick the shortest name (most specific) then by SKU
async function resolveSkuFromInput(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Try exact SKU (uppercased)
  const exact = await pool.query('SELECT sku FROM products WHERE UPPER(sku) = $1 LIMIT 1', [raw.toUpperCase()]);
  if (exact.rows.length > 0) {
    return exact.rows[0].sku;
  }

  // Try name contains
  const nameMatch = await pool.query(
    'SELECT sku FROM products WHERE name ILIKE $1 ORDER BY LENGTH(name) ASC, sku ASC LIMIT 1',
    ['%' + raw + '%']
  );
  if (nameMatch.rows.length > 0) {
    return nameMatch.rows[0].sku;
  }

  // No match
  return null;
}

// Lightweight debug logger, disabled by default unless DEBUG_LOGS=true
const DEBUG_LOGS = process.env.DEBUG_LOGS === 'true';
function debugLog(...args) {
  if (DEBUG_LOGS) {
    console.log(...args);
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'Slack AppLink Bot',
    mode: 'User Plus Mode',
    timestamp: new Date().toISOString()
  });
});

// Friendly routes for inventory UI and favicon
app.get('/inventory', (req, res) => {
  res.redirect('/inventory.html');
});
app.get('/inventory/', (req, res) => {
  res.redirect('/inventory.html');
});
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// AppLink User Plus Mode Authentication Middleware
// User Plus Mode validates both the Salesforce user AND app credentials
const validateUserPlusMode = (req, res, next) => {
  // Trust the App Link Service Mesh to authenticate requests before forwarding.
  // Mesh strips certain headers by design. Treat user context headers as optional metadata.
  const sfUserId = req.headers['x-salesforce-user-id'] || null;
  const sfOrgId = req.headers['x-salesforce-org-id'] || null;
  const sfUserEmail = req.headers['x-salesforce-user-email'] || null;
  const sfUserName = req.headers['x-salesforce-user-name'] || 'AppLink Authenticated User';

  req.salesforceContext = {
    userId: sfUserId,
    orgId: sfOrgId,
    userEmail: sfUserEmail,
    userName: sfUserName
  };

  next();
};

// ===== AGENTFORCE ACTION ENDPOINTS =====

// Action 1: Query Customer Data from External Database
app.post('/api/customers/search', validateUserPlusMode, async (req, res) => {
  try {
    const { searchTerm, limit = 10 } = req.body;
    const sfContext = req.salesforceContext;
    
    debugLog('[User Plus Mode] User ' + sfContext.userName + ' (' + sfContext.userId + ') searching for: ' + searchTerm);
    
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
    
    debugLog('[User Plus Mode] User ' + sfContext.userName + ' fetching orders for customer: ' + customerId);
    
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
    
    debugLog('[User Plus Mode] User ' + sfContext.userName + ' requesting insights for: ' + email);
    
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

// GET /api/inventory/list - List all products with inventory (for UI)
app.get('/api/inventory/list', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.sku,
        p.name,
        p.description,
        p.category,
        p.unit_price,
        p.reorder_level,
        json_agg(
          json_build_object(
            'warehouseName', w.name,
            'warehouseLocation', w.location,
            'warehouseCode', w.code,
            'quantityOnHand', i.quantity_on_hand,
            'quantityReserved', i.quantity_reserved,
            'quantityAvailable', i.quantity_available,
            'stockStatus', CASE
              WHEN i.quantity_available <= p.reorder_level THEN 'LOW_STOCK'
              WHEN i.quantity_available = 0 THEN 'OUT_OF_STOCK'
              ELSE 'IN_STOCK'
            END
          )
        ) as warehouses
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN warehouses w ON i.warehouse_id = w.id
      GROUP BY p.id
      ORDER BY p.category, p.name
    `);

    res.json({
      success: true,
      products: result.rows.map(row => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        description: row.description,
        category: row.category,
        unitPrice: parseFloat(row.unit_price),
        reorderLevel: row.reorder_level,
        warehouses: row.warehouses || []
      }))
    });
  } catch (error) {
    console.error('Error fetching inventory list:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/inventory/update - Update inventory quantity (for UI)
app.post('/api/inventory/update', async (req, res) => {
  try {
    const { sku, warehouseCode, change } = req.body;

    debugLog('[UI Update] Updating inventory for ' + sku + ' at ' + warehouseCode + ' by ' + change);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inventoryResult = await client.query(`
        UPDATE inventory
        SET quantity_on_hand = quantity_on_hand + $1,
            last_stock_check = NOW()
        FROM products p, warehouses w
        WHERE inventory.product_id = p.id
        AND inventory.warehouse_id = w.id
        AND p.sku = $2
        AND w.code = $3
        RETURNING
          p.name as product_name,
          w.name as warehouse_name,
          inventory.quantity_on_hand,
          inventory.quantity_available
      `, [change, sku, warehouseCode]);

      if (inventoryResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Product or warehouse not found'
        });
      }

      const newInventory = inventoryResult.rows[0];

      await client.query(`
        INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, reference_number, notes, created_by)
        SELECT p.id, w.id, $1, $2, $3, $4, 'web_ui'
        FROM products p, warehouses w
        WHERE p.sku = $5 AND w.code = $6
      `, [
        change > 0 ? 'RECEIPT' : 'ADJUSTMENT',
        change,
        'WEB-UI-' + Date.now(),
        'Updated via web UI',
        sku,
        warehouseCode
      ]);

      await client.query('COMMIT');

      const message = change > 0
        ? 'Received ' + change + ' units of ' + newInventory.product_name + ' at ' + newInventory.warehouse_name
        : 'Removed ' + Math.abs(change) + ' units of ' + newInventory.product_name + ' from ' + newInventory.warehouse_name;

      await sendSlackNotification(message, {
        product: newInventory.product_name,
        warehouse: newInventory.warehouse_name,
        change: change,
        newQuantity: parseInt(newInventory.quantity_on_hand),
        available: parseInt(newInventory.quantity_available),
        sku: sku
      });

      res.json({
        success: true,
        message: message,
        newQuantity: parseInt(newInventory.quantity_on_hand),
        available: parseInt(newInventory.quantity_available)
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to send Slack notifications
async function sendSlackNotification(message, details) {
  try {
    // Skip if Slack is not configured
    if (!slackApp) {
      debugLog('[Slack Notification] Slack not configured, skipping notification');
      return;
    }

    if (!process.env.SLACK_NOTIFICATION_CHANNEL) {
      debugLog('[Slack Notification] No channel configured, skipping notification');
      return;
    }

    const emoji = details.change > 0 ? ':package:' : ':outbox_tray:';
    const color = details.change > 0 ? '#28a745' : '#ffc107';

    await slackApp.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: process.env.SLACK_NOTIFICATION_CHANNEL,
      text: emoji + ' Inventory Update: ' + message,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: emoji + ' Inventory Update'
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Product:*\n' + details.product },
            { type: 'mrkdwn', text: '*SKU:*\n' + details.sku },
            { type: 'mrkdwn', text: '*Warehouse:*\n' + details.warehouse },
            { type: 'mrkdwn', text: '*Change:*\n' + (details.change > 0 ? '+' : '') + details.change + ' units' },
            { type: 'mrkdwn', text: '*New On-Hand:*\n' + details.newQuantity + ' units' },
            { type: 'mrkdwn', text: '*Available:*\n' + details.available + ' units' }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Updated via Web UI at ' + new Date().toLocaleString()
            }
          ]
        }
      ]
    });
    debugLog('[Slack Notification] Sent successfully');
  } catch (error) {
    console.error('[Slack Notification] Failed to send:', error.message);
  }
}

// Action 4: Check Stock Levels by SKU
app.post('/api/inventory/check-stock', validateUserPlusMode, async (req, res) => {
  try {
    const { sku, warehouse_code } = req.body;
    const sfContext = req.salesforceContext;

    // Allow natural language: accept product name in "sku" and resolve to actual SKU
    const resolvedSku = await resolveSkuFromInput(sku);
    if (!resolvedSku) {
      return res.json({
        success: true,
        found: false,
        message: 'Product not found. Try a SKU or product name.',
        query: sku,
        requestedBy: sfContext.userName
      });
    }

    debugLog('[User Plus Mode] User ' + sfContext.userName + ' checking stock for SKU: ' + resolvedSku + ' (input: ' + sku + ')');

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
      params = [resolvedSku, warehouse_code];
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
      params = [resolvedSku];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'Product not found or no inventory data available',
        sku: resolvedSku,
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

    debugLog('[User Plus Mode] User ' + sfContext.userName + ' fetching low stock alerts');

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

    debugLog('[User Plus Mode] User ' + sfContext.userName + ' fetching transaction history for: ' + sku);

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

// Only register Slack commands if Slack is configured
if (slackApp) {

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

  const rawInput = command.text.trim();

  if (!rawInput) {
    return respond({
      text: 'Please provide a product SKU or name. Usage: /stock <SKU or Name>\n\nExamples:\n• /stock LAPTOP-PRO-15\n• /stock EUV Photoresist Chemical'
    });
  }

  try {
    // Resolve input to SKU (accept natural language product names)
    const resolvedSku = await resolveSkuFromInput(rawInput);
    if (!resolvedSku) {
      return respond({
        text: 'Product not found for "' + rawInput + '". Try a SKU or product name.'
      });
    }

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
      [resolvedSku]
    );

    if (result.rows.length === 0) {
      return respond({
        text: 'Product not found: ' + resolvedSku + '\n\nPlease check the SKU and try again.'
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

} // End of Slack commands/events conditional block

// Remove ad-hoc Slack verification handlers; ExpressReceiver handles /slack/events URL verification

// ===== SERVER STARTUP =====

const PORT = process.env.PORT || 3000;

// Start single Express server (Slack Bolt mounted if configured)
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
