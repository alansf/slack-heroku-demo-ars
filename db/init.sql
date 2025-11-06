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
