import { MongoConnector } from '../connectors/mongodb.js';
import { PostgresConnector } from '../connectors/postgres.js';
import { ServiceConfig } from '../config/services.js';
import { logger } from '../utils/logger.js';
import { applyServiceEnv, loadServiceEnv } from '../utils/env-loader.js';

export interface SeederStats {
  totalRecords: number;
  insertedRecords: number;
  skippedRecords: number;
  errors: number;
  duration: number;
}

export interface SeederOptions {
  clearBefore?: boolean;
  validateAfter?: boolean;
  dryRun?: boolean;
  batchSize?: number;
}

export abstract class BaseSeeder {
  protected serviceName: string;
  protected serviceConfig: ServiceConfig;
  protected mongoConnector?: MongoConnector;
  protected postgresConnector?: PostgresConnector;
  protected stats: SeederStats;
  protected envCleanup?: () => void;

  constructor(serviceName: string, serviceConfig: ServiceConfig) {
    this.serviceName = serviceName;
    this.serviceConfig = serviceConfig;
    this.stats = {
      totalRecords: 0,
      insertedRecords: 0,
      skippedRecords: 0,
      errors: 0,
      duration: 0,
    };
  }

  /**
   * Initialize database connections
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing seeder for ${this.serviceName}`);

    // Load service-specific environment variables
    this.envCleanup = applyServiceEnv(this.serviceName);

    if (this.serviceConfig.type === 'mongodb') {
      this.mongoConnector = new MongoConnector(this.serviceConfig.config as any);
      await this.mongoConnector.connect();
    } else if (this.serviceConfig.type === 'postgresql') {
      this.postgresConnector = new PostgresConnector(this.serviceConfig.config as any);
      await this.postgresConnector.connect();
    }
  }

  /**
   * Cleanup database connections
   */
  async cleanup(): Promise<void> {
    if (this.mongoConnector) {
      await this.mongoConnector.disconnect();
    }
    if (this.postgresConnector) {
      await this.postgresConnector.disconnect();
    }
    logger.info(`Cleanup completed for ${this.serviceName}`);
  }

  /**
   * Clear all data from service
   */
  async clear(): Promise<void> {
    logger.info(`🧹 Clearing existing data for ${this.serviceName}...`);

    let totalCleared = 0;

    try {
      if (this.mongoConnector && this.serviceConfig.collections) {
        for (const collection of this.serviceConfig.collections) {
          try {
            const cleared = await this.mongoConnector.clearCollection(collection);
            totalCleared += cleared;
          } catch (error: any) {
            // Skip authorization errors for now since MongoDB containers don't have proper auth setup
            if (error.code === 13 || error.codeName === 'Unauthorized') {
              logger.warn(
                `⚠️  Skipping clear for ${collection} - authorization required. Continuing without clearing.`
              );
              continue;
            }
            throw error;
          }
        }
      }

      if (this.postgresConnector && this.serviceConfig.tables) {
        for (const table of this.serviceConfig.tables) {
          const cleared = await this.postgresConnector.clearTable(table);
          totalCleared += cleared;
        }
      }

      if (totalCleared > 0) {
        logger.success(`✅ Cleared ${totalCleared} records from ${this.serviceName}`);
      } else {
        logger.info(`📭 No existing data found in ${this.serviceName} or skipped due to auth requirements`);
      }
    } catch (error: any) {
      // If we get authorization errors, warn but don't fail the entire process
      if (error.code === 13 || error.codeName === 'Unauthorized') {
        logger.warn(`⚠️  Cannot clear data for ${this.serviceName} - authorization required. Continuing with seeding.`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Validate seeded data
   */
  async validate(): Promise<boolean> {
    logger.info(`Validating data for ${this.serviceName}`);

    try {
      if (this.mongoConnector && this.serviceConfig.collections) {
        for (const collection of this.serviceConfig.collections) {
          const count = await this.mongoConnector.countDocuments(collection);
          logger.info(`${collection}: ${count} documents`);
        }
      }

      if (this.postgresConnector && this.serviceConfig.tables) {
        for (const table of this.serviceConfig.tables) {
          const count = await this.postgresConnector.countRecords(table);
          logger.info(`${table}: ${count} records`);
        }
      }

      return true;
    } catch (error) {
      logger.error(`Validation failed for ${this.serviceName}`, error);
      return false;
    }
  }

  /**
   * Get seeding statistics
   */
  getStats(): SeederStats {
    return { ...this.stats };
  }

  /**
   * Log progress
   */
  protected logProgress(current: number, total: number, entity: string): void {
    const percentage = Math.round((current / total) * 100);
    logger.info(`${entity}: ${current}/${total} (${percentage}%)`);
  }

  /**
   * Abstract method to be implemented by concrete seeders
   */
  abstract seed(options?: SeederOptions): Promise<void>;

  /**
   * Main execution method
   */
  async execute(options: SeederOptions = {}): Promise<SeederStats> {
    const startTime = Date.now();

    try {
      await this.initialize();

      if (options.clearBefore) {
        await this.clear();
      }

      if (!options.dryRun) {
        await this.seed(options);
      } else {
        logger.info(`Dry run mode - skipping actual seeding for ${this.serviceName}`);
      }

      if (options.validateAfter && !options.dryRun) {
        await this.validate();
      }

      this.stats.duration = Date.now() - startTime;

      logger.success(`Seeding completed for ${this.serviceName}`, {
        stats: this.stats,
        duration: `${this.stats.duration}ms`,
      });

      return this.stats;
    } catch (error) {
      this.stats.duration = Date.now() - startTime;
      this.stats.errors++;
      logger.error(`Seeding failed for ${this.serviceName}`, error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}
