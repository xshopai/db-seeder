import sql from 'mssql';
import { logger } from '../utils/logger.js';

export interface MSSQLConfig {
  connectionUrl: string;
}

export class MSSQLConnector {
  private pool: sql.ConnectionPool | null = null;
  private config: MSSQLConfig;
  private parsedConfig: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  } | null = null;

  constructor(config: MSSQLConfig) {
    this.config = config;
  }

  /**
   * Parse connection URL to extract host, port, database, username, password
   * Format: mssql://username:password@host:port/database
   */
  private parseConnectionUrl(url: string): {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  } {
    try {
      const parsedUrl = new URL(url);
      return {
        host: parsedUrl.hostname,
        port: parseInt(parsedUrl.port) || 1433,
        database: parsedUrl.pathname.slice(1), // Remove leading /
        username: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
      };
    } catch (error) {
      throw new Error(`Failed to parse MSSQL connection URL: ${error}`);
    }
  }

  /**
   * Connect to SQL Server
   */
  async connect(): Promise<void> {
    try {
      if (!this.config.connectionUrl) {
        throw new Error('connectionUrl is required');
      }

      const { host, port, database, username, password } = this.parseConnectionUrl(this.config.connectionUrl);

      // Store parsed config for later use
      this.parsedConfig = { host, port, database, username, password };

      logger.info(`Connecting to SQL Server: ${host}:${port}/${database}`);

      const sqlConfig: sql.config = {
        server: host,
        port,
        database,
        user: username,
        password,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
      };

      this.pool = await sql.connect(sqlConfig);
      logger.success(`Connected to SQL Server: ${database}`);
    } catch (error) {
      logger.error('Failed to connect to SQL Server', error);
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query(queryText: string, params?: Record<string, any>): Promise<sql.IResult<any>> {
    if (!this.pool) {
      throw new Error('SQL Server pool not initialized. Call connect() first.');
    }

    try {
      const request = this.pool.request();

      // Add parameters if provided
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      return await request.query(queryText);
    } catch (error) {
      logger.error('SQL Server query failed', { queryText, error });
      throw error;
    }
  }

  /**
   * Get the connection pool
   */
  getPool(): sql.ConnectionPool {
    if (!this.pool) {
      throw new Error('SQL Server pool not initialized. Call connect() first.');
    }
    return this.pool;
  }

  /**
   * Get parsed database name
   */
  getDatabase(): string {
    return this.parsedConfig?.database || this.config.database || '';
  }

  /**
   * Disconnect from SQL Server
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info('Disconnected from SQL Server');
    }
  }

  /**
   * Begin transaction
   */
  async beginTransaction(): Promise<sql.Transaction> {
    if (!this.pool) {
      throw new Error('SQL Server pool not initialized');
    }

    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    return transaction;
  }

  /**
   * Commit transaction
   */
  async commitTransaction(transaction: sql.Transaction): Promise<void> {
    await transaction.commit();
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(transaction: sql.Transaction): Promise<void> {
    await transaction.rollback();
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.query(
      `SELECT COUNT(*) as count 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_NAME = @tableName`,
      { tableName },
    );
    return result.recordset[0].count > 0;
  }

  /**
   * Get table row count
   */
  async getRowCount(tableName: string): Promise<number> {
    const result = await this.query(`SELECT COUNT(*) as count FROM [${tableName}]`);
    return result.recordset[0].count;
  }

  /**
   * Truncate table (using DELETE since TRUNCATE may have FK constraints)
   */
  async truncateTable(tableName: string): Promise<void> {
    await this.query(`DELETE FROM [${tableName}]`);
  }
}
