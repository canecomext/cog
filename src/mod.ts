/**
 * Main module exports for the CRUD Operations Generator
 */

import { ModelParser } from "./parser/model-parser.ts";
import { DrizzleSchemaGenerator } from "./generators/drizzle-schema.generator.ts";
import { DatabaseInitGenerator } from "./generators/database-init.generator.ts";
import { DomainAPIGenerator } from "./generators/domain-api.generator.ts";
import { RestAPIGenerator } from "./generators/rest-api.generator.ts";
import { GeneratorConfig } from "./types/model.types.ts";

export * from "./types/model.types.ts";

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
      type: options.database?.type || "postgresql",
      postgis: options.database?.postgis !== false,
      schema: options.database?.schema,
    },
    features: {
      softDeletes: options.features?.softDeletes !== false,
      timestamps: options.features?.timestamps !== false,
      uuid: options.features?.uuid !== false,
      hooks: true,
      validation: options.features?.validation !== false,
      migration: options.features?.migration !== false,
    },
    naming: {
      tableNaming: "snake_case",
      columnNaming: "snake_case",
    },
  };

  // Step 1: Parse models
  console.log("📖 Parsing model definitions...");
  const parser = new ModelParser();
  const { models, errors } = await parser.parseModelsFromDirectory(modelsPath);

  if (errors.length > 0) {
    console.error("\n❌ Validation errors found:");
    for (const error of errors) {
      const prefix = error.severity === "error" ? "  ❌" : "  ⚠️";
      console.error(
        `${prefix} ${error.model ? `[${error.model}]` : ""} ${error.message}`,
      );
    }

    const hasErrors = errors.some((e) => e.severity === "error");
    if (hasErrors) {
      throw new Error("Generation aborted due to validation errors");
    }
  }

  console.log(
    `✅ Found ${models.length} valid models: ${
      models.map((m) => m.name).join(", ")
    }\n`,
  );

  // Step 2: Generate code
  console.log("⚙️  Generating code...");

  const files = new Map<string, string>();

  // Generate Drizzle schemas
  console.log("  📝 Generating Drizzle ORM schemas...");
  const schemaGenerator = new DrizzleSchemaGenerator(models, {
    isCockroachDB: config.database.type === "cockroachdb",
  });
  const schemas = schemaGenerator.generateSchemas();
  schemas.forEach((content, path) => files.set(path, content));

  // Generate database initialization
  console.log("  🗄️  Generating database initialization...");
  const dbInitGenerator = new DatabaseInitGenerator(models);
  files.set("db/database.ts", dbInitGenerator.generateDatabaseInit());
  files.set("db/migrations.ts", dbInitGenerator.generateMigrationRunner());

  // Generate domain APIs
  console.log("  🎯 Generating domain APIs...");
  const domainGenerator = new DomainAPIGenerator(models);
  const domainFiles = domainGenerator.generateDomainAPIs();
  domainFiles.forEach((content, path) => files.set(path, content));

  // Generate REST APIs
  console.log("  🌐 Generating REST endpoints...");
  const restGenerator = new RestAPIGenerator(models);
  const restFiles = restGenerator.generateRestAPIs();
  restFiles.forEach((content, path) => files.set(path, content));

  // Generate main index file
  console.log("  📦 Generating main export file...");
  files.set("index.ts", generateMainIndex(models));

  // Step 3: Write files
  console.log("\n📝 Writing generated files...");
  await writeGeneratedFiles(outputPath, files);

  console.log(`\n✅ Successfully generated ${files.size} files!`);

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
import { initializeDatabase, type DatabaseConfig, type DbTransaction } from './db/database.ts';
import { registerRestRoutes } from './rest/index.ts';
import * as domain from './domain/index.ts';
import * as schema from './schema/index.ts';

type Env = {
  Variables: {
    requestId?: string;
    userId?: string;
    transaction?: DbTransaction;
  }
}

export interface InitializationConfig {
  database: DatabaseConfig;
  app: Hono<Env>;
  hooks?: {
    [modelName: string]: any;
  };
}

/**
 * Initialize the generated backend
 */
export async function initializeGenerated(config: InitializationConfig) {
  // Initialize database
  const { db, sql } = await initializeDatabase(config.database);

  // Register REST routes
  registerRestRoutes(config.app);

  // Initialize domain layers with hooks if provided
  if (config.hooks) {
    ${
    models.map((m) => `
    if (config.hooks.${m.name.toLowerCase()}) {
      Object.assign(domain.${m.name.toLowerCase()}Domain, 
        new domain.${m.name}Domain(config.hooks.${m.name.toLowerCase()}));
    }`).join("")
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
`;
}

/**
 * Write generated files to disk
 */
async function writeGeneratedFiles(
  outputPath: string,
  files: Map<string, string>,
) {
  // Create output directory
  await Deno.mkdir(outputPath, { recursive: true });

  for (const [relativePath, content] of files) {
    const fullPath = `${outputPath}/${relativePath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

    // Create directory if needed
    await Deno.mkdir(dir, { recursive: true });

    // Write file
    await Deno.writeTextFile(fullPath, content);
    console.log(`  ✓ ${relativePath}`);
  }
}
