# MCP Server - Visible & Total Wireless

This repository contains MCP (Model Context Protocol) servers for both Visible and Total Wireless brands.

## Structure

```
final/
├── visible/              # Visible brand implementation
└── totalwireless/        # Total Wireless brand implementation
```

## Visible Brand

**Location:** `visible/`

**MCP Endpoint:** https://visible-final-ge4qawxpca-uc.a.run.app/mcp

**Features:**
- Device catalog (1130+ devices)
- Plan comparison (7 plans)
- Store locator (38 stores with interactive map)
- Advanced filtering: colors, sizes, conditions, price ranges
- Selection features: exactPrice, limit, selectIndex, sortBy

**Deployment:**
```bash
cd visible
./deploy-visible-karishma.sh
```

**Styling:** Blue theme (#0000FF)

## Total Wireless Brand

**Location:** `totalwireless/`

**MCP Endpoint:** https://totalwireless-ge4qawxpca-uc.a.run.app/mcp

**Features:**
- Device catalog (1130+ devices)
- Plan comparison (7 plans)
- Store locator (38 stores with interactive map)
- Advanced filtering: colors, sizes, conditions, price ranges
- Selection features: exactPrice, limit, selectIndex, sortBy

**Deployment:**
```bash
cd totalwireless
./deploy-totalwireless-karishma.sh
```

**Styling:** Red theme (#ee2000)

## MCP Tools

Both implementations provide the same three tools:

### 1. find_devices
Search and filter devices by:
- Brand, model, color, size, storage, condition
- Price ranges (min/max) or exact price
- Budget-aware filtering
- Position-based selection (selectIndex)
- Result limiting and sorting

### 2. find_plans
Search and filter plans by:
- Price ranges
- Data allowance
- Features (hotspot, international)
- Exact price matching

### 3. find_stores
Search and filter stores by:
- City, state, zip code
- Returns interactive map widget with Mapbox

## Technology Stack

- **Runtime:** Node.js 18 (Alpine)
- **Language:** TypeScript
- **Framework:** OpenAI Apps SDK (MCP)
- **Frontend:** React 18, Tailwind CSS
- **Maps:** Mapbox GL JS
- **Deployment:** Google Cloud Run
- **Container:** Docker multi-stage build

## Development

Both folders contain:
- `visible_server_node/` - MCP server implementation
- `src/` - React widgets (devices, plans, stores)
- `Dockerfile.visible` - Container configuration
- Deployment scripts for Google Cloud Run

## Recent Updates

- **Selection Features:** Added exactPrice, limit, selectIndex, sortBy parameters
- **Store Locator:** Fixed Irving TX coordinates, deployed 38 stores
- **Repository Consolidation:** Merged main and totalwireless branches into final branch
- **Cleanup:** Removed sample code (pizzaz, solar-system, todo)
