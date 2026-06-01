#!/bin/bash
set -e

echo "========================================"
echo "Initializing SecureCommerce Database"
echo "========================================"

# Wait for MongoDB to be ready
until mongosh --eval "print('MongoDB connection successful')" &>/dev/null; do
  echo "Waiting for MongoDB to start..."
  sleep 2
done

echo "MongoDB is ready!"

# Initialize database
mongosh <<EOF
use secure_commerce

// Create indexes for security-critical collections
db.createCollection("auditlogs")
db.createCollection("threatalerts")
db.createCollection("fraudalerts")
db.createCollection("users")
db.createCollection("products")
db.createCollection("categories")
db.createCollection("carts")
db.createCollection("orders")

// Create indexes
db.auditlogs.createIndex({ "timestamp": -1 })
db.auditlogs.createIndex({ "userId": 1, "timestamp": -1 })
db.auditlogs.createIndex({ "action": 1, "timestamp": -1 })
db.auditlogs.createIndex({ "severity": 1, "timestamp": -1 })
db.auditlogs.createIndex({ "ip": 1, "timestamp": -1 })

db.threatalerts.createIndex({ "severity": 1, "isResolved": 1 })
db.threatalerts.createIndex({ "createdAt": -1 })

db.fraudalerts.createIndex({ "riskScore": -1 })
db.fraudalerts.createIndex({ "status": 1, "createdAt": -1 })

db.users.createIndex({ "email": 1 }, { unique: true })
db.users.createIndex({ "role": 1 })

db.products.createIndex({ "name": "text", "description": "text", "tags": "text" })
db.products.createIndex({ "categoryId": 1 })

db.orders.createIndex({ "userId": 1, "createdAt": -1 })
db.orders.createIndex({ "status": 1 })
db.orders.createIndex({ "createdAt": -1 })

print("Database initialization complete!")

// Create TTL indexes
db.carts.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 })
db.auditlogs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 7776000 }) // 90 days

print("TTL indexes created!")
EOF

echo "========================================"
echo "Database initialization complete!"
echo "========================================"