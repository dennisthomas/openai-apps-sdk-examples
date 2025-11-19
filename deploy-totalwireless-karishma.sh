#!/bin/bash

# Deployment script for Total Wireless Karishma branch to Manager's GCP (totalwireless)
# This deploys totalwireless-karishma branch to shining-courage-434003-h1 project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration - FIXED for manager's project
PROJECT_ID="shining-courage-434003-h1"
SERVICE_NAME="totalwireless"
REGION="us-central1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Set manager's environment
export GCP_PROJECT_ID="$PROJECT_ID"
export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deploying Total Wireless Karishma to Manager's GCP       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Project ID: $PROJECT_ID (Manager's)"
echo "Region: $REGION"
echo "Service Name: $SERVICE_NAME"
echo "Image: $IMAGE_NAME"
echo "Branch: totalwireless-karishma (from manager's repo)"
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
echo -e "${YELLOW}Setting GCP project to manager's project...${NC}"
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

# Check for existing service URL
echo -e "${YELLOW}Checking for existing service URL...${NC}"
EXISTING_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format="value(status.url)" 2>/dev/null || echo "")

if [ -z "$EXISTING_URL" ]; then
  BASE_URL="https://${SERVICE_NAME}-$(gcloud config get-value project | tr ':' '-')-${REGION//-/}.a.run.app"
  echo -e "${YELLOW}First deployment - using expected URL: $BASE_URL${NC}"
else
  BASE_URL="$EXISTING_URL"
  echo -e "${YELLOW}Using existing service URL: $BASE_URL${NC}"
fi

# Build the Docker image with BASE_URL
echo -e "${YELLOW}Building Docker image for linux/amd64 platform...${NC}"
echo -e "${YELLOW}BASE_URL set to: $BASE_URL/assets${NC}"
docker build --platform linux/amd64 \
  --build-arg BASE_URL="$BASE_URL/assets" \
  -f Dockerfile.visible \
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
echo -e "Health Check: ${GREEN}$SERVICE_URL/health${NC}"
echo -e "MCP Endpoint: ${GREEN}$SERVICE_URL/mcp${NC}"
echo -e "Assets served from: ${GREEN}$SERVICE_URL/assets/${NC}"
echo ""
echo "Test endpoints:"
echo "  curl $SERVICE_URL/health"
echo "  curl $SERVICE_URL/assets/visible-plans.html"
echo "  curl $SERVICE_URL/assets/visible-devices.html"
echo ""
echo "Next steps:"
echo "  1. Test your service: curl $SERVICE_URL/health"
echo "  2. View logs: gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
echo "  3. Monitor: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME?project=$PROJECT_ID"
echo ""
echo "To add to ChatGPT:"
echo "  - Go to Settings > Connectors"
echo "  - Add MCP endpoint: $SERVICE_URL/mcp"
echo ""
