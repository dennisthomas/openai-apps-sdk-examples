# Visible MCP Server (Node.js)

This is an MCP server that exposes Visible plans and devices catalog as interactive widgets.

## Features

- **Visible Plans Carousel**: Browse Visible mobile plans with pricing and details
- **Visible Devices Carousel**: Browse available smartphones and wearables

## Running the Server

```bash
pnpm run start
```

The server will start on port 8001 (or the port specified in the `PORT` environment variable).

## Endpoints

- **SSE Stream**: `GET http://localhost:8001/mcp`
- **Message Post**: `POST http://localhost:8001/mcp/messages?sessionId=...`
- **Health Check**: `GET http://localhost:8001/health`
- **Static Assets**: `GET http://localhost:8001/assets/*`

## Widgets

The server provides the following widgets:

1. **visible-plans**: Displays Visible mobile plans in a carousel view
2. **visible-devices**: Displays Visible smartphones and wearables in a carousel view

## Building

Before running the server, you need to build the widget assets:

```bash
cd ../
pnpm run build
```

This will generate the HTML files in the `assets/` directory.

## Deployment

This server is configured to deploy to Google Cloud Run. Use the deployment script:

```bash
./deploy-visible.sh
```

The deployment script will:
- Build the Docker image using `Dockerfile.main`
- Push to Google Container Registry
- Deploy to Cloud Run service `visible-final`

## Environment Variables

- `PORT`: Server port (default: 8001)
- `BASE_URL`: Base URL for widget assets (set during Docker build)

## Data Files

The server uses the following data catalogs:
- `src/devices/devices.json`: Device catalog with pricing and specifications
- `src/plans/plans.json`: Mobile plan offerings
