#!/usr/bin/env python3
"""
xshopai Database Seeder
Seeds users, products, and inventory data for demo purposes.
Can also clear all databases for a clean slate.

Usage:
    python seed.py                  # Seed all data
    python seed.py --users          # Seed users only
    python seed.py --products       # Seed products only
    python seed.py --inventory      # Seed inventory only
    python seed.py --clear          # Clear ALL databases (clean slate)
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

# Load environment variables
try:
    from dotenv import load_dotenv
    # Load .env.dev first (development), then .env (production fallback)
    env_path = Path(__file__).parent / '.env.dev'
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()  # Falls back to .env
except ImportError:
    pass


def generate_variant_sku(base_sku: str, color: str = None, size: str = None) -> str:
    """Generate variant SKU from base SKU, color, and size.
    
    Example: "WOM-CLO-TOP-001" + "Black" + "M" -> "WOM-CLO-TOP-001-BLACK-M"
    """
    import re
    variant_sku = base_sku
    if color:
        # Remove non-alphanumeric characters and uppercase
        clean_color = re.sub(r'[^A-Z0-9]', '', color.upper())
        variant_sku += f"-{clean_color}"
    if size:
        clean_size = re.sub(r'[^A-Z0-9]', '', size.upper())
        variant_sku += f"-{clean_size}"
    return variant_sku


def generate_variants(base_sku: str, colors: list, sizes: list) -> list:
    """Generate all variant SKUs for color/size combinations."""
    variants = []
    for color in colors:
        for size in sizes:
            variants.append({
                'sku': generate_variant_sku(base_sku, color, size),
                'color': color,
                'size': size
            })
    return variants


def get_data_path(filename: str) -> Path:
    """Get path to data file."""
    return Path(__file__).parent / "data" / filename


def load_json(filename: str) -> list:
    """Load JSON data from file."""
    path = get_data_path(filename)
    if not path.exists():
        print(f"❌ Error: Data file not found: {path}")
        sys.exit(1)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(10)).decode('utf-8')
    except ImportError:
        print("⚠️  bcrypt not available, using pre-computed hashes")
        # Pre-computed bcrypt hashes for demo passwords
        hashes = {
            'guest': '$2b$10$rG4Xf6YZ8vq2X5K1MnOpAeW3LmBpZ7Y8N9QwRsT4UvW5XyZ6A1B2C',
            'admin': '$2b$10$xH5Yg7AB9wq3Z6L2NoQrBeX4MnCqA8Z9O0RxStU5VwX6YzA7B2C3D',
        }
        return hashes.get(password, hashes['guest'])


# =============================================================================
# DATABASE CLEARING FUNCTIONS
# =============================================================================

def clear_mongodb(url: str, db_name: str, service_name: str):
    """Clear all collections in a MongoDB database."""
    try:
        from pymongo import MongoClient
    except ImportError:
        print(f"  ⚠️  pymongo not installed, skipping {service_name}")
        return False
    
    try:
        client = MongoClient(url, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        
        # Parse database name from URL if not provided
        if not db_name:
            db_name = url.split('/')[-1].split('?')[0]
        
        db = client[db_name]
        collections = db.list_collection_names()
        
        total_deleted = 0
        for collection_name in collections:
            # Skip system collections
            if collection_name.startswith('system.'):
                continue
            result = db[collection_name].delete_many({})
            total_deleted += result.deleted_count
        
        client.close()
        print(f"  ✅ {service_name}: Cleared {total_deleted} documents from {len(collections)} collections")
        return True
        
    except Exception as e:
        print(f"  ❌ {service_name}: Failed to clear - {e}")
        return False


def clear_postgres(host: str, port: int, user: str, password: str, database: str, service_name: str):
    """Clear all tables in a PostgreSQL database."""
    try:
        import psycopg2
    except ImportError:
        print(f"  ⚠️  psycopg2 not installed, skipping {service_name}")
        return False
    
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database
        )
        cursor = conn.cursor()
        
        # Get all table names (excluding system tables and alembic_version)
        cursor.execute("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public' AND tablename != 'alembic_version'
        """)
        tables = [row[0] for row in cursor.fetchall()]
        
        # Disable FK constraints and truncate all tables
        cursor.execute("SET session_replication_role = 'replica';")
        for table in tables:
            cursor.execute(f'TRUNCATE TABLE "{table}" CASCADE;')
        cursor.execute("SET session_replication_role = 'origin';")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"  ✅ {service_name}: Cleared {len(tables)} tables")
        return True
        
    except Exception as e:
        print(f"  ❌ {service_name}: Failed to clear - {e}")
        return False


