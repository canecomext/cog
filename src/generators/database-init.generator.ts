import { ModelDefinition } from "../types/model.types.ts";

/**
 * Generates database initialization code
 */
export class DatabaseInitGenerator {
  private models: ModelDefinition[];

  constructor(models: ModelDefinition[]) {
    this.models = models;
  }

  /**
   * Generate database initialization file
   */
  generateDatabaseInit(): string {
    return `import { drizzle } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema/index.ts';

// Export transaction type for use in domain layer
export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | 'require' | 'prefer' | 'allow' | 'verify-full' | object;
  max?: number;
  idle_timeout?: number;
}

let db: ReturnType<typeof drizzle> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

/**
 * Initialize database connection
 */
export async function initializeDatabase(config: DatabaseConfig) {
  if (db) {
    return { db, sql };
  }

  // Create postgres connection
  sql = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    max: config.max || 10,
    idle_timeout: config.idle_timeout || 20,
  });

  // Create drizzle instance
  db = drizzle(sql, { schema });

  // Test connection
  try {
    await sql\`SELECT 1\`;
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }

  return { db, sql };
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

/**
 * Get SQL instance
 */
export function getSQL() {
  if (!sql) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return sql;
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}

/**
 * Execute in transaction
 */
export async function withTransaction<T>(
  callback: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  const database = getDatabase();
  return await database.transaction(callback as any);
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const sqlInstance = getSQL();
    await sqlInstance\`SELECT 1\`;
    return true;
  } catch {
    return false;
  }
}
`;
  }

  /**
   * Convert string to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
      .replace(/^_/, "");
  }
}
