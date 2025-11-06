-- Database schema for external customer and order data
-- This demonstrates data outside of Salesforce CRM that Agentforce can query

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_orders INTEGER DEFAULT 0,
  last_order_date TIMESTAMP
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  items_count INTEGER DEFAULT 1
);

-- Insert sample customer data
INSERT INTO customers (name, email, phone, total_orders, last_order_date) VALUES
('Alice Johnson', 'alice.johnson@example.com', '555-0101', 8, NOW() - INTERVAL '2 days'),
('Bob Smith', 'bob.smith@example.com', '555-0102', 3, NOW() - INTERVAL '10 days'),
('Carol White', 'carol.white@example.com', '555-0103', 12, NOW() - INTERVAL '1 day'),
('David Brown', 'david.brown@example.com', '555-0104', 5, NOW() - INTERVAL '5 days'),
('Emma Davis', 'emma.davis@example.com', '555-0105', 15, NOW() - INTERVAL '3 hours'),
('Frank Wilson', 'frank.wilson@example.com', '555-0106', 2, NOW() - INTERVAL '30 days'),
('Grace Lee', 'grace.lee@example.com', '555-0107', 7, NOW() - INTERVAL '7 days'),
('Henry Martinez', 'henry.martinez@example.com', '555-0108', 9, NOW() - INTERVAL '4 days')
ON CONFLICT (email) DO NOTHING;

-- Insert sample order data
INSERT INTO orders (customer_id, order_date, total_amount, status, items_count) VALUES
(1, NOW() - INTERVAL '2 days', 149.99, 'completed', 3),
(1, NOW() - INTERVAL '15 days', 89.50, 'completed', 2),
(1, NOW() - INTERVAL '30 days', 199.99, 'completed', 5),
(2, NOW() - INTERVAL '10 days', 59.99, 'completed', 1),
(2, NOW() - INTERVAL '45 days', 129.99, 'completed', 3),
(3, NOW() - INTERVAL '1 day', 299.99, 'pending', 4),
(3, NOW() - INTERVAL '5 days', 179.99, 'completed', 3),
(3, NOW() - INTERVAL '12 days', 89.99, 'completed', 2),
(4, NOW() - INTERVAL '5 days', 449.99, 'completed', 6),
(4, NOW() - INTERVAL '20 days', 99.99, 'completed', 2),
(5, NOW() - INTERVAL '3 hours', 349.99, 'processing', 5),
(5, NOW() - INTERVAL '2 days', 189.99, 'completed', 4),
(5, NOW() - INTERVAL '8 days', 229.99, 'completed', 3),
(6, NOW() - INTERVAL '30 days', 79.99, 'completed', 1),
(7, NOW() - INTERVAL '7 days', 159.99, 'completed', 2),
(7, NOW() - INTERVAL '14 days', 249.99, 'completed', 4),
(8, NOW() - INTERVAL '4 days', 399.99, 'completed', 7),
(8, NOW() - INTERVAL '11 days', 129.99, 'completed', 2);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

-- Update customer order counts based on actual orders
UPDATE customers c
SET total_orders = (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id);

-- Update last order dates
UPDATE customers c
SET last_order_date = (SELECT MAX(order_date) FROM orders o WHERE o.customer_id = c.id);

-- ===== ERP INVENTORY MANAGEMENT SYSTEM =====

-- Create warehouses table (simulates ERP system locations)
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create products table (simulates ERP product catalog)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  unit_price DECIMAL(10, 2),
  reorder_level INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create inventory table (simulates ERP stock levels)
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER DEFAULT 0,
  quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  last_stock_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, warehouse_id)
);

-- Create inventory transactions table (audit trail)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  transaction_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  reference_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

-- Insert warehouse data
INSERT INTO warehouses (name, location, code) VALUES
('Main Distribution Center', 'San Francisco, CA', 'WH-SF-001'),
('East Coast Warehouse', 'New York, NY', 'WH-NY-002'),
('Midwest Hub', 'Chicago, IL', 'WH-CH-003'),
('Southern Distribution', 'Dallas, TX', 'WH-DL-004')
ON CONFLICT (code) DO NOTHING;