def clear_mysql(host: str, port: int, user: str, password: str, database: str, service_name: str):
    """Clear all tables in a MySQL database."""
    try:
        import mysql.connector
    except ImportError:
        print(f"  ⚠️  mysql-connector-python not installed, skipping {service_name}")
        return False
    
    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database
        )
        cursor = conn.cursor()
        
        # Get all table names (excluding alembic_version)
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = %s AND table_name != 'alembic_version'
        """, (database,))
        tables = [row[0] for row in cursor.fetchall()]
        
        # Disable FK constraints and delete from all tables
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
        for table in tables:
            cursor.execute(f"TRUNCATE TABLE `{table}`;")
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"  ✅ {service_name}: Cleared {len(tables)} tables")
        return True
        
    except Exception as e:
        print(f"  ❌ {service_name}: Failed to clear - {e}")
        return False


def clear_sqlserver(host: str, port: int, user: str, password: str, database: str, service_name: str):
    """Clear all tables in a SQL Server database using pymssql."""
    try:
        import pymssql
    except ImportError:
        print(f"  ⚠️  pymssql not installed, skipping {service_name}")
        return False
    
    try:
        # First connect to master to check if database exists
        master_conn = pymssql.connect(
            server=host,
            port=port,
            user=user,
            password=password,
            database='master'
        )
        cursor = master_conn.cursor()
        cursor.execute(f"SELECT name FROM sys.databases WHERE name = '{database}'")
        db_exists = cursor.fetchone() is not None
        cursor.close()
        master_conn.close()
        
        if not db_exists:
            print(f"  ⏭️  {service_name}: Database '{database}' does not exist (nothing to clear)")
            return True  # Consider this a success - nothing to clear
        
        # Now connect to the actual database and clear it
        conn = pymssql.connect(
            server=host,
            port=port,
            user=user,
            password=password,
            database=database
        )
        cursor = conn.cursor()
        
        # Get all user tables (excluding system tables and __EFMigrations)
        cursor.execute("""
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' 
            AND TABLE_NAME != '__EFMigrationsHistory'
            AND TABLE_SCHEMA = 'dbo'
        """)
        tables = [row[0] for row in cursor.fetchall()]
        
        # Disable FK constraints and delete from all tables
        for table in tables:
            cursor.execute(f"ALTER TABLE [{table}] NOCHECK CONSTRAINT ALL;")
        
        for table in tables:
            cursor.execute(f"DELETE FROM [{table}];")
        
        for table in tables:
            cursor.execute(f"ALTER TABLE [{table}] CHECK CONSTRAINT ALL;")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"  ✅ {service_name}: Cleared {len(tables)} tables")
        return True
        
    except Exception as e:
        print(f"  ❌ {service_name}: Failed to clear - {e}")
        return False


def clear_all_databases():
    """Clear all databases across all services for a clean slate."""
    print("=" * 60)
    print("🧹 Clearing ALL Databases")
    print("=" * 60)
    print()
    
    results = []
    
    # MongoDB Services
    print("🍃 MongoDB Databases:")
    
    # User Service MongoDB
    user_url = os.environ.get('USER_MONGODB_URI', 
        'mongodb://admin:admin123@localhost:27018/user_service_db?authSource=admin')
    results.append(('user-service', clear_mongodb(user_url, 'user_service_db', 'user-service')))
    
    # Product Service MongoDB
    product_url = os.environ.get('PRODUCT_MONGODB_URI',
        'mongodb://admin:admin123@localhost:27019/product_service_db?authSource=admin')
    results.append(('product-service', clear_mongodb(product_url, 'product_service_db', 'product-service')))
    
    # Review Service MongoDB
    review_url = os.environ.get('REVIEW_MONGODB_URI',
        'mongodb://admin:admin123@localhost:27020/review_service_db?authSource=admin')
    results.append(('review-service', clear_mongodb(review_url, 'review_service_db', 'review-service')))
    
    print()
    
    # PostgreSQL Services
    print("🐘 PostgreSQL Databases:")
    
    # Audit Service PostgreSQL (matches audit-service env vars)
    results.append(('audit-service', clear_postgres(
        host=os.environ.get('POSTGRES_HOST', 'localhost'),
        port=int(os.environ.get('POSTGRES_PORT', 5434)),
        user=os.environ.get('POSTGRES_USER', 'admin'),
        password=os.environ.get('POSTGRES_PASSWORD', 'admin123'),
        database=os.environ.get('POSTGRES_DB', 'audit_service_db'),
        service_name='audit-service'
    )))
    
    print()
    
    # MySQL Services
    print("🐬 MySQL Databases:")
    
    # Inventory Service MySQL (matches inventory-service env vars)
    # Parse MYSQL_SERVER_CONNECTION format: mysql+pymysql://user:pass@host:port
    mysql_conn = os.environ.get('MYSQL_SERVER_CONNECTION', 'mysql+pymysql://admin:admin123@localhost:3306')
    db_name = os.environ.get('INVENTORY_DB_NAME', 'inventory_service_db')
    
    try:
        # Parse: mysql+pymysql://user:pass@host:port
        conn_parts = mysql_conn.replace('mysql+pymysql://', '').replace('mysql://', '').split('@')
        user_pass = conn_parts[0].split(':')
        host_port = conn_parts[1].split(':')
        
        results.append(('inventory-service', clear_mysql(
            host=host_port[0],
            port=int(host_port[1]) if len(host_port) > 1 else 3306,
            user=user_pass[0],
            password=user_pass[1] if len(user_pass) > 1 else '',
            database=db_name,
            service_name='inventory-service'
        )))
    except Exception as e:
        print(f"  ❌ inventory-service: Failed to parse connection string - {e}")
        results.append(('inventory-service', False))
    
    print()
    
    # SQL Server Services
    print("🗄️  SQL Server Databases:")
    
    # Order Service SQL Server
    results.append(('order-service', clear_sqlserver(
        host=os.environ.get('ORDER_SQLSERVER_HOST', 'localhost'),
        port=int(os.environ.get('ORDER_SQLSERVER_PORT', 1434)),
        user=os.environ.get('ORDER_SQLSERVER_USER', 'sa'),
        password=os.environ.get('ORDER_SQLSERVER_PASSWORD', 'Admin123!'),
        database=os.environ.get('ORDER_SQLSERVER_DB', 'order_service_db'),
        service_name='order-service'
    )))
    
    # Payment Service SQL Server
    results.append(('payment-service', clear_sqlserver(
        host=os.environ.get('PAYMENT_SQLSERVER_HOST', 'localhost'),
        port=int(os.environ.get('PAYMENT_SQLSERVER_PORT', 1433)),
        user=os.environ.get('PAYMENT_SQLSERVER_USER', 'sa'),
        password=os.environ.get('PAYMENT_SQLSERVER_PASSWORD', 'Admin123!'),
        database=os.environ.get('PAYMENT_SQLSERVER_DB', 'payment_service_db'),
        service_name='payment-service'
    )))
    
    print()
    
    return results


def seed_users():
    """Seed users into user-service MongoDB. Clears existing demo data first."""
    try:
        from pymongo import MongoClient
    except ImportError:
        print("❌ pymongo not installed. Run: pip install pymongo")
        return False

    # Connect to user-service MongoDB (uses USER_MONGODB_URI like the service uses MONGODB_URI)
    mongo_url = os.environ.get('USER_MONGODB_URI', 'mongodb://admin:admin123@localhost:27018/user_service_db?authSource=admin')
    print(f"📡 Connecting to user-service MongoDB...")
    
    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')  # Test connection
        
        # Parse database name from URL
        db_name = mongo_url.split('/')[-1].split('?')[0] or 'user-service'
        db = client[db_name]
        users_collection = db['users']
        
        # Clear demo users first
        users_data = load_json('users.json')
        demo_emails = [u['email'] for u in users_data]
        result = users_collection.delete_many({'email': {'$in': demo_emails}})
        if result.deleted_count:
            print(f"  🧹 Cleared {result.deleted_count} existing demo users")
        
        # Seed users
        seeded = 0
        
        for user in users_data:
            
            # Prepare user document
            user_doc = {
                **user,
                'password': hash_password(user['password']),
                'createdAt': datetime.now(timezone.utc),
                'updatedAt': datetime.now(timezone.utc),
                'createdBy': 'SEEDER',
            }
            
            users_collection.insert_one(user_doc)
            print(f"  ✅ Created user: {user['email']} ({', '.join(user['roles'])})")
            seeded += 1
        
        client.close()
        print(f"👤 Users: {seeded} seeded")
        return True
        
    except Exception as e:
        print(f"❌ Failed to seed users: {e}")
        return False


def seed_products():
    """Seed products into product-service MongoDB. Clears existing demo data first."""
    try:
        from pymongo import MongoClient
    except ImportError:
        print("❌ pymongo not installed. Run: pip install pymongo")
        return False

    # Connect to product-service MongoDB (uses PRODUCT_MONGODB_URI like the service uses MONGODB_URI)
    mongo_url = os.environ.get('PRODUCT_MONGODB_URI', 'mongodb://admin:admin123@localhost:27019/product_service_db?authSource=admin')
    print(f"📡 Connecting to product-service MongoDB...")
    
    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        
        db_name = mongo_url.split('/')[-1].split('?')[0] or 'product-service'
        db = client[db_name]
        products_collection = db['products']
        
        # Clear demo products first
        products_data = load_json('products.json')
        demo_skus = [p['sku'] for p in products_data]
        result = products_collection.delete_many({'sku': {'$in': demo_skus}})
        if result.deleted_count:
            print(f"  🧹 Cleared {result.deleted_count} existing demo products")
        
        # Seed products
        seeded = 0
        
        for product in products_data:
            
            # Get colors and sizes with defaults
            colors = product.get('colors', ['Black', 'White'])
            sizes = product.get('sizes', ['M', 'L'])
            base_sku = product['sku']
            
            # Generate variant SKUs for each color/size combination
            variants = generate_variants(base_sku, colors, sizes)
            
            # Transform to product-service schema (taxonomy nested object, snake_case)
            product_doc = {
                'name': product['name'],
                'description': product['description'],
                'price': product['price'],
                'brand': product.get('brand', ''),
                'sku': base_sku,
                'images': product.get('images', []),
                'tags': product.get('tags', []),
                'colors': colors,
                'sizes': sizes,
                'variants': variants,  # Pre-computed variant SKUs
                'specifications': product.get('specifications', {}),
                # Taxonomy as nested object (product-service schema)
                'taxonomy': {
                    'department': product.get('department', '').lower(),
                    'category': product.get('category', '').lower(),
                    'subcategory': product.get('subcategory', '').lower(),
                },
                # Use snake_case for product-service
                'is_active': True,
                'created_at': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc),
                'created_by': 'SEEDER',
                'history': [],
                'review_aggregates': {
                    'total_reviews': 0,
                    'average_rating': 0.0,
                    'rating_distribution': {'1': 0, '2': 0, '3': 0, '4': 0, '5': 0},
                    'verified_purchase_count': 0,
                },
            }
            
            products_collection.insert_one(product_doc)
            print(f"  ✅ Created product: {product['name'][:40]}...")
            seeded += 1
        
        client.close()
        print(f"📦 Products: {seeded} seeded")
        return True
        
    except Exception as e:
        print(f"❌ Failed to seed products: {e}")
        return False


def _ensure_inventory_schema(cursor, conn):
    """Create inventory-service tables if they don't exist.
    
    Mirrors the schema from inventory-service Alembic migration
    (migrations/versions/001_initial_schema.py) so the seed script
    can set up the database without running the inventory service.
    """
    cursor.execute("SHOW TABLES LIKE 'inventory_items'")
    if cursor.fetchone():
        print("  ✅ Schema already exists, skipping creation")
        return

    print("  🔨 Creating inventory schema (tables don't exist yet)...")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sku VARCHAR(100) NOT NULL,
            quantity_available INT NOT NULL DEFAULT 0,
            quantity_reserved INT NOT NULL DEFAULT 0,
            reorder_level INT NOT NULL DEFAULT 10,
            max_stock INT NOT NULL DEFAULT 1000,
            cost_per_unit DECIMAL(10,2) DEFAULT 0.00,
            last_restocked DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE INDEX ix_inventory_items_sku (sku)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            id VARCHAR(36) PRIMARY KEY,
            order_id VARCHAR(36) NOT NULL,
            sku VARCHAR(100) NOT NULL,
            quantity INT NOT NULL,
            status ENUM('PENDING','ACTIVE','CONFIRMED','RELEASED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
            expires_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX ix_reservations_order_id (order_id),
            INDEX ix_reservations_sku (sku),
            INDEX ix_reservations_status (status),
            INDEX ix_reservations_expires_at (expires_at),
            CONSTRAINT fk_reservations_sku FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_movements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sku VARCHAR(100) NOT NULL,
            movement_type ENUM('IN','OUT','RESERVED','RELEASED','ADJUSTMENT') NOT NULL,
            quantity INT NOT NULL,
            reference VARCHAR(255) NULL,
            reason TEXT NULL,
            created_by VARCHAR(100) NOT NULL DEFAULT 'system',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX ix_stock_movements_sku (sku),
            INDEX ix_stock_movements_type (movement_type),
            INDEX ix_stock_movements_reference (reference),
            INDEX ix_stock_movements_created_at (created_at),
            CONSTRAINT fk_stock_movements_sku FOREIGN KEY (sku) REFERENCES inventory_items(sku) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    # Create alembic_version table so Flask-Migrate doesn't re-run migrations
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alembic_version (
            version_num VARCHAR(32) NOT NULL,
            CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cursor.execute("""
        INSERT IGNORE INTO alembic_version (version_num) VALUES ('001_initial')
    """)

    conn.commit()
    print("  ✅ Schema created (inventory_items, reservations, stock_movements)")


def seed_inventory():
    """Seed inventory into inventory-service MySQL with variant SKUs.
    
    Clears existing demo data first.
    Distributes base quantity evenly across all color/size combinations.
    
    Automatically creates the required tables if they don't exist,
    so the inventory service doesn't need to be running.
    """
    try:
        import mysql.connector
    except ImportError:
        print("❌ mysql-connector-python not installed. Run: pip install mysql-connector-python")
        return False

    # Parse MySQL connection from environment (matches inventory-service format)
    # MYSQL_SERVER_CONNECTION=mysql+pymysql://user:pass@host:port
    # INVENTORY_DB_NAME=inventory_service_db
    mysql_conn = os.environ.get('MYSQL_SERVER_CONNECTION', 'mysql+pymysql://admin:admin123@localhost:3306')
    db_name = os.environ.get('INVENTORY_DB_NAME', 'inventory_service_db')
    
    # Parse connection string: mysql+pymysql://user:pass@host:port
    try:
        conn_str = mysql_conn.replace('mysql+pymysql://', '').replace('mysql://', '')
        parts = conn_str.split('@')
        user_pass = parts[0].split(':')
        host_port = parts[1].split(':')
        
        config = {
            'user': user_pass[0],
            'password': user_pass[1] if len(user_pass) > 1 else '',
            'host': host_port[0],
            'port': int(host_port[1]) if len(host_port) > 1 else 3306,
            'database': db_name,
        }
    except Exception as e:
        print(f"❌ Failed to parse database URL: {e}")
        print(f"   URL format expected: mysql+pymysql://user:pass@host:port")
        return False
    
    print(f"📡 Connecting to inventory-service MySQL ({config['host']}:{config['port']})...")
    
    try:
        conn = mysql.connector.connect(**config)
        cursor = conn.cursor()
        
        # Ensure schema exists (no need to run the inventory service)
        _ensure_inventory_schema(cursor, conn)
        
        # Load inventory and products data
        inventory_data = load_json('inventory.json')
        products_data = load_json('products.json')
        
        # Create a map of base SKU to product colors/sizes
        # Include products with colors OR sizes (not both required)
        product_map = {}
        for product in products_data:
            if product.get('sku'):
                colors = product.get('colors', [])
                sizes = product.get('sizes', [])
                # Only add to map if product has colors or sizes
                if colors or sizes:
                    product_map[product['sku']] = {
                        'colors': colors,
                        'sizes': sizes
                    }
        
        # Clear demo inventory first (base + variant SKUs)
        demo_skus = [item['sku'] for item in inventory_data]
        for base_sku in demo_skus:
            cursor.execute("DELETE FROM stock_movements WHERE sku = %s OR sku LIKE %s",
                          (base_sku, f"{base_sku}-%"))
            cursor.execute("DELETE FROM reservations WHERE sku = %s OR sku LIKE %s",
                          (base_sku, f"{base_sku}-%"))
            cursor.execute("DELETE FROM inventory_items WHERE sku = %s OR sku LIKE %s", 
                          (base_sku, f"{base_sku}-%"))
        conn.commit()
        print(f"  🧹 Cleared existing demo inventory items (base + variants)")
        
        # Seed inventory with variant SKUs
        seeded = 0
        variant_count = 0
        
        for item in inventory_data:
            base_sku = item['sku']
            product = product_map.get(base_sku)
            
            has_colors = product and len(product['colors']) > 0
            has_sizes = product and len(product['sizes']) > 0
            
            # Case 1: Product has BOTH colors AND sizes - create color-size variants
            if has_colors and has_sizes:
                colors = product['colors']
                sizes = product['sizes']
                total_variants = len(colors) * len(sizes)
                
                # Distribute base quantity evenly across variants
                quantity_per_variant = max(1, item['quantity_available'] // total_variants)
                extra_quantity = item['quantity_available'] % total_variants
                
                variant_index = 0
                for color in colors:
                    for size in sizes:
                        # Generate variant SKU: BASE-COLOR-SIZE (uppercase, spaces to hyphens)
                        color_code = color.upper().replace(' ', '-')
                        size_code = size.upper()
                        variant_sku = f"{base_sku}-{color_code}-{size_code}"
                        
                        # Add extra quantity to first variants to avoid losing items
                        quantity = quantity_per_variant + (1 if variant_index < extra_quantity else 0)
                        
                        # Insert variant inventory item
                        cursor.execute("""
                            INSERT INTO inventory_items 
                            (sku, quantity_available, quantity_reserved, reorder_level, max_stock, cost_per_unit, created_at, updated_at)
                            VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                        """, (
                            variant_sku,
                            quantity,
                            0,
                            max(1, item['reorder_level'] // total_variants),
                            max(10, item['max_stock'] // total_variants),
                            item['cost_per_unit'],
                        ))
                        
                        variant_count += 1
                        variant_index += 1
                
                print(f"  ✅ Created {len(colors) * len(sizes)} variants for: {base_sku}")
                seeded += 1
            
            # Case 2: Product has sizes but NO colors (e.g., Books with Paperback/Hardcover/Audiobook)
            elif has_sizes and not has_colors:
                sizes = product['sizes']
                total_variants = len(sizes)
                
                # Distribute base quantity evenly across variants
                quantity_per_variant = max(1, item['quantity_available'] // total_variants)
                extra_quantity = item['quantity_available'] % total_variants
                
                for idx, size in enumerate(sizes):
                    # Generate variant SKU: BASE-SIZE (uppercase)
                    size_code = size.upper().replace(' ', '-')
                    variant_sku = f"{base_sku}-{size_code}"
                    
                    quantity = quantity_per_variant + (1 if idx < extra_quantity else 0)
                    
                    cursor.execute("""
                        INSERT INTO inventory_items 
                        (sku, quantity_available, quantity_reserved, reorder_level, max_stock, cost_per_unit, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                    """, (
                        variant_sku,
                        quantity,
                        0,
                        max(1, item['reorder_level'] // total_variants),
                        max(10, item['max_stock'] // total_variants),
                        item['cost_per_unit'],
                    ))
                    variant_count += 1
                
                print(f"  ✅ Created {len(sizes)} size variants for: {base_sku}")
                seeded += 1
            
            # Case 3: Product has colors but NO sizes
            elif has_colors and not has_sizes:
                colors = product['colors']
                total_variants = len(colors)
                
                quantity_per_variant = max(1, item['quantity_available'] // total_variants)
                extra_quantity = item['quantity_available'] % total_variants
                
                for idx, color in enumerate(colors):
                    color_code = color.upper().replace(' ', '-')
                    variant_sku = f"{base_sku}-{color_code}"
                    
                    quantity = quantity_per_variant + (1 if idx < extra_quantity else 0)
                    
                    cursor.execute("""
                        INSERT INTO inventory_items 
                        (sku, quantity_available, quantity_reserved, reorder_level, max_stock, cost_per_unit, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                    """, (
                        variant_sku,
                        quantity,
                        0,
                        max(1, item['reorder_level'] // total_variants),
                        max(10, item['max_stock'] // total_variants),
                        item['cost_per_unit'],
                    ))
                    variant_count += 1
                
                print(f"  ✅ Created {len(colors)} color variants for: {base_sku}")
                seeded += 1
            
            else:
                # Case 4: No colors/sizes - create base SKU inventory only
                cursor.execute("""
                    INSERT INTO inventory_items 
                    (sku, quantity_available, quantity_reserved, reorder_level, max_stock, cost_per_unit, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
                """, (
                    base_sku,
                    item['quantity_available'],
                    item['quantity_reserved'],
                    item['reorder_level'],
                    item['max_stock'],
                    item['cost_per_unit'],
                ))
                print(f"  ✅ Created inventory: {base_sku} (qty: {item['quantity_available']})")
                seeded += 1
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"📊 Inventory: {seeded} products seeded, {variant_count} variant SKUs created")
        return True
        
    except mysql.connector.Error as e:
        print(f"❌ Failed to seed inventory: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='xshopai Database Seeder')
    parser.add_argument('--users', action='store_true', help='Seed users only')
    parser.add_argument('--products', action='store_true', help='Seed products only')
    parser.add_argument('--inventory', action='store_true', help='Seed inventory only')
    parser.add_argument('--clear', action='store_true', help='Clear ALL databases (clean slate)')
    args = parser.parse_args()
    
    # If --clear flag is set, clear all databases and exit
    if args.clear:
        results = clear_all_databases()
        
        # Summary
        print("=" * 60)
        print("📋 Clear Summary:")
        success_count = sum(1 for _, success in results if success)
        fail_count = sum(1 for _, success in results if not success)
        for name, success in results:
            status = "✅ Cleared" if success else "❌ Failed/Skipped"
            print(f"   {name}: {status}")
        print("=" * 60)
        print()
        print(f"🧹 {success_count} databases cleared, {fail_count} failed/skipped")
        print()
        sys.exit(0 if fail_count == 0 else 1)
    
    # If no specific target, seed all
    seed_all = not (args.users or args.products or args.inventory)
    
    print("=" * 60)
    print("🌱 xshopai Database Seeder")
    print("=" * 60)
    print()
    
    results = []
    
    if seed_all or args.users:
        print("🔹 Seeding Users...")
        results.append(('Users', seed_users()))
        print()
    
    if seed_all or args.products:
        print("🔹 Seeding Products...")
        results.append(('Products', seed_products()))
        print()
    
    if seed_all or args.inventory:
        print("🔹 Seeding Inventory...")
        results.append(('Inventory', seed_inventory()))
        print()
    
    # Summary
    print("=" * 60)
    print("📋 Summary:")
    all_success = True
    for name, success in results:
        status = "✅ Success" if success else "❌ Failed"
        print(f"   {name}: {status}")
        if not success:
            all_success = False
    print("=" * 60)
    
    if all_success:
        print()
        print("🎉 Seeding complete! Demo credentials:")
        print("   👤 Customer: guest@xshopai.com / Guest123!")
        print("   👑 Admin:    admin@xshopai.com / Admin123!")
        print()
    
    sys.exit(0 if all_success else 1)


if __name__ == '__main__':
    main()
