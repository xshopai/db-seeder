#!/bin/bash

# =============================================================================
# Fetch Azure Secrets for Local Seeding
# =============================================================================
# This script retrieves connection strings from Azure Key Vault and generates
# a .env file for the seeder project.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Access to the Key Vault (Key Vault Secrets User or Officer role)
#
# Usage:
#   ./fetch-azure-secrets.sh [environment] [suffix]
#
# Examples:
#   ./fetch-azure-secrets.sh dev 1six    # Uses kv-xshopai-dev-1six
#   ./fetch-azure-secrets.sh dev 5292    # Uses kv-xshopai-dev-5292
#   ./fetch-azure-secrets.sh prod abc    # Uses kv-xshopai-prod-abc
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() { echo -e "${BLUE}ℹ ${NC}$1"; }
print_success() { echo -e "${GREEN}✓ ${NC}$1"; }
print_warning() { echo -e "${YELLOW}⚠ ${NC}$1"; }
print_error() { echo -e "${RED}✗ ${NC}$1"; }

# Parse arguments
ENVIRONMENT="${1:-dev}"
SUFFIX="${2:-1six}"

# Derive resource names
KEY_VAULT="kv-xshopai-${ENVIRONMENT}-${SUFFIX}"
COSMOS_ACCOUNT="cosmos-xshopai-${ENVIRONMENT}-${SUFFIX}"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_BACKUP="${SCRIPT_DIR}/.env.backup.$(date +%Y%m%d_%H%M%S)"

echo ""
echo "============================================================"
echo "  Fetch Azure Secrets for Local Seeding"
echo "============================================================"
echo ""
print_info "Environment: ${ENVIRONMENT}"
print_info "Suffix: ${SUFFIX}"
print_info "Key Vault: ${KEY_VAULT}"
echo ""

# Check Azure CLI login
print_info "Checking Azure CLI login..."
if ! az account show > /dev/null 2>&1; then
    print_error "Not logged in to Azure CLI. Please run 'az login' first."
    exit 1
fi
print_success "Azure CLI logged in"

# Check Key Vault access
print_info "Checking Key Vault access..."
if ! az keyvault show --name "$KEY_VAULT" > /dev/null 2>&1; then
    print_error "Key Vault '$KEY_VAULT' not found or no access."
    print_info "Available Key Vaults in your subscription:"
    az keyvault list --query "[].name" -o tsv 2>/dev/null || echo "  (none found)"
    exit 1
fi
print_success "Key Vault accessible: $KEY_VAULT"

# Backup existing .env if it exists
if [ -f "$ENV_FILE" ]; then
    print_warning "Backing up existing .env to $ENV_BACKUP"
    cp "$ENV_FILE" "$ENV_BACKUP"
fi

# Helper function to get secret
get_secret() {
    local secret_name="$1"
    local value=$(az keyvault secret show \
        --vault-name "$KEY_VAULT" \
        --name "$secret_name" \
        --query "value" -o tsv 2>/dev/null || echo "")
    echo "$value"
}

# Helper function to insert database name into Cosmos connection string
# Input: mongodb://user:pass@host:port/?params  Output: mongodb://user:pass@host:port/dbname?params
cosmos_with_db() {
    local conn="$1"
    local dbname="$2"
    # Replace /? with /dbname?
    echo "${conn/\/\?/\/${dbname}\?}"
}

# Helper function to convert MySQL connection for Node.js and insert database name
# Input: mysql+pymysql://user:pass@host:port?params  Output: mysql://user:pass@host:port/dbname?params
mysql_with_db() {
    local conn="$1"
    local dbname="$2"
    # 1. Replace mysql+pymysql:// with mysql://
    conn="${conn/mysql+pymysql:\/\//mysql:\/\/}"
    # 2. Insert database name before ? (host:port?params -> host:port/dbname?params)
    echo "${conn/\?/\/${dbname}\?}"
}

echo ""
print_info "Fetching secrets from Key Vault..."
echo ""

# Fetch all connection strings (using new lower-kebab-case naming convention)
COSMOS_CONNECTION=$(get_secret "cosmos-account-connection")
MYSQL_CONNECTION=$(get_secret "mysql-server-connection")
POSTGRES_CONNECTION=$(get_secret "postgres-server-connection")
SQL_CONNECTION=$(get_secret "sql-server-connection")
SERVICEBUS_CONNECTION=$(get_secret "servicebus-connection")
APPINSIGHTS_CONNECTION=$(get_secret "appinsights-connection")

# Report what we found
[ -n "$COSMOS_CONNECTION" ] && print_success "Retrieved: Cosmos DB connection" || print_warning "Missing: Cosmos DB connection"
[ -n "$MYSQL_CONNECTION" ] && print_success "Retrieved: MySQL connection" || print_warning "Missing: MySQL connection"
[ -n "$POSTGRES_CONNECTION" ] && print_success "Retrieved: PostgreSQL connection" || print_warning "Missing: PostgreSQL connection"
[ -n "$SQL_CONNECTION" ] && print_success "Retrieved: SQL Server connection" || print_warning "Missing: SQL Server connection"
[ -n "$SERVICEBUS_CONNECTION" ] && print_success "Retrieved: Service Bus connection" || print_warning "Missing: Service Bus connection"
[ -n "$APPINSIGHTS_CONNECTION" ] && print_success "Retrieved: App Insights connection" || print_warning "Missing: App Insights connection"