-- Insert product data
INSERT INTO products (sku, name, description, category, unit_price, reorder_level) VALUES
('LAPTOP-PRO-15', 'Professional Laptop 15"', 'High-performance laptop for business use', 'Electronics', 1299.99, 15),
('DESK-CHAIR-ERG', 'Ergonomic Office Chair', 'Adjustable ergonomic chair with lumbar support', 'Furniture', 349.99, 10),
('MONITOR-4K-27', '4K Monitor 27"', 'Ultra HD 4K display for professionals', 'Electronics', 599.99, 20),
('KEYBOARD-MECH', 'Mechanical Keyboard', 'RGB mechanical keyboard with cherry switches', 'Electronics', 149.99, 25),
('MOUSE-WIRELESS', 'Wireless Mouse', 'Ergonomic wireless mouse with precision tracking', 'Electronics', 79.99, 30),
('DESK-LAMP-LED', 'LED Desk Lamp', 'Adjustable LED lamp with color temperature control', 'Office Supplies', 89.99, 15),
('NOTEBOOK-A4', 'Premium Notebook A4', 'High-quality paper notebook for note-taking', 'Office Supplies', 12.99, 50),
('WEBCAM-HD', 'HD Webcam 1080p', 'Full HD webcam for video conferencing', 'Electronics', 129.99, 20),
('HEADSET-NC', 'Noise Cancelling Headset', 'Professional headset with active noise cancellation', 'Electronics', 199.99, 15),
('DOCKING-STATION', 'Universal Docking Station', 'Multi-port docking station for laptops', 'Electronics', 249.99, 12),
('PHONE-STAND', 'Adjustable Phone Stand', 'Aluminum phone stand for desk', 'Accessories', 29.99, 40),
('CABLE-USB-C', 'USB-C Cable 6ft', 'High-speed USB-C charging cable', 'Accessories', 19.99, 100)
ON CONFLICT (sku) DO NOTHING;

-- Insert inventory data (distributed across warehouses)
INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, quantity_reserved) VALUES
-- Main Distribution Center (WH-SF-001)
(1, 1, 45, 5),   -- LAPTOP-PRO-15: 45 on hand, 5 reserved = 40 available
(2, 1, 28, 3),   -- DESK-CHAIR-ERG: 28 on hand, 3 reserved = 25 available
(3, 1, 67, 7),   -- MONITOR-4K-27: 67 on hand, 7 reserved = 60 available
(4, 1, 120, 15), -- KEYBOARD-MECH: 120 on hand, 15 reserved = 105 available
(5, 1, 85, 10),  -- MOUSE-WIRELESS: 85 on hand, 10 reserved = 75 available
(6, 1, 42, 2),   -- DESK-LAMP-LED: 42 on hand, 2 reserved = 40 available
(7, 1, 250, 20), -- NOTEBOOK-A4: 250 on hand, 20 reserved = 230 available
(8, 1, 55, 5),   -- WEBCAM-HD: 55 on hand, 5 reserved = 50 available
(9, 1, 38, 3),   -- HEADSET-NC: 38 on hand, 3 reserved = 35 available
(10, 1, 30, 5),  -- DOCKING-STATION: 30 on hand, 5 reserved = 25 available
(11, 1, 95, 5),  -- PHONE-STAND: 95 on hand, 5 reserved = 90 available
(12, 1, 450, 50), -- CABLE-USB-C: 450 on hand, 50 reserved = 400 available

