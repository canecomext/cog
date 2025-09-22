#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

import { generateFromModels } from './mod.ts';

/**
 * Main CLI for the CRUD Operations Generator
 */
async function main() {
  console.log('🚀 CRUD Operations Generator (COG)');
  console.log('===================================\n');

  // Parse command line arguments
  const args = parseArguments();

  // Set up configuration
  const modelsPath = args.modelsPath || './models';
  const outputPath = args.outputPath || './generated';
  const dbType = args.dbType || 'postgresql';

  console.log('📁 Models directory:', modelsPath);
  console.log('📂 Output directory:', outputPath);
  console.log('🗄️  Database type:', dbType);
  console.log('');

  // Call the main generation function
  const result = await generateFromModels(modelsPath, outputPath, {
    database: {
      type: dbType,
      postgis: args.postgis !== false,
      schema: args.schema
    },
    features: {
      softDeletes: args.softDeletes !== false,
      timestamps: args.timestamps !== false,
      uuid: args.uuid !== false,
      validation: args.validation !== false,
      migration: args.migration !== false
    }
  });

  console.log('\n🎉 Generation complete! Your CRUD backend code is ready.\n');
  console.log('📚 Next steps:');
  console.log(`  1. Review the generated code in ${result.outputPath}`);
  console.log('  2. Set up your PostgreSQL database with PostGIS extension');
  console.log('  3. Configure your database connection in .env');
  console.log('  4. Run your backend with: deno run --allow-all <your-backend.ts>\n');
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
  deno run -A src/cli.ts [options]

Options:
  --modelsPath <path>    Path to models directory (default: ./models)
  --outputPath <path>    Path to output directory (default: ./generated)
  --dbType <type>        Database type: postgresql or cockroachdb (default: postgresql)
  --schema <name>        Database schema name
  --no-postgis           Disable PostGIS support
  --no-softDeletes       Disable soft deletes
  --no-timestamps        Disable timestamps
  --no-uuid              Disable UUID support
  --no-validation        Disable validation
  --no-migration         Disable migration generation
  --help                 Show this help message

Example:
  deno run -A src/cli.ts --modelsPath ./my-models --outputPath ./src/generated
  `);
}


// Run the CLI
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    Deno.exit(1);
  }
}