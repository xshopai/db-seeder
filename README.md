<div align="center">

# 🌱 Database Seeder

**Demo data seeding utility for the xshopai e-commerce platform**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[Getting Started](#-getting-started) •
[Demo Credentials](#-demo-credentials) •
[Data Files](#-data-files) •
[Contributing](#-contributing)

</div>

---

## 🎯 Overview

The **Database Seeder** populates all xshopai platform databases with realistic demo data for local development and testing. It seeds users, products, and inventory across MongoDB, MySQL, and other databases, providing a consistent baseline dataset for development workflows.

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 🌱 Selective Seeding

- Seed all databases at once
- Individual collection/table targeting
- Clear and reseed capability
- Idempotent seeding operations

</td>
<td width="50%">

### 📦 Multi-Database Support

- MongoDB (user-service, product-service)
- MySQL (inventory-service)
- JSON-based seed data files
- Environment-configurable connections

</td>
</tr>
</table>

---

## 🔑 Demo Credentials

After seeding, use these accounts to log in:

| Role        | Email               | Password |
| :---------- | :------------------ | :------- |
| 👤 Customer | `guest@xshopai.com` | `guest`  |
| 🔐 Admin    | `admin@xshopai.com` | `admin`  |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Running database instances (via `dev/docker-compose.yml`)

### Quick Start

```bash
cd db-seeder

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

### Environment Variables

Create `.env` or export these variables:

```bash
# User Service MongoDB
USER_SERVICE_DATABASE_URL=mongodb://localhost:27018/user-service

# Product Service MongoDB
PRODUCT_SERVICE_DATABASE_URL=mongodb://localhost:27019/product-service

# Inventory Service MySQL
INVENTORY_SERVICE_DATABASE_URL=mysql://root:password@localhost:3306/inventory
```

Default values assume the local Docker stack from `dev/docker-compose.yml`.

---

## 📦 Data Files

| File                                          | Description                             |
| :-------------------------------------------- | :-------------------------------------- |
| 📄 [data/users.json](data/users.json)         | Demo users (guest + admin accounts)     |
| 📄 [data/products.json](data/products.json)   | 25 products covering all UI categories  |
| 📄 [data/inventory.json](data/inventory.json) | Inventory records matching product SKUs |

---

## 🏗️ Project Structure

```
db-seeder/
├── 📄 seed.py                    # Main seeder script
├── 📄 requirements.txt           # Python dependencies
├── 📄 fetch-azure-secrets.sh     # Azure Key Vault integration
├── 📁 data/                      # Seed data files
│   ├── 📄 users.json             # User accounts
│   ├── 📄 products.json          # Product catalog
│   └── 📄 inventory.json         # Stock levels
└── 📄 README.md
```

---

## 🔧 Integration with Deployment Scripts

### Docker (Standalone Containers)

```bash
cd infrastructure/local/docker
./deploy.sh --seed
```

### Docker Compose

```bash
cd dev
docker-compose up -d    # Start infrastructure
cd ../db-seeder
python seed.py          # Seed databases
```

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch
3. **Add** new seed data as JSON files in `data/`
4. **Test** seeding against a fresh database
5. **Open** a Pull Request

---

## 🆘 Support

| Resource       | Link                                                                   |
| :------------- | :--------------------------------------------------------------------- |
| 🐛 Bug Reports | [GitHub Issues](https://github.com/xshopai/db-seeder/issues)           |
| 💬 Discussions | [GitHub Discussions](https://github.com/xshopai/db-seeder/discussions) |

---

## 📄 License

This project is part of the **xshopai** e-commerce platform.
Licensed under the MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**[⬆ Back to Top](#-database-seeder)**

Made with ❤️ by the xshopai team

</div>
