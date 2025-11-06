# ERP Inventory Gateway with AppLink

## Overview

This application includes a complete **ERP Inventory Management System** that demonstrates how to use Heroku as a secure gateway between Salesforce Agentforce and internal enterprise systems.

## Architecture: Secure Gateway Pattern

```
Salesforce Agentforce
       |
       | (User Plus Mode - validates user + app)
       |
   AppLink Layer
       |
       v
  Heroku Microservice (this app)
       |
       | (Acts as secure gateway)
       |
       v
  Internal ERP System (simulated with Postgres)
```

### Why Use a Gateway?

1. **Security**: Keep internal ERP systems behind firewall
2. **Authentication**: AppLink User Plus Mode validates Salesforce users
3. **Data Transformation**: Convert between ERP and Salesforce formats
4. **Audit Trail**: Log all access attempts with user context
5. **Rate Limiting**: Control access to expensive ERP queries
6. **Caching**: Reduce load on internal systems

## Sample Data

The database includes:
- **4 Warehouses**: San Francisco, New York, Chicago, Dallas
- **12 Products**: Electronics, furniture, office supplies
- **30+ Inventory Records**: Distributed across warehouses
- **Low Stock Items**: Laptops and chairs in Dallas warehouse

## Slack Commands

### /stock <SKU>

Check inventory levels for a product across all warehouses.

**Usage**: `/stock LAPTOP-PRO-15`

**Response**: Rich formatted message showing:
- Product details (name, category, price)
- Total available and on-hand quantities
- Breakdown by warehouse with stock status indicators
- Low stock warnings if applicable

### /low-stock

View all products currently at or below reorder levels.

**Usage**: `/low-stock`

## Using with Agentforce

Once AppLink is configured, you can ask Agentforce natural language questions:

**Example Queries**:
- "Check stock levels for LAPTOP-PRO-15"
- "Show me all low stock items in the Dallas warehouse"
- "What is the inventory history for the mechanical keyboard?"
- "How many wireless mice do we have available?"

## Learn More

- [Heroku as Microservices Gateway](https://www.heroku.com/microservices)
- [AppLink User Plus Mode](https://devcenter.heroku.com/articles/heroku-applink)
- [Salesforce Agentforce](https://www.salesforce.com/agentforce/)
