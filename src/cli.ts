#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

import { ModelParser } from './parser/model-parser.ts';
import { DrizzleSchemaGenerator } from './generators/drizzle-schema.generator.ts';
import { DatabaseInitGenerator } from './generators/database-init.generator.ts';
import { DomainAPIGenerator } from './generators/domain-api.generator.ts';
import { RestAPIGenerator } from './generators/rest-api.generator.ts';
import { GeneratorConfig } from './types/model.types.ts';

/**
 * Main CLI for the CRUD Operations Generator
 */
async function main() {
  console.log('🚀 CRUD Operations Generator (COG)');
  console.log('===================================\n');

  // Parse command line arguments
  const args = parseArguments();

  // Load configuration
  const config: GeneratorConfig = {
    modelsPath: args.modelsPath || './models',
    outputPath: args.outputPath || './generated',
    database: {
      type: args.dbType || 'postgresql',
      postgis: args.postgis !== false,
      schema: args.schema
    },
    features: {
      softDeletes: args.softDeletes !== false,
      timestamps: args.timestamps !== false,
      uuid: args.uuid !== false,
      hooks: true,
      validation: args.validation !== false,
      migration: args.migration !== false
    },
    naming: {
      tableNaming: 'snake_case',
      columnNaming: 'snake_case'
    }
  };

  console.log('📁 Models directory:', config.modelsPath);
  console.log('📂 Output directory:', config.outputPath);
  console.log('🗄️  Database type:', config.database.type);
  console.log('');

  // Step 1: Parse models
  console.log('📖 Parsing model definitions...');
  const parser = new ModelParser();
  const { models, errors } = await parser.parseModelsFromDirectory(config.modelsPath);

  if (errors.length > 0) {
    console.error('\n❌ Validation errors found:');
    for (const error of errors) {
      const prefix = error.severity === 'error' ? '  ❌' : '  ⚠️';
      console.error(`${prefix} ${error.model ? `[${error.model}]` : ''} ${error.message}`);
    }
    
    const hasErrors = errors.some(e => e.severity === 'error');
    if (hasErrors) {
      console.error('\n🛑 Generation aborted due to errors.');
      Deno.exit(1);
    }
  }

  console.log(`✅ Found ${models.length} valid models: ${models.map(m => m.name).join(', ')}\n`);

  // Step 2: Generate code
  console.log('⚙️  Generating code...');
  
  const files = new Map<string, string>();

  // Generate Drizzle schemas
  console.log('  📝 Generating Drizzle ORM schemas...');
  const schemaGenerator = new DrizzleSchemaGenerator(models, {
    isCockroachDB: config.database.type === 'cockroachdb'
  });
  const schemas = schemaGenerator.generateSchemas();
  schemas.forEach((content, path) => files.set(path, content));

  // Generate database initialization
  console.log('  🗄️  Generating database initialization...');
  const dbInitGenerator = new DatabaseInitGenerator(models);
  files.set('db/database.ts', dbInitGenerator.generateDatabaseInit());
  files.set('db/migrations.ts', dbInitGenerator.generateMigrationRunner());

  // Generate domain APIs
  console.log('  🎯 Generating domain APIs...');
  const domainGenerator = new DomainAPIGenerator(models);
  const domainFiles = domainGenerator.generateDomainAPIs();
  domainFiles.forEach((content, path) => files.set(path, content));

  // Generate REST APIs
  console.log('  🌐 Generating REST endpoints...');
  const restGenerator = new RestAPIGenerator(models);
  const restFiles = restGenerator.generateRestAPIs();
  restFiles.forEach((content, path) => files.set(path, content));

  // Generate main index file
  console.log('  📦 Generating main export file...');
  files.set('index.ts', generateMainIndex(models));

  // Step 3: Write files
  console.log('\n📝 Writing generated files...');
  await writeGeneratedFiles(config.outputPath, files);

  console.log(`\n✅ Successfully generated ${files.size} files!`);
  console.log('\n🎉 Generation complete! Your CRUD backend code is ready.\n');
  console.log('📚 Next steps:');
  console.log('  1. Review the generated code in', config.outputPath);
  console.log('  2. Install dependencies: npm install drizzle-orm postgres @hono/hono');
  console.log('  3. Set up your database connection');
  console.log('  4. Import and use the generated code in your backend\n');
}

/**
 * Parse command line arguments
 */
function parseArguments(): Record<string, any> {
  const args: Record<string, any> = {};
  
  for (let i = 0; i < Deno.args.length; i++) {
    const arg = Deno.args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = Deno.args[i + 1];
      
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  
  // Show help if requested
  if (args.help) {
    showHelp();
    Deno.exit(0);
  }
  
  return args;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
CRUD Operations Generator (COG)

Usage:
  deno task generate [options]

Options:
  --modelsPath <path>    Path to models directory (default: ./models)
  --outputPath <path>    Path to output directory (default: ./generated)
  --dbType <type>        Database type: postgresql or cockroachdb (default: postgresql)
  --schema <name>        Database schema name
  --no-postgis          Disable PostGIS support
  --no-softDeletes      Disable soft deletes
  --no-timestamps       Disable timestamps
  --no-uuid            Disable UUID support
  --no-validation      Disable validation
  --no-migration       Disable migration generation
  --help               Show this help message

Example:
  deno task generate --modelsPath ./my-models --outputPath ./src/generated
  `);
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
import { initializeDatabase, type DatabaseConfig } from './db/database';
import { registerAPIRoutes } from './api';
import * as domain from './domain';
import * as schema from './schema';

export interface InitializationConfig {
  database: DatabaseConfig;
  app: Hono;
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

  // Register API routes
  registerAPIRoutes(config.app);

  // Initialize domain layers with hooks if provided
  if (config.hooks) {
    ${models.map(m => `
    if (config.hooks.${m.name.toLowerCase()}) {
      Object.assign(domain.${m.name.toLowerCase()}Domain, 
        new domain.${m.name}Domain(config.hooks.${m.name.toLowerCase()}));
    }`).join('')}
  }

  return {
    db,
    sql,
    domain,
    schema
  };
}

// Re-export everything for convenience
export * from './db/database';
export * from './api';
export * from './domain';
export * from './schema';
`;
}

/**
 * Write generated files to disk
 */
async function writeGeneratedFiles(outputPath: string, files: Map<string, string>) {
  // Create output directory
  await Deno.mkdir(outputPath, { recursive: true });

  for (const [relativePath, content] of files) {
    const fullPath = `${outputPath}/${relativePath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    
    // Create directory if needed
    await Deno.mkdir(dir, { recursive: true });
    
    // Write file
    await Deno.writeTextFile(fullPath, content);
    console.log(`  ✓ ${relativePath}`);
  }
}

// Run the CLI
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    Deno.exit(1);
  }
}