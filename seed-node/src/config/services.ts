import { MongoConfig } from '../connectors/mongodb.js';
import { PostgresConfig } from '../connectors/postgres.js';

export interface ServiceConfig {
  name: string;
  type: 'mongodb' | 'postgresql' | 'sqlserver' | 'mysql' | 'redis';
  config: MongoConfig | PostgresConfig;
  collections?: string[]; // For MongoDB
  tables?: string[]; // For SQL databases
  seedOrder: number; // Order in which to seed (1 = first)
  dependencies?: string[]; // Services that must be seeded first
}

/**
 * Build service configs lazily (reads env vars at call time, not import time)
 */
function buildServiceConfigs(): Record<string, ServiceConfig> {
  return {
    'auth-service': {
      name: 'auth-service',
      type: 'mongodb',
      seedOrder: 1,
      config: {
        connectionUrl: process.env.AUTH_SERVICE_DATABASE_URL,
      },
      collections: ['users', 'sessions', 'refresh_tokens'],
    },

    'user-service': {
      name: 'user-service',
      type: 'mongodb',
      seedOrder: 2,
      config: {
        connectionUrl: process.env.USER_SERVICE_DATABASE_URL,
      },
      collections: ['users', 'user_profiles', 'user_preferences'],
    },

    'product-service': {
      name: 'product-service',
      type: 'mongodb',
      seedOrder: 3,
      // No dependencies - products seed directly from products.json
      config: {
        connectionUrl: process.env.PRODUCT_SERVICE_DATABASE_URL,
      },
      collections: ['products', 'categories', 'product_reviews'],
    },

    'inventory-service': {
      name: 'inventory-service',
      type: 'mysql',
      seedOrder: 4,
      // No dependencies - inventory seeds directly from inventory.json
      config: {
        connectionUrl: process.env.INVENTORY_SERVICE_DATABASE_URL,
      },
      tables: ['inventory_items', 'stock_movements', 'reservations'],
    },

    'review-service': {
      name: 'review-service',
      type: 'mongodb',
      seedOrder: 5,
      dependencies: ['user-service', 'product-service'],
      config: {
        connectionUrl: process.env.REVIEW_SERVICE_DATABASE_URL,
      },
      collections: ['reviews', 'product_ratings', 'review_flags'],
    },

    'order-service': {
      name: 'order-service',
      type: 'sqlserver',
      seedOrder: 6,
      dependencies: ['user-service', 'product-service'],
      config: {
        connectionUrl: process.env.ORDER_SERVICE_DATABASE_URL,
      },
      tables: ['Orders', 'OrderItems', 'OrderStatusHistory'],
    },

    'audit-service': {
      name: 'audit-service',
      type: 'postgresql',
      seedOrder: 7,
      dependencies: ['user-service'],
      config: {
        connectionUrl: process.env.AUDIT_SERVICE_DATABASE_URL,
      },
      tables: ['audit_logs', 'audit_events'],
    },
  };
}

/**
 * Get services in seeding order
 */
export function getServicesInOrder(): ServiceConfig[] {
  return Object.values(buildServiceConfigs()).sort((a, b) => a.seedOrder - b.seedOrder);
}

/**
 * Get service configuration by name
 */
export function getServiceConfig(serviceName: string): ServiceConfig | undefined {
  return buildServiceConfigs()[serviceName];
}

/**
 * Validate dependencies are met
 */
export function validateDependencies(serviceName: string, seededServices: string[]): boolean {
  const config = getServiceConfig(serviceName);
  if (!config || !config.dependencies) return true;

  return config.dependencies.every((dep) => seededServices.includes(dep));
}

/**
 * Get all MongoDB services
 */
export function getMongoServices(): ServiceConfig[] {
  return Object.values(buildServiceConfigs()).filter((service) => service.type === 'mongodb');
}

/**
 * Get all PostgreSQL services
 */
export function getPostgresServices(): ServiceConfig[] {
  return Object.values(buildServiceConfigs()).filter((service) => service.type === 'postgresql');
}
