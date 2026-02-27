# xshopai Database Seeder

Seeds demo data (users, products, inventory) for local development and testing.

## Demo Credentials

After seeding:

- **Customer**: `guest@xshopai.com` / `guest`
- **Admin**: `admin@xshopai.com` / `admin`

## Quick Start

```bash
cd deployment/seed

# Install dependencies
pip install -r requirements.txt

# Seed all data
python seed.py

# Or seed selectively
python seed.py --users      # Users only
python seed.py --products   # Products only
python seed.py --inventory  # Inventory only

# Clear and reseed
python seed.py --clear
```

## Environment Variables

Create `.env` or export these environment variables:

```bash
# User Service MongoDB
USER_SERVICE_DATABASE_URL=mongodb://localhost:27018/user-service

# Product Service MongoDB
PRODUCT_SERVICE_DATABASE_URL=mongodb://localhost:27019/product-service

# Inventory Service MySQL
INVENTORY_SERVICE_DATABASE_URL=mysql://root:password@localhost:3306/inventory
```

Default values assume local Docker setup.

## Data Files

| File                  | Description                             |
| --------------------- | --------------------------------------- |
| `data/users.json`     | Demo users (guest, admin)               |
| `data/products.json`  | 25 products covering all UI categories  |
| `data/inventory.json` | Inventory records matching product SKUs |

## Integration with Deployment Scripts

### Docker (Standalone Containers)

From the deployment directory:

```bash
cd deployment/local/docker
./deploy.sh --seed
```

This will:

1. Start all services as standalone Docker containers
2. Wait for healthy status
3. Run the seeder

### Docker Compose (Not yet tested)

```bash
cd deployment/local/docker-compose
./deploy.sh --seed
```
