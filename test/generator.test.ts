/**
 * Basic generator tests for CI pipeline
 */

import { assertEquals, assertExists } from '@std/assert';
import { generateFromModels } from '../src/mod.ts';

const TEST_OUTPUT_PATH = './test/test-generated';
const TEST_MODELS_PATH = './test/test-models';

/**
 * Setup: Create test model directory and a simple model
 */
async function setup() {
  await Deno.mkdir(TEST_MODELS_PATH, { recursive: true });

  const simpleModel = {
    name: 'TestEntity',
    tableName: 'test_entity',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        primaryKey: true,
        defaultValue: 'gen_random_uuid()',
        required: true,
      },
      {
        name: 'name',
        type: 'string',
        maxLength: 100,
        required: true,
      },
      {
        name: 'isActive',
        type: 'boolean',
        defaultValue: true,
      },
    ],
    timestamps: true,
  };

  await Deno.writeTextFile(`${TEST_MODELS_PATH}/test-entity.json`, JSON.stringify(simpleModel, null, 2));
}

/**
 * Cleanup: Remove test directories
 */
async function cleanup() {
  try {
    await Deno.remove(TEST_OUTPUT_PATH, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
  try {
    await Deno.remove(TEST_MODELS_PATH, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

Deno.test('generator - generates expected file structure', async () => {
  await cleanup();
  await setup();

  try {
    const result = await generateFromModels(TEST_MODELS_PATH, TEST_OUTPUT_PATH);

    // Verify result
    assertEquals(result.models.length, 1);
    assertEquals(result.models[0].name, 'TestEntity');
    assertEquals(result.outputPath, TEST_OUTPUT_PATH);

    // Verify main index file exists
    const indexStat = await Deno.stat(`${TEST_OUTPUT_PATH}/index.ts`);
    assertExists(indexStat);

    // Verify schema files
    const schemaStat = await Deno.stat(`${TEST_OUTPUT_PATH}/schema/testentity.schema.ts`);
    assertExists(schemaStat);
    const relStat = await Deno.stat(`${TEST_OUTPUT_PATH}/schema/relations.ts`);
    assertExists(relStat);

    // Verify domain files
    const domainStat = await Deno.stat(`${TEST_OUTPUT_PATH}/domain/testentity.domain.ts`);
    assertExists(domainStat);
    const exceptionsStat = await Deno.stat(`${TEST_OUTPUT_PATH}/domain/exceptions.ts`);
    assertExists(exceptionsStat);

    // Verify REST files
    const restStat = await Deno.stat(`${TEST_OUTPUT_PATH}/rest/testentity.rest.ts`);
    assertExists(restStat);
    const openApiStat = await Deno.stat(`${TEST_OUTPUT_PATH}/rest/openapi.ts`);
    assertExists(openApiStat);

    // Verify database files
    const dbStat = await Deno.stat(`${TEST_OUTPUT_PATH}/db/database.ts`);
    assertExists(dbStat);
    const initDbStat = await Deno.stat(`${TEST_OUTPUT_PATH}/db/initialize-database.ts`);
    assertExists(initDbStat);

    // Verify utils files
    const filterStat = await Deno.stat(`${TEST_OUTPUT_PATH}/utils/filter.utils.ts`);
    assertExists(filterStat);
  } finally {
    await cleanup();
  }
});

Deno.test('generator - handles multiple models', async () => {
  await cleanup();
  await setup();

  try {
    // Add a second model
    const secondModel = {
      name: 'AnotherEntity',
      tableName: 'another_entity',
      fields: [
        {
          name: 'id',
          type: 'uuid',
          primaryKey: true,
          defaultValue: 'gen_random_uuid()',
          required: true,
        },
        {
          name: 'title',
          type: 'text',
          required: true,
        },
      ],
    };
    await Deno.writeTextFile(`${TEST_MODELS_PATH}/another-entity.json`, JSON.stringify(secondModel, null, 2));

    const result = await generateFromModels(TEST_MODELS_PATH, TEST_OUTPUT_PATH);

    assertEquals(result.models.length, 2);

    // Verify both schema files exist
    const schema1 = await Deno.stat(`${TEST_OUTPUT_PATH}/schema/testentity.schema.ts`);
    assertExists(schema1);
    const schema2 = await Deno.stat(`${TEST_OUTPUT_PATH}/schema/anotherentity.schema.ts`);
    assertExists(schema2);

    // Verify both domain files exist
    const domain1 = await Deno.stat(`${TEST_OUTPUT_PATH}/domain/testentity.domain.ts`);
    assertExists(domain1);
    const domain2 = await Deno.stat(`${TEST_OUTPUT_PATH}/domain/anotherentity.domain.ts`);
    assertExists(domain2);
  } finally {
    await cleanup();
  }
});

Deno.test('generator - supports cockroachdb option', async () => {
  await cleanup();
  await setup();

  try {
    const result = await generateFromModels(TEST_MODELS_PATH, TEST_OUTPUT_PATH, {
      database: {
        type: 'cockroachdb',
      },
    });

    assertEquals(result.models.length, 1);

    // Verify files were generated
    const indexStat = await Deno.stat(`${TEST_OUTPUT_PATH}/index.ts`);
    assertExists(indexStat);
  } finally {
    await cleanup();
  }
});
