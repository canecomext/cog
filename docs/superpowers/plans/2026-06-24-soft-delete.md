# Soft Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, per-model `softDelete` feature to COG that sets a nullable `deletedAt` epoch-ms meta column on
delete, filters soft-deleted rows out of reads, locks update/delete (404), and scopes unique constraints to live rows
via partial indexes.

**Architecture:** COG is a code generator: it reads JSON model definitions and emits TypeScript (Drizzle schema, raw
DDL, domain layer, REST, OpenAPI). Soft delete is implemented entirely in the generators, following the existing
`timestamps` meta-column pattern. The active CRUD lives in the per-model domain produced by `domain-api.generator.ts`
(the generated `BaseDomain` in `base-domain.generator.ts` is NOT extended by any generated model — do not edit it).
Tests assert on generated _output_ (generate a model, read the emitted file, assert substrings) plus runtime integration
tests in `example/`.

**Tech Stack:** Deno, TypeScript, Drizzle ORM, Hono, Zod, PostgreSQL/CockroachDB. Test runner: `Deno.test` with
`@std/assert`.

## Global Constraints

- No `any` type; use arrow functions (not the `function` keyword); type-specific signatures and returns. (AGENTS.md)
- Do NOT run code generation, `db:init`, `db:clean`, `test`, or `test:integration` yourself — the developer runs these.
  (AGENTS.md)
- Add no new dependencies.
- Dates/timestamps are stored as EPOCH **milliseconds** in `bigint`/`INT8` columns; default SQL is
  `(extract(epoch from now()) * 1000)::bigint`.
- `deletedAt` is **nullable, no default** (NULL = live, timestamp = deleted) — unlike `createdAt`/`updatedAt` which are
  `NOT NULL` with a default.
- Partial unique indexes require CockroachDB v20.2+ (already past the v22.2 enum floor) and all PostgreSQL versions.
- The Drizzle JS property is always `deletedAt` (camelCase) regardless of the DB column name (default `deleted_at`,
  configurable). Domain code references `table.deletedAt`; schema/DDL reference the snake_case column.
- Decisions (from the spec): update/delete on soft-deleted → 404; re-delete → 404; no restore in v1; `deletedAt` is
  `expose: 'hidden'`, `accept: 'never'`; soft delete sets `deletedAt` only and does NOT touch `updatedAt`; junction
  tables stay hard-deleted.
- After all tasks: run `deno task fmt`, `fmt:check`, `lint`, `check` in BOTH root and `example/`; fix failures before
  proceeding. Then ASK the developer to regenerate and run integration tests.

---

## File Structure

| File                                                                                 | Responsibility              | Change                                                                                                                            |
| ------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/model.types.ts`                                                           | Model definition types      | Add `softDelete` property                                                                                                         |
| `src/parser/model-parser.ts`                                                         | JSON → ModelDefinition      | Parse `softDelete`                                                                                                                |
| `src/utils/field.utils.ts`                                                           | Shared field helpers        | Add `getSoftDeleteColumn(model)`                                                                                                  |
| `src/generators/drizzle-schema.generator.ts`                                         | Drizzle schema + field meta | Nullable `deletedAt` column, field meta, partial unique indexes, bigint import                                                    |
| `src/generators/database-init.generator.ts`                                          | Raw DDL                     | Nullable `deleted_at`, skip plain unique constraint, partial unique index DDL                                                     |
| `src/generators/domain-api.generator.ts`                                             | Per-model domain (CRUD)     | `QueryOptions.withSoftDeleted`, soft-delete `delete()`, update/find lock + filter, imports, junction config `targetHasSoftDelete` |
| `src/generators/junction-utils.generator.ts`                                         | M2M junction helpers        | `getJunctionTargets` filters soft-deleted targets when flagged                                                                    |
| `example/models/softdeletetestentity.json`                                           | New dedicated test model    | Create                                                                                                                            |
| `example/models/softdeleteparent.json`, `softdeletechild.json`, `softdeletetag.json` | Relationship fixtures       | Create (include + m2m propagation tests)                                                                                          |
| `example/db-clean.ts`                                                                | Test DB cleanup             | Add new tables to delete ordering (children/junction before parent)                                                               |
| `example/test/integration.test.ts`                                                   | Runtime integration tests   | Soft-delete test block (single-entity + relationship propagation)                                                                 |
| `test/generator.test.ts`                                                             | Generator output tests      | Soft-delete output assertions                                                                                                     |
| `AGENTS.md`, `README.md`                                                             | Docs                        | Document `softDelete`                                                                                                             |

---

## Task 1: Model type, parser, and QueryOptions field

**Files:**

- Modify: `src/types/model.types.ts:144-147` (add `softDelete` after `timestamps`)
- Modify: `src/parser/model-parser.ts:165` (pass through `softDelete`)
- Modify: `src/generators/domain-api.generator.ts:74-75` (add `withSoftDeleted` to the `QueryOptions` template emitted
  into `hooks.types.ts`)
- Test: `test/generator.test.ts`

**Interfaces:**

- Produces: `ModelDefinition.softDelete?: boolean | { deletedAt?: string }`. The generated `QueryOptions` gains
  `withSoftDeleted?: boolean`.

- [ ] **Step 1: Write the failing test** — append to `test/generator.test.ts`:

```typescript
Deno.test('parser - parses softDelete property', async () => {
  const { parseModel } = await import('../src/parser/model-parser.ts');
  const model = parseModel({
    name: 'Sd',
    tableName: 'sd',
    fields: [{ name: 'id', type: 'uuid', primaryKey: true, required: true }],
    softDelete: true,
  });
  assertEquals(model.softDelete, true);

  const model2 = parseModel({
    name: 'Sd2',
    tableName: 'sd2',
    fields: [{ name: 'id', type: 'uuid', primaryKey: true, required: true }],
    softDelete: { deletedAt: 'removed_at' },
  });
  assertEquals((model2.softDelete as { deletedAt?: string }).deletedAt, 'removed_at');
});
```

Note: confirm the parser's exported function name by reading `src/parser/model-parser.ts` (it may be `parseModel` or a
method on a class). Adjust the import/call to match the actual export.

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A test/generator.test.ts --filter "parses softDelete"` Expected: FAIL — `model.softDelete` is
`undefined` (parser drops it).

- [ ] **Step 3: Add the type** — in `src/types/model.types.ts`, after the `timestamps` property (line 147), add:

```typescript
softDelete?: boolean | {
  deletedAt?: string; // custom column name (default: "deleted_at")
};
```

- [ ] **Step 4: Pass it through the parser** — in `src/parser/model-parser.ts`, alongside the existing
      `timestamps: modelData.timestamps as ...` (line 165), add:

```typescript
softDelete: modelData.softDelete as boolean | { deletedAt?: string } | undefined,
```