-- East Coast Warehouse (WH-NY-002)
(1, 2, 32, 2),   -- LAPTOP-PRO-15: 32 on hand, 2 reserved = 30 available
(2, 2, 18, 0),   -- DESK-CHAIR-ERG: 18 on hand, 0 reserved = 18 available
(3, 2, 45, 5),   -- MONITOR-4K-27: 45 on hand, 5 reserved = 40 available
(4, 2, 90, 10),  -- KEYBOARD-MECH: 90 on hand, 10 reserved = 80 available
(5, 2, 70, 5),   -- MOUSE-WIRELESS: 70 on hand, 5 reserved = 65 available
(6, 2, 25, 0),   -- DESK-LAMP-LED: 25 on hand, 0 reserved = 25 available
(7, 2, 180, 15), -- NOTEBOOK-A4: 180 on hand, 15 reserved = 165 available
(8, 2, 40, 3),   -- WEBCAM-HD: 40 on hand, 3 reserved = 37 available

-- Midwest Hub (WH-CH-003)
(1, 3, 28, 3),   -- LAPTOP-PRO-15: 28 on hand, 3 reserved = 25 available
(2, 3, 15, 2),   -- DESK-CHAIR-ERG: 15 on hand, 2 reserved = 13 available
(3, 3, 50, 4),   -- MONITOR-4K-27: 50 on hand, 4 reserved = 46 available
(4, 3, 110, 12), -- KEYBOARD-MECH: 110 on hand, 12 reserved = 98 available
(5, 3, 65, 8),   -- MOUSE-WIRELESS: 65 on hand, 8 reserved = 57 available
(9, 3, 22, 2),   -- HEADSET-NC: 22 on hand, 2 reserved = 20 available
(10, 3, 18, 3),  -- DOCKING-STATION: 18 on hand, 3 reserved = 15 available

-- Southern Distribution (WH-DL-004)
(1, 4, 8, 1),    -- LAPTOP-PRO-15: 8 on hand, 1 reserved = 7 available (LOW STOCK!)
(2, 4, 5, 0),    -- DESK-CHAIR-ERG: 5 on hand, 0 reserved = 5 available (LOW STOCK!)
(3, 4, 35, 3),   -- MONITOR-4K-27: 35 on hand, 3 reserved = 32 available
(4, 4, 75, 8),   -- KEYBOARD-MECH: 75 on hand, 8 reserved = 67 available
(5, 4, 55, 5),   -- MOUSE-WIRELESS: 55 on hand, 5 reserved = 50 available
(11, 4, 60, 5),  -- PHONE-STAND: 60 on hand, 5 reserved = 55 available
(12, 4, 300, 30) -- CABLE-USB-C: 300 on hand, 30 reserved = 270 available
ON CONFLICT (product_id, warehouse_id) DO NOTHING;

-- Insert sample inventory transactions
INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, reference_number, notes, created_by) VALUES
(1, 1, 'RECEIPT', 50, 'PO-2024-001', 'Received shipment from supplier', 'system'),
(1, 1, 'SALE', -5, 'SO-2024-123', 'Sold to customer', 'sales_team'),
(3, 2, 'TRANSFER', -10, 'TRF-2024-045', 'Transferred to WH-NY-002', 'warehouse_ops'),
(3, 2, 'TRANSFER', 10, 'TRF-2024-045', 'Received from WH-SF-001', 'warehouse_ops'),
(7, 1, 'RECEIPT', 300, 'PO-2024-015', 'Bulk order of notebooks', 'system'),
(1, 4, 'ADJUSTMENT', -2, 'ADJ-2024-008', 'Damaged units removed from inventory', 'quality_control');

-- Create indexes for inventory queries
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product ON inventory_transactions(product_id);

-- Create view for low stock alerts
CREATE OR REPLACE VIEW low_stock_alerts AS
SELECT
  p.sku,
  p.name,
  p.category,
  w.name as warehouse_name,
  w.code as warehouse_code,
  i.quantity_on_hand,
  i.quantity_reserved,
  i.quantity_available,
  p.reorder_level,
  (p.reorder_level - i.quantity_available) as units_below_threshold
FROM inventory i
JOIN products p ON i.product_id = p.id
JOIN warehouses w ON i.warehouse_id = w.id
WHERE i.quantity_available <= p.reorder_level
ORDER BY units_below_threshold DESC;
