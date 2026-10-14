#!/bin/bash
# FixFlow Deployment Script
# This script helps deploy FixFlow to free-tier services:
# - Frontend: Cloudflare Pages
# - Backend: Cloudflare Workers
# - Database/Auth: Firebase Spark Plan

set -e

echo "========================================="
echo "FixFlow Free-Tier Deployment"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed${NC}"
        exit 1
    fi
    
    if ! command -v wrangler &> /dev/null; then
        echo -e "${YELLOW}Warning: Wrangler CLI not found globally. Will use npx.${NC}"
    fi
    
    if ! command -v firebase &> /dev/null; then
        echo -e "${YELLOW}Warning: Firebase CLI not found globally. Will use npx.${NC}"
    fi
    
    echo -e "${GREEN}Prerequisites check passed${NC}"
    echo ""
}

# Build frontend
build_frontend() {
    echo "Building frontend..."
    cd "FixFlow UI Design"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm ci
    fi
    
    # Build for Cloudflare Pages
    CLOUDFLARE_PAGES=true npm run build
    
    echo -e "${GREEN}Frontend build complete: dist/${NC}"
    cd ..
    echo ""
}

# Build workers
build_workers() {
    echo "Building Cloudflare Workers..."
    cd workers
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing workers dependencies..."
        npm ci
    fi
    
    # Type-check and compile
    npm run build
    
    echo -e "${GREEN}Workers build complete: dist/${NC}"
    cd ..
    echo ""
}

# Deploy frontend to Cloudflare Pages
deploy_frontend() {
    echo "Deploying frontend to Cloudflare Pages..."
    
    # Check if wrangler is authenticated
    if ! npx wrangler whoami &> /dev/null; then
        echo -e "${YELLOW}Wrangler not authenticated. Please run: npx wrangler login${NC}"
        npx wrangler login
    fi
    
    # Deploy using wrangler pages
    npx wrangler pages deploy "FixFlow UI Design/dist" --project-name=fixflow
    
    echo -e "${GREEN}Frontend deployed to Cloudflare Pages${NC}"
    echo ""
}

# Deploy workers
deploy_workers() {
    echo "Deploying Cloudflare Workers..."
    cd workers
    
    # Check if wrangler is authenticated
    if ! npx wrangler whoami &> /dev/null; then
        echo -e "${YELLOW}Wrangler not authenticated. Please run: npx wrangler login${NC}"
        npx wrangler login
    fi
    
    # Deploy workers
    npx wrangler deploy
    
    echo -e "${GREEN}Workers deployed${NC}"
    cd ..
    echo ""
}

# Deploy Firebase backend (Firestore rules, indexes, functions)
deploy_firebase() {
    echo "Deploying Firebase configuration..."
    cd backend
    
    # Check if firebase is authenticated
    if ! npx firebase projects:list &> /dev/null; then
        echo -e "${YELLOW}Firebase not authenticated. Please run: npx firebase login${NC}"
        npx firebase login
    fi
    
    # Deploy Firestore rules and indexes
    echo "Deploying Firestore rules and indexes..."
    npx firebase deploy --only firestore:rules,firestore:indexes
    
    echo -e "${GREEN}Firebase configuration deployed${NC}"
    cd ..
    echo ""
}

# Setup Firebase project
setup_firebase() {
    echo "Setting up Firebase project..."
    echo ""
    echo "Please ensure you have:"
    echo "1. Created a Firebase project at https://console.firebase.google.com"
    echo "2. Enabled Authentication (Email/Password, Google)"
    echo "3. Created a Firestore database in Native mode"
    echo "4. Enabled Storage"
    echo ""
    read -p "Enter your Firebase Project ID: " PROJECT_ID
    
    if [ -z "$PROJECT_ID" ]; then
        echo -e "${RED}Project ID is required${NC}"
        exit 1
    fi
    
    # Update .firebaserc
    echo "{
  \"projects\": {
    \"default\": \"$PROJECT_ID\"
  }
}" > backend/.firebaserc
    
    echo -e "${GREEN}Firebase project configured: $PROJECT_ID${NC}"
    echo ""
}

# Main deployment flow
main() {
    check_prerequisites
    
    echo "Select deployment option:"
    echo "1) Full deployment (frontend + workers + firebase)"
    echo "2) Frontend only (Cloudflare Pages)"
    echo "3) Workers only (Cloudflare Workers)"
    echo "4) Firebase only (Firestore rules/indexes)"
    echo "5) Build only (no deployment)"
    echo ""
    read -p "Enter choice [1-5]: " CHOICE
    
    case $CHOICE in
        1)
            setup_firebase
            build_frontend
            build_workers
            deploy_firebase
            deploy_frontend
            deploy_workers
            ;;
        2)
            build_frontend
            deploy_frontend
            ;;
        3)
            build_workers
            deploy_workers
            ;;
        4)
            deploy_firebase
            ;;
        5)
            build_frontend
            build_workers
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac
    
    echo "========================================="
    echo -e "${GREEN}Deployment complete!${NC}"
    echo "========================================="
    echo ""
    echo "Next steps:"
    echo "1. Configure environment variables in Cloudflare Pages dashboard"
    echo "2. Configure secrets in Cloudflare Workers dashboard"
    echo "3. Set up Firebase Auth custom claims for roles"
    echo "4. Test the application at your Cloudflare Pages URL"
    echo ""
    echo "See DEPLOYMENT_PLAN.md for detailed configuration instructions."
}

main "$@"