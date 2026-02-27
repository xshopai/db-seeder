#!/bin/bash

# =============================================================================
# Fetch Azure Secrets for Local Seeding
# =============================================================================
# This script retrieves connection strings from Azure Key Vault and generates
# a .env file for the seeder project.
#
# Resource naming follows the same pattern as GitHub Actions workflows:
#   - Resource Group: rg-xshopai-{suffix}
#   - Key Vault: kv-xshopai-{suffix}
#   - Cosmos DB: cosmos-xshopai-{suffix}
#   - MySQL: mysql-xshopai-{suffix}
#   etc.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Access to the Key Vault (Key Vault Secrets User or Officer role)
#
# Usage:
#   ./fetch-azure-secrets.sh [environment] [suffix]
#
#   environment: dev (default) or prod
#   suffix: Resource suffix (optional, defaults to 'development' for dev, 'production' for prod)
#
# Examples:
#   ./fetch-azure-secrets.sh                     # Prompts for environment, uses default suffix
#   ./fetch-azure-secrets.sh dev                 # Uses kv-xshopai-development
#   ./fetch-azure-secrets.sh prod                # Uses kv-xshopai-production
#   ./fetch-azure-secrets.sh dev my-suffix       # Uses kv-xshopai-my-suffix (override)
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
ENVIRONMENT="$1"
INPUT_SUFFIX="$2"

# Prompt for environment if not provided
if [ -z "$ENVIRONMENT" ]; then
    echo -n "Enter environment (dev/prod) [dev]: "
    read -r ENVIRONMENT
    ENVIRONMENT="${ENVIRONMENT:-dev}"
fi

# Validate environment
if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "prod" ]; then
    print_error "Invalid environment: $ENVIRONMENT. Must be 'dev' or 'prod'."
    exit 1
fi

# Resolve suffix: manual override > default based on environment
# This matches GitHub Actions logic: DEPLOY_SUFFIX_DEV / DEPLOY_SUFFIX_PROD
if [ -n "$INPUT_SUFFIX" ]; then
    SUFFIX="$INPUT_SUFFIX"
    print_info "Using manual suffix override: $SUFFIX"
elif [ "$ENVIRONMENT" = "prod" ]; then
    SUFFIX="production"
    print_info "Using default prod suffix: $SUFFIX"
else
    SUFFIX="development"
    print_info "Using default dev suffix: $SUFFIX"
fi

# Derive resource names (matches GitHub Actions + Bicep naming: xshopai-{suffix})
KEY_VAULT="kv-xshopai-${SUFFIX}"
COSMOS_ACCOUNT="cosmos-xshopai-${SUFFIX}"
RESOURCE_GROUP="rg-xshopai-${SUFFIX}"

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
print_info "Resource Group: ${RESOURCE_GROUP}"
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

# Helper function to parse PostgreSQL connection string
# Input: postgresql://user:pass@host:port/db?params
# Outputs values to global variables
parse_postgres_connection() {
    local conn="$1"
    # Remove protocol prefix
    local without_proto="${conn#*://}"
    # Extract user:pass
    local userpass="${without_proto%%@*}"
    PARSED_PG_USER="${userpass%%:*}"
    PARSED_PG_PASSWORD="${userpass#*:}"
    # Extract host:port/db
    local hostportdb="${without_proto#*@}"
    local hostport="${hostportdb%%/*}"
    PARSED_PG_HOST="${hostport%%:*}"
    PARSED_PG_PORT="${hostport#*:}"
    # Extract db (remove query params)
    local dbpart="${hostportdb#*/}"
    PARSED_PG_DB="${dbpart%%\?*}"
}

# Helper function to parse SQL Server connection string
# Input: Server=host,port;Database=db;User Id=user;Password=pass;...
# Outputs values to global variables
parse_sqlserver_connection() {
    local conn="$1"
    # Extract Server (may be host,port or just host)
    local server=$(echo "$conn" | grep -oP 'Server=\K[^;]+' || echo "")
    if [[ "$server" == *","* ]]; then
        PARSED_SQL_HOST="${server%%,*}"
        PARSED_SQL_PORT="${server#*,}"
    else
        PARSED_SQL_HOST="$server"
        PARSED_SQL_PORT="1433"
    fi
    # Extract other fields
    PARSED_SQL_DB=$(echo "$conn" | grep -oP 'Database=\K[^;]+' || echo "")
    PARSED_SQL_USER=$(echo "$conn" | grep -oP 'User Id=\K[^;]+' || echo "")
    PARSED_SQL_PASSWORD=$(echo "$conn" | grep -oP 'Password=\K[^;]+' || echo "")
}

# Helper function to parse MySQL connection string
# Input: mysql+pymysql://user:pass@host:port/db?params or mysql://user:pass@host:port/db?params
parse_mysql_connection() {
    local conn="$1"
    # Remove protocol prefix (handle both mysql:// and mysql+pymysql://)
    local without_proto="${conn#*://}"
    # Extract user:pass
    local userpass="${without_proto%%@*}"
    PARSED_MYSQL_USER="${userpass%%:*}"
    PARSED_MYSQL_PASSWORD="${userpass#*:}"
    # Extract host:port/db
    local hostportdb="${without_proto#*@}"
    local hostport="${hostportdb%%/*}"
    PARSED_MYSQL_HOST="${hostport%%:*}"
    PARSED_MYSQL_PORT="${hostport#*:}"
    # Remove port if it contains query params
    PARSED_MYSQL_PORT="${PARSED_MYSQL_PORT%%\?*}"
    # Default port if not specified
    [ -z "$PARSED_MYSQL_PORT" ] && PARSED_MYSQL_PORT="3306"
}

echo ""
print_info "Fetching secrets from Key Vault..."
echo ""

# Fetch MongoDB connection strings (stored per-service in Key Vault)
USER_MONGODB_URI=$(get_secret "user-service-mongodb-uri")
PRODUCT_MONGODB_URI=$(get_secret "product-service-mongodb-uri")
REVIEW_MONGODB_URI=$(get_secret "review-service-mongodb-uri")

# Fetch MySQL credentials and connection
MYSQL_CONNECTION=$(get_secret "inventory-service-mysql-server")
MYSQL_ADMIN_USER=$(get_secret "mysql-admin-user")
MYSQL_ADMIN_PASSWORD=$(get_secret "mysql-admin-password")

# Fetch PostgreSQL credentials
POSTGRES_CONNECTION=$(get_secret "audit-service-postgres-url")
POSTGRES_ADMIN_USER=$(get_secret "postgres-admin-user")
POSTGRES_ADMIN_PASSWORD=$(get_secret "postgres-admin-password")

# Fetch SQL Server connections
ORDER_SQL_CONNECTION=$(get_secret "order-service-sql-connection")
PAYMENT_SQL_CONNECTION=$(get_secret "payment-service-sql-connection")
SQL_ADMIN_USER=$(get_secret "sql-admin-user")
SQL_ADMIN_PASSWORD=$(get_secret "sql-admin-password")

# Fetch Redis
REDIS_HOST=$(get_secret "redis-host")
REDIS_KEY=$(get_secret "redis-key")

# Fetch other services
APPINSIGHTS_CONNECTION=$(get_secret "appinsights-connection-string")

# Report what we found
[ -n "$USER_MONGODB_URI" ] && print_success "Retrieved: User MongoDB" || print_warning "Missing: User MongoDB"
[ -n "$PRODUCT_MONGODB_URI" ] && print_success "Retrieved: Product MongoDB" || print_warning "Missing: Product MongoDB"
[ -n "$REVIEW_MONGODB_URI" ] && print_success "Retrieved: Review MongoDB" || print_warning "Missing: Review MongoDB"
[ -n "$MYSQL_CONNECTION" ] && print_success "Retrieved: MySQL connection" || print_warning "Missing: MySQL connection"
[ -n "$POSTGRES_CONNECTION" ] && print_success "Retrieved: PostgreSQL connection" || print_warning "Missing: PostgreSQL connection"
[ -n "$ORDER_SQL_CONNECTION" ] && print_success "Retrieved: Order SQL connection" || print_warning "Missing: Order SQL connection"
[ -n "$PAYMENT_SQL_CONNECTION" ] && print_success "Retrieved: Payment SQL connection" || print_warning "Missing: Payment SQL connection"
[ -n "$REDIS_HOST" ] && print_success "Retrieved: Redis" || print_warning "Missing: Redis"
[ -n "$APPINSIGHTS_CONNECTION" ] && print_success "Retrieved: App Insights" || print_warning "Missing: App Insights"

# Parse PostgreSQL connection string into components
if [ -n "$POSTGRES_CONNECTION" ]; then
    parse_postgres_connection "$POSTGRES_CONNECTION"
fi

# Parse SQL Server connections into components
if [ -n "$ORDER_SQL_CONNECTION" ]; then
    parse_sqlserver_connection "$ORDER_SQL_CONNECTION"
    ORDER_SQL_HOST="$PARSED_SQL_HOST"
    ORDER_SQL_PORT="$PARSED_SQL_PORT"
    ORDER_SQL_DB="$PARSED_SQL_DB"
fi

if [ -n "$PAYMENT_SQL_CONNECTION" ]; then
    parse_sqlserver_connection "$PAYMENT_SQL_CONNECTION"
    PAYMENT_SQL_HOST="$PARSED_SQL_HOST"
    PAYMENT_SQL_PORT="$PARSED_SQL_PORT"
    PAYMENT_SQL_DB="$PARSED_SQL_DB"
fi

# Generate .env file
echo ""
print_info "Generating .env file..."

