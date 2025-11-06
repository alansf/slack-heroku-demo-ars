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

-- Insert product data - Semiconductor Manufacturing Components
INSERT INTO products (sku, name, description, category, unit_price, reorder_level) VALUES
('GPU-H100-80GB', 'NVIDIA H100 80GB GPU', 'High-performance AI training GPU with 80GB HBM3 memory', 'GPU Chips', 32999.99, 5),
('GPU-A100-40GB', 'NVIDIA A100 40GB GPU', 'Enterprise datacenter GPU for AI workloads', 'GPU Chips', 11999.99, 10),
('GPU-L40S-48GB', 'NVIDIA L40S 48GB GPU', 'Multi-workload GPU for AI inference and graphics', 'GPU Chips', 8999.99, 8),
('CHEM-PHOTORESIST-EUV', 'EUV Photoresist Chemical', 'Extreme ultraviolet photoresist for 5nm process', 'Chemicals', 45000.00, 3),
('CHEM-ETCHANT-SILICON', 'Silicon Etchant Solution', 'High-purity silicon etchant for wafer processing', 'Chemicals', 12500.00, 5),
('CHEM-DOPANT-BORON', 'Boron Dopant Material', 'Ultra-pure boron for p-type doping', 'Chemicals', 28000.00, 2),
('RACK-GPU-8U', 'GPU Server Rack 8U', '8U rack-mount chassis for 8x GPU configuration', 'Server Hardware', 15999.99, 4),
('RACK-STORAGE-42U', 'Storage Server Rack 42U', 'Full 42U rack for high-density storage', 'Server Hardware', 8499.99, 6),
('WAFER-SILICON-300MM', '300mm Silicon Wafer', 'Prime grade 300mm silicon wafer substrate', 'Wafer Materials', 1200.00, 50),
('MASK-RETICLE-EUV', 'EUV Lithography Mask', 'Extreme ultraviolet lithography reticle', 'Manufacturing Tools', 150000.00, 2),
('COOLANT-LIQUID-IMMERSION', 'Liquid Immersion Coolant', 'Dielectric cooling fluid for GPU servers', 'Cooling Systems', 3500.00, 15),
('PSU-REDUNDANT-3KW', 'Redundant Power Supply 3KW', 'Hot-swap redundant PSU for GPU servers', 'Power Systems', 2499.99, 10)
ON CONFLICT (sku) DO NOTHING;

-- Insert inventory data (distributed across warehouses)
INSERT INTO inventory (product_id, warehouse_id, quantity_on_hand, quantity_reserved) VALUES
-- Main Distribution Center - San Francisco (WH-SF-001)
(1, 1, 12, 2),   -- GPU-H100-80GB: 12 on hand, 2 reserved = 10 available
(2, 1, 28, 3),   -- GPU-A100-40GB: 28 on hand, 3 reserved = 25 available
(3, 1, 35, 5),   -- GPU-L40S-48GB: 35 on hand, 5 reserved = 30 available
(4, 1, 8, 1),    -- CHEM-PHOTORESIST-EUV: 8 on hand, 1 reserved = 7 available
(5, 1, 15, 2),   -- CHEM-ETCHANT-SILICON: 15 on hand, 2 reserved = 13 available
(6, 1, 6, 1),    -- CHEM-DOPANT-BORON: 6 on hand, 1 reserved = 5 available
(7, 1, 18, 3),   -- RACK-GPU-8U: 18 on hand, 3 reserved = 15 available
(8, 1, 25, 2),   -- RACK-STORAGE-42U: 25 on hand, 2 reserved = 23 available
(9, 1, 450, 50), -- WAFER-SILICON-300MM: 450 on hand, 50 reserved = 400 available
(10, 1, 5, 1),   -- MASK-RETICLE-EUV: 5 on hand, 1 reserved = 4 available
(11, 1, 85, 10), -- COOLANT-LIQUID-IMMERSION: 85 on hand, 10 reserved = 75 available
(12, 1, 42, 5),  -- PSU-REDUNDANT-3KW: 42 on hand, 5 reserved = 37 available

-- East Coast Warehouse - New York (WH-NY-002)
(1, 2, 8, 1),    -- GPU-H100-80GB: 8 on hand, 1 reserved = 7 available
(2, 2, 22, 2),   -- GPU-A100-40GB: 22 on hand, 2 reserved = 20 available
(3, 2, 28, 3),   -- GPU-L40S-48GB: 28 on hand, 3 reserved = 25 available
(4, 2, 6, 0),    -- CHEM-PHOTORESIST-EUV: 6 on hand, 0 reserved = 6 available
(5, 2, 12, 1),   -- CHEM-ETCHANT-SILICON: 12 on hand, 1 reserved = 11 available
(7, 2, 14, 2),   -- RACK-GPU-8U: 14 on hand, 2 reserved = 12 available
(8, 2, 20, 3),   -- RACK-STORAGE-42U: 20 on hand, 3 reserved = 17 available
(9, 2, 380, 40), -- WAFER-SILICON-300MM: 380 on hand, 40 reserved = 340 available

-- Midwest Hub - Chicago (WH-CH-003)
(1, 3, 6, 1),    -- GPU-H100-80GB: 6 on hand, 1 reserved = 5 available
(2, 3, 18, 2),   -- GPU-A100-40GB: 18 on hand, 2 reserved = 16 available
(3, 3, 24, 4),   -- GPU-L40S-48GB: 24 on hand, 4 reserved = 20 available
(5, 3, 10, 1),   -- CHEM-ETCHANT-SILICON: 10 on hand, 1 reserved = 9 available
(7, 3, 12, 1),   -- RACK-GPU-8U: 12 on hand, 1 reserved = 11 available
(11, 3, 60, 5),  -- COOLANT-LIQUID-IMMERSION: 60 on hand, 5 reserved = 55 available
(12, 3, 35, 3),  -- PSU-REDUNDANT-3KW: 35 on hand, 3 reserved = 32 available

-- Southern Distribution - Dallas (WH-DL-004)
(1, 4, 3, 0),    -- GPU-H100-80GB: 3 on hand, 0 reserved = 3 available (LOW STOCK!)
(2, 4, 7, 1),    -- GPU-A100-40GB: 7 on hand, 1 reserved = 6 available (LOW STOCK!)
(3, 4, 15, 2),   -- GPU-L40S-48GB: 15 on hand, 2 reserved = 13 available
(4, 4, 2, 0),    -- CHEM-PHOTORESIST-EUV: 2 on hand, 0 reserved = 2 available (LOW STOCK!)
(6, 4, 1, 0),    -- CHEM-DOPANT-BORON: 1 on hand, 0 reserved = 1 available (CRITICAL LOW!)
(7, 4, 8, 1),    -- RACK-GPU-8U: 8 on hand, 1 reserved = 7 available
(9, 4, 320, 30), -- WAFER-SILICON-300MM: 320 on hand, 30 reserved = 290 available
(11, 4, 45, 5),  -- COOLANT-LIQUID-IMMERSION: 45 on hand, 5 reserved = 40 available
(12, 4, 28, 2)   -- PSU-REDUNDANT-3KW: 28 on hand, 2 reserved = 26 available
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
