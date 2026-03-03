# Copilot Instructions — db-seeder

## Tool Identity

- **Name**: db-seeder
- **Purpose**: Database seeding utility — seeds users, products, and inventory data for demo/development environments
- **Language**: Python 3.11+
- **Databases Targeted**: MongoDB (user-service, product-service, review-service), MySQL (inventory-service), PostgreSQL (audit-service, order-processor-service), SQL Server (order-service, payment-service)

## Architecture

- **Pattern**: CLI utility — runs as standalone script with argument parsing
- **No Framework**: Pure Python with database drivers
- **No Dapr**: Direct database connections (not a microservice)

## Project Structure

```
db-seeder/
├── seed.py              # Main seeder script (CLI entry point)
├── data/
│   ├── users.json       # User seed data
│   ├── products.json    # Product catalog seed data
│   └── inventory.json   # Inventory seed data
├── requirements.txt     # Python dependencies
├── fetch-azure-secrets.sh  # Fetches connection strings from Azure Key Vault
├── .env                 # Local environment (connection strings)
├── .env.example         # Template for environment variables
└── README.md
```

## Code Conventions

- Single-file CLI tool (`seed.py`) with argparse
- Functions organized by database type: `clear_mongodb`, `clear_postgres`, `clear_mysql`, `clear_sqlserver`
- Seed data loaded from JSON files in `data/` directory
- Password hashing via **bcrypt** (with fallback to pre-computed hashes)
- SKU variant generation for product inventory (color × size matrix)
- Error handling: graceful skip if database driver not installed or DB unreachable
- Console output with emoji indicators (✅ ❌ ⚠️)

## Database Connections

| Database   | Service           | Default Connection                                    |
| :--------- | :---------------- | :---------------------------------------------------- |
| MongoDB    | user-service      | `mongodb://admin:admin123@localhost:27018`            |
| MongoDB    | product-service   | `mongodb://admin:admin123@localhost:27019`            |
| MongoDB    | review-service    | `mongodb://admin:admin123@localhost:27020`            |
| MySQL      | inventory-service | `admin:admin123@localhost:3306/inventory_service_db`  |
| PostgreSQL | audit-service     | `postgres:postgres@localhost:5434/audit-service`      |
| PostgreSQL | order-processor   | `postgres:postgres@localhost:5435/order_processor_db` |
| SQL Server | order-service     | `sa:Admin123!@localhost:1434/OrderServiceDb`          |
| SQL Server | payment-service   | `sa:Admin123!@localhost:1433/PaymentServiceDb`        |

## CLI Usage

```bash
python seed.py                  # Seed all data
python seed.py --users          # Seed users only
python seed.py --products       # Seed products only
python seed.py --inventory      # Seed inventory only
python seed.py --clear          # Clear ALL databases (clean slate)
```

## Demo Credentials

- Admin: `admin@xshopai.com` / `admin`
- Guest: `guest@xshopai.com` / `guest`

## Environment Variables

Connection strings loaded from `.env` file. Use `fetch-azure-secrets.sh` for Azure deployments.

```
USER_MONGODB_URL=mongodb://admin:admin123@localhost:27018/user-service?authSource=admin
PRODUCT_MONGODB_URL=mongodb://admin:admin123@localhost:27019/product-service?authSource=admin
REVIEW_MONGODB_URL=mongodb://admin:admin123@localhost:27020/review-service?authSource=admin
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=admin
MYSQL_PASSWORD=admin123
MYSQL_DATABASE=inventory_service_db
```

## Security Rules

- Never use production database credentials in `.env` or committed configuration files
- Seed data for production MUST use environment variables fetched via `fetch-azure-secrets.sh` from Azure Key Vault
- Never commit `.env` files containing real connection strings or passwords
- Bcrypt-hashed passwords MUST be used for seeded user accounts — never store plain-text passwords in seed data files
- Run `python seed.py --clear` only against non-production databases

## Non-Goals

- This tool is NOT a microservice — it has no server, HTTP API, or Dapr integration
- This tool does NOT modify production data — intended for development and demo environments only
- This tool does NOT manage authentication or JWT token issuance
- This tool does NOT validate business rules — it provides raw test data only

## Common Commands

```bash
pip install -r requirements.txt   # Install dependencies
python seed.py                    # Seed all databases
python seed.py --clear            # Clear all databases
```
