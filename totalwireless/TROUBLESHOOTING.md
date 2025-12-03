# Troubleshooting Guide

## Widgets Not Rendering in ChatGPT

If your widgets flash briefly but don't render, or you only see text responses, here's how to troubleshoot:

### 1. Check Asset URLs

The most common issue is that the widget HTML references assets that ChatGPT cannot access.

**How to verify:**
```bash
# Get your service URL
SERVICE_URL=$(gcloud run services describe pizzaz-mcp-server --region=us-central1 --format="value(status.url)")

# Test if assets are accessible
curl -I $SERVICE_URL/assets/pizzaz-2d2b.js
curl -I $SERVICE_URL/assets/pizzaz-2d2b.css
```

You should get `200 OK` responses. If you get `404 Not Found`, the assets aren't being served correctly.

### 2. Verify BASE_URL in Built Assets

Check that the HTML files reference the correct URL:

```bash
# Check what URL is in the HTML
cat assets/pizzaz-2d2b.html | grep -E "(src|href)"
```

The URLs should point to your Cloud Run service, not `localhost:4444`.

**Expected:**
```html
<script type="module" src="https://your-service.run.app/assets/pizzaz-2d2b.js"></script>
<link rel="stylesheet" href="https://your-service.run.app/assets/pizzaz-2d2b.css">
```

**Wrong (will not work):**
```html
<script type="module" src="http://localhost:4444/pizzaz-2d2b.js"></script>
<link rel="stylesheet" href="http://localhost:4444/pizzaz-2d2b.css">
```

### 3. Rebuild with Correct BASE_URL

If the URLs are wrong, you need to rebuild:

```bash
# Redeploy with the deployment script which automatically sets BASE_URL
./deploy-to-cloud-run.sh YOUR_PROJECT_ID us-central1
```

The script will:
1. Detect your Cloud Run service URL
2. Rebuild the Docker image with `BASE_URL` set correctly
3. Deploy the updated image

### 4. Check Browser Console in ChatGPT

1. Open ChatGPT in your browser
2. Open Developer Tools (F12 or Cmd+Option+I on Mac)
3. Go to the Console tab
4. Trigger the widget
5. Look for errors like:
   - `Failed to load resource: net::ERR_CONNECTION_REFUSED` - means URLs point to localhost
   - `CORS error` - means CORS headers are missing (server issue)
   - `404 Not Found` - means assets aren't at the expected path

### 5. Test the MCP Server Locally

Before deploying, test locally with the correct flow:

```bash
# 1. Build with your deployed URL
export BASE_URL=https://your-service.run.app/assets
pnpm run build

# 2. Start the MCP server
cd pizzaz_server_node
pnpm start

# 3. Verify assets are served
curl -I http://localhost:8000/assets/pizzaz-2d2b.js
```

### 6. Check Cloud Run Logs

View real-time logs to see if requests are reaching your server:

```bash
gcloud run services logs read pizzaz-mcp-server \
  --region=us-central1 \
  --limit=50 \
  --format="table(timestamp,severity,textPayload)"
```

Look for:
- Asset requests (GET /assets/...)
- Any errors or 404s
- MCP protocol messages

### 7. Verify CORS Headers

The server must allow cross-origin requests from ChatGPT:

```bash
curl -I -H "Origin: https://chatgpt.com" \
  $SERVICE_URL/assets/pizzaz-2d2b.js
```

Should include:
```
Access-Control-Allow-Origin: *
```

## Common Issues and Solutions

### Issue: "Widgets worked locally but not in production"

**Cause:** Assets built with `localhost:4444` URLs instead of production URL.

**Solution:** Always rebuild when deploying:
```bash
./deploy-to-cloud-run.sh YOUR_PROJECT_ID
```

### Issue: "Service URL changed after redeployment"

**Cause:** Cloud Run service was deleted and recreated, getting a new URL.

**Solution:** Redeploy to rebuild with new URL:
```bash
./deploy-to-cloud-run.sh YOUR_PROJECT_ID
```

### Issue: "Getting 403 Forbidden on assets"

**Cause:** Path traversal protection or incorrect asset path.

**Solution:** Ensure assets are in `/assets/` directory and accessed via `/assets/` path.

### Issue: "Widgets render but are unstyled"

**Cause:** CSS file failed to load.

**Solution:** Check that both JS and CSS files are accessible:
```bash
curl -I $SERVICE_URL/assets/pizzaz-2d2b.css
```

## Testing Checklist

Before reporting an issue, verify:

- [ ] Assets are built with correct BASE_URL
- [ ] Static assets are accessible via `/assets/` path
- [ ] CORS headers are present on asset responses
- [ ] HTML files reference the correct production URLs
- [ ] MCP endpoint is responding (test with curl)
- [ ] No errors in Cloud Run logs
- [ ] No errors in browser console

## Getting Help

If you're still having issues:

1. Check the [MCP specification](https://modelcontextprotocol.io/specification)
2. Review the [Apps SDK documentation](https://platform.openai.com/docs/guides/apps-sdk)
3. Enable verbose logging in your server
4. Test with the MCP Inspector tool
