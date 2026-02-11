#!/usr/bin/env node

// IMPORTANT: Load .env FIRST, before any other imports that use process.env
import { config } from 'dotenv';
config();

import { Command } from 'commander';
import { logger } from './utils/logger.js';
import { idMapper } from './utils/id-mapper.js';
import { getServicesInOrder, getServiceConfig, validateDependencies, ServiceConfig } from './config/services.js';
import { UserSeeder } from './seeders/user.seeder.js';
import { ProductSeeder } from './seeders/product.seeder.js';
import { InventorySeeder } from './seeders/inventory.seeder.js';
import { ReviewSeeder } from './seeders/review.seeder.js';
import { OrderSeeder } from './seeders/order.seeder.js';
import { SeederOptions } from './seeders/base.seeder.js';

console.log('🔧 CLI Starting up...');
console.log('Args:', process.argv);

interface SeedingResult {
  serviceName: string;
  success: boolean;
  stats?: any;
  error?: string;
  duration: number;
}

class UnifiedSeeder {
  private seededServices: string[] = [];
  private results: SeedingResult[] = [];

  /**
   * Create seeder instance for a service
   */
  private createSeeder(serviceConfig: ServiceConfig) {
    switch (serviceConfig.name) {
      case 'user-service':
        return new UserSeeder(serviceConfig);
      case 'product-service':
        return new ProductSeeder(serviceConfig);
      case 'inventory-service':
        return new InventorySeeder(serviceConfig);
      case 'review-service':
        return new ReviewSeeder(serviceConfig);
      case 'order-service':
        return new OrderSeeder(serviceConfig);
      default:
        throw new Error(`No seeder available for ${serviceConfig.name}`);
    }
  }

  /**
   * Seed a single service
   */
  async seedService(serviceName: string, options: SeederOptions = {}): Promise<SeedingResult> {
    const startTime = Date.now();

    try {
      const serviceConfig = getServiceConfig(serviceName);
      if (!serviceConfig) {
        throw new Error(`Service configuration not found: ${serviceName}`);
      }

      // Check dependencies
      if (!validateDependencies(serviceName, this.seededServices)) {
        const deps = serviceConfig.dependencies?.join(', ') || 'none';
        throw new Error(`Dependencies not met for ${serviceName}. Required: ${deps}`);
      }

      logger.step(this.seededServices.length + 1, getServicesInOrder().length, `Seeding ${serviceName}`);

      const seeder = this.createSeeder(serviceConfig);
      const stats = await seeder.execute(options);

      this.seededServices.push(serviceName);

      const result: SeedingResult = {
        serviceName,
        success: true,
        stats,
        duration: Date.now() - startTime,
      };

      this.results.push(result);
      return result;
    } catch (error) {
      const result: SeedingResult = {
        serviceName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };

      this.results.push(result);
      logger.error(`Failed to seed ${serviceName}`, error);
      return result;
    }
  }

  /**
   * Seed all services in dependency order
   */
  async seedAll(options: SeederOptions = {}): Promise<SeedingResult[]> {
    logger.header('🌱 xshopai Unified Seeding System');

    const services = getServicesInOrder();
    const availableServices = services.filter((service) => {
      try {
        this.createSeeder(service);
        return true;
      } catch {
        return false;
      }
    });

    logger.info(`Found ${availableServices.length} services with seeders available`);

    // Always clear existing data before seeding fresh data
    const seedOptionsWithClear = {
      ...options,
      clearBefore: true,
    };

    for (const service of availableServices) {
      await this.seedService(service.name, seedOptionsWithClear);
    }

    return this.results;
  }

  /**
   * Clear all data from specified services
   */
  async clearServices(serviceNames?: string[]): Promise<void> {
    logger.header('🧹 Clearing Service Data');

    const servicesToClear = serviceNames || getServicesInOrder().map((s) => s.name);

    for (const serviceName of servicesToClear) {
      try {
        const serviceConfig = getServiceConfig(serviceName);
        if (!serviceConfig) continue;

        const seeder = this.createSeeder(serviceConfig);
        await seeder.initialize();
        await seeder.clear();
        await seeder.cleanup();

        logger.success(`Cleared data for ${serviceName}`);
      } catch (error) {
        logger.error(`Failed to clear ${serviceName}`, error);
      }
    }
  }

  /**
   * Print seeding summary
   */
  printSummary(): void {
    logger.header('📊 Seeding Summary');

    const successful = this.results.filter((r) => r.success);
    const failed = this.results.filter((r) => !r.success);

    logger.info(`✅ Successful: ${successful.length}`);
    logger.info(`❌ Failed: ${failed.length}`);
    logger.info(`⏱️  Total Duration: ${this.results.reduce((sum, r) => sum + r.duration, 0)}ms`);

    if (this.results.length > 0) {
      const summary = this.results.map((result) => ({
        Service: result.serviceName,
        Status: result.success ? '✅ Success' : '❌ Failed',
        Records: result.stats?.insertedRecords || 0,
        Duration: `${result.duration}ms`,
        Error: result.error || '-',
      }));

      logger.table(summary);
    }

    // Print ID mapping statistics
    const mapStats = idMapper.getStats();
    logger.info(`🆔 Generated IDs: ${mapStats.mongoIds} MongoDB, ${mapStats.uuids} UUIDs`);
  }
}

// CLI setup
const program = new Command();

program.name('xshopai-seeder').description('Unified data seeding system for xshopai microservices').version('1.0.0');

program
  .command('seed')
  .description('Seed all services or specific service (always clears existing data first)')
  .option('-s, --service <name>', 'Seed specific service')
  .option('--no-clear', 'Skip clearing existing data before seeding')
  .option('-v, --validate', 'Validate data after seeding')
  .option('--dry-run', 'Perform dry run without actual seeding')
  .action(async (options) => {
    console.log('🚀 Starting seeder with options:', options);
    logger.info('Starting seeder action...');

    const seeder = new UnifiedSeeder();

    const seedOptions: SeederOptions = {
      clearBefore: options.clear !== false, // Clear by default unless --no-clear is specified
      validateAfter: options.validate,
      dryRun: options.dryRun,
    };

    try {
      if (options.service) {
        logger.info(`Seeding specific service: ${options.service}`);
        await seeder.seedService(options.service, seedOptions);
      } else {
        logger.info('Seeding all services...');
        await seeder.seedAll(seedOptions);
      }
    } catch (error) {
      logger.error('Seeding process failed', error);
      process.exit(1);
    } finally {
      seeder.printSummary();
    }
  });

program
  .command('clear')
  .description('Clear data from all services or specific service')
  .option('-s, --service <name>', 'Clear specific service')
  .action(async (options) => {
    const seeder = new UnifiedSeeder();

    try {
      const services = options.service ? [options.service] : undefined;
      await seeder.clearServices(services);
      logger.success('Data clearing completed');
    } catch (error) {
      logger.error('Data clearing failed', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show service configurations and connection status')
  .action(async () => {
    logger.header('🔍 Service Status');

    const services = getServicesInOrder();
    const statusTable = services.map((service) => ({
      Service: service.name,
      Type: service.type,
      Host: (service.config as any).host,
      Port: (service.config as any).port,
      Database: (service.config as any).database,
      Order: service.seedOrder,
      Dependencies: service.dependencies?.join(', ') || 'None',
    }));

    logger.table(statusTable);
  });

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection', error);
  process.exit(1);
});

// Parse CLI arguments
console.log('📋 Parsing CLI arguments...');
program.parse(process.argv);

export { UnifiedSeeder };
export default program;
