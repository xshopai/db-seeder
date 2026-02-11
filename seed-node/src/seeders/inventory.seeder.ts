import { BaseSeeder, SeederOptions } from './base.seeder.js';
import { ServiceConfig } from '../config/services.js';
import { MySQLConnector } from '../connectors/mysql.js';
import { logger } from '../utils/logger.js';

export interface InventoryItem {
  sku: string;
  quantity_available: number;
  quantity_reserved: number;
  reorder_level: number;
  max_stock: number;
  cost_per_unit: number;
  last_restocked: Date;
}

export class InventorySeeder extends BaseSeeder {
  protected mysqlConnector!: MySQLConnector;

  constructor(serviceConfig: ServiceConfig) {
    super('inventory-service', serviceConfig);
  }

  /**
   * Initialize database connections
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Inventory Service database connections...');

    // Connect to inventory MySQL database
    this.mysqlConnector = new MySQLConnector(this.serviceConfig.config as any);
    await this.mysqlConnector.connect();

    logger.success('✅ Database connections established');
  }

  /**
   * Clear existing inventory data
   */
  async clear(): Promise<void> {
    logger.info('🧹 Clearing existing inventory data...');

    const tables = ['reservations', 'stock_movements', 'inventory_items'];

    for (const table of tables) {
      try {
        await this.mysqlConnector.query(`DELETE FROM ${table}`);
        logger.success(`  ✓ Cleared ${table}`);
      } catch (error) {
        logger.warn(`  ⚠ Could not clear ${table} (may not exist)`);
      }
    }
  }

  /**
   * Seed inventory data with variant SKUs based on products.json colors and sizes
   */
  async seed(options?: SeederOptions): Promise<any> {
    logger.info('🌱 Seeding inventory data with variant SKUs...');

    // Load inventory data and products data from JSON files
    const { readFile } = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const inventoryDataPath = join(__dirname, '../data/inventory.json');
    const productsDataPath = join(__dirname, '../data/products.json');

    const inventoryData = JSON.parse(await readFile(inventoryDataPath, 'utf-8'));
    const productsData = JSON.parse(await readFile(productsDataPath, 'utf-8'));

    // Create a map of base SKU to product info (colors, sizes)
    const productMap = new Map<string, { colors: string[]; sizes: string[] }>();
    for (const product of productsData) {
      if (product.sku && product.colors && product.sizes) {
        productMap.set(product.sku, {
          colors: product.colors,
          sizes: product.sizes,
        });
      }
    }

    logger.info(`📁 Loaded ${inventoryData.length} base inventory items from JSON`);
    logger.info(`📁 Loaded ${productsData.length} products with color/size variants`);

    let insertedCount = 0;
    let skippedCount = 0;
    let variantCount = 0;

    for (const item of inventoryData) {
      const baseSku = item.sku;
      const product = productMap.get(baseSku);

      // If product has colors and sizes, create variant SKUs
      if (product && product.colors.length > 0 && product.sizes.length > 0) {
        const totalVariants = product.colors.length * product.sizes.length;
        // Distribute base quantity evenly across variants
        const quantityPerVariant = Math.floor(item.quantity_available / totalVariants);
        const extraQuantity = item.quantity_available % totalVariants;

        let variantIndex = 0;
        for (const color of product.colors) {
          for (const size of product.sizes) {
            // Generate variant SKU: BASE-COLOR-SIZE (uppercase, spaces replaced with hyphens)
            const colorCode = color.toUpperCase().replace(/\s+/g, '-');
            const sizeCode = size.toUpperCase();
            const variantSku = `${baseSku}-${colorCode}-${sizeCode}`;

            // Check if variant already exists
            const existingResult = await this.mysqlConnector.query('SELECT id FROM inventory_items WHERE sku = ?', [
              variantSku,
            ]);
            if (existingResult.length > 0) {
              skippedCount++;
              variantIndex++;
              continue;
            }

            // Add extra quantity to first variant to avoid losing items
            const quantity = quantityPerVariant + (variantIndex < extraQuantity ? 1 : 0);

            try {
              await this.mysqlConnector.query(
                `INSERT INTO inventory_items 
                 (sku, quantity_available, quantity_reserved, reorder_level, max_stock, cost_per_unit, last_restocked, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                  variantSku,
                  quantity,
                  0,
                  Math.max(1, Math.floor(item.reorder_level / totalVariants)),
                  Math.max(10, Math.floor(item.max_stock / totalVariants)),
                  item.cost_per_unit,
                  new Date(),
                ],
              );

              // Create initial stock movement record
              await this.mysqlConnector.query(
                `INSERT INTO stock_movements 
                 (sku, movement_type, quantity, reference, reason, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [variantSku, 'IN', quantity, 'INITIAL_STOCK', 'Initial inventory seeding (variant)', 'system'],
              );

              variantCount++;
              variantIndex++;

              if (variantCount % 100 === 0) {
                logger.info(`  ✓ Created ${variantCount} variant inventory items...`);
              }
            } catch (error) {
              logger.error(`Failed to create inventory for variant SKU ${variantSku}`, error);
            }
          }
        }
      } else {
        // No colors/sizes - create base SKU inventory only
        const existingResult = await this.mysqlConnector.query('SELECT id FROM inventory_items WHERE sku = ?', [
          baseSku,
        ]);
        if (existingResult.length > 0) {
          skippedCount++;
          continue;
        }

        try {
          await this.mysqlConnector.query(
            `INSERT INTO inventory_items 
             (sku, quantity_available, quantity_reserved, reorder_level, max_stock, cost_per_unit, last_restocked, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              baseSku,
              item.quantity_available,
              item.quantity_reserved || 0,
              item.reorder_level,
              item.max_stock,
              item.cost_per_unit,
              new Date(),
            ],
          );

          // Create initial stock movement record
          await this.mysqlConnector.query(
            `INSERT INTO stock_movements 
             (sku, movement_type, quantity, reference, reason, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [baseSku, 'IN', item.quantity_available, 'INITIAL_STOCK', 'Initial inventory seeding', 'system'],
          );

          insertedCount++;
        } catch (error) {
          logger.error(`Failed to create inventory for base SKU ${baseSku}`, error);
        }
      }
    }

    const totalInserted = insertedCount + variantCount;
    logger.success(`✅ Inventory seeding complete!`);
    logger.info(`  • Created: ${insertedCount} base inventory records`);
    logger.info(`  • Created: ${variantCount} variant inventory records`);
    logger.info(`  • Total: ${totalInserted} inventory records`);
    logger.info(`  • Skipped: ${skippedCount} (already exist)`);

    // Update stats
    this.stats.totalRecords = totalInserted;
    this.stats.insertedRecords = totalInserted;
    this.stats.skippedRecords = skippedCount;

    return {
      totalRecords: totalInserted,
      insertedRecords: totalInserted,
      baseRecords: insertedCount,
      variantRecords: variantCount,
      skippedRecords: skippedCount,
      errors: 0,
    };
  }

  /**
   * Cleanup database connections
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up inventory seeder connections...');
    await this.mysqlConnector?.disconnect();
  }

  /**
   * Validate seeded data
   */
  async validate(): Promise<boolean> {
    logger.info('🔍 Validating inventory data...');

    try {
      // Check if inventory items exist
      const result = await this.mysqlConnector.query('SELECT COUNT(*) as count FROM inventory_items');
      const count = parseInt(result[0].count);

      logger.info(`  • Found ${count} inventory items`);

      if (count === 0) {
        logger.error('❌ No inventory items found');
        return false;
      }

      // Count variant vs base SKUs (variants contain extra hyphens beyond base pattern)
      const variantResult = await this.mysqlConnector.query(
        `SELECT COUNT(*) as count FROM inventory_items WHERE sku REGEXP '^[A-Z0-9&]+-[A-Z]+-[A-Z]+-[0-9]+-[A-Z]+-[A-Z]+$'`,
      );
      const variantSkuCount = parseInt(variantResult[0].count || '0');

      logger.info(`  • Found ${variantSkuCount} variant SKUs (color-size combinations)`);
      logger.info(`  • Found ${count - variantSkuCount} base/simple SKUs`);

      // Check for low stock items
      const lowStockResult = await this.mysqlConnector.query(
        'SELECT COUNT(*) as count FROM inventory_items WHERE quantity_available <= reorder_level',
      );
      const lowStockCount = parseInt(lowStockResult[0].count);

      if (lowStockCount > 0) {
        logger.warn(`⚠ ${lowStockCount} items are at or below reorder level`);
      }

      // Check stock movements
      const movementsResult = await this.mysqlConnector.query('SELECT COUNT(*) as count FROM stock_movements');
      const movementsCount = parseInt(movementsResult[0].count);

      logger.info(`  • Found ${movementsCount} stock movement records`);

      logger.success('✅ Inventory data validation passed');
      return true;
    } catch (error) {
      logger.error('❌ Inventory validation failed', error);
      return false;
    }
  }
}
