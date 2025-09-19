#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Code Generation Script
 * 
 * This script generates all backend code from the model definitions.
 * Run this before running the backend to ensure all code is up to date.
 * 
 * Usage: deno run --allow-read --allow-write generate.ts
 */

import { generateFromModels } from "../src/mod.ts";

console.log("🚀 Starting code generation...\n");

const modelsPath = "./models";
const outputPath = "./generated";

try {
  // Generate code from all model definitions
  await generateFromModels(modelsPath, outputPath);
  
  console.log("\n✅ Code generation completed successfully!");
  console.log(`📁 Generated files are in: ${outputPath}`);
  console.log("\n📝 Next steps:");
  console.log("   1. Copy .env.template to .env and configure your database");
  console.log("   2. Run: deno run --allow-all run-backend.ts");
} catch (error) {
  console.error("\n❌ Code generation failed:", error);
  Deno.exit(1);
}