- [ ] **Step 5: Add `withSoftDeleted` to the generated QueryOptions** — in `src/generators/domain-api.generator.ts`,
      inside the `QueryOptions` interface template, immediately after the `skipSanitization?: boolean;` line (around
      line 75), add:

```typescript
// Soft-delete control (find* methods, default: false): include soft-deleted rows
withSoftDeleted?: boolean;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `deno test -A test/generator.test.ts --filter "parses softDelete"` Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/model.types.ts src/parser/model-parser.ts src/generators/domain-api.generator.ts test/generator.test.ts
git commit -m "feat(soft-delete): add softDelete model property, parser, and QueryOptions.withSoftDeleted

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared `getSoftDeleteColumn` helper

**Files:**

- Modify: `src/utils/field.utils.ts` (add helper)
- Test: `test/generator.test.ts`

**Interfaces:**

- Consumes: `ModelDefinition.softDelete` (Task 1).
- Produces: `getSoftDeleteColumn(model: ModelDefinition): string | null` — returns the **snake_case DB column name**
  (`deleted_at` by default, or the custom name) when soft delete is enabled, else `null`. Used by Tasks 3, 4, 5.

- [ ] **Step 1: Write the failing test** — append to `test/generator.test.ts`:

```typescript
Deno.test('field.utils - getSoftDeleteColumn', async () => {
  const { getSoftDeleteColumn } = await import('../src/utils/field.utils.ts');
  const base = { name: 'X', tableName: 'x', fields: [] };
  assertEquals(getSoftDeleteColumn({ ...base }), null);
  assertEquals(getSoftDeleteColumn({ ...base, softDelete: true }), 'deleted_at');
  assertEquals(getSoftDeleteColumn({ ...base, softDelete: { deletedAt: 'removed_at' } }), 'removed_at');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A test/generator.test.ts --filter "getSoftDeleteColumn"` Expected: FAIL — `getSoftDeleteColumn` is not
exported.

- [ ] **Step 3: Implement the helper** — in `src/utils/field.utils.ts`, add (import `toSnakeCase` from
      `./string.utils.ts` if not already imported, and `ModelDefinition` from `../types/model.types.ts`):

```typescript
/**
 * Returns the snake_case DB column name for the soft-delete timestamp,
 * or null when soft delete is not enabled for the model.
 */
export const getSoftDeleteColumn = (model: ModelDefinition): string | null => {
  if (!model.softDelete) return null;
  if (model.softDelete === true) return 'deleted_at';
  return model.softDelete.deletedAt ?? 'deleted_at';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test -A test/generator.test.ts --filter "getSoftDeleteColumn"` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/field.utils.ts test/generator.test.ts
git commit -m "feat(soft-delete): add getSoftDeleteColumn helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Drizzle schema — nullable `deletedAt` column + field metadata

**Files:**

- Modify: `src/generators/drizzle-schema.generator.ts` (bigint import ~126-129; column injection ~246-250; field meta
  `getAllFieldsWithTimestamps` ~897-915)
- Test: `test/generator.test.ts`

**Interfaces:**

- Consumes: `getSoftDeleteColumn` (Task 2).
- Produces: generated `<model>.schema.ts` contains a nullable `deletedAt: bigint('<col>', { mode: 'number' })` (no
  `.default`, no `.notNull`) and a `deletedAt` entry in `<model>FieldMeta` with
  `exposeCreate:false, exposeRead:false, acceptCreate:false, acceptUpdate:false`.

- [ ] **Step 1: Write the failing test** — append to `test/generator.test.ts`. This helper writes a soft-delete model,
      generates, and returns file text:

```typescript
const SD_MODELS = './test/test-sd-models';
const SD_OUTPUT = './test/test-sd-generated';

async function generateSoftDeleteModel() {
  await Deno.mkdir(SD_MODELS, { recursive: true });
  const model = {
    name: 'SoftDeletedEntity',
    tableName: 'soft_deleted_entity',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true, defaultValue: 'gen_random_uuid()', required: true },
      { name: 'code', type: 'string', maxLength: 100, required: true, unique: true },
      { name: 'name', type: 'string', maxLength: 100, required: true },
    ],
    indexes: [{ fields: ['code', 'name'], unique: true }],
    timestamps: true,
    softDelete: true,
  };
  await Deno.writeTextFile(`${SD_MODELS}/sde.json`, JSON.stringify(model, null, 2));
  await generateFromModels(SD_MODELS, SD_OUTPUT);
}

async function cleanupSoftDelete() {
  for (const p of [SD_MODELS, SD_OUTPUT]) {
    try {
      await Deno.remove(p, { recursive: true });
    } catch { /* ignore */ }
  }
}

Deno.test('generator - soft delete schema column and field meta', async () => {
  await cleanupSoftDelete();
  try {
    await generateSoftDeleteModel();
    const schema = await Deno.readTextFile(`${SD_OUTPUT}/schema/softdeletedentity.schema.ts`);
    // Nullable deletedAt: no .notNull(), no .default()
    assertEquals(/deletedAt:\s*bigint\('deleted_at',\s*\{\s*mode:\s*'number'\s*\}\)\s*,/.test(schema), true);
    assertEquals(schema.includes("deletedAt: bigint('deleted_at', { mode: 'number' }).default"), false);
    // Field meta hidden + never-accept
    assertEquals(
      schema.includes(
        "['deletedAt', { type: 'date', array: false, exposeCreate: false, exposeRead: false, acceptCreate: false, acceptUpdate: false }]",
      ),
      true,
    );
  } finally {
    await cleanupSoftDelete();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A test/generator.test.ts --filter "soft delete schema column"` Expected: FAIL — no `deletedAt` column
emitted.

- [ ] **Step 3: Ensure `bigint` is imported when soft delete is on** — in `src/generators/drizzle-schema.generator.ts`
      around lines 126-129, change the timestamps-only guard:

```typescript
// Ensure bigint is imported when generated timestamp/soft-delete columns are present
if (model.timestamps || model.softDelete) {
  drizzleImports.add('bigint');
}
```

- [ ] **Step 4: Inject the nullable column** — in the field-definition assembly (after the timestamps block at lines
      246-250), add:

```typescript
// Add soft-delete column if enabled (nullable, no default)
const softDeleteColumn = getSoftDeleteColumn(model);
if (softDeleteColumn) {
  fieldDefinitions.push(`  deletedAt: bigint('${softDeleteColumn}', { mode: 'number' })`);
}
```

Import the helper at the top of the file: `import { getSoftDeleteColumn } from '../utils/field.utils.ts';` (merge into
the existing field.utils import if one exists).

- [ ] **Step 5: Add the field-meta entry** — in `getAllFieldsWithTimestamps` (lines 897-915), before `return fields;`,
      add:

```typescript
// Soft-delete column: hidden from responses, never accepted from input
if (model.softDelete) {
  fields.push({ name: 'deletedAt', type: 'date', expose: 'hidden', accept: 'never' });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `deno test -A test/generator.test.ts --filter "soft delete schema column"` Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/generators/drizzle-schema.generator.ts test/generator.test.ts
git commit -m "feat(soft-delete): emit nullable deletedAt column and field meta in Drizzle schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Drizzle schema — partial unique indexes scoped to live rows

**Files:**

- Modify: `src/generators/drizzle-schema.generator.ts` (field-level `.unique()` ~405-406; field-level index ~268-278;
  model-level indexes ~281-298)
- Test: `test/generator.test.ts`

**Interfaces:**

- Consumes: `getSoftDeleteColumn` (Task 2).
- Produces: for soft-delete models, unique fields/indexes are emitted as partial
  `uniqueIndex(...).on(...).where(sql\`<col> IS NULL\`)`; the inline`.unique()` column modifier is omitted for those
  fields.

**Background:** Drizzle's column `.unique()` cannot be partial. For soft-delete models, a `unique: true` field must
instead become a table-level partial `uniqueIndex`. Model-level `unique` indexes (lines 285-296) gain a `.where(...)`
clause.

- [ ] **Step 1: Write the failing test** — append to `test/generator.test.ts`:

```typescript
Deno.test('generator - soft delete partial unique indexes', async () => {
  await cleanupSoftDelete();
  try {
    await generateSoftDeleteModel();
    const schema = await Deno.readTextFile(`${SD_OUTPUT}/schema/softdeletedentity.schema.ts`);
    // Field-level unique becomes a partial unique index, not an inline .unique() modifier
    assertEquals(schema.includes('.unique()'), false);
    assertEquals(/uniqueIndex\([^)]*\)\s*\.on\(table\.code\)\s*\.where\(sql`deleted_at IS NULL`\)/.test(schema), true);
    // Model-level unique index gains the partial WHERE clause
    assertEquals(
      /uniqueIndex\([^)]*\)\.on\(table\.code,\s*table\.name\)\.where\(sql`deleted_at IS NULL`\)/.test(schema),
      true,
    );
  } finally {
    await cleanupSoftDelete();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A test/generator.test.ts --filter "partial unique indexes"` Expected: FAIL — inline `.unique()` still
emitted; no partial `.where(...)`.

- [ ] **Step 3: Omit inline `.unique()` for soft-delete models** — in `generateFieldDefinition`, find the unique
      modifier (lines 405-406):

```typescript
if (field.unique) {
  modifiers.push('.unique()');
}
```

Change to:

```typescript
// For soft-delete models, uniqueness is enforced via a partial unique index
// (see table-level constraints) so live rows are unique but soft-deleted rows
// do not reserve the value. A plain .unique() cannot be partial.
if (field.unique && !getSoftDeleteColumn(model)) {
  modifiers.push('.unique()');
}
```

- [ ] **Step 4: Emit field-level partial unique indexes** — in the table-constraints section, after the field-level
      index loop (lines 268-279), add:

```typescript
// Field-level unique → partial unique index for soft-delete models
const sdCol = getSoftDeleteColumn(model);
if (sdCol) {
  for (const field of model.fields) {
    if (field.unique) {
      const idxName = `uq_${model.name.toLowerCase()}_${field.name}`;
      tableConstraints.push(
        `  uniqueIndex('${idxName}').on(table.${field.name}).where(sql\`${sdCol} IS NULL\`)`,
      );
    }
  }
}
```

Note: confirm `uniqueIndex` and `sql` are imported in the generated schema header (the schema generator already imports
`uniqueIndex` per line 135 and `sql` for defaults). If a soft-delete model has no other `sql` usage, ensure `sql` is
still imported — add it to the import set when `getSoftDeleteColumn(model)` is non-null.

- [ ] **Step 5: Add the partial WHERE to model-level unique indexes** — in the model-level index loop (lines 282-297),
      after computing `indexType` and `fields`, append the partial clause when unique + soft delete. Replace the two
      `tableConstraints.push(...)` lines with versions that add `.where(...)`:

```typescript
const partial = idx.unique && sdCol ? `.where(sql\`${sdCol} IS NULL\`)` : '';
if (isPostGISIdx) {
  tableConstraints.push(`  ${indexType}('${indexName}').using('gist', ${fields})${partial}`);
} else {
  tableConstraints.push(`  ${indexType}('${indexName}').on(${fields})${partial}`);
}
```

(`sdCol` is already in scope from Step 4 since both loops are in the same method; if not, hoist
`const sdCol = getSoftDeleteColumn(model);` above both loops.)

- [ ] **Step 6: Run test to verify it passes**

Run: `deno test -A test/generator.test.ts --filter "partial unique indexes"` Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/generators/drizzle-schema.generator.ts test/generator.test.ts
git commit -m "feat(soft-delete): scope unique constraints to live rows via partial indexes (Drizzle schema)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Raw DDL — nullable `deleted_at` + partial unique index DDL

**Files:**

- Modify: `src/generators/database-init.generator.ts` (columns ~536-542; constraints ~553-559; indexes ~671-711)
- Test: `test/generator.test.ts`

**Interfaces:**

- Consumes: `getSoftDeleteColumn` (Task 2).
- Produces: in generated `initialize-database.ts`, soft-delete tables get `deleted_at INT8` (nullable, no default), the
  plain `UNIQUE(...)` table constraint is suppressed for unique fields, and
  `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL` is emitted for unique fields and model-level unique indexes.

- [ ] **Step 1: Write the failing test** — append to `test/generator.test.ts`:

```typescript
Deno.test('generator - soft delete DDL column and partial unique index', async () => {
  await cleanupSoftDelete();
  try {
    await generateSoftDeleteModel();
    const ddl = await Deno.readTextFile(`${SD_OUTPUT}/db/initialize-database.ts`);
    // Nullable deleted_at column (no DEFAULT, no NOT NULL)
    assertEquals(/deleted_at INT8(?!\s+DEFAULT)(?!\s+NOT NULL)/.test(ddl), true);
    // No plain UNIQUE constraint for the soft-delete table's unique field
    assertEquals(ddl.includes('"softdeletedentity_code_unique" UNIQUE'), false);
    // Partial unique index for field-level unique
    assertEquals(ddl.includes('CREATE UNIQUE INDEX') && ddl.includes('WHERE deleted_at IS NULL'), true);
  } finally {
    await cleanupSoftDelete();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A test/generator.test.ts --filter "soft delete DDL"` Expected: FAIL — no `deleted_at` column, plain
UNIQUE constraint still present.

- [ ] **Step 3: Emit the nullable column** — in `generateColumnsSQL` (after the timestamps block, lines 536-542), add
      (import `getSoftDeleteColumn` at the top of the file):

```typescript
// Soft-delete column (nullable, no default)
const softDeleteColumn = getSoftDeleteColumn(model);
if (softDeleteColumn) {
  columns.push(`${softDeleteColumn} INT8`);
}
```

- [ ] **Step 4: Suppress the plain UNIQUE constraint for soft-delete models** — in `generateConstraintsSQL` (lines
      553-559), guard the field-level unique push:

```typescript
const sdCol = getSoftDeleteColumn(model);
for (const field of model.fields) {
  if (field.unique && !sdCol) {
    const columnName = toSnakeCase(field.name);
    constraints.push(`CONSTRAINT "${model.name.toLowerCase()}_${columnName}_unique" UNIQUE("${columnName}")`);
  }
}
```

- [ ] **Step 5: Emit partial unique index DDL** — in `generateIndexes` (lines 667-714):

  a. Hoist `const sdCol = getSoftDeleteColumn(model);` near the top of the method (after `const tableName = ...`).

  b. For soft-delete models, add a loop that emits a partial unique index for every `field.unique` field (these no
  longer have a table constraint). Place after the existing field-level index loop:

```typescript
// Soft-delete: field-level unique becomes a partial unique index over live rows
if (sdCol) {
  for (const field of model.fields) {
    if (field.unique) {
      const columnName = toSnakeCase(field.name);
      const indexName = `uq_${tableName}_${columnName}`;
      indexes.push({
        name: indexName,
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ` +
          `("${columnName}") WHERE ${sdCol} IS NULL`,
      });
    }
  }
}
```

c. For model-level unique indexes (lines 704-709), append the partial clause when unique + soft delete:

```typescript
const createType = idx.unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX';
const partialClause = idx.unique && sdCol ? ` WHERE ${sdCol} IS NULL` : '';
indexes.push({
  name: indexName,
  sql: `${createType} IF NOT EXISTS "${indexName}" ON "${tableName}" ` +
    `${methodClause} (${columns})${partialClause}`,
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `deno test -A test/generator.test.ts --filter "soft delete DDL"` Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/generators/database-init.generator.ts test/generator.test.ts
git commit -m "feat(soft-delete): emit nullable deleted_at and partial unique index DDL

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Domain layer — soft delete, update/find lock, and bypass

**Files:**

- Modify: `src/generators/domain-api.generator.ts` (imports ~191-197; findById where ~309-312; findMany whereSQL ~371;
  update where ~466-473; delete via `generateHardDelete` ~872-880 and call site ~516)
- Test: `test/generator.test.ts`

**Interfaces:**

- Consumes: `ModelDefinition.softDelete`, `QueryOptions.withSoftDeleted` (Task 1).
- Produces: for soft-delete models the generated `<model>.domain.ts`:
  - imports `and, isNull` from `drizzle-orm`,
  - `delete()` performs an UPDATE setting `deletedAt` with an `and(eq(pk,id), isNull(table.deletedAt))` guard,
  - `update()` WHERE includes `isNull(table.deletedAt)`,
  - `findById`/`findMany` AND-compose `isNull(table.deletedAt)` unless `options.withSoftDeleted` is true.

- [ ] **Step 1: Write the failing test** — append to `test/generator.test.ts`:

```typescript
Deno.test('generator - soft delete domain behavior', async () => {
  await cleanupSoftDelete();
  try {
    await generateSoftDeleteModel();
    const domain = await Deno.readTextFile(`${SD_OUTPUT}/domain/softdeletedentity.domain.ts`);
    // imports
    assertEquals(/import \{[^}]*\band\b[^}]*\bisNull\b[^}]*\} from 'drizzle-orm';/.test(domain), true);
    // delete() is a soft update, not a hard .delete()
    assertEquals(domain.includes('.delete(softdeletedentityTable)'), false);
    assertEquals(domain.includes('deletedAt: sql`(extract(epoch from now()) * 1000)::bigint`'), true);
    // delete + update guard on deletedAt
    assertEquals(domain.includes('isNull(softdeletedentityTable.deletedAt)'), true);
    // find filter respects withSoftDeleted
    assertEquals(domain.includes('options?.withSoftDeleted'), true);
  } finally {
    await cleanupSoftDelete();
  }
});

Deno.test('generator - non-soft-delete model keeps hard delete', async () => {
  await cleanup();
  await setup(); // existing TestEntity has no softDelete
  try {
    await generateFromModels(TEST_MODELS_PATH, TEST_OUTPUT_PATH);
    const domain = await Deno.readTextFile(`${TEST_OUTPUT_PATH}/domain/testentity.domain.ts`);
    assertEquals(domain.includes('.delete(testentityTable)'), true);
    assertEquals(domain.includes('deletedAt:'), false);
  } finally {
    await cleanup();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A test/generator.test.ts --filter "soft delete domain"` Expected: FAIL — hard delete present, no
`and`/`isNull` import.

- [ ] **Step 3: Add `and`/`isNull` imports for soft-delete models** — in `generateModelDomainAPI` (lines 191-197), after
      the existing `drizzleImports` assembly, before the closing `" } from 'drizzle-orm';"`, add the soft-delete
      operators. Replace lines 191-197 with:

```typescript
let drizzleImports = 'import { eq, desc, asc, sql, type AnyColumn';
const needsAnd = hasManyToMany || !!model.softDelete;
if (needsAnd) {
  drizzleImports += ', and';
}
if (hasManyToMany || hasRelationships) {
  drizzleImports += ', inArray';
}
if (model.softDelete) {
  drizzleImports += ', isNull';
}
drizzleImports += " } from 'drizzle-orm';";
```

(This keeps `and` single-occurrence whether it's needed for many-to-many or soft delete.)

- [ ] **Step 4: Guard `findById`** — in the `findById` template (lines 309-312), replace the `.where(...)`:

```typescript
    const query = db
      .select()
      .from(${modelNameLower}Table)
      .where(${
  model.softDelete
    ? `options?.withSoftDeleted ? eq(${modelNameLower}Table.${primaryKeyField}, id) : and(eq(${modelNameLower}Table.${primaryKeyField}, id), isNull(${modelNameLower}Table.deletedAt))`
    : `eq(${modelNameLower}Table.${primaryKeyField}, id)`
});
```

- [ ] **Step 5: Filter `findMany`** — in the `findMany` template, replace the
      `const whereSQL = options.where as SQL | undefined;` line (line 371) with:

```typescript
    // Extract whereSQL from options (already converted to SQL)
    ${
  model.softDelete
    ? `let whereSQL = options.where as SQL | undefined;
    if (!options?.withSoftDeleted) {
      whereSQL = whereSQL ? and(whereSQL, isNull(${modelNameLower}Table.deletedAt)) : isNull(${modelNameLower}Table.deletedAt);
    }`
    : `const whereSQL = options.where as SQL | undefined;`
}
```

(The downstream code already applies `whereSQL` to both the data query and the count query, so the filter affects
pagination totals too.)

- [ ] **Step 6: Lock `update`** — in the `update` template (lines 466-473), replace the `.where(...)`:

```typescript
      .where(${
  model.softDelete
    ? `and(eq(${modelNameLower}Table.${primaryKeyField}, id), isNull(${modelNameLower}Table.deletedAt))`
    : `eq(${modelNameLower}Table.${primaryKeyField}, id)`
})
```

(The existing `if (!updated) throw new NotFoundException(...)` then yields the 404 for an already-soft-deleted row.)

- [ ] **Step 7: Make `delete` a soft update** — rename/extend `generateHardDelete` (lines 872-880). Replace the method
      with:

```typescript
/**
 * Generate the delete statement: a soft-delete UPDATE when enabled,
 * otherwise a hard DELETE. Both bind `const [deleted]`.
 */
private generateDeleteStatement(
  model: ModelDefinition,
  txVar: string = 'tx',
): string {
  const table = `${model.name.toLowerCase()}Table`;
  const pk = model.fields.find((f) => f.primaryKey)?.name || 'id';
  if (model.softDelete) {
    return `const [deleted] = await ${txVar}
      .update(${table})
      .set({ deletedAt: sql\`(extract(epoch from now()) * 1000)::bigint\` })
      .where(and(eq(${table}.${pk}, id), isNull(${table}.deletedAt)))
      .returning();`;
  }
  return `const [deleted] = await ${txVar}
      .delete(${table})
      .where(eq(${table}.${pk}, id))
      .returning();`;
}
```

Then update the call site at line 516 from `${this.generateHardDelete(model, 'tx')}` to
`${this.generateDeleteStatement(model, 'tx')}`. (Search the file for any other `generateHardDelete` reference and update
it too.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `deno test -A test/generator.test.ts --filter "soft delete domain"` then
`deno test -A test/generator.test.ts --filter "keeps hard delete"` Expected: PASS for both.

- [ ] **Step 9: Type-check the generator**

Run: `deno task check` Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/generators/domain-api.generator.ts test/generator.test.ts
git commit -m "feat(soft-delete): soft-delete delete(), lock update/find, withSoftDeleted bypass

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6b: Many-to-many target join excludes soft-deleted rows

**Files:**

- Modify: `src/generators/domain-api.generator.ts` (junction config object ~910-920)
- Modify: `src/generators/junction-utils.generator.ts` (`getJunctionTargets` ~244-273)
- Test: `test/generator.test.ts`

**Background:** Every `?include=` path delegates to the target's own `findById`/`findMany`, so the Task 6 filter already
excludes soft-deleted related rows there. The ONE exception is the dedicated many-to-many list endpoint
`GET /:id/{relation}List`, served by `getJunctionTargets()`, which raw-`innerJoin`s the target table and returns rows
directly. When the target model is soft-deletable, soft-deleted rows leak. This task plugs that leak.
`hasJunction`/`setJunctions` operate only on the (hard-deleted) junction table — no change.

**Interfaces:**

- Consumes: `ModelDefinition.softDelete` (Task 1); the generator's `this.models` for target lookup.
- Produces: generated `<rel>JunctionConfig` carries `targetHasSoftDelete: boolean`; `getJunctionTargets` AND-composes
  `isNull(config.targetTable.deletedAt)` into the join WHERE when that flag is true.

- [ ] **Step 1: Write the failing test** — append to `test/generator.test.ts`. This uses a parent with a many-to-many to
      a soft-deletable target:

```typescript
const M2M_MODELS = './test/test-m2m-models';
const M2M_OUTPUT = './test/test-m2m-generated';

async function generateM2MSoftDelete() {
  await Deno.mkdir(M2M_MODELS, { recursive: true });
  const parent = {
    name: 'SdParent',
    tableName: 'sd_parent',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true, defaultValue: 'gen_random_uuid()', required: true },
      { name: 'name', type: 'string', maxLength: 100, required: true },
    ],
    relationships: [
      { type: 'manyToMany', name: 'tagList', target: 'SdTag', endpoints: { get: true, add: true, remove: true } },
    ],
    endpoints: { create: true, readOne: true, readMany: true, update: true, delete: true },
  };
  const tag = {
    name: 'SdTag',
    tableName: 'sd_tag',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true, defaultValue: 'gen_random_uuid()', required: true },
      { name: 'label', type: 'string', maxLength: 100, required: true },
    ],
    softDelete: true,
    endpoints: { create: true, readOne: true, readMany: true, update: true, delete: true },
  };
  await Deno.writeTextFile(`${M2M_MODELS}/sd-parent.json`, JSON.stringify(parent, null, 2));
  await Deno.writeTextFile(`${M2M_MODELS}/sd-tag.json`, JSON.stringify(tag, null, 2));
  await generateFromModels(M2M_MODELS, M2M_OUTPUT);
}

async function cleanupM2M() {
  for (const p of [M2M_MODELS, M2M_OUTPUT]) {
    try {
      await Deno.remove(p, { recursive: true });
    } catch { /* ignore */ }
  }
}

Deno.test('generator - m2m junction config flags soft-deletable target', async () => {
  await cleanupM2M();
  try {
    await generateM2MSoftDelete();
    const domain = await Deno.readTextFile(`${M2M_OUTPUT}/domain/sdparent.domain.ts`);
    assertEquals(domain.includes('targetHasSoftDelete: true'), true);
    const junction = await Deno.readTextFile(`${M2M_OUTPUT}/domain/junction.utils.ts`);
    // getJunctionTargets honors the flag with an isNull filter on the target's deletedAt
    assertEquals(junction.includes('targetHasSoftDelete'), true);
    assertEquals(junction.includes("config.targetTable['deletedAt'"), true);
    assertEquals(junction.includes('isNull('), true);
  } finally {
    await cleanupM2M();
  }
});
```

Note: confirm the generated junction utilities filename (`junction.utils.ts`) and the source-domain filename
(`sdparent.domain.ts`) by listing `${M2M_OUTPUT}/domain/` if the assertions miss.

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A test/generator.test.ts --filter "junction config flags"` Expected: FAIL — no `targetHasSoftDelete`,
no `isNull` in `getJunctionTargets`.

- [ ] **Step 3: Emit `targetHasSoftDelete` in the junction config** — in `src/generators/domain-api.generator.ts`, in
      `generateRelationshipMethods`, where the per-relationship config object is built (lines 912-920), look up the
      target model and add the flag. Just before the `methods.push(\`...\`)` that emits the config, add:

```typescript
const targetModel = this.models.find((m) => m.name === rel.target);
const targetHasSoftDelete = !!targetModel?.softDelete;
```

Then add this line inside the emitted config object (after `targetTableName: '${targetNameLower}',`):

```typescript
targetHasSoftDelete: ${targetHasSoftDelete},
```

(Confirm the generator class exposes the model list as `this.models`; if it is named differently, use the actual
property — grep the constructor.)

- [ ] **Step 4: Filter the target in `getJunctionTargets`** — in `src/generators/junction-utils.generator.ts`, update
      the generated `getJunctionTargets`:

  a. Add `targetHasSoftDelete?: boolean;` to the `config` parameter's inline type (alongside
  `targetTableName: string;`).

  b. Ensure the generated junction utilities import `and` and `isNull` from `drizzle-orm` (the file already imports `eq`
  and `sql` and uses `and` in `hasJunction`; add `isNull` to that import if missing).

  c. Replace the query (lines 266-270):

```typescript
const liveCondition = config.targetHasSoftDelete
  ? and(
    eq(sourceCol as never, sourceId),
    isNull(config.targetTable['deletedAt' as keyof typeof config.targetTable] as never),
  )
  : eq(sourceCol as never, sourceId);

const result = await db
  .select()
  .from(config.junctionTable as never)
  .innerJoin(config.targetTable as never, eq(targetCol as never, targetId as never))
  .where(liveCondition as never);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test -A test/generator.test.ts --filter "junction config flags"` Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `deno task check` Expected: no errors. (If the generated `junction.utils.ts` type-checks only within
`example/generated`, rely on the `example` check in Task 9; the root `check` covers the generator sources.)

- [ ] **Step 7: Commit**

```bash
git add src/generators/domain-api.generator.ts src/generators/junction-utils.generator.ts test/generator.test.ts
git commit -m "feat(soft-delete): exclude soft-deleted targets from many-to-many getJunctionTargets join

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: OpenAPI metadata reflects the hidden column

**Files:**

- Inspect: `src/generators/openapi-metadata.generator.ts`, `src/generators/openapi-builder.generator.ts`
- Test: `test/generator.test.ts`

**Interfaces:**

- Consumes: the field-meta entry from Task 3 (`deletedAt` is `exposeRead:false`).
- Produces: generated OpenAPI metadata does NOT advertise `deletedAt` as a readable/writable property (it is hidden). No
  new behavior expected if OpenAPI is already driven by field meta — this task verifies that and only adds code if a gap
  is found.

- [ ] **Step 1: Write the test** — append to `test/generator.test.ts`:

```typescript
Deno.test('generator - soft delete column is hidden from OpenAPI', async () => {
  await cleanupSoftDelete();
  try {
    await generateSoftDeleteModel();
    const meta = await Deno.readTextFile(`${SD_OUTPUT}/rest/openapi-metadata.ts`);
    // deletedAt must not appear as an exposed/advertised property
    assertEquals(meta.includes('deletedAt'), false);
  } finally {
    await cleanupSoftDelete();
  }
});
```

- [ ] **Step 2: Run test**

Run: `deno test -A test/generator.test.ts --filter "hidden from OpenAPI"` Expected: either PASS (OpenAPI already filters
by `exposeRead`) or FAIL (it lists all fields).

- [ ] **Step 3: Fix only if it failed** — if `deletedAt` leaks, locate where `openapi-metadata.generator.ts` enumerates
      fields and ensure it filters on `exposeRead` (mirroring how it must already hide `expose: 'hidden'` user fields —
      the existing `exposuretestentity` has a hidden field, so this filtering likely already exists; follow that
      pattern). If it already passes, make no code change.

- [ ] **Step 4: Re-run to confirm PASS**

Run: `deno test -A test/generator.test.ts --filter "hidden from OpenAPI"` Expected: PASS.

- [ ] **Step 5: Commit** (only if a change was made; otherwise skip)

```bash
git add src/generators/openapi-metadata.generator.ts test/generator.test.ts
git commit -m "test(soft-delete): verify deletedAt is hidden from OpenAPI metadata

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Example model, db-clean wiring, and integration tests

**Files:**

- Create: `example/models/softdeletetestentity.json`
- Modify: `example/db-clean.ts` (add table to delete ordering)
- Modify: `example/test/integration.test.ts` (soft-delete test block + `createdIds` bucket)

**Interfaces:**

- Consumes: the full generator feature (Tasks 1-7, including 6b). The generated `SoftDeleteTestEntity` exposes REST CRUD
  at `/api/softdeletetestentity`; the relationship fixtures exercise include + many-to-many propagation.
- Produces: integration coverage for the 11 spec scenarios (8 single-entity + 3 relationship). These tests are WRITTEN
  here but RUN by the developer (per AGENTS.md).

**Note:** This task does not regenerate code or run a DB. Write the files; the developer regenerates and runs.

- [ ] **Step 1: Create the test model** — `example/models/softdeletetestentity.json`:

```json
{
  "name": "SoftDeleteTestEntity",
  "tableName": "soft_delete_test_entity",
  "schema": "public",
  "fields": [
    { "name": "id", "type": "uuid", "primaryKey": true, "defaultValue": "gen_random_uuid()", "required": true },
    { "name": "code", "type": "string", "maxLength": 100, "required": true, "unique": true },
    { "name": "name", "type": "string", "maxLength": 100, "required": true }
  ],
  "endpoints": { "create": true, "readOne": true, "readMany": true, "update": true, "delete": true },
  "timestamps": true,
  "softDelete": true
}
```

- [ ] **Step 1b: Create the relationship fixture models** — these prove §9 propagation (includes + many-to-many join).

`example/models/softdeleteparent.json`:

```json
{
  "name": "SoftDeleteParent",
  "tableName": "soft_delete_parent",
  "schema": "public",
  "fields": [
    { "name": "id", "type": "uuid", "primaryKey": true, "defaultValue": "gen_random_uuid()", "required": true },
    { "name": "name", "type": "string", "maxLength": 100, "required": true }
  ],
  "relationships": [
    { "type": "oneToMany", "name": "childList", "target": "SoftDeleteChild", "foreignKey": "parentId" },
    {
      "type": "manyToMany",
      "name": "tagList",
      "target": "SoftDeleteTag",
      "endpoints": { "get": true, "add": true, "remove": true }
    }
  ],
  "endpoints": { "create": true, "readOne": true, "readMany": true, "update": true, "delete": true },
  "timestamps": true
}
```

`example/models/softdeletechild.json`:

```json
{
  "name": "SoftDeleteChild",
  "tableName": "soft_delete_child",
  "schema": "public",
  "fields": [
    { "name": "id", "type": "uuid", "primaryKey": true, "defaultValue": "gen_random_uuid()", "required": true },
    {
      "name": "parentId",
      "type": "uuid",
      "required": true,
      "references": { "model": "SoftDeleteParent", "field": "id", "onDelete": "cascade" }
    },
    { "name": "name", "type": "string", "maxLength": 100, "required": true }
  ],
  "relationships": [
    { "type": "manyToOne", "name": "parent", "target": "SoftDeleteParent", "foreignKey": "parentId" }
  ],
  "endpoints": { "create": true, "readOne": true, "readMany": true, "update": true, "delete": true },
  "timestamps": true,
  "softDelete": true
}
```

`example/models/softdeletetag.json`:

```json
{
  "name": "SoftDeleteTag",
  "tableName": "soft_delete_tag",
  "schema": "public",
  "fields": [
    { "name": "id", "type": "uuid", "primaryKey": true, "defaultValue": "gen_random_uuid()", "required": true },
    { "name": "label", "type": "string", "maxLength": 100, "required": true }
  ],
  "endpoints": { "create": true, "readOne": true, "readMany": true, "update": true, "delete": true },
  "timestamps": true,
  "softDelete": true
}
```

Note: confirm the exact relationship/`references` JSON shape against an existing related model (e.g. `employee.json`,
`assignment.json`, `idcard.json`) and mirror it — match how `foreignKey`, `references`, `through`, and m2m `endpoints`
are actually spelled in this repo before finalizing these files.

- [ ] **Step 2: Add the tables to `db-clean.ts`** — read `example/db-clean.ts`, and add raw deletes for the new tables.
      The single entity has no FKs (ordering flexible); the relationship fixtures must be purged child→junction→parent.
      The many-to-many junction table name is generated from the relationship (confirm it from
      `example/generated/db/initialize-database.ts` after regeneration, or follow the existing junction naming such as
      `employee_skill`):

```typescript
await sql`DELETE FROM soft_delete_test_entity`;
await sql`DELETE FROM soft_delete_child`;
// delete the generated parent↔tag junction table (confirm its exact name) before its endpoints
// await sql`DELETE FROM soft_delete_parent_soft_delete_tag`; // example — verify actual name
await sql`DELETE FROM soft_delete_tag`;
await sql`DELETE FROM soft_delete_parent`;
```

Place these with the other `DELETE FROM` statements, respecting FK order (junction + children before parents). A raw
DELETE ignores the soft-delete filter and physically purges rows — correct for cleanup.

- [ ] **Step 3: Write the integration test block** — read `example/test/integration.test.ts` to match its exact helpers
      (`GET`/`POST`/`PUT`/`REQUEST`/`encodeFilter`/`logSection`/`logStep`/`logSuccess`, the `createdIds` object, and how
      the raw `postgres` connection is obtained for DB-level assertions — mirror what `db-clean.ts` / the harness
      already does). Then add a section. The following is the intended shape — adapt names to the file's actual
      conventions:

```typescript
logSection('Soft Delete');

// 1. Create — deletedAt must not be present (hidden field)
logStep('Create a soft-delete entity');
const sd = await POST('/api/softdeletetestentity', { code: 'SD-1', name: 'First' }) as Record<string, unknown>;
assertExists(sd.id, 'sd.id');
assertEquals('deletedAt' in sd, false, 'deletedAt must be hidden in responses');
const sdId = sd.id as string;

// 2. Soft delete — returns the record; row physically persists with deleted_at set
logStep('Soft delete the entity');
await DELETE(`/api/softdeletetestentity/${sdId}`);
const rows = await rawSql`SELECT deleted_at FROM soft_delete_test_entity WHERE id = ${sdId}`;
assertEquals(rows.length, 1, 'row must still physically exist (soft, not hard, delete)');
assert(rows[0].deleted_at !== null, 'deleted_at must be populated');

// 3. List excludes it
logStep('List excludes soft-deleted');
const list = await GET<{ data: unknown[]; pagination: { total: number } }>('/api/softdeletetestentity');
assertEquals(list.data.some((r) => (r as { id: string }).id === sdId), false, 'soft-deleted row must not be listed');

// 4. Get by id → 404
logStep('Get soft-deleted by id → 404');
const getRes = await REQUEST('GET', `/api/softdeletetestentity/${sdId}`);
assertEquals(getRes.status, 404, 'GET soft-deleted must be 404');

// 5. Update locked → 404
logStep('Update soft-deleted → 404');
const putRes = await REQUEST('PUT', `/api/softdeletetestentity/${sdId}`, { name: 'Nope' });
assertEquals(putRes.status, 404, 'PUT soft-deleted must be 404');

// 6. Re-delete → 404
logStep('Re-delete soft-deleted → 404');
const delRes = await REQUEST('DELETE', `/api/softdeletetestentity/${sdId}`);
assertEquals(delRes.status, 404, 'second DELETE must be 404');

// 7. Partial unique index — same code can be reused after soft delete
logStep('Reuse unique code after soft delete');
const reused = await POST('/api/softdeletetestentity', { code: 'SD-1', name: 'Reused' }) as Record<string, unknown>;
assertExists(reused.id, 'reused.id — soft-deleted row must not reserve the unique value');
createdIds.softDeleteTestEntities = [reused.id as string];
// two live rows with the same code must still be rejected
const dup = await REQUEST('POST', '/api/softdeletetestentity', { code: 'SD-1', name: 'Dup' });
assertEquals(dup.status >= 400, true, 'duplicate live unique code must be rejected');

// 8. Timestamp interaction
logStep('Timestamps: createdAt preserved, deletedAt recent, updatedAt untouched by soft delete');
const t = await POST('/api/softdeletetestentity', { code: 'SD-2', name: 'T' }) as Record<string, number | string>;
const tId = t.id as string;
const beforeRows = await rawSql`SELECT created_at, updated_at FROM soft_delete_test_entity WHERE id = ${tId}`;
await DELETE(`/api/softdeletetestentity/${tId}`);
const afterRows =
  await rawSql`SELECT created_at, updated_at, deleted_at FROM soft_delete_test_entity WHERE id = ${tId}`;
assertEquals(Number(afterRows[0].created_at), Number(beforeRows[0].created_at), 'createdAt must not change');
assertEquals(
  Number(afterRows[0].updated_at),
  Number(beforeRows[0].updated_at),
  'updatedAt must NOT advance on soft delete',
);
assert(Math.abs(Number(afterRows[0].deleted_at) - Date.now()) < 5000, 'deletedAt must be ~now');

// 9. Include excludes soft-deleted child (oneToMany propagation)
logStep('?include=childList excludes soft-deleted children');
const parent = await POST('/api/softdeleteparent', { name: 'P1' }) as Record<string, unknown>;
const parentId = parent.id as string;
const childA = await POST('/api/softdeletechild', { parentId, name: 'A' }) as Record<string, unknown>;
const childB = await POST('/api/softdeletechild', { parentId, name: 'B' }) as Record<string, unknown>;
await DELETE(`/api/softdeletechild/${childA.id}`); // soft-delete one child
const withChildren = await GET<Record<string, unknown>>(`/api/softdeleteparent/${parentId}?include=childList`);
const childList = withChildren.childList as Array<{ id: string }>;
assertEquals(childList.length, 1, 'only the live child must be included');
assertEquals(childList[0].id, childB.id, 'the live child is B');

// 10. many-to-many list excludes soft-deleted target (getJunctionTargets propagation)
logStep('GET /:id/tagList excludes soft-deleted tags');
const tag1 = await POST('/api/softdeletetag', { label: 'T1' }) as Record<string, unknown>;
const tag2 = await POST('/api/softdeletetag', { label: 'T2' }) as Record<string, unknown>;
await POST(`/api/softdeleteparent/${parentId}/tag`, { id: tag1.id });
await POST(`/api/softdeleteparent/${parentId}/tag`, { id: tag2.id });
await DELETE(`/api/softdeletetag/${tag1.id}`); // soft-delete one tag
const tagList = await GET<Array<{ id: string }>>(`/api/softdeleteparent/${parentId}/tagList`);
assertEquals(tagList.length, 1, 'only the live tag must be returned by the m2m list');
assertEquals(tagList[0].id, tag2.id, 'the live tag is T2');

// 11. manyToOne include resolves correctly: the live child still resolves its (live) parent
logStep('?include=parent on a live child returns the parent');
const childWithParent = await GET<Record<string, unknown>>(`/api/softdeletechild/${childB.id}?include=parent`);
assertExists((childWithParent.parent as { id?: string })?.id, 'live child must resolve its parent');

createdIds.softDeleteParents = [parentId];
createdIds.softDeleteTags = [tag2.id as string];
createdIds.softDeleteChildren = [childB.id as string];

logSuccess('Soft delete behavior verified');
```

Note: confirm the exact many-to-many "add" endpoint shape from a generated rest file or AGENTS.md
(`POST /:id/{relation}` with `{ id }` body vs `POST /:id/{relation}List`), and the include-response key names, against
the real generated routes before finalizing. Adjust the URLs/bodies to match.

Also: add `softDeleteTestEntities`, `softDeleteParents`, `softDeleteChildren`, and `softDeleteTags` buckets to the
`createdIds` object declaration and cleanup loops in `runCleanup()` that DELETE any remaining created ids (use the raw
connection or the `safeDelete` helper — note `safeDelete` tolerates the 404 it will hit for already-soft-deleted ids).
Clean children/junction before parents.

- [ ] **Step 4: Type-check the example tests** (no DB needed)

Run: `cd example && deno task check` Expected: no type errors. Fix any mismatches against the real helper signatures.

- [ ] **Step 5: Commit**

```bash
git add example/models/softdeletetestentity.json example/models/softdeleteparent.json \
  example/models/softdeletechild.json example/models/softdeletetag.json \
  example/db-clean.ts example/test/integration.test.ts
git commit -m "test(soft-delete): add example models and integration tests (incl. include + m2m propagation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Documentation + final verification

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Document in `AGENTS.md`** — add a `softDelete` row/section. Specifically:
  - In the Model Definition JSON example, add `"softDelete": true` near `"timestamps": true`.
  - Add a short "Soft Delete" subsection after the Hook System or Data Types section covering: opt-in per model;
    nullable `deletedAt` epoch-ms column (default column `deleted_at`, configurable via
    `{ "softDelete": { "deletedAt": "..." } }`); reads exclude soft-deleted rows; update/delete on soft-deleted → 404;
    re-delete → 404; no restore in v1; `withSoftDeleted: true` domain option bypasses the filter for internal reads (not
    REST-exposed); unique constraints become partial indexes scoped to live rows; soft delete sets `deletedAt` only and
    does not touch `updatedAt`; junction tables remain hard-deleted; **relationship loads also exclude soft-deleted
    rows** — `?include=` of a oneToMany/manyToMany excludes soft-deleted children/targets, a manyToOne/oneToOne include
    of a soft-deleted row resolves to `null`, and the many-to-many `GET /:id/{relation}List` endpoint excludes
    soft-deleted targets.

- [ ] **Step 2: Document in `README.md`** — add a user-facing "Soft Delete" section with the same JSON config examples
      and behavior summary, matching the README's existing tone and structure (look at how `timestamps` is documented
      and mirror it).

- [ ] **Step 3: Commit docs**

```bash
git add AGENTS.md README.md
git commit -m "docs(soft-delete): document softDelete feature in AGENTS.md and README.md

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Run the full quality gate** (root):

```bash
deno task fmt && deno task fmt:check && deno task lint && deno task check && deno test -A test/generator.test.ts
```

Expected: all pass. Fix any failures and re-run before continuing.

- [ ] **Step 5: Run the quality gate in `example/`** (formatting/lint/type only — NOT generation or integration):

```bash
cd example && deno task fmt && deno task fmt:check && deno task lint && deno task check
```

Expected: all pass.

- [ ] **Step 6: Hand off generation + integration to the developer.** Per AGENTS.md, do NOT run these yourself. Ask the
      developer to:
  1. `cd example && deno task cog:psql:generate` (and/or `cog:crdb:generate`)
  2. `deno task db:clean && deno task db:init`
  3. `deno task test:integration`

  Report that the generator unit tests pass and that regeneration + integration testing is pending their run.

---

## Self-Review

**Spec coverage:**

- Opt-in config (`softDelete: true` / custom column) → Task 1 (type/parser), Task 2 (helper). ✓
- Nullable `deletedAt`, no default → Task 3 (Drizzle), Task 5 (DDL). ✓
- Field meta hidden/never-accept → Task 3. ✓
- delete() → soft UPDATE, 404 on missing/already-deleted → Task 6. ✓
- update() lock → Task 6. ✓
- findMany/findById filter + `withSoftDeleted` bypass → Task 6 (+ QueryOptions field in Task 1). ✓
- Partial unique indexes (field + model level) → Task 4 (Drizzle), Task 5 (DDL). ✓
- `updatedAt` untouched on soft delete → Task 6 (delete sets only `deletedAt`), asserted in Task 8 test 8. ✓
- Relationship propagation (§9): includes via `findById`/`findMany` inherit the filter (Task 6); the m2m
  `getJunctionTargets` join is filtered → Task 6b. Asserted in Task 8 tests 9-11. ✓
- OpenAPI reflects hidden column → Task 7. ✓
- No restore / no REST view of deleted → enforced by absence (no restore code generated). Junction _tables_ stay
  hard-deleted (no `deletedAt`); only the m2m _target_ join is filtered (Task 6b). ✓
- Dedicated example model + relationship fixtures + 11 integration tests + db-clean wiring → Task 8. ✓
- Generator output tests → Tasks 3-7 + 6b. ✓
- Docs (AGENTS.md, README.md) → Task 9. ✓
- CockroachDB compatibility note → Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; every code step shows concrete code. Task 7 is conditional-by-design
(verify-then-fix) with explicit fallback. Task 8 explicitly instructs adapting to real helper signatures because those
helpers are file-local — the intended assertions are fully spelled out.

**Type consistency:** Helper `getSoftDeleteColumn(model): string | null` used identically in Tasks 3/4/5. Generator
method renamed `generateHardDelete` → `generateDeleteStatement` with its single call site updated (Task 6 Step 7).
`QueryOptions.withSoftDeleted` defined in Task 1, consumed in Task 6. The junction config field `targetHasSoftDelete` is
emitted in Task 6b (domain-api) and consumed by `getJunctionTargets` (junction-utils) in the same task. Drizzle property
`deletedAt` (camelCase) used in domain and the junction join (`config.targetTable['deletedAt']`); snake_case column used
in schema/DDL — consistent with the timestamps precedent.
