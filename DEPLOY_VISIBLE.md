# Deploying Visible MCP Server to Google Cloud Run

This guide explains how to deploy the Visible MCP Server to Google Cloud Run.

## Prerequisites

1. **Google Cloud Project**: You need a GCP project with billing enabled
2. **gcloud CLI**: Install from https://cloud.google.com/sdk/docs/install
3. **Docker**: Install from https://docs.docker.com/get-docker/
4. **Authentication**: Run `gcloud auth login` to authenticate

## Quick Deploy

Run the deployment script with your GCP project ID:

```bash
./deploy-visible-to-cloud-run.sh YOUR_PROJECT_ID us-central1
```

Replace `YOUR_PROJECT_ID` with your actual Google Cloud project ID.

## What the Script Does

1. **Validates Requirements**: Checks for gcloud and Docker
2. **Enables APIs**: Enables Cloud Build, Cloud Run, and Container Registry
3. **Builds Widget Assets**: Compiles the React components (visible-plans and visible-devices)
4. **Creates Docker Image**: Builds a multi-stage Docker image
5. **Pushes to GCR**: Uploads the image to Google Container Registry
6. **Deploys to Cloud Run**: Creates/updates the Cloud Run service

## Configuration

The deployment uses these settings:

- **Service Name**: `visible-mcp-server`
- **Port**: 8080 (Cloud Run standard)
- **Memory**: 512Mi
- **CPU**: 1
- **Min Instances**: 0 (scales to zero)
- **Max Instances**: 10
- **Access**: Public (unauthenticated)

## After Deployment

Once deployed, you'll receive:

- **Service URL**: `https://visible-mcp-server-[...].run.app`
- **Health Check**: `[SERVICE_URL]/health`
- **MCP Endpoint**: `[SERVICE_URL]/mcp`
- **Widget Assets**:
  - `[SERVICE_URL]/assets/visible-plans.html`
  - `[SERVICE_URL]/assets/visible-devices.html`

## Testing Your Deployment

```bash
# Test health endpoint
curl https://YOUR_SERVICE_URL/health

# Test assets
curl https://YOUR_SERVICE_URL/assets/visible-plans.html
curl https://YOUR_SERVICE_URL/assets/visible-devices.html
```

## Adding to ChatGPT

1. Go to ChatGPT Settings
2. Navigate to Connectors or MCP Servers section
3. Add your MCP endpoint: `https://YOUR_SERVICE_URL/mcp`
4. The widgets will be available when users ask about Visible plans or devices

## Monitoring

- **View Logs**: `gcloud run services logs read visible-mcp-server --region=us-central1`
- **Console**: https://console.cloud.google.com/run
- **Metrics**: Available in Cloud Console under your service

## Updating the Deployment

To update after making code changes:

```bash
# Rebuild assets
pnpm run build

# Redeploy
./deploy-visible-to-cloud-run.sh YOUR_PROJECT_ID us-central1
```

## Troubleshooting

### Build Failures

- Ensure all dependencies are installed: `pnpm install`
- Verify assets are built: `pnpm run build`
- Check that `assets/` directory exists with visible-*.html files

### Deployment Failures

- Verify your GCP project has billing enabled
- Check you have necessary IAM permissions
- Ensure APIs are enabled (script does this automatically)

### Runtime Issues

- Check logs: `gcloud run services logs read visible-mcp-server`
- Verify health endpoint returns 200 OK
- Test locally first: `cd visible_server_node && PORT=8080 pnpm start`

## Cost Considerations

Cloud Run pricing:
- **Free Tier**: 2 million requests/month, 360,000 GB-seconds
- **Min Instances = 0**: No charge when idle
- **Typical Cost**: Very low for development/testing usage

## Security Notes

The current deployment is **publicly accessible** (`--allow-unauthenticated`). For production:

1. Consider adding authentication
2. Use Cloud Armor for DDoS protection
3. Enable Cloud Run's built-in security features
4. Review and restrict IAM permissions

## Environment Variables

The server respects these environment variables:

- `PORT`: Server port (default: 8080)
- `NODE_ENV`: Set to "production" in deployment
- `BASE_URL`: Set during build for asset URLs

## Architecture

```
┌─────────────────┐
│   Cloud Run     │
│                 │
│  ┌───────────┐  │
│  │  Visible  │  │
│  │   Server  │  │──► MCP Endpoint (/mcp)
│  │           │  │
│  │  Assets   │  │──► Widgets (/assets/*)
│  └───────────┘  │
└─────────────────┘
```

## Support

For issues specific to this deployment:
1. Check the deployment logs
2. Verify local development works first
3. Review Cloud Run documentation: https://cloud.google.com/run/docs
