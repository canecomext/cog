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
      softDeletes: options.features?.softDeletes !== false,
      timestamps: options.features?.timestamps !== false,
      uuid: options.features?.uuid !== false,
      hooks: true,
      validation: options.features?.validation !== false,
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
    if (hasErrors) {
      throw new Error('Generation aborted due to validation errors');
    }
  }

  // Step 2: Generate code
  const files = new Map<string, string>();

  // Generate Drizzle schemas
  const schemaGenerator = new DrizzleSchemaGenerator(models, {
    isCockroachDB: config.database.type === 'cockroachdb',
  });
  const schemas = schemaGenerator.generateSchemas();
  schemas.forEach((content, path) => files.set(path, content));

  // Generate database initialization and utilities
  const dbInitGenerator = new DatabaseInitGenerator(models, {
    dbType: config.database.type,
    postgis: config.database.postgis,
  });

  files.set('db/database.ts', dbInitGenerator.generateDatabaseInit());
  files.set('db/initialize-database.ts', dbInitGenerator.generateDatabaseInitialization());

  // Generate domain APIs
  const domainGenerator = new DomainAPIGenerator(models);
  const domainFiles = domainGenerator.generateDomainAPIs();
  domainFiles.forEach((content, path) => files.set(path, content));

  // Generate REST APIs
  const restGenerator = new RestAPIGenerator(models);
  const restFiles = restGenerator.generateRestAPIs();
  restFiles.forEach((content, path) => files.set(path, content));

  // Generate OpenAPI specification
  const openAPIGenerator = new OpenAPIGenerator(models);
  const openAPIFiles = openAPIGenerator.generateOpenAPI();
  openAPIFiles.forEach((content, path) => files.set(path, content));

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

import { Hono } from '@hono/hono';
import { connect, type DatabaseConfig } from './db/database.ts';
import { registerRestRoutes } from './rest/index.ts';
import type { Env } from './rest/types.ts';
import * as domain from './domain/index.ts';
import * as schema from './schema/index.ts';

export interface InitializationConfig {
  database: DatabaseConfig;
  app: Hono<Env>;
  api?: {
    baseUrl?: string; // Optional base URL prefix for API routes (e.g., '/api/v1')
  };
  hooks?: {
    [modelName: string]: any;
  };
}

/**
 * Initialize the generated backend
 */
export async function initializeGenerated(config: InitializationConfig) {
  // Initialize database
  const { db, sql } = await connect(config.database);

  // Register REST routes after all global middlewares
  registerRestRoutes(config.app, config.api?.baseUrl);

  // Initialize domain layers with hooks if provided
  if (config.hooks) {
    ${
    models.map((m) => `
    if (config.hooks.${m.name.toLowerCase()}) {
      Object.assign(domain.${m.name.toLowerCase()}Domain, 
        new domain.${m.name}Domain(config.hooks.${m.name.toLowerCase()}));
    }`).join('')
  }
  }

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
export type { Env } from './rest/types.ts';
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
