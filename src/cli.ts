#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

import { generateFromModels } from './mod.ts';

/**
 * Main CLI for the CRUD Operations Generator
 */
async function main() {
  // Parse command line arguments
  const args = parseArguments();
  const verbose = args.verbose === true;

  // Set up configuration
  const modelsPath = args.modelsPath || './models';
  const outputPath = args.outputPath || './generated';
  const dbType = args.dbType || 'postgresql';

  // Call the main generation function - it will handle all output based on verbose flag
  await generateFromModels(modelsPath, outputPath, {
    database: {
      type: dbType,
      postgis: args.postgis !== false,
      schema: args.schema
    },
    features: {
      softDeletes: args.softDeletes !== false,
      timestamps: args.timestamps !== false
    },
    documentation: {
      enabled: args.documentation !== false
    },
    verbose
  });
}

/**
 * Parse command line arguments
 */
function parseArguments(): Record<string, any> {
  const args: Record<string, any> = {};
  for (let i = 0; i < Deno.args.length; i++) {
    const arg = Deno.args[i];
    if (arg.startsWith('--')) {
      let key = arg.slice(2);
      
      // Handle --no- prefixed flags
      if (key.startsWith('no-')) {
        const actualKey = key.slice(3); // Remove 'no-' prefix
        args[actualKey] = false;
      } else {
        const value = Deno.args[i + 1];
        if (value && !value.startsWith('--')) {
          args[key] = value;
          i++;
        } else {
          args[key] = true;
        }
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
  --no-documentation     Disable OpenAPI documentation generation
  --verbose              Output the relative paths of generated files
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