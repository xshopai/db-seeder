# XShopAI Database Seeder

A unified database seeding tool for the XShopAI microservices platform. Seeds all service databases with consistent test data.

## Supported Services

| Service           | Database            | Purpose                               |
| ----------------- | ------------------- | ------------------------------------- |
| user-service      | Cosmos DB (MongoDB) | User profiles, addresses, preferences |
| auth-service      | Cosmos DB (MongoDB) | Sessions, refresh tokens              |
| product-service   | Cosmos DB (MongoDB) | Product catalog, categories           |
| review-service    | Cosmos DB (MongoDB) | Product reviews, ratings              |
| cart-service      | Cosmos DB (MongoDB) | Shopping carts                        |
| inventory-service | MySQL               | Stock levels, reservations            |
| audit-service     | PostgreSQL          | Audit logs                            |
| order-service     | SQL Server          | Orders, order items                   |

## Quick Start

### For Local Development (Docker Compose)

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Start local databases:

   ```bash
   cd ../docker-compose
   docker-compose -f docker-compose.databases.yml up -d
   ```

3. Install dependencies and seed:
   ```bash
   npm install
   npm run seed
   ```

### For Azure Environment

Use the `fetch-azure-secrets.sh` script to automatically retrieve connection strings from Azure Key Vault:

```bash
# Fetch secrets for dev environment with suffix "1six"
./fetch-azure-secrets.sh dev 1six

# This generates a .env file with all connection strings
```

**Prerequisites:**

- Azure CLI installed and logged in (`az login`)
- Key Vault Secrets User or Officer role on the target Key Vault

**Usage:**

```bash
./fetch-azure-secrets.sh [environment] [suffix]

# Examples:
./fetch-azure-secrets.sh dev 1six    # Uses kv-xshopai-dev-1six
./fetch-azure-secrets.sh dev 5292    # Uses kv-xshopai-dev-5292
./fetch-azure-secrets.sh prod abc    # Uses kv-xshopai-prod-abc
```

The script will:

1. Verify Azure CLI authentication
2. Check Key Vault access
3. Retrieve all connection strings
4. Generate a properly formatted `.env` file
5. Validate the connections

## Available Commands

```bash
# Seed all services
npm run seed

# Seed specific services
npm run seed:users      # user-service
npm run seed:products   # product-service
npm run seed:inventory  # inventory-service
npm run seed:orders     # order-service
npm run seed:reviews    # review-service
npm run seed:audit      # audit-service

# Clear all data (use with caution!)
npm run clear

# Validate data integrity
npm run validate
```

## Environment Variables

The seeder uses the following environment variables:

### MongoDB Services (Cosmos DB)

- `USER_SERVICE_DATABASE_URL` - User service connection
- `AUTH_SERVICE_DATABASE_URL` - Auth service connection
- `PRODUCT_SERVICE_DATABASE_URL` - Product service connection
- `REVIEW_SERVICE_DATABASE_URL` - Review service connection
- `CART_SERVICE_DATABASE_URL` - Cart service connection

### MySQL Services

- `INVENTORY_SERVICE_DATABASE_URL` - Inventory service connection

### PostgreSQL Services

- `AUDIT_SERVICE_DATABASE_URL` - Audit service connection

### SQL Server Services

- `ORDER_SERVICE_DATABASE_URL` - Order service connection

### Optional Settings

- `SEED_VERBOSE=true` - Enable verbose logging
- `SEED_CLEAR_EXISTING=true` - Clear data before seeding
- `SEED_BATCH_SIZE=100` - Batch size for bulk inserts

## Data Files

Seed data is stored in `src/data/`:

```
src/data/
├── users.json          # User profiles
├── products.json       # Product catalog
├── inventory.json      # Stock levels
├── orders.json         # Sample orders
├── reviews.json        # Product reviews
└── categories.json     # Product categories
```

## Seeding Order

Services are seeded in dependency order:

1. **auth-service** - Base authentication data
2. **user-service** - User profiles (may reference auth)
3. **product-service** - Product catalog
4. **inventory-service** - Stock for products
5. **review-service** - Reviews (references users & products)
6. **order-service** - Orders (references users & products)
7. **audit-service** - Audit logs

## Troubleshooting

### "Connection refused" errors

- For local: Ensure Docker containers are running
- For Azure: Run `fetch-azure-secrets.sh` to get latest connection strings

### "Authentication failed" errors

- For Azure Cosmos: Ensure local auth is enabled on the account
- For Azure MySQL: Check firewall rules allow your IP

### SSL Certificate errors

- Azure MySQL requires SSL. The connection string includes the CA certificate path.
- If using a different environment, update the `ssl_ca` parameter.

### "Key Vault access denied"

- Run `az login` to refresh your credentials
- Ensure you have "Key Vault Secrets User" role on the vault

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

## License

MIT - See LICENSE file in root repository.
