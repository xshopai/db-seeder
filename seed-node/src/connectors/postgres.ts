import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger.js';

export interface PostgresConfig {
  connectionUrl: string;
}

export class PostgresConnector {
  private pool: Pool | null = null;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  /**
   * Connect to PostgreSQL
   */
  async connect(): Promise<void> {
    try {
      if (!this.config.connectionUrl) {
        throw new Error('connectionUrl is required');
      }

      const poolConfig: PoolConfig = {
        connectionString: this.config.connectionUrl,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10,
      };

      logger.info(`Connecting to PostgreSQL using connection URL`);

      this.pool = new Pool(poolConfig);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.success(`Connected to PostgreSQL: ${database}`);
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL', error);
      throw error;
    }
  }

  /**
   * Disconnect from PostgreSQL
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Disconnected from PostgreSQL');
    }
  }

  /**
   * Get pool instance
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error('PostgreSQL not connected');
    }
    return this.pool;
  }

  /**
   * Execute query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    try {
      const pool = this.getPool();
      const result = await pool.query(sql, params);
      return result;
    } catch (error) {
      logger.error('Failed to execute query', { sql, params, error });
      throw error;
    }
  }

  /**
   * Clear table
   */
  async clearTable(tableName: string): Promise<number> {
    try {
      const result = await this.query(`DELETE FROM ${tableName}`);
      logger.info(`Cleared ${result.rowCount} rows from ${tableName}`);
      return result.rowCount;
    } catch (error) {
      logger.error(`Failed to clear table ${tableName}`, error);
      throw error;
    }
  }

  /**
   * Insert many records
   */
  async insertMany(tableName: string, records: any[], columns: string[]): Promise<any[]> {
    if (records.length === 0) return [];

    try {
      const pool = this.getPool();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const insertedRecords = [];
        for (const record of records) {
          const values = columns.map((col) => record[col]);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;

          const result = await client.query(sql, values);
          insertedRecords.push(result.rows[0]);
        }

        await client.query('COMMIT');
        logger.success(`Inserted ${insertedRecords.length} records into ${tableName}`);
        return insertedRecords;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`Failed to insert records into ${tableName}`, error);
      throw error;
    }
  }

  /**
   * Count records in table
   */
  async countRecords(tableName: string): Promise<number> {
    try {
      const result = await this.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error(`Failed to count records in ${tableName}`, error);
      throw error;
    }
  }

  /**
   * List all tables
   */
  async listTables(): Promise<string[]> {
    try {
      const result = await this.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      return result.rows.map((row: any) => row.table_name);
    } catch (error) {
      logger.error('Failed to list tables', error);
      throw error;
    }
  }

  /**
   * Drop table if exists
   */
  async dropTable(tableName: string): Promise<boolean> {
    try {
      await this.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      logger.info(`Dropped table: ${tableName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to drop table ${tableName}`, error);
      throw error;
    }
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.query(
        `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `,
        [tableName],
      );
      return result.rows[0].exists;
    } catch (error) {
      logger.error(`Failed to check if table ${tableName} exists`, error);
      throw error;
    }
  }
}
