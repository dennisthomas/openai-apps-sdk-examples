#!/bin/bash

# Deploy the Visible Python MCP server to Google Cloud Run.
# Usage: ./deploy-python-visible-to-cloud-run.sh PROJECT_ID [REGION]

set -euo pipefail

SERVICE_NAME="visible-mcp-server-python"
DEFAULT_REGION="us-central1"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 PROJECT_ID [REGION]"
  exit 1
fi

PROJECT_ID="$1"
REGION="${2:-$DEFAULT_REGION}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "Deploying Visible MCP Python server"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"
echo "Image:   ${IMAGE_NAME}"
echo ""

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required. Install: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install: https://docs.docker.com/get-docker/"
  exit 1
fi

echo "Setting GCP project..."
gcloud config set project "${PROJECT_ID}"

echo "Enabling Cloud Run dependencies..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  --quiet

echo "Configuring Docker auth..."
gcloud auth configure-docker --quiet

echo "Resolving service URL..."
EXISTING_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format="value(status.url)" 2>/dev/null || true)

if [[ -z "${EXISTING_URL}" ]]; then
  SANITIZED_PROJECT=$(gcloud config get-value project | tr ':' '-')
  BASE_URL="https://${SERVICE_NAME}-${SANITIZED_PROJECT}-${REGION//-/}.a.run.app"
  echo "No existing deployment. Using expected URL: ${BASE_URL}"
else
  BASE_URL="${EXISTING_URL}"
  echo "Found existing deployment: ${BASE_URL}"
fi

echo "Building Docker image (linux/amd64)..."
docker build --platform linux/amd64 \
  --build-arg BASE_URL="${BASE_URL}/assets" \
  -f Dockerfile.python \
  -t "${IMAGE_NAME}:latest" \
  -t "${IMAGE_NAME}:$(date +%Y%m%d-%H%M%S)" .

echo "Pushing latest tag..."
docker push "${IMAGE_NAME}:latest"

echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_NAME}:latest" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8081 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --quiet

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format="value(status.url)")

echo ""
echo "Deployment complete!"
echo "Service URL:      ${SERVICE_URL}"
echo "Health endpoint:  ${SERVICE_URL}/health"
echo "MCP SSE endpoint: ${SERVICE_URL}/mcp"
echo "Assets:           ${SERVICE_URL}/assets/<widget>.html"
echo ""
echo "Quick checks:"
echo "  curl ${SERVICE_URL}/health"
echo "  curl ${SERVICE_URL}/assets/visible-plans.html"
echo ""
echo "ChatGPT connector settings:"
echo "  Endpoint: ${SERVICE_URL}/mcp"
echo ""
