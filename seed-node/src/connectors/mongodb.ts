import { MongoClient, Db, Collection, Document, OptionalUnlessRequiredId } from 'mongodb';
import { logger } from '../utils/logger.js';

export interface MongoConfig {
  connectionUrl: string;
}

// Retry configuration for Cosmos DB throttling
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 100,
  maxDelayMs: 5000,
};

/**
 * Retry helper with exponential backoff for Cosmos DB throttling (Error 16500)
 */
async function withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check for Cosmos DB throttling error (16500 = Request Rate Too Large)
      const isThrottling =
        error.code === 16500 || error.message?.includes('16500') || error.message?.includes('Request rate is large');

      if (!isThrottling || attempt === RETRY_CONFIG.maxRetries) {
        throw error;
      }

      // Extract RetryAfterMs from error if available, otherwise use exponential backoff
      const retryAfterMatch = error.message?.match(/RetryAfterMs=(\d+)/);
      const suggestedDelay = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) : 0;
      const exponentialDelay = Math.min(RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1), RETRY_CONFIG.maxDelayMs);
      const delayMs = Math.max(suggestedDelay, exponentialDelay);

      logger.warn(
        `${operationName}: Cosmos DB throttled (attempt ${attempt}/${RETRY_CONFIG.maxRetries}), retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export class MongoConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private config: MongoConfig;

  constructor(config: MongoConfig) {
    this.config = config;
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      if (!this.config.connectionUrl) {
        throw new Error('connectionUrl is required');
      }

      const connectionUrl = this.config.connectionUrl;

      // Extract database name from connection URL
      // Formats:
      //   mongodb://user:pass@host:port/<database>?...
      //   mongodb+srv://user:pass@host/<database>?...
      //   mongodb://...cosmos.azure.com:10255/<database>?...
      const urlMatch = connectionUrl.match(/:\/\/[^/]+\/([a-zA-Z0-9_-]+)(?:\?|$)/);
      const dbName = urlMatch ? urlMatch[1] : undefined;

      logger.info(`Connecting to MongoDB using connection URL`);

      this.client = new MongoClient(connectionUrl);
      await this.client.connect();
      this.db = this.client.db(dbName);

      // Test connection
      await this.db.admin().ping();
      logger.success(`Connected to MongoDB: ${dbName}`);
    } catch (error) {
      logger.error('Failed to connect to MongoDB', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info('Disconnected from MongoDB');
    }
  }

  /**
   * Get database instance
   */
  getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB not connected');
    }
    return this.db;
  }

  /**
   * Get collection
   */
  getCollection<T extends Document = any>(name: string): Collection<T> {
    return this.getDb().collection<T>(name);
  }

  /**
   * Clear collection with retry logic for Cosmos DB throttling
   */
  async clearCollection(name: string): Promise<number> {
    return withRetry(async () => {
      try {
        const collection = this.getCollection(name);
        const result = await collection.deleteMany({});
        logger.info(`Cleared ${result.deletedCount} documents from ${name}`);
        return result.deletedCount;
      } catch (error) {
        logger.error(`Failed to clear collection ${name}`, error);
        throw error;
      }
    }, `clearCollection(${name})`);
  }

  /**
   * Insert many documents with retry logic for Cosmos DB throttling
   * Batches inserts to avoid overwhelming Cosmos DB RU limits
   */
  async insertMany<T extends Document>(collectionName: string, documents: T[], batchSize: number = 10): Promise<T[]> {
    const collection = this.getCollection<T>(collectionName);
    let insertedCount = 0;

    // Process in batches to avoid Cosmos DB throttling
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(documents.length / batchSize);

      await withRetry(async () => {
        try {
          const result = await collection.insertMany(batch as OptionalUnlessRequiredId<T>[]);
          insertedCount += Object.keys(result.insertedIds).length;
          logger.info(
            `Inserted batch ${batchNum}/${totalBatches} (${Object.keys(result.insertedIds).length} docs) into ${collectionName}`,
          );
        } catch (error: any) {
          // Handle authorization errors
          if (error.code === 13 || error.codeName === 'Unauthorized') {
            logger.error(`❌ Cannot insert documents into ${collectionName} - authorization required`);
          }
          throw error;
        }
      }, `insertMany(${collectionName}) batch ${batchNum}`);

      // Small delay between batches to avoid throttling
      if (i + batchSize < documents.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    logger.success(`Inserted total ${insertedCount} documents into ${collectionName}`);
    return documents;
  }

  /**
   * Count documents in collection
   */
  async countDocuments(collectionName: string): Promise<number> {
    try {
      const collection = this.getCollection(collectionName);
      return await collection.countDocuments();
    } catch (error: any) {
      // Handle authorization errors gracefully
      if (error.code === 13 || error.codeName === 'Unauthorized') {
        logger.warn(`⚠️  Cannot count documents in ${collectionName} - authorization required. Returning 0.`);
        return 0;
      }
      logger.error(`Failed to count documents in ${collectionName}`, error);
      throw error;
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    try {
      const collections = await this.getDb().listCollections().toArray();
      return collections.map((col) => col.name);
    } catch (error) {
      logger.error('Failed to list collections', error);
      throw error;
    }
  }

  /**
   * Drop collection if exists
   */
  async dropCollection(name: string): Promise<boolean> {
    try {
      const collections = await this.listCollections();
      if (collections.includes(name)) {
        await this.getDb().dropCollection(name);
        logger.info(`Dropped collection: ${name}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Failed to drop collection ${name}`, error);
      throw error;
    }
  }
}
