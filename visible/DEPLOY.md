# Deploying Pizzaz to Google Cloud Run

This guide explains how to deploy the Pizzaz MCP server to Google Cloud Run using Docker.

## Prerequisites

Before deploying, ensure you have:

1. **Google Cloud Account** with billing enabled
2. **Google Cloud CLI (`gcloud`)** installed and configured
   ```bash
   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL

   # Initialize and authenticate
   gcloud init
   gcloud auth login
   ```

3. **Docker** installed and running
4. **Project setup** - Create or select a GCP project:
   ```bash
   # Create a new project
   gcloud projects create YOUR_PROJECT_ID --name="Pizzaz MCP"

   # Or list existing projects
   gcloud projects list

   # Set the project
   gcloud config set project YOUR_PROJECT_ID
   ```

## Deployment Methods

### Method 1: Quick Deploy (Recommended)

Use the provided deployment script for a streamlined deployment:

```bash
# Make the script executable
chmod +x deploy-to-cloud-run.sh

# Deploy to Cloud Run
./deploy-to-cloud-run.sh YOUR_PROJECT_ID us-central1
```

The script will:
- Build the Docker image locally
- Push it to Google Container Registry
- Deploy to Cloud Run
- Output the service URL

### Method 2: Manual Deployment

#### Step 1: Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com
```

#### Step 2: Build and Push Docker Image

```bash
# Set your project ID
export PROJECT_ID=YOUR_PROJECT_ID

# Build the Docker image
docker build -t gcr.io/$PROJECT_ID/pizzaz-mcp-server:latest .

# Configure Docker to use gcloud as credential helper
gcloud auth configure-docker

# Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/pizzaz-mcp-server:latest
```

#### Step 3: Deploy to Cloud Run

```bash
gcloud run deploy pizzaz-mcp-server \
  --image=gcr.io/$PROJECT_ID/pizzaz-mcp-server:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300
```

### Method 3: Continuous Deployment with Cloud Build

Set up automated deployments triggered by Git commits:

#### Step 1: Connect Repository

```bash
# Link your GitHub/GitLab repository to Cloud Build
gcloud builds triggers create github \
  --repo-name=openai-apps-sdk-examples \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

#### Step 2: Push Changes

Now, any push to the `main` branch will automatically trigger a build and deployment.

```bash
git add .
git commit -m "Deploy Pizzaz to Cloud Run"
git push origin main
```

## Configuration

### Environment Variables

If you need to add environment variables to your Cloud Run service:

```bash
gcloud run services update pizzaz-mcp-server \
  --region=us-central1 \
  --set-env-vars="KEY1=value1,KEY2=value2"
```

### Custom Domain

To map a custom domain to your Cloud Run service:

```bash
gcloud run domain-mappings create \
  --service=pizzaz-mcp-server \
  --domain=pizzaz.yourdomain.com \
  --region=us-central1
```

### Authentication

To require authentication (remove public access):

```bash
gcloud run services update pizzaz-mcp-server \
  --region=us-central1 \
  --no-allow-unauthenticated
```

## Post-Deployment

### Get Service URL

```bash
gcloud run services describe pizzaz-mcp-server \
  --region=us-central1 \
  --format="value(status.url)"
```

### View Logs

```bash
gcloud run services logs read pizzaz-mcp-server \
  --region=us-central1 \
  --limit=50
```

### Monitor Performance

```bash
# Open Cloud Console monitoring
gcloud run services describe pizzaz-mcp-server \
  --region=us-central1 \
  --format="value(status.url)" | \
  sed 's/https:\/\//https:\/\/console.cloud.google.com\/run\/detail\/us-central1\/pizzaz-mcp-server?project=/'
```

## Cost Optimization

Cloud Run charges based on:
- **CPU and Memory** - Only during request processing
- **Requests** - Number of requests served
- **Networking** - Egress data

Tips to reduce costs:
1. Use `--min-instances=0` to scale to zero when idle
2. Set appropriate `--memory` and `--cpu` limits
3. Use `--max-instances` to cap costs
4. Enable request/response logging only when needed

## Troubleshooting

### Build Fails

```bash
# Check build logs
gcloud builds log $(gcloud builds list --limit=1 --format="value(id)")
```

### Service Won't Start

```bash
# Check service logs
gcloud run services logs read pizzaz-mcp-server --region=us-central1 --limit=100

# Check service details
gcloud run services describe pizzaz-mcp-server --region=us-central1
```

### Update Fails

```bash
# Force a new revision
gcloud run deploy pizzaz-mcp-server \
  --image=gcr.io/$PROJECT_ID/pizzaz-mcp-server:latest \
  --region=us-central1 \
  --platform=managed
```

## Cleanup

To delete all resources:

```bash
# Delete Cloud Run service
gcloud run services delete pizzaz-mcp-server --region=us-central1

# Delete Docker images
gcloud container images delete gcr.io/$PROJECT_ID/pizzaz-mcp-server:latest

# Optional: Delete the project
gcloud projects delete YOUR_PROJECT_ID
```

## Architecture

The deployment uses a multi-stage Docker build:

1. **Builder Stage**: Installs dependencies and builds widget assets with Vite
2. **Production Stage**: Copies built assets and runs the MCP server with minimal dependencies

This approach keeps the final image size small (~200MB) while ensuring all assets are properly bundled.

## Security Best Practices

1. **Use specific versions** in Dockerfile instead of `latest`
2. **Enable authentication** for production deployments
3. **Use Secret Manager** for sensitive environment variables
4. **Set up VPC** for internal-only services
5. **Enable Cloud Armor** for DDoS protection
6. **Regular updates** of base images and dependencies

## Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Container Registry Documentation](https://cloud.google.com/container-registry/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
