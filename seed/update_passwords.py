#!/usr/bin/env python3
"""Update user passwords in database"""

import os
from pymongo import MongoClient
import bcrypt

# Connect to MongoDB (with authentication)
MONGODB_URI = os.environ.get('USER_SERVICE_DATABASE_URL', 'mongodb://admin:admin123@localhost:27018/user_service_db?authSource=admin')
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)

# Parse database name from URL
db_name = MONGODB_URI.split('/')[-1].split('?')[0] or 'user-service'
db = client[db_name]
users_collection = db['users']

# Hash the new passwords
guest_password = bcrypt.hashpw('Guest123!'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
admin_password = bcrypt.hashpw('Admin123!'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Update guest user
result1 = users_collection.update_one(
    {'email': 'guest@xshopai.com'},
    {'$set': {'password': guest_password}}
)
print(f"✅ Updated guest user password: {result1.modified_count} document(s)")

# Update admin user
result2 = users_collection.update_one(
    {'email': 'admin@xshopai.com'},
    {'$set': {'password': admin_password}}
)
print(f"✅ Updated admin user password: {result2.modified_count} document(s)")

print(f"\n🎉 Password update complete!")
print(f"   👤 Customer: guest@xshopai.com / Guest123!")
print(f"   👑 Admin:    admin@xshopai.com / Admin123!")

client.close()
