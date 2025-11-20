/**
 * Main module exports for the CRUD Operations Generator
 */

import { ModelParser } from './parser/model-parser.ts';
import { DrizzleSchemaGenerator } from './generators/drizzle-schema.generator.ts';
import { DatabaseInitGenerator } from './generators/database-init.generator.ts';
import { DomainAPIGenerator } from './generators/domain-api.generator.ts';
import { RestAPIGenerator } from './generators/rest-api.generator.ts';
import { OpenAPIGenerator } from './generators/openapi.generator.ts';
import { GeneratorConfig } from './types/model.types.ts';

export * from './types/model.types.ts';

/**
 * Generate CRUD backend code from model definitions
 * @param modelsPath - Path to the directory containing model JSON files
 * @param outputPath - Path where generated code will be written
 * @param options - Additional generation options
 */
export async function generateFromModels(
  modelsPath: string,
  outputPath: string,
  options: Partial<GeneratorConfig> = {},
) {
  // Default configuration
  const config: GeneratorConfig = {
    modelsPath,
    outputPath,
    database: {
      type: options.database?.type || 'postgresql',
      postgis: options.database?.postgis !== false,
      schema: options.database?.schema,
    },
    features: {
      timestamps: options.features?.timestamps !== false,
      hooks: true,
    },
    documentation: {
      enabled: options.documentation?.enabled !== false,
    },
    naming: {
      tableNaming: 'snake_case',
      columnNaming: 'snake_case',
    },
    verbose: options.verbose,
  };

  const verbose = config.verbose === true;

  // Step 1: Parse models
  const parser = new ModelParser();
  const { models, errors } = await parser.parseModelsFromDirectory(modelsPath);

  if (errors.length > 0) {
    const hasErrors = errors.some((e) => e.severity === 'error');
    console.log(errors.filter((e) => e.severity === 'error'));

    if (hasErrors) {
      throw new Error('Generation aborted due to validation errors');
    }
  }

  // Apply global feature flag overrides to all models
  for (const model of models) {
    // Override timestamps if explicitly disabled
    if (config.features?.timestamps === false) {
      model.timestamps = false;
    }
    // Apply global schema if specified
    if (config.database.schema) {
      model.schema = config.database.schema;
    }
  }

  // Step 2: Generate code
  const files = new Map<string, string>();

  // Generate Drizzle schemas
  const schemaGenerator = new DrizzleSchemaGenerator(models, {
    isCockroachDB: config.database.type === 'cockroachdb',
    postgis: config.database.postgis,
  });
  const schemas = schemaGenerator.generateSchemas();
  schemas.forEach((content, path) => files.set(path, content));

  // Generate database initialization and utilities
  const dbInitGenerator = new DatabaseInitGenerator(models, {
    dbType: config.database.type,
    postgis: config.database.postgis,
  });

  files.set('db/database.ts', dbInitGenerator.generateDatabaseInit());
  files.set(
    'db/initialize-database.ts',
    dbInitGenerator.generateDatabaseInitialization(),
  );

  // Generate domain APIs
  const domainGenerator = new DomainAPIGenerator(models);
  const domainFiles = domainGenerator.generateDomainAPIs();
  domainFiles.forEach((content, path) => files.set(path, content));

  // Generate REST APIs
  const restGenerator = new RestAPIGenerator(models, {
    docsEnabled: config.documentation?.enabled,
  });
  const restFiles = restGenerator.generateRestAPIs();
  restFiles.forEach((content, path) => files.set(path, content));

  // Generate OpenAPI specification (only if docs are enabled)
  if (config.documentation?.enabled !== false) {
    const openAPIGenerator = new OpenAPIGenerator(models);
    const openAPIFiles = openAPIGenerator.generateOpenAPI();
    openAPIFiles.forEach((content, path) => files.set(path, content));
  }

  // Generate main index file
  files.set('index.ts', generateMainIndex(models));

  // Step 3: Write files
  await writeGeneratedFiles(outputPath, files, verbose);

  return {
    models,
    fileCount: files.size,
    outputPath,
  };
}

/**
 * Generate main index file
 */
function generateMainIndex(models: any[]): string {
  return `/**
 * Generated CRUD Backend
 *
 * This is the main entry point for the generated backend code.
 */

import { Hono } from 'jsr:@hono/hono';
import { connect, type DatabaseConfig } from './db/database.ts';
import { registerRestRoutes, ${models.map((m) => `initialize${m.name}RestRoutes`).join(', ')} } from './rest/index.ts';
import * as domain from './domain/index.ts';
import * as schema from './schema/index.ts';

// Generic initialization config - works with any Hono Env type
export interface InitializationConfig<Env extends { Variables: Record<string, any> } = any> {
  database: DatabaseConfig;
  app: Hono<Env>;
  api?: {
    basePath?: string; // Optional base path prefix for API routes (e.g., '/api/v1', default: '/api')
  };
  logging?: {
    trace?: (message: string, ...args: any[]) => void;
    debug?: (message: string, ...args: any[]) => void;
    info?: (message: string, ...args: any[]) => void;
    warn?: (message: string, ...args: any[]) => void;
    error?: (message: string, ...args: any[]) => void;
  };
  domainHooks?: {
    [modelName: string]: any;
  };
  restHooks?: {
    [modelName: string]: any;
  };
}

/**
 * Initialize the generated backend
 * @param config Configuration object with database, app, and optional hooks
 * @returns Initialized database connection, SQL client, domain objects, and schema
 */
export async function initializeGenerated<Env extends { Variables: Record<string, any> } = any>(config: InitializationConfig<Env>) {
  // Initialize database
  const { db, sql } = await connect(config.database, config.logging);

  // Initialize domain layers with hooks if provided
  if (config.domainHooks) {
    ${
    models
      .map(
        (m) => `
    if (config.domainHooks.${m.name.toLowerCase()}) {
      Object.assign(domain.${m.name.toLowerCase()}Domain,
        new domain.${m.name}Domain(
        config.domainHooks.${m.name.toLowerCase()}
      ));
    }`,
      )
      .join('')
  }
  }

  // Initialize REST routes with hooks if provided
  if (config.restHooks) {
    ${
    models
      .map(
        (m) => `
    if (config.restHooks.${m.name.toLowerCase()}) {
      initialize${m.name}RestRoutes(config.restHooks.${m.name.toLowerCase()});
    }`,
      )
      .join('')
  }
  }

  // Register REST routes after hooks initialization
  registerRestRoutes(config.app, config.api?.basePath);

  return {
    db,
    sql,
    domain,
    schema
  };
}

// Re-export everything for convenience
export * from './db/database.ts';
export * from './rest/index.ts';
export * from './domain/index.ts';
export * from './schema/index.ts';
export type { DefaultEnv } from './rest/types.ts';
`;
}

/**
 * Write generated files to disk
 */
async function writeGeneratedFiles(
  outputPath: string,
  files: Map<string, string>,
  verbose = false,
) {
  // Create output directory
  await Deno.mkdir(outputPath, { recursive: true });

  for (const [relativePath, content] of files) {
    const fullPath = `${outputPath}/${relativePath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));

    // Create directory if needed
    await Deno.mkdir(dir, { recursive: true });

    // Write file
    await Deno.writeTextFile(fullPath, content);

    // Only output file paths if verbose flag is true
    if (verbose) {
      console.log(relativePath);
    }
  }
}
