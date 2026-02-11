import mysql from 'mysql2/promise';
import { logger } from '../utils/logger.js';

export interface MySQLConfig {
  connectionUrl: string;
}

export class MySQLConnector {
  private pool: mysql.Pool | null = null;
  private config: MySQLConfig;
  private parsedConfig: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  } | null = null;

  constructor(config: MySQLConfig) {
    this.config = config;
  }

  /**
   * Parse connection URL to extract host, port, database, username, password
   * Format: mysql://username:password@host:port/database
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
        port: parseInt(parsedUrl.port) || 3306,
        database: parsedUrl.pathname.slice(1), // Remove leading /
        username: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
      };
    } catch (error) {
      throw new Error(`Failed to parse MySQL connection URL: ${error}`);
    }
  }

  /**
   * Connect to MySQL
   */
  async connect(): Promise<void> {
    try {
      if (!this.config.connectionUrl) {
        throw new Error('connectionUrl is required');
      }

      const { host, port, database, username, password } = this.parseConnectionUrl(this.config.connectionUrl);

      // Store parsed config for later use
      this.parsedConfig = { host, port, database, username, password };

      logger.info(`Connecting to MySQL: ${host}:${port}/${database}`);

      // Check if SSL is required (Azure MySQL, etc.)
      const isAzure = host.includes('.azure.com');

      this.pool = mysql.createPool({
        host,
        port,
        database,
        user: username,
        password,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 10000,
        ssl: isAzure ? { rejectUnauthorized: true } : undefined,
      });

      // Test connection
      const connection = await this.pool.getConnection();
      await connection.query('SELECT 1');
      connection.release();

      logger.success(`Connected to MySQL: ${database}`);
    } catch (error) {
      logger.error('Failed to connect to MySQL', error);
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('MySQL pool not initialized. Call connect() first.');
    }

    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error('MySQL query failed', { sql, error });
      throw error;
    }
  }

  /**
   * Get the connection pool
   */
  getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error('MySQL pool not initialized. Call connect() first.');
    }
    return this.pool;
  }

  /**
   * Disconnect from MySQL
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Disconnected from MySQL');
    }
  }

  /**
   * Begin transaction
   */
  async beginTransaction(): Promise<mysql.PoolConnection> {
    if (!this.pool) {
      throw new Error('MySQL pool not initialized');
    }

    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  /**
   * Commit transaction
   */
  async commitTransaction(connection: mysql.PoolConnection): Promise<void> {
    await connection.commit();
    connection.release();
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(connection: mysql.PoolConnection): Promise<void> {
    await connection.rollback();
    connection.release();
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    const database = this.parsedConfig?.database;
    if (!database) {
      throw new Error('Database not initialized. Call connect() first.');
    }
    const rows = await this.query(
      `SELECT COUNT(*) as count 
       FROM information_schema.tables 
       WHERE table_schema = ? AND table_name = ?`,
      [database, tableName],
    );
    return rows[0].count > 0;
  }

  /**
   * Get table row count
   */
  async getRowCount(tableName: string): Promise<number> {
    const rows = await this.query(`SELECT COUNT(*) as count FROM ??`, [tableName]);
    return rows[0].count;
  }

  /**
   * Truncate table
   */
  async truncateTable(tableName: string): Promise<void> {
    await this.query(`TRUNCATE TABLE ??`, [tableName]);
  }
}
