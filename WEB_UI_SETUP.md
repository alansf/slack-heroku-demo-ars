# Web UI Setup Guide - GPU Chip Inventory

## What Was Built

A beautiful, real-time Web UI for managing semiconductor manufacturing inventory with automatic Slack notifications and Agentforce integration!

### Product Catalog (High-Value Components)

**GPU Chips:**
- NVIDIA H100 80GB - $32,999.99 (Flagship AI training)
- NVIDIA A100 40GB - $11,999.99 (Enterprise datacenter)
- NVIDIA L40S 48GB - $8,999.99 (Multi-workload)

**Manufacturing Chemicals:**
- EUV Photoresist Chemical - $45,000.00 (5nm process)
- Silicon Etchant Solution - $12,500.00 (Wafer processing)
- Boron Dopant Material - $28,000.00 (P-type doping)

**Server Hardware:**
- GPU Server Rack 8U - $15,999.99
- Storage Server Rack 42U - $8,499.99

**Manufacturing Materials:**
- 300mm Silicon Wafer - $1,200.00
- EUV Lithography Mask - $150,000.00 (Most expensive!)
- Liquid Immersion Coolant - $3,500.00
- Redundant Power Supply 3KW - $2,499.99

## Access the Web UI

**URL:** https://sorbet-vibes-b1eea-a81ac22c5102.herokuapp.com/inventory.html

## Features

### Interactive Inventory Management

**Real-Time Controls:**
- Click "+1" or "+5" to add inventory
- Click "-1" or "-5" to remove inventory
- Instant database updates
- Auto-refresh after changes

**Smart Filtering:**
- Filter by category (GPU Chips, Chemicals, etc.)
- Filter by warehouse location
- Search by product name or SKU
- One-click refresh button

**Stock Status Indicators:**
- 🟢 Green badge = IN_STOCK
- 🟡 Yellow badge = LOW_STOCK (at reorder level)
- 🔴 Red badge = OUT_OF_STOCK

**Warehouse Breakdown:**
Each product shows inventory across 4 locations:
- San Francisco, CA (Main Distribution)
- New York, NY (East Coast)
- Chicago, IL (Midwest Hub)
- Dallas, TX (Southern Distribution)

### Complete Integration Flow

```
User clicks button in Web UI
       ↓
Database updates inventory
       ↓
Transaction log created
       ↓
Slack notification sent
       ↓
UI refreshes automatically
       ↓
Agentforce sees new inventory
```

## Setup Instructions

### 1. Set Slack Credentials (Required)

The app needs Slack credentials to start:

```bash
heroku config:set SLACK_BOT_TOKEN=xoxb-your-token -a sorbet-vibes-b1eea
heroku config:set SLACK_SIGNING_SECRET=your-secret -a sorbet-vibes-b1eea
```

### 2. Initialize Database

Load the GPU chip inventory data:

```bash
heroku pg:psql -a sorbet-vibes-b1eea < db/init.sql
```

This creates:
- 12 products (GPU chips, chemicals, hardware)
- 4 warehouses
- 30+ inventory records with realistic quantities
- Sample transaction history

### 3. Configure Slack Notifications (Optional)

To receive inventory update notifications in Slack:

```bash
heroku config:set SLACK_NOTIFICATION_CHANNEL=#inventory-alerts -a sorbet-vibes-b1eea
```

Create the channel first, then invite your bot to it.

### 4. Configure Slack App

Add these slash commands to your Slack app:
- `/stock <SKU>` → Check inventory for any product
- `/low-stock` → View products needing reorder

Point both to: `https://sorbet-vibes-b1eea-a81ac22c5102.herokuapp.com/slack/events`

## Using the Web UI

### Basic Workflow

1. **Open UI:** https://sorbet-vibes-b1eea-a81ac22c5102.herokuapp.com/inventory.html

2. **Browse Products:** Scroll through GPU chips and components

3. **Filter/Search:**
   - Select "GPU Chips" from category dropdown
   - Type "H100" in search box
   - Select specific warehouse

4. **Update Inventory:**
   - Find "NVIDIA H100 80GB GPU"
   - Locate "San Francisco" warehouse section
   - Click "+5" button
   - See toast notification: "Inventory updated!"
   - UI automatically refreshes

5. **Check Slack:**
   - Notification appears in configured channel
   - Shows product, change, new quantity
   - Includes timestamp and warehouse

