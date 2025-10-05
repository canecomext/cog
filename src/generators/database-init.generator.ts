import { ModelDefinition } from '../types/model.types.ts';

/**
 * Generates database initialization code
 */
export class DatabaseInitGenerator {
  private models: ModelDefinition[];
  private dbType: 'postgresql' | 'cockroachdb';
  private postgis: boolean;

  constructor(
    models: ModelDefinition[],
    options: { dbType?: string; postgis?: boolean } = {},
  ) {
    this.models = models;
    this.dbType = options.dbType === 'cockroachdb' ? 'cockroachdb' : 'postgresql';
    this.postgis = options.postgis !== false;
  }

  /**
   * Generate database initialization script
   */
  generateDatabaseInitialization(): string {
    const createPostgis = this.postgis
      ? "\n    // Create PostGIS extension\n    await sql`CREATE EXTENSION IF NOT EXISTS postgis`;\n    console.log('PostGIS extension created');"
      : '';

    // Remove extra indentation and fix template
    return `import { initializeDatabase, closeDatabase, getSQL } from './database.ts';
import { load } from "@std/dotenv";
import { join } from "@std/path";

// Handle interruption signals
Deno.addSignalListener("SIGINT", async () => {
  console.log('\\nReceived interrupt signal');
  await closeDatabase();
  console.log('Database connection closed');
  Deno.exit(0);
});

// Load environment variables
const env = await load();

async function initialize() {
  try {
    // Initialize database with the existing configuration
    await initializeDatabase({
      connectionString: env.DB_URL,
      ssl: env.DB_SSL_CERT_FILE
        ? { ca: await Deno.readTextFile(join(Deno.cwd(), env.DB_SSL_CERT_FILE)) }
        : 'require'
    });
    
    const sql = getSQL();
${createPostgis}

    // Create tables
${this.generateTableCreationSQL()}

    // Create junction tables for many-to-many relationships
${this.generateJunctionTableCreationSQL()}

    // Create indexes
${this.generateIndexCreationSQL()}

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error during database initialization:', error);
    throw error;
  } finally {
    await closeDatabase();
    console.log('Database connection closed');
  }
}

await initialize();
`;
  }

  /**
   * Generate database utility file
   */
  generateDatabaseInit(): string {
    return `import { drizzle } from "drizzle-orm/postgres-js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema/index.ts";

// Export transaction type for use in domain layer
export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;

export interface DatabaseConfig {
  /**
   * Connection string in PostgreSQL format.
   * If provided, individual connection parameters (host, port, etc.) are ignored.
   * Example: 'postgresql://user:password@localhost:5432/dbname'
   */
  connectionString?: string;

  // Individual connection parameters (used if connectionString is not provided)
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | 'require' | 'prefer' | 'allow' | 'verify-full' | {
    ca?: string;      // Path to the CA certificate file
    key?: string;     // Path to the client key file
    cert?: string;    // Path to the client certificate file
    rejectUnauthorized?: boolean;  // Whether to reject unauthorized connections
  };
  max?: number;
  idle_timeout?: number;
}

let db: ReturnType<typeof drizzle> | null = null;
let sql: postgres.Sql<{}> | null = null;

/**
 * Initialize database connection
 */
export async function initializeDatabase(config: DatabaseConfig) {
  if (db) {
    return { db, sql };
  }

  // Create postgres connection
  const options = {
    ssl: config.ssl,
    max: config.max || 10,
    idle_timeout: config.idle_timeout || 20,
  };

  if (config.connectionString) {
    sql = postgres(config.connectionString, options);
  } else {
    sql = postgres({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ...options,
    });
  };

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
export function withoutTransaction() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

/**
 * Execute database operations within a transaction context
 */
export async function withTransaction<T>(
  callback: (tx: DbTransaction) => Promise<T>,
  options?: {
    isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
    accessMode?: 'read write' | 'read only';
    deferrable?: boolean;
  }
): Promise<T> {
  const database = withoutTransaction();
  return await database.transaction(callback, options);
}

/**
 * Get SQL instance
 */
export function getSQL(): postgres.Sql<{}> {
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
    return true;
  }
  return false;
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
}`;
  }

