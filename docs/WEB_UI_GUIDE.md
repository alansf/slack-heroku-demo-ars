# Web UI Inventory Management Guide

## Overview

The Web UI provides a real-time, user-friendly interface for managing semiconductor manufacturing inventory. It demonstrates the complete flow:

```
Web UI → Database Update → Slack Notification → Agentforce Sync
```

## Accessing the UI

Navigate to: `https://slack-heroku-demo-ars.herokuapp.com/inventory.html`

For this app: https://slack-heroku-demo-ars.herokuapp.com/inventory.html

## Features

### Product Catalog

The UI displays high-value semiconductor manufacturing components:

**GPU Chips:**
- NVIDIA H100 80GB ($32,999.99) - Flagship AI training GPU
- NVIDIA A100 40GB ($11,999.99) - Enterprise datacenter GPU  
- NVIDIA L40S 48GB ($8,999.99) - Multi-workload GPU

**Chemicals:**
- EUV Photoresist Chemical ($45,000) - For 5nm manufacturing
- Silicon Etchant Solution ($12,500) - Wafer processing
- Boron Dopant Material ($28,000) - P-type doping

**Server Hardware:**
- GPU Server Rack 8U ($15,999.99) - 8x GPU configuration
- Storage Server Rack 42U ($8,499.99) - High-density storage

**Manufacturing Materials:**
- 300mm Silicon Wafer ($1,200) - Substrate material
- EUV Lithography Mask ($150,000) - Most expensive item
- Liquid Immersion Coolant ($3,500) - GPU cooling
- Redundant Power Supply 3KW ($2,499.99) - Hot-swap PSU

### Real-Time Features

**Filtering:**
- Filter by category (GPU Chips, Chemicals, Server Hardware, etc.)
- Filter by warehouse location
- Search by product name or SKU

**Stock Status Indicators:**
- Green badge = IN_STOCK
- Yellow badge = LOW_STOCK (at or below reorder level)
- Red badge = OUT_OF_STOCK

**Quantity Controls:**
- +1 / +5 buttons to add inventory
- -1 / -5 buttons to remove inventory
- Real-time quantity display
- Automatic refresh after updates

### Warehouse Breakdown

Each product shows inventory across 4 warehouses:
- **Main Distribution Center** - San Francisco, CA
- **East Coast Warehouse** - New York, NY
- **Midwest Hub** - Chicago, IL
- **Southern Distribution** - Dallas, TX

### Real-Time Updates

When you click a button to update inventory:

1. **Database Update**: Quantity is immediately updated in Postgres
2. **Transaction Log**: Audit trail entry is created
3. **Slack Notification**: Message sent to configured channel
4. **UI Refresh**: Display updates with new quantities
5. **AppLink Sync**: Changes available to Agentforce

## API Endpoints

### GET /api/inventory/list

Returns all products with warehouse inventory details.

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "id": 1,
      "sku": "GPU-H100-80GB",
      "name": "NVIDIA H100 80GB GPU",
      "category": "GPU Chips",
      "unitPrice": 32999.99,
      "reorderLevel": 5,
      "warehouses": [
        {
          "warehouseName": "Main Distribution Center",
          "warehouseCode": "WH-SF-001",
          "quantityOnHand": 12,
          "quantityReserved": 2,
          "quantityAvailable": 10,
          "stockStatus": "IN_STOCK"
        }
      ]
    }
  ]
}
```

### POST /api/inventory/update

Updates inventory quantity for a specific product/warehouse.

**Request:**
```json
{
  "sku": "GPU-H100-80GB",
  "warehouseCode": "WH-SF-001",
  "change": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Received 5 units of NVIDIA H100 80GB GPU at Main Distribution Center",
  "newQuantity": 17,
  "available": 15
}
```

## Slack Notifications

When inventory is updated via the UI, a rich notification is sent to Slack:

**Notification includes:**
- Product name and SKU
- Warehouse location
- Change amount (+/- units)
- New on-hand quantity
- Available quantity
- Timestamp

**Configure notifications:**
```bash
heroku config:set SLACK_NOTIFICATION_CHANNEL=#inventory-alerts -a slack-heroku-demo-ars
```

## Integration Flow

### Complete Update Flow

1. **User Action**: Click +5 button on H100 GPU in SF warehouse
2. **API Call**: POST to `/api/inventory/update`
3. **Database Transaction**:
   - Update `inventory` table
   - Insert into `inventory_transactions`
   - Commit transaction
4. **Slack Notification**: Send rich formatted message
5. **UI Update**: Refresh display with new quantities
6. **Agentforce Sync**: Changes available via AppLink API

### Querying from Agentforce

After updating via UI, Agentforce can query the new inventory:

**Via Natural Language:**
- "Check stock levels for H100 GPUs"
- "Show me inventory in San Francisco"
- "What GPU chips are low stock?"

**Via Slack:**
```
/stock GPU-H100-80GB
```

**Via API:**
```bash
curl -X POST https://slack-heroku-demo-ars.herokuapp.com/api/inventory/check-stock \
  -H "Content-Type: application/json" \
  -H "x-salesforce-user-id: user-id" \
  -H "x-salesforce-org-id: org-id" \
  -H "x-salesforce-user-name: User Name" \
  -d '{"sku": "GPU-H100-80GB"}'
```

## Use Case Example

**Scenario**: Receiving a shipment of H100 GPUs

1. Open Web UI at `/inventory.html`
2. Search for "H100" or filter by "GPU Chips"
3. Find the San Francisco warehouse entry
4. Click "+5" to add 5 units
5. Slack channel receives notification
6. Sales team sees updated inventory in Salesforce
7. Agentforce can answer "How many H100s do we have?"

## Low Stock Alerts

The UI highlights products below reorder level:

**Critical Items** (Dallas warehouse):
- H100 GPUs: Only 3 available (needs 5)
- A100 GPUs: Only 6 available (needs 10)
- EUV Photoresist: Only 2 available (needs 3)
- Boron Dopant: Only 1 available (needs 2) ⚠️ CRITICAL

These appear with yellow/red badges and can trigger reorder workflows.

## Technical Details

**Frontend:**
- Vanilla JavaScript (no frameworks required)
- Real-time updates without page refresh
- Responsive design for mobile and desktop
- Toast notifications for user feedback

**Backend:**
- Express.js REST API
- PostgreSQL with transactions
- Slack Bolt for notifications
- Error handling and rollback

**Security:**
- UI is publicly accessible (for demo)
- Can add authentication middleware if needed
- AppLink endpoints still require User Plus Mode
- Transaction audit trail tracks all changes

## Development

**Run locally:**
```bash
export DATABASE_URL=your-postgres-url
export SLACK_BOT_TOKEN=your-token
export SLACK_NOTIFICATION_CHANNEL=#inventory-alerts
npm start
```

**Access at:** http://localhost:3000/inventory.html

## Best Practices

1. **Always use transactions** for inventory updates
2. **Log all changes** in `inventory_transactions` table
3. **Send notifications** for critical stock changes
4. **Validate quantities** before updating
5. **Handle errors gracefully** with user feedback
6. **Refresh data** after successful updates

## Future Enhancements

Potential additions:
- Authentication and user roles
- Batch updates for multiple warehouses
- Export to CSV/Excel
- Inventory forecasting
- Reorder automation
- Photo upload for products
- Barcode scanning support