6. **Query from Agentforce:**
   - Ask: "How many H100 GPUs do we have?"
   - Agentforce queries updated inventory
   - Returns real-time data

### Example Scenarios

**Scenario 1: Receiving GPU Shipment**
1. Open Web UI
2. Search for "H100"
3. San Francisco warehouse shows 12 on hand
4. Click "+10" button (shipment arrived)
5. Slack notifies team
6. Sales team sees 22 available in Salesforce

**Scenario 2: Low Stock Alert**
1. Open Web UI
2. Dallas warehouse shows H100 with only 3 units (red badge)
3. Below reorder level of 5
4. Click "+10" to restock
5. Badge turns green
6. Agentforce aware of restocking

**Scenario 3: Chemical Depletion**
1. Manufacturing team uses EUV Photoresist
2. Open Web UI
3. Click "-1" on Photoresist in SF warehouse
4. System logs transaction
5. If below reorder level, yellow badge appears
6. Purchasing team gets Slack alert

## Low Stock Examples

The database includes intentional low-stock scenarios for demos:

**Dallas Warehouse (Critical):**
- H100 GPUs: Only 3 available (needs 5) 🔴
- A100 GPUs: Only 6 available (needs 10) 🟡
- EUV Photoresist: Only 2 available (needs 3) 🟡
- Boron Dopant: Only 1 available (needs 2) 🔴 CRITICAL!

Use these to demonstrate low stock alerts and reordering workflows.

## Slack Commands

### Check GPU Stock

```
/stock GPU-H100-80GB
```

Returns rich formatted message with:
- Product details and pricing
- Total available across all warehouses
- Breakdown by location
- Stock status indicators
- Low stock warnings

### View All Low Stock

```
/low-stock
```

Returns list of products at or below reorder level with warehouse locations.

## API Testing

### Get All Inventory

```bash
curl https://sorbet-vibes-b1eea-a81ac22c5102.herokuapp.com/api/inventory/list
```

### Update Inventory

```bash
curl -X POST https://sorbet-vibes-b1eea-a81ac22c5102.herokuapp.com/api/inventory/update \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "GPU-H100-80GB",
    "warehouseCode": "WH-SF-001",
    "change": 5
  }'
```

## Troubleshooting

**App not starting:**
- Ensure SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET are set
- Check: `heroku config -a sorbet-vibes-b1eea`

**UI shows empty:**
- Database needs initialization
- Run: `heroku pg:psql -a sorbet-vibes-b1eea < db/init.sql`

**No Slack notifications:**
- Set SLACK_NOTIFICATION_CHANNEL environment variable
- Ensure bot is invited to the channel
- Check logs: `heroku logs --tail -a sorbet-vibes-b1eea`

**Update button doesn't work:**
- Check browser console for errors
- Verify API endpoint is accessible
- Check database connection

## Files Created

- `public/inventory.html` - Web UI (responsive, real-time)
- `docs/WEB_UI_GUIDE.md` - Complete UI documentation
- `ERP_INVENTORY_SUMMARY.md` - Implementation summary
- Updated `db/init.sql` - GPU chip product catalog
- Updated `src/app.js` - API endpoints and Slack integration

## Next Steps

1. **Set Slack credentials** (required)
2. **Initialize database** with GPU inventory
3. **Configure Slack channel** for notifications
4. **Open Web UI** and test updates
5. **Try Slack commands** /stock and /low-stock
6. **Enable AppLink** for Agentforce integration

## Demo Flow

Perfect for presentations:

1. **Show Web UI** - Beautiful interface with high-value products
2. **Update H100 inventory** - Click +5 button
3. **Show Slack notification** - Real-time alert appears
4. **Query from Slack** - `/stock GPU-H100-80GB`
5. **Ask Agentforce** - "How many H100 GPUs do we have?"
6. **Show audit trail** - Check inventory_transactions table

This demonstrates the complete enterprise integration pattern!

## Summary

You now have a production-ready inventory management system that:
✅ Manages high-value GPU chips and components
✅ Provides beautiful real-time web interface
✅ Sends Slack notifications on changes
✅ Integrates with Salesforce Agentforce
✅ Maintains complete audit trail
✅ Supports multiple warehouse locations
✅ Demonstrates secure gateway pattern

The perfect showcase for Heroku as a microservice gateway! 🚀
