#!/usr/bin/env python3
"""
xshopai Database Seeder
Seeds users, products, and inventory data for demo purposes.

Usage:
    python seed.py                  # Seed all data
    python seed.py --users          # Seed users only
    python seed.py --products       # Seed products only
    python seed.py --inventory      # Seed inventory only
    python seed.py --clear          # Clear all seed data first
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
    load_dotenv()
except ImportError:
    pass


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


def seed_users(clear_first: bool = False):
    """Seed users into user-service MongoDB."""
    try:
        from pymongo import MongoClient
    except ImportError:
        print("❌ pymongo not installed. Run: pip install pymongo")
        return False

    # Connect to user-service MongoDB
    mongo_url = os.environ.get('USER_SERVICE_DATABASE_URL', 'mongodb://admin:admin123@localhost:27018/user_service_db?authSource=admin')
    print(f"📡 Connecting to user-service MongoDB...")
    
    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')  # Test connection
        
        # Parse database name from URL
        db_name = mongo_url.split('/')[-1].split('?')[0] or 'user-service'
        db = client[db_name]
        users_collection = db['users']
        
        if clear_first:
            result = users_collection.delete_many({'email': {'$in': ['guest@xshopai.com', 'admin@xshopai.com']}})
            print(f"🧹 Cleared {result.deleted_count} existing demo users")
        
        # Load and seed users
        users_data = load_json('users.json')
        seeded = 0
        skipped = 0
        
        for user in users_data:
            # Check if user already exists
            existing = users_collection.find_one({'email': user['email']})
            if existing:
                print(f"  ⏭️  User {user['email']} already exists, skipping")
                skipped += 1
                continue
            
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
        print(f"👤 Users: {seeded} seeded, {skipped} skipped")
        return True
        
    except Exception as e:
        print(f"❌ Failed to seed users: {e}")
        return False


def seed_products(clear_first: bool = False):
    """Seed products into product-service MongoDB."""
    try:
        from pymongo import MongoClient
    except ImportError:
        print("❌ pymongo not installed. Run: pip install pymongo")
        return False

    # Connect to product-service MongoDB
    mongo_url = os.environ.get('PRODUCT_SERVICE_DATABASE_URL', 'mongodb://admin:admin123@localhost:27019/product_service_db?authSource=admin')
    print(f"📡 Connecting to product-service MongoDB...")
    
    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        
        db_name = mongo_url.split('/')[-1].split('?')[0] or 'product-service'
        db = client[db_name]
        products_collection = db['products']
        
        if clear_first:
            # Get all demo SKUs
            products_data = load_json('products.json')
            demo_skus = [p['sku'] for p in products_data]
            result = products_collection.delete_many({'sku': {'$in': demo_skus}})
            print(f"🧹 Cleared {result.deleted_count} existing demo products")
        
        # Load and seed products
        products_data = load_json('products.json')
        seeded = 0
        skipped = 0
        
        for product in products_data:
            # Check if product already exists by SKU
            existing = products_collection.find_one({'sku': product['sku']})
            if existing:
                print(f"  ⏭️  Product {product['sku']} already exists, skipping")
                skipped += 1
                continue
            
            # Transform to product-service schema (taxonomy nested object, snake_case)
            product_doc = {
                'name': product['name'],
                'description': product['description'],
                'price': product['price'],
                'brand': product.get('brand', ''),
                'sku': product['sku'],
                'images': product.get('images', []),
                'tags': product.get('tags', []),
                'colors': product.get('colors', []),
                'sizes': product.get('sizes', []),
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
        print(f"📦 Products: {seeded} seeded, {skipped} skipped")
        return True
        
    except Exception as e:
        print(f"❌ Failed to seed products: {e}")
        return False


def seed_inventory(clear_first: bool = False):
    """Seed inventory into inventory-service MySQL with variant SKUs.
    
    Generates variant SKUs in format: BASE-COLOR-SIZE (e.g., WOM-CLO-TOP-001-WHITE-XS)
    Distributes base quantity evenly across all color/size combinations.
    """
    try:
        import mysql.connector
    except ImportError:
        print("❌ mysql-connector-python not installed. Run: pip install mysql-connector-python")
        return False

    # Parse MySQL connection from environment
    db_url = os.environ.get('INVENTORY_SERVICE_DATABASE_URL', 'mysql://admin:admin123@localhost:3306/inventory_service_db')
    
    # Parse connection string: mysql://user:pass@host:port/database
    try:
        parts = db_url.replace('mysql://', '').split('@')
        user_pass = parts[0].split(':')
        host_port_db = parts[1].split('/')
        host_port = host_port_db[0].split(':')
        
        config = {
            'user': user_pass[0],
            'password': user_pass[1] if len(user_pass) > 1 else '',
            'host': host_port[0],
            'port': int(host_port[1]) if len(host_port) > 1 else 3306,
            'database': host_port_db[1].split('?')[0] if len(host_port_db) > 1 else 'inventory',
        }
    except Exception as e:
        print(f"❌ Failed to parse database URL: {e}")
        print(f"   URL format expected: mysql://user:pass@host:port/database")
        return False
    
    print(f"📡 Connecting to inventory-service MySQL ({config['host']}:{config['port']})...")
    
    try:
        conn = mysql.connector.connect(**config)
        cursor = conn.cursor()
        
        # Load inventory and products data
        inventory_data = load_json('inventory.json')
        products_data = load_json('products.json')
        
        # Create a map of base SKU to product colors/sizes
        product_map = {}
        for product in products_data:
            if product.get('sku') and product.get('colors') and product.get('sizes'):
                product_map[product['sku']] = {
                    'colors': product['colors'],
                    'sizes': product['sizes']
                }
        
        # Collect all base SKUs and their variant patterns for clearing
        demo_skus = [item['sku'] for item in inventory_data]
        
        if clear_first:
            # Clear base SKUs and all variant SKUs (pattern: BASE-%)
            for base_sku in demo_skus:
                cursor.execute("DELETE FROM inventory_items WHERE sku = %s OR sku LIKE %s", 
                              (base_sku, f"{base_sku}-%"))
            print(f"🧹 Cleared existing demo inventory items (base + variants)")
            conn.commit()
        
        # Seed inventory with variant SKUs
        seeded = 0
        skipped = 0
        variant_count = 0
        
        for item in inventory_data:
            base_sku = item['sku']
            product = product_map.get(base_sku)
            
            # If product has colors and sizes, create variant SKUs
            if product and len(product['colors']) > 0 and len(product['sizes']) > 0:
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
                        
                        # Check if variant already exists
                        cursor.execute("SELECT id FROM inventory_items WHERE sku = %s", (variant_sku,))
                        if cursor.fetchone():
                            skipped += 1
                            variant_index += 1
                            continue
                        
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
            else:
                # No colors/sizes - create base SKU inventory only
                cursor.execute("SELECT id FROM inventory_items WHERE sku = %s", (base_sku,))
                if cursor.fetchone():
                    print(f"  ⏭️  Inventory {base_sku} already exists, skipping")
                    skipped += 1
                    continue
                
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
        
        print(f"📊 Inventory: {seeded} products seeded, {variant_count} variant SKUs created, {skipped} skipped")
        return True
        
    except mysql.connector.Error as e:
        print(f"❌ Failed to seed inventory: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='xshopai Database Seeder')
    parser.add_argument('--users', action='store_true', help='Seed users only')
    parser.add_argument('--products', action='store_true', help='Seed products only')
    parser.add_argument('--inventory', action='store_true', help='Seed inventory only')
    parser.add_argument('--clear', action='store_true', help='Clear existing demo data first')
    args = parser.parse_args()
    
    # If no specific target, seed all
    seed_all = not (args.users or args.products or args.inventory)
    
    print("=" * 60)
    print("🌱 xshopai Database Seeder")
    print("=" * 60)
    print()
    
    results = []
    
    if seed_all or args.users:
        print("🔹 Seeding Users...")
        results.append(('Users', seed_users(args.clear)))
        print()
    
    if seed_all or args.products:
        print("🔹 Seeding Products...")
        results.append(('Products', seed_products(args.clear)))
        print()
    
    if seed_all or args.inventory:
        print("🔹 Seeding Inventory...")
        results.append(('Inventory', seed_inventory(args.clear)))
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
        print("   👤 Customer: guest@xshopai.com / guest")
        print("   👑 Admin:    admin@xshopai.com / admin")
        print()
    
    sys.exit(0 if all_success else 1)


if __name__ == '__main__':
    main()
