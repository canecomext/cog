import { ModelDefinition } from '../types/model.types.ts';

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
    return `import { drizzle } from 'npm:drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'npm:drizzle-orm';
import type { PgTransaction } from 'npm:drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'npm:drizzle-orm/postgres-js';
import postgres from 'npm:postgres';
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
   * Generate migration runner
   */
  generateMigrationRunner(): string {
    return `import { migrate } from 'npm:drizzle-orm/postgres-js/migrator';
import { getDatabase } from './database.ts';

/**
 * Run database migrations
 */
export async function runMigrations() {
  const db = getDatabase();
  
  console.log('Running migrations...');
  
  try {
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Create initial migration
 */
export function generateInitialMigration(): string {
  // This would generate the SQL for creating all tables
  return \`
-- Initial migration
${this.generateCreateTableStatements()}
  \`;
}
`;
  }

  /**
   * Generate CREATE TABLE statements for migration
   */
  private generateCreateTableStatements(): string {
    const statements: string[] = [];

    for (const model of this.models) {
      statements.push(this.generateCreateTable(model));
    }

    // Add junction tables for many-to-many relationships
    for (const model of this.models) {
      if (model.relationships) {
        for (const rel of model.relationships) {
          if (rel.type === 'manyToMany' && rel.through) {
            statements.push(this.generateJunctionTable(model, rel));
          }
        }
      }
    }

    return statements.join('\n\n');
  }

  /**
   * Generate CREATE TABLE statement for a model
   */
  private generateCreateTable(model: ModelDefinition): string {
    let sql = `CREATE TABLE IF NOT EXISTS ${model.schema ? `${model.schema}.` : ''}${model.tableName} (\n`;
    
    const columns: string[] = [];
    
    for (const field of model.fields) {
      columns.push(this.generateColumnDefinition(field));
    }

    // Add timestamp columns
    if (model.timestamps) {
      if (model.timestamps === true || model.timestamps.createdAt) {
        columns.push('  created_at TIMESTAMP DEFAULT NOW() NOT NULL');
      }
      if (model.timestamps === true || model.timestamps.updatedAt) {
        columns.push('  updated_at TIMESTAMP DEFAULT NOW() NOT NULL');
      }
      if (typeof model.timestamps === 'object' && model.timestamps.deletedAt) {
        columns.push('  deleted_at TIMESTAMP');
      }
    }

    // Add soft delete column
    if (model.softDelete && !(typeof model.timestamps === 'object' && model.timestamps?.deletedAt)) {
      columns.push('  deleted_at TIMESTAMP');
    }

    sql += columns.join(',\n') + '\n);';

    // Add indexes
    if (model.indexes) {
      for (const index of model.indexes) {
        sql += `\n\nCREATE ${index.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${index.name || `idx_${model.tableName}_${index.fields.join('_')}`} ON ${model.tableName} (${index.fields.join(', ')})${index.where ? ` WHERE ${index.where}` : ''};`;
      }
    }

    return sql;
  }

  /**
   * Generate column definition
   */
  private generateColumnDefinition(field: any): string {
    let columnDef = `  ${this.toSnakeCase(field.name)} `;

    // Map field type to PostgreSQL type
    switch (field.type) {
      case 'text':
        columnDef += 'TEXT';
        break;
      case 'string':
        columnDef += `VARCHAR${field.maxLength ? `(${field.maxLength})` : ''}`;
        break;
      case 'integer':
        columnDef += 'INTEGER';
        break;
      case 'bigint':
        columnDef += 'BIGINT';
        break;
      case 'decimal':
        columnDef += `DECIMAL${field.precision ? `(${field.precision}${field.scale !== undefined ? `, ${field.scale}` : ''})` : ''}`;
        break;
      case 'boolean':
        columnDef += 'BOOLEAN';
        break;
      case 'date':
        columnDef += 'TIMESTAMP';
        break;
      case 'uuid':
        columnDef += 'UUID';
        break;
      case 'json':
        columnDef += 'JSON';
        break;
      case 'jsonb':
        columnDef += 'JSONB';
        break;
      case 'point':
      case 'linestring':
      case 'polygon':
      case 'multipoint':
      case 'multilinestring':
      case 'multipolygon':
      case 'geometry':
      case 'geography':
        columnDef += this.getPostGISType(field);
        break;
      default:
        columnDef += 'TEXT';
    }

    // Add array modifier
    if (field.array) {
      columnDef += '[]';
    }

    // Add constraints
    if (field.primaryKey) {
      columnDef += ' PRIMARY KEY';
    }
    if (field.unique && !field.primaryKey) {
      columnDef += ' UNIQUE';
    }
    if (field.required || field.primaryKey) {
      columnDef += ' NOT NULL';
    }
    if (field.defaultValue !== undefined) {
      if (typeof field.defaultValue === 'string' && field.defaultValue.includes('()')) {
        columnDef += ` DEFAULT ${field.defaultValue}`;
      } else if (typeof field.defaultValue === 'string') {
        columnDef += ` DEFAULT '${field.defaultValue}'`;
      } else {
        columnDef += ` DEFAULT ${field.defaultValue}`;
      }
    }
    if (field.references) {
      columnDef += ` REFERENCES ${field.references.model.toLowerCase()}(${field.references.field})`;
      if (field.references.onDelete) {
        columnDef += ` ON DELETE ${field.references.onDelete}`;
      }
      if (field.references.onUpdate) {
        columnDef += ` ON UPDATE ${field.references.onUpdate}`;
      }
    }

    return columnDef;
  }

  /**
   * Get PostGIS type string
   */
  private getPostGISType(field: any): string {
    if (field.type === 'geometry' || field.type === 'geography') {
      const type = field.type.toUpperCase();
      const geometryType = field.geometryType || 'GEOMETRY';
      const srid = field.srid || 4326;
      return `${type}(${geometryType}, ${srid})`;
    } else {
      // Specific geometry type
      const srid = field.srid || 4326;
      return `GEOMETRY(${field.type.toUpperCase()}, ${srid})`;
    }
  }

  /**
   * Generate junction table for many-to-many relationship
   */
  private generateJunctionTable(model: ModelDefinition, rel: any): string {
    const tableName = rel.through;
    const sourceFK = rel.foreignKey || `${model.tableName}_id`;
    const targetFK = rel.targetForeignKey || `${rel.target.toLowerCase()}_id`;

    return `CREATE TABLE IF NOT EXISTS ${tableName} (
  ${sourceFK} UUID NOT NULL REFERENCES ${model.tableName}(id) ON DELETE CASCADE,
  ${targetFK} UUID NOT NULL REFERENCES ${rel.target.toLowerCase()}(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  PRIMARY KEY (${sourceFK}, ${targetFK})
);

CREATE INDEX IF NOT EXISTS idx_${tableName}_${sourceFK} ON ${tableName} (${sourceFK});
CREATE INDEX IF NOT EXISTS idx_${tableName}_${targetFK} ON ${tableName} (${targetFK});`;
  }

  /**
   * Convert string to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
  }
}