  /**
   * Sort models by their dependencies
   */
  private sortModelsByDependencies(): ModelDefinition[] {
    const graph = new Map<string, Set<string>>();
    const temp = new Set<string>();
    const visited = new Set<string>();
    const ordered: string[] = [];

    // Build dependency graph: model -> set(dependencies it references)
    for (const model of this.models) {
      const modelName = model.name.toLowerCase();
      if (!graph.has(modelName)) graph.set(modelName, new Set());
      for (const field of model.fields) {
        if (field.references) {
          const ref = field.references.model.toLowerCase();
          // ignore self-references
          if (ref !== modelName) graph.get(modelName)!.add(ref);
        }
      }
    }

    // DFS visit ensures deps are added before the model
    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (temp.has(name)) {
        // cycle detected; break it by returning (self/circular deps handled)
        return;
      }
      temp.add(name);
      const deps = graph.get(name) || new Set();
      for (const d of deps) visit(d);
      temp.delete(name);
      visited.add(name);
      ordered.push(name); // push after deps so deps come first
    };

    for (const model of this.models) visit(model.name.toLowerCase());

    // Map back to ModelDefinition in correct order
    const modelByName = new Map(this.models.map((m) => [m.name.toLowerCase(), m] as const));
    return ordered.map((n) => modelByName.get(n)!).filter(Boolean);
  }

  /**
   * Generate SQL statements for junction table creation
   */
  private generateJunctionTableCreationSQL(): string {
    const junctionTables: string[] = [];
    const processedJunctions = new Set<string>();

    for (const model of this.models) {
      if (!model.relationships) continue;

      for (const rel of model.relationships) {
        if (rel.type === 'manyToMany' && rel.through) {
          // Avoid generating the same junction table twice
          if (processedJunctions.has(rel.through)) continue;
          processedJunctions.add(rel.through);

          // Find the target model
          const targetModel = this.models.find((m) => m.name === rel.target);
          if (!targetModel) continue;

          // Get primary key types
          const sourcePK = model.fields.find((f) => f.primaryKey);
          const targetPK = targetModel.fields.find((f) => f.primaryKey);

          if (!sourcePK || !targetPK) continue;

          // Generate the junction table name and columns
          const tableName = rel.through.toLowerCase();
          const sourceFKColumn = rel.foreignKey || this.toSnakeCase(model.name) + '_id';
          const targetFKColumn = rel.targetForeignKey || this.toSnakeCase(rel.target) + '_id';

          let tableSQL = `    await sql\`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        ${sourceFKColumn} UUID NOT NULL REFERENCES "${
            this.toSnakeCase(model.name)
          }"(${sourcePK.name}) ON DELETE CASCADE,
        ${targetFKColumn} UUID NOT NULL REFERENCES "${
            this.toSnakeCase(targetModel.name)
          }"(${targetPK.name}) ON DELETE CASCADE,`;

          // Add timestamps if enabled
          const hasTimestamps = model.timestamps || targetModel.timestamps;
          if (hasTimestamps) {
            tableSQL += `
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,`;
          }

          tableSQL += `
        PRIMARY KEY (${sourceFKColumn}, ${targetFKColumn})
      );\`;
    console.log('Created junction table: ${tableName}');`;

          junctionTables.push(tableSQL);

          // Add indexes for the foreign keys
          const indexSQL = `    // Create indexes for ${tableName}
    await sql\`CREATE INDEX IF NOT EXISTS idx_${tableName}_${sourceFKColumn} ON "${tableName}"(${sourceFKColumn});\`;
    await sql\`CREATE INDEX IF NOT EXISTS idx_${tableName}_${targetFKColumn} ON "${tableName}"(${targetFKColumn});\`;
    console.log('Created indexes for junction table: ${tableName}');`;

          junctionTables.push(indexSQL);
        }
      }
    }

    return junctionTables.join('\n\n');
  }

  /**
   * Generate SQL statements for table creation
   */
  private generateTableCreationSQL(): string {
    const sortedModels = this.sortModelsByDependencies();
    return sortedModels.map((model) => {
      const tableName = this.toSnakeCase(model.name);
      const columns = this.generateColumnsSQL(model);
      const constraints = this.generateConstraintsSQL(model);

      return `    await sql\`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        ${columns}${constraints ? ',\n        ' + constraints : ''}
      );\`;
    console.log('Created table: ${tableName}');`;
    }).join('\n\n');
  }

  /**
   * Generate column definitions for a table
   */
  private generateColumnsSQL(model: ModelDefinition): string {
    const columns = [];

    // Model-specific columns
    for (const field of model.fields) {
      if (field.primaryKey) {
        // Primary key field
        if (field.type === 'uuid') {
          columns.push(
            `${field.name} UUID PRIMARY KEY${field.defaultValue ? ` DEFAULT ${field.defaultValue}` : ''} NOT NULL`,
          );
        } else {
          columns.push(`${field.name} ${this.getColumnType(field)} PRIMARY KEY NOT NULL`);
        }
        continue;
      }

      const columnName = this.toSnakeCase(field.name);
      const columnType = this.getColumnType(field);
      const constraints = this.getColumnConstraints(field);
      columns.push(`"${columnName}" ${columnType}${constraints}`);
    }

    // Common columns
    if (model.timestamps !== false) {
      const timestampType = 'TIMESTAMP';
      columns.push(`created_at ${timestampType} DEFAULT CURRENT_TIMESTAMP NOT NULL`);
      columns.push(`updated_at ${timestampType} DEFAULT CURRENT_TIMESTAMP NOT NULL`);
    }
    if (model.softDelete) {
      columns.push(`deleted_at TIMESTAMP`);
    }

    return columns.join(',\n        ');
  }

  /**
   * Generate constraints for a table
   */
  private generateConstraintsSQL(model: ModelDefinition): string {
    const constraints = [];

    // Unique constraints
    for (const field of model.fields) {
      if (field.unique) {
        const columnName = this.toSnakeCase(field.name);
        constraints.push(`CONSTRAINT "${model.name.toLowerCase()}_${columnName}_unique" UNIQUE("${columnName}")`);
      }
    }

    // Foreign key constraints
    for (const field of model.fields) {
      if (field.references) {
        const columnName = this.toSnakeCase(field.name);
        const refTable = this.toSnakeCase(field.references.model);
        const refColumn = field.references.field || 'id';
        const onDelete = field.references.onDelete || 'NO ACTION';
        const onUpdate = field.references.onUpdate || 'NO ACTION';

        constraints.push(
          `CONSTRAINT "${model.name.toLowerCase()}_${columnName}_fk" ` +
            `FOREIGN KEY ("${columnName}") REFERENCES "${refTable}"("${refColumn}") ` +
            `ON DELETE ${onDelete} ON UPDATE ${onUpdate}`,
        );
      }
    }

    return constraints.join(',\n        ');
  }

  /**
   * Generate SQL statements for index creation
   */
  private generateIndexCreationSQL(): string {
    const processedIndexes = new Set(); // Track unique index names
    return this.models.map((model) => {
      const tableName = this.toSnakeCase(model.name);
      const indexes = this.generateIndexes(model);

      if (!indexes.length) return '';

      return indexes.map(({ sql, name }) => {
        if (processedIndexes.has(name)) return '';
        processedIndexes.add(name);
        return `    await sql\`${sql}\`;
    console.log('Created index: ${name}');`;
      }).filter(Boolean).join('\n');
    }).filter(Boolean).join('\n\n');
  }

  /**
   * Generate indexes for a table
   */
  private generateIndexes(model: ModelDefinition): Array<{ sql: string; name: string }> {
    const indexes = [];
    const tableName = this.toSnakeCase(model.name);

    // Field-level indexes
    for (const field of model.fields) {
      if (field.index) {
        const columnName = this.toSnakeCase(field.name);
        const method = this.getIndexMethod(field);
        const methodClause = method ? `USING ${method}` : '';
        const indexName = `idx_${tableName}_${columnName}`;

        indexes.push({
          name: indexName,
          sql: `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ` +
            `${methodClause} ("${columnName}")`,
        });
      }
    }

    // Model-level indexes
    if (model.indexes) {
      for (const idx of model.indexes) {
        const columns = idx.fields.map((f) => `"${this.toSnakeCase(f)}"`).join(', ');
        const indexName = idx.name || `idx_${tableName}_${idx.fields.map((f) => this.toSnakeCase(f)).join('_')}`;
        const method = idx.type || this.getDefaultIndexMethod();
        const methodClause = method ? `USING ${method}` : '';

        indexes.push({
          name: indexName,
          sql: `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ` +
            `${methodClause} (${columns})`,
        });
      }
    }

    return indexes;
  }

  /**
   * Get SQL type for a field
   */
  private getColumnType(field: any): string {
    // Handle array types first
    if (field.array) {
      if (field.type === 'text') return 'TEXT[]';
      const baseType = this.getColumnType({ ...field, array: false });
      return `${baseType}[]`;
    }

    // Basic types that are the same in both PostgreSQL and CockroachDB
    const commonTypes: Record<string, string> = {
      'uuid': 'UUID',
      'string': field.maxLength ? `VARCHAR(${field.maxLength})` : 'TEXT',
      'text': 'TEXT',
      'boolean': 'BOOLEAN',
      'date': 'TIMESTAMP',
      'jsonb': 'JSONB',
      'timestamp': 'TIMESTAMP',
    };

    if (field.type in commonTypes) {
      return commonTypes[field.type];
    }

    // Database-specific types
    if (this.dbType === 'cockroachdb') {
      switch (field.type) {
        case 'integer':
          return 'INT4';
        case 'bigint':
          return 'INT8';
        case 'decimal':
          return `DECIMAL(${field.precision || 10}, ${field.scale || 2})`;
        case 'point':
          return this.postgis ? 'GEOMETRY(POINT, 4326)' : 'JSONB';
        case 'polygon':
          return this.postgis ? 'GEOMETRY(POLYGON, 4326)' : 'JSONB';
        case 'linestring':
          return this.postgis ? 'GEOMETRY(LINESTRING, 4326)' : 'JSONB';
        case 'geometry':
          if (field.geometryType === 'POLYGON') {
            return this.postgis ? 'GEOMETRY(POLYGON, 4326)' : 'JSONB';
          }
          return 'JSONB';
        case 'geography':
          if (field.geometryType === 'MULTIPOLYGON') {
            return this.postgis ? 'GEOMETRY(MULTIPOLYGON, 4326)' : 'JSONB';
          }
          return 'JSONB';
        default:
          return 'TEXT';
      }
    } else {
      // PostgreSQL types
      switch (field.type) {
        case 'integer':
          return 'INTEGER';
        case 'bigint':
          return 'BIGINT';
        case 'decimal':
          return `DECIMAL(${field.precision || 10}, ${field.scale || 2})`;
        case 'point':
          return this.postgis ? 'GEOMETRY(POINT, 4326)' : 'JSONB';
        case 'polygon':
          return this.postgis ? 'GEOMETRY(POLYGON, 4326)' : 'JSONB';
        case 'linestring':
          return this.postgis ? 'GEOMETRY(LINESTRING, 4326)' : 'JSONB';
        case 'geometry':
          if (field.geometryType === 'POLYGON') {
            return this.postgis ? 'GEOMETRY(POLYGON, 4326)' : 'JSONB';
          }
          return 'JSONB';
        case 'geography':
          if (field.geometryType === 'MULTIPOLYGON') {
            return this.postgis ? 'GEOGRAPHY(MULTIPOLYGON, 4326)' : 'JSONB';
          }
          return 'JSONB';
        default:
          return 'TEXT';
      }
    }
  }

  /**
   * Get SQL constraints for a field
   */
  private getColumnConstraints(field: any): string {
    const constraints = [];

    if (field.required) {
      constraints.push('NOT NULL');
    }

    if (field.defaultValue !== undefined) {
      if (field.type === 'uuid' && field.defaultValue === 'gen_random_uuid()') {
        constraints.push(`DEFAULT gen_random_uuid()`);
      } else if (typeof field.defaultValue === 'string' && !field.defaultValue.includes('(')) {
        constraints.push(`DEFAULT '${field.defaultValue}'`);
      } else if (typeof field.defaultValue === 'boolean') {
        constraints.push(`DEFAULT ${field.defaultValue}`);
      } else if (typeof field.defaultValue === 'number') {
        constraints.push(`DEFAULT ${field.defaultValue}`);
      } else if (field.defaultValue === null) {
        constraints.push('DEFAULT NULL');
      } else {
        constraints.push(`DEFAULT ${field.defaultValue}`);
      }
    }

    return constraints.length ? ' ' + constraints.join(' ') : '';
  }

  /**
   * Get index method based on field type
   */
  private getIndexMethod(field: any): string {
    // CockroachDB only supports BTREE and INVERTED indexes
    if (this.dbType === 'cockroachdb') {
      if (field.type === 'json' || field.type === 'jsonb') {
        return 'INVERTED';
      }
      return this.postgis && ['point', 'polygon', 'multipolygon', 'linestring'].includes(field.type) ? 'GIST' : 'BTREE';
    }

    // PostgreSQL index types
    if (this.postgis && ['point', 'polygon', 'multipolygon', 'linestring'].includes(field.type)) {
      return 'GIST';
    }

    if (field.type === 'json' || field.type === 'jsonb') {
      return 'GIN';
    }

    return 'BTREE';
  }

  /**
   * Get default index method for the database
   */
  private getDefaultIndexMethod(): string {
    return this.dbType === 'cockroachdb' ? 'BTREE' : 'BTREE';
  }

  /**
   * Convert string to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
      .replace(/^_/, '');
  }
}
