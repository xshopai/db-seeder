import { BaseSeeder, SeederOptions } from './base.seeder.js';
import { ServiceConfig } from '../config/services.js';
import { idMapper } from '../utils/id-mapper.js';
import { logger } from '../utils/logger.js';
import { ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate variant SKU from base SKU, color, and size
 * Example: "ANT-WOM-CLO-001" + "Gray" + "M" = "ANT-WOM-CLO-001-GRAY-M"
 */
function generateVariantSKU(baseSku: string, color?: string, size?: string): string {
  let variantSku = baseSku;
  if (color) {
    variantSku += `-${color.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  }
  if (size) {
    variantSku += `-${size.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  }
  return variantSku;
}

export interface Product {
  _id: ObjectId;
  
  // === CORE PRODUCT DATA (Source of Truth) ===
  name: string;
  description?: string;
  price: number;
  brand?: string;
  sku: string;
  status: 'active' | 'inactive' | 'draft';
  
  // === TAXONOMY (Hierarchical Categories) ===
  taxonomy: {
    department?: string;
    category?: string;
    subcategory?: string;
    productType?: string;
  };
  
  // === ATTRIBUTES & SPECIFICATIONS ===
  images: string[];
  tags: string[];
  colors: string[];
  sizes: string[];
  specifications: Record<string, string>;
  variants?: Array<{ sku: string; color?: string; size?: string; }>;
  
  // === DENORMALIZED DATA (From Other Services) ===
  // From Inventory Service - updated by sync/webhook
  availability_status?: {
    status: 'in-stock' | 'out-of-stock' | 'low-stock';
    available_quantity: number;
    last_updated: Date;
  };
  
  // From Review Service - updated by sync/webhook
  review_aggregates?: {
    average_rating: number;
    total_review_count: number;
    last_updated: Date;
  };
  
  // === AUDIT FIELDS ===
  is_active: boolean;
  created_by: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
  history: any[];
}

export class ProductSeeder extends BaseSeeder {
  constructor(serviceConfig: ServiceConfig) {
    super('product-service', serviceConfig);
  }

  /**
   * Load products from data file
   */
  private loadProductsData(): any[] {
    try {
      // Use the unified seeder data directory
      const dataPath = join(__dirname, '..', 'data', 'products.json');
      logger.info(`Loading products data from: ${dataPath}`);
      const data = readFileSync(dataPath, 'utf-8');
      const parsedData = JSON.parse(data);
      logger.info(`📁 Loaded ${parsedData.length} product records from data file`);
      return parsedData;
    } catch (error) {
      logger.error('Failed to load products data file', error);
      throw new Error('Could not load products data. Please ensure src/data/products.json exists.');
    }
  }

  /**
   * Convert loaded data to Product format
   */
  private convertToProducts(data: any[]): Product[] {
    logger.info('🔄 Converting product data to database format...');
    const products: Product[] = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const productId = idMapper.getMongoId(`product_${i + 1}`);

      if (i < 5) logger.debug(`Processing product ${i + 1}: ${item.name || `Product ${i + 1}`}`);

      const product: Product = {
        _id: productId,
        
        // === CORE PRODUCT DATA ===
        name: item.name || `Product ${i + 1}`,
        description: item.description || '',
        price: typeof item.price === 'number' ? item.price : 99.99,
        brand: item.brand || 'Generic',
        sku: item.sku || `SKU-${String(i + 1).padStart(4, '0')}`,
        status: 'active',
        
        // === TAXONOMY ===
        taxonomy: {
          department: item.department || 'General',
          category: item.category || 'General',
          subcategory: item.subcategory || 'General',
          productType: item.productType || 'General',
        },
        
        // === ATTRIBUTES ===
        images: Array.isArray(item.images)
          ? item.images
          : [`https://picsum.photos/400/400?random=${i + 1}`, `https://picsum.photos/400/400?random=${i + 100}`],
        tags: Array.isArray(item.tags) ? item.tags : [],
        colors: Array.isArray(item.colors) ? item.colors : ['Black', 'White'],
        sizes: Array.isArray(item.sizes) ? item.sizes : ['M', 'L'],
        specifications: item.specifications || {},
        
        // Generate variant SKUs for each color/size combination
        variants: (() => {
          const baseSku = item.sku || `SKU-${String(i + 1).padStart(4, '0')}`;
          const colors = Array.isArray(item.colors) ? item.colors : ['Black', 'White'];
          const sizes = Array.isArray(item.sizes) ? item.sizes : ['M', 'L'];
          const variants = [];
          
          for (const color of colors) {
            for (const size of sizes) {
              variants.push({
                sku: generateVariantSKU(baseSku, color, size),
                color,
                size
              });
            }
          }
          
          return variants;
        })(),
        
        // === DENORMALIZED DATA ===
        // These will be populated by inventory/review service webhooks
        // For seed data, we leave them undefined initially
        availabilityStatus: undefined,
        reviewAggregates: undefined,
        
        // === AUDIT FIELDS ===
        is_active: true,
        created_by: idMapper.getMongoId('user_3').toString(), // Mike Admin
        updated_by: idMapper.getMongoId('user_3').toString(), // Mike Admin
        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
        history: [],
      };

      products.push(product);
    }

    logger.info(`✅ Converted ${products.length} products with generated ObjectIds`);
    return products;
  }

  /**
   * Seed products
   */
  async seed(_options: SeederOptions = {}): Promise<void> {
    logger.info('🌱 Starting product seeding process...');

    try {
      // Load existing product data
      const rawData = this.loadProductsData();
      const products = this.convertToProducts(rawData);

      this.stats.totalRecords = products.length;

      if (!this.mongoConnector) {
        throw new Error('MongoDB connector not initialized');
      }

      logger.info('🔗 Connecting to product service database...');

      // Check if products collection already has data
      const existingCount = await this.mongoConnector.countDocuments('products');
      if (existingCount > 0) {
        logger.warn(`⚠️  Products collection already has ${existingCount} records. Proceeding with insertion...`);
      }

      // Insert products
      logger.info(`📝 Inserting ${products.length} products into database...`);
      await this.mongoConnector.insertMany('products', products);
      this.stats.insertedRecords = products.length;

      logger.success(`🎉 Successfully seeded ${products.length} products into the database!`);

      // Log product summary
      logger.info('📊 Product Summary (first 10):');
      const productSummary = products.slice(0, 10).map((product, _index) => ({
        ID: product._id.toString().substring(0, 8) + '...',
        Name: product.name.length > 30 ? product.name.substring(0, 30) + '...' : product.name,
        Department: product.taxonomy.department || 'N/A',
        Category: product.taxonomy.category || 'N/A',
        Price: `$${product.price}`,
        Brand: product.brand || 'N/A',
      }));

      logger.table(productSummary);

      if (products.length > 10) {
        logger.info(`... and ${products.length - 10} more products`);
      }

      // Store product IDs for reviews
      const productIds = products.map((p) => p._id.toString());
      logger.info(`💾 Stored ${productIds.length} product IDs for cross-service references`);

      // Log final statistics
      logger.info(
        `📈 Final Stats: ${this.stats.insertedRecords}/${this.stats.totalRecords} products inserted successfully`
      );
    } catch (error) {
      this.stats.errors++;
      logger.error('❌ Failed to seed products', error);
      throw error;
    }
  }
}