cat > "$ENV_FILE" << EOF
# ============================================
# XShopAI Seeder - Azure Environment Configuration
# ============================================
# Auto-generated by fetch-azure-secrets.sh
# Generated: $(date -Iseconds)
# Environment: ${ENVIRONMENT}
# Suffix: ${SUFFIX}
# Resource Group: ${RESOURCE_GROUP}
# Key Vault: ${KEY_VAULT}
# ============================================

# ============================================
# MongoDB Services (uses MONGODB_URI like the services)
# ============================================

# User Service MongoDB (Cosmos DB)
USER_MONGODB_URI=${USER_MONGODB_URI}

# Product Service MongoDB (Cosmos DB)
PRODUCT_MONGODB_URI=${PRODUCT_MONGODB_URI}

# Review Service MongoDB (Cosmos DB)
REVIEW_MONGODB_URI=${REVIEW_MONGODB_URI}

# ============================================
# MySQL Services (uses MYSQL_SERVER_CONNECTION like inventory-service)
# ============================================

# Inventory Service MySQL
MYSQL_SERVER_CONNECTION=${MYSQL_CONNECTION}
INVENTORY_DB_NAME=inventory_service_db

# ============================================
# PostgreSQL Services (uses POSTGRES_* like audit-service)
# ============================================

# Audit Service PostgreSQL
POSTGRES_HOST=${PARSED_PG_HOST:-}
POSTGRES_PORT=${PARSED_PG_PORT:-5432}
POSTGRES_USER=${POSTGRES_ADMIN_USER:-${PARSED_PG_USER:-}}
POSTGRES_PASSWORD=${POSTGRES_ADMIN_PASSWORD:-${PARSED_PG_PASSWORD:-}}
POSTGRES_DB=audit_service_db

# ============================================
# SQL Server Services
# ============================================

# Order Service SQL Server
ORDER_SQLSERVER_HOST=${ORDER_SQL_HOST:-}
ORDER_SQLSERVER_PORT=${ORDER_SQL_PORT:-1433}
ORDER_SQLSERVER_USER=${SQL_ADMIN_USER:-}
ORDER_SQLSERVER_PASSWORD=${SQL_ADMIN_PASSWORD:-}
ORDER_SQLSERVER_DB=${ORDER_SQL_DB:-order_service_db}

# Payment Service SQL Server
PAYMENT_SQLSERVER_HOST=${PAYMENT_SQL_HOST:-}
PAYMENT_SQLSERVER_PORT=${PAYMENT_SQL_PORT:-1433}
PAYMENT_SQLSERVER_USER=${SQL_ADMIN_USER:-}
PAYMENT_SQLSERVER_PASSWORD=${SQL_ADMIN_PASSWORD:-}
PAYMENT_SQLSERVER_DB=${PAYMENT_SQL_DB:-payment_service_db}

# ============================================
# Redis Services
# ============================================

# Cart Service Redis
REDIS_HOST=${REDIS_HOST:-}
REDIS_PORT=6380
REDIS_PASSWORD=${REDIS_KEY:-}
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

check_env_var "USER_MONGODB_URI"
check_env_var "PRODUCT_MONGODB_URI"
check_env_var "MYSQL_SERVER_CONNECTION"
check_env_var "POSTGRES_HOST"

if [ $MISSING_COUNT -gt 0 ]; then
    print_warning "$MISSING_COUNT connection strings are missing or invalid"
    print_info "Some services may not be deployed yet. Run seeding for available services only."
else
    print_success "All primary connection strings are valid"
fi

echo ""
echo "============================================================"
echo "  Setup Complete! (${ENVIRONMENT} / ${SUFFIX})"
echo "============================================================"
echo ""
print_info "Generated .env with the following services:"
echo ""
if [ -n "$USER_MONGODB_URI" ]; then
    echo "  MongoDB (Cosmos DB):"
    echo "    - USER_MONGODB_URI"
    echo "    - PRODUCT_MONGODB_URI"
    echo "    - REVIEW_MONGODB_URI"
fi
if [ -n "$MYSQL_CONNECTION" ]; then
    echo "  MySQL:"
    echo "    - MYSQL_SERVER_CONNECTION + INVENTORY_DB_NAME"
fi
if [ -n "$POSTGRES_CONNECTION" ]; then
    echo "  PostgreSQL:"
    echo "    - POSTGRES_HOST/PORT/USER/PASSWORD/DB"
fi
if [ -n "$ORDER_SQL_CONNECTION" ]; then
    echo "  SQL Server:"
    echo "    - ORDER_SQLSERVER_* and PAYMENT_SQLSERVER_*"
fi
if [ -n "$REDIS_HOST" ]; then
    echo "  Redis:"
    echo "    - REDIS_HOST/PORT/PASSWORD"
fi
echo ""
echo "============================================================"
echo ""
