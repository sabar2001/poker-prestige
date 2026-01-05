import { Pool, QueryResult } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * PostgreSQL Connection Pool
 * 
 * Uses environment variables for configuration:
 * - DATABASE_URL (full connection string) OR
 * - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'poker_prestige',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Query helper function
 * Executes a SQL query with parameters
 */
export const query = async (
  text: string,
  params?: any[]
): Promise<QueryResult> => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[DB] Query executed', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('[DB] Query error', { text, error });
    throw error;
  }
};

/**
 * Get a client for transactions
 */
export const getClient = async () => {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Set a timeout to prevent hanging transactions
  const timeout = setTimeout(() => {
    console.error('[DB] Client checkout timeout');
    release();
  }, 5000);
  
  const releaseWithClear = () => {
    clearTimeout(timeout);
    release();
  };
  
  return {
    query,
    release: releaseWithClear,
    client
  };
};

/**
 * Test database connection
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    const result = await query('SELECT NOW()');
    console.log('[DB] Connection successful', result.rows[0]);
    return true;
  } catch (error) {
    console.error('[DB] Connection failed', error);
    return false;
  }
};

/**
 * Close all connections (for graceful shutdown)
 */
export const closePool = async (): Promise<void> => {
  await pool.end();
  console.log('[DB] Pool closed');
};

export { pool };

