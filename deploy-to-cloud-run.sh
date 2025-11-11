#!/bin/bash

# Deployment script for Pizzaz MCP Server to Google Cloud Run
# Usage: ./deploy-to-cloud-run.sh PROJECT_ID [REGION]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="pizzaz-mcp-server"
DEFAULT_REGION="us-central1"

# Check arguments
if [ -z "$1" ]; then
  echo -e "${RED}Error: PROJECT_ID is required${NC}"
  echo "Usage: $0 PROJECT_ID [REGION]"
  echo "Example: $0 my-gcp-project us-central1"
  exit 1
fi

PROJECT_ID=$1
REGION=${2:-$DEFAULT_REGION}
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deploying Pizzaz MCP Server to Google Cloud Run          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service Name: $SERVICE_NAME"
echo "Image: $IMAGE_NAME"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI is not installed${NC}"
  echo "Please install it from: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Check if docker is installed
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker is not installed${NC}"
  echo "Please install it from: https://docs.docker.com/get-docker/"
  exit 1
fi

# Set the project
echo -e "${YELLOW}Setting GCP project...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}Enabling required Google Cloud APIs...${NC}"
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  --quiet

# Configure Docker authentication
echo -e "${YELLOW}Configuring Docker authentication...${NC}"
gcloud auth configure-docker --quiet

# First, do a temporary deploy to get the service URL, or use existing if available
echo -e "${YELLOW}Checking for existing service URL...${NC}"
EXISTING_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format="value(status.url)" 2>/dev/null || echo "")

if [ -z "$EXISTING_URL" ]; then
  # Generate the expected URL format
  BASE_URL="https://${SERVICE_NAME}-$(gcloud config get-value project | tr ':' '-')-${REGION//-/}.a.run.app"
  echo -e "${YELLOW}First deployment - using expected URL: $BASE_URL${NC}"
else
  BASE_URL="$EXISTING_URL"
  echo -e "${YELLOW}Using existing service URL: $BASE_URL${NC}"
fi

# Build the Docker image with BASE_URL
echo -e "${YELLOW}Building Docker image for linux/amd64 platform...${NC}"
echo -e "${YELLOW}BASE_URL set to: $BASE_URL${NC}"
docker build --platform linux/amd64 \
  --build-arg BASE_URL="$BASE_URL/assets" \
  -t $IMAGE_NAME:latest \
  -t $IMAGE_NAME:$(date +%Y%m%d-%H%M%S) .

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Docker build failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}"

# Push the image to Google Container Registry
echo -e "${YELLOW}Pushing image to Google Container Registry...${NC}"
docker push $IMAGE_NAME:latest

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Failed to push Docker image${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Image pushed successfully${NC}"

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
  --image=$IMAGE_NAME:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --quiet

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Cloud Run deployment failed${NC}"
  exit 1
fi

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format="value(status.url)")

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deployment Successful!                                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Service URL: ${GREEN}$SERVICE_URL${NC}"
echo -e "MCP Endpoint: ${GREEN}$SERVICE_URL/mcp${NC}"
echo -e "Assets served from: ${GREEN}$SERVICE_URL/assets/${NC}"
echo ""
echo "Next steps:"
echo "  1. Test your service: curl $SERVICE_URL/mcp"
echo "  2. View logs: gcloud run services logs read $SERVICE_NAME --region=$REGION"
echo "  3. Monitor: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME?project=$PROJECT_ID"
echo ""
echo "To add to ChatGPT:"
echo "  - Go to Settings > Connectors"
echo "  - Add MCP endpoint: $SERVICE_URL/mcp"
echo ""