# Generate .env file
echo ""
print_info "Generating .env file..."

cat > "$ENV_FILE" << EOF
# =============================================================================
# XShopAI Seeder - Azure Environment Configuration
# =============================================================================
# Auto-generated by fetch-azure-secrets.sh
# Generated: $(date -Iseconds)
# Key Vault: ${KEY_VAULT}
# =============================================================================

# -----------------------------------------------------------------------------
# MongoDB Services (Cosmos DB with MongoDB API)
# -----------------------------------------------------------------------------
# user-service: User profiles, addresses, payment methods, preferences
USER_SERVICE_DATABASE_URL=$(cosmos_with_db "$COSMOS_CONNECTION" "user_service_db")

# auth-service: Authentication tokens, sessions, refresh tokens
AUTH_SERVICE_DATABASE_URL=$(cosmos_with_db "$COSMOS_CONNECTION" "auth_service_db")

# product-service: Product catalog, categories, reviews aggregates
PRODUCT_SERVICE_DATABASE_URL=$(cosmos_with_db "$COSMOS_CONNECTION" "product_service_db")

# review-service: Product reviews, ratings, review flags
REVIEW_SERVICE_DATABASE_URL=$(cosmos_with_db "$COSMOS_CONNECTION" "review_service_db")

# cart-service: Shopping carts (if using MongoDB)
CART_SERVICE_DATABASE_URL=$(cosmos_with_db "$COSMOS_CONNECTION" "cart_service_db")

# -----------------------------------------------------------------------------
# MySQL Services (Azure MySQL Flexible Server)
# -----------------------------------------------------------------------------
# inventory-service: Inventory items, stock movements, reservations
INVENTORY_SERVICE_DATABASE_URL=$(mysql_with_db "$MYSQL_CONNECTION" "inventory_service_db")

# -----------------------------------------------------------------------------
# PostgreSQL Services (Azure PostgreSQL Flexible Server)
# -----------------------------------------------------------------------------
# audit-service: Audit logs, audit events
AUDIT_SERVICE_DATABASE_URL=${POSTGRES_CONNECTION}/audit_service_db

# -----------------------------------------------------------------------------
# SQL Server Services (Azure SQL Database)
# -----------------------------------------------------------------------------
# order-service: Orders, order items, order status history
ORDER_SERVICE_DATABASE_URL=${SQL_CONNECTION}

# -----------------------------------------------------------------------------
# Messaging (Azure Service Bus)
# -----------------------------------------------------------------------------
SERVICEBUS_CONNECTION_STRING=${SERVICEBUS_CONNECTION}

# -----------------------------------------------------------------------------
# Observability (Azure Application Insights)
# -----------------------------------------------------------------------------
APPLICATIONINSIGHTS_CONNECTION_STRING=${APPINSIGHTS_CONNECTION}

# -----------------------------------------------------------------------------
# Seeder Configuration
# -----------------------------------------------------------------------------
# Set to 'true' to enable verbose logging during seeding
SEED_VERBOSE=false

# Set to 'true' to clear existing data before seeding
SEED_CLEAR_EXISTING=false

# Batch size for bulk inserts
SEED_BATCH_SIZE=100
EOF

print_success "Generated .env file: $ENV_FILE"

# Validate the generated file
echo ""
print_info "Validating .env file..."
MISSING_COUNT=0

check_env_var() {
    local var_name="$1"
    local var_value=$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2-)
    if [ -z "$var_value" ] || [ "$var_value" = "/" ] || [[ "$var_value" == *"///"* ]]; then
        print_warning "  $var_name is empty or invalid"
        MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
}

check_env_var "USER_SERVICE_DATABASE_URL"
check_env_var "PRODUCT_SERVICE_DATABASE_URL"
check_env_var "INVENTORY_SERVICE_DATABASE_URL"
check_env_var "ORDER_SERVICE_DATABASE_URL"

if [ $MISSING_COUNT -gt 0 ]; then
    print_warning "$MISSING_COUNT connection strings are missing or invalid"
    print_info "Some services may not be deployed yet. Run seeding for available services only."
else
    print_success "All primary connection strings are valid"
fi

echo ""
echo "============================================================"
echo "  Setup Complete!"
echo "============================================================"
echo ""
print_info "To seed the databases, run:"
echo ""
echo "  cd $(dirname "$ENV_FILE")"
echo "  npm install"
echo "  npm run seed"
echo ""
print_info "Or seed specific services:"
echo ""
echo "  npm run seed:users"
echo "  npm run seed:products"
echo "  npm run seed:inventory"
echo "  npm run seed:orders"
echo ""

# Show summary of what's available
echo "============================================================"
echo "  Connection Summary"
echo "============================================================"
if [ -n "$COSMOS_CONNECTION" ]; then
    echo "  ✓ MongoDB (Cosmos): user, auth, product, review, cart services"
fi
if [ -n "$MYSQL_CONNECTION" ]; then
    echo "  ✓ MySQL: inventory-service"
fi
if [ -n "$POSTGRES_CONNECTION" ]; then
    echo "  ✓ PostgreSQL: audit-service"
fi
if [ -n "$SQL_CONNECTION" ]; then
    echo "  ✓ SQL Server: order-service"
fi
echo "============================================================"
echo ""
