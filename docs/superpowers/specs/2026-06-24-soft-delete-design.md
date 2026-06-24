# Soft Delete — Design Spec

**Date:** 2026-06-24 **Status:** Approved (pending implementation plan) **Feature:** Per-model soft delete via a
`deletedAt` meta column.

## Summary

Add an opt-in `softDelete` feature to COG. When enabled on a model, deletion sets a `deletedAt` epoch-millisecond
timestamp instead of removing the row. Soft-deleted records disappear from the normal API surface: reads filter them
out, and update/delete on them behave as if the record does not exist (404). The feature follows the existing "meta
column" pattern established by `timestamps`, but `deletedAt` is **nullable with no default** (NULL = live, timestamp =
deleted).

The design goal is a _common-sense default_ that keeps users inside COG. Soft delete usually metastasizes into
hand-written endpoints because frameworks bolt it on rigidly; COG already has the seams (per-model opt-in, the
before/pre/post/after hook chain, and a `skipSanitization`-style bypass option) to absorb custom needs without
abandoning the generator.

## Motivation

Soft delete touches every operation except create:

- **Finds** must exclude soft-deleted rows by default.
- **Update/Delete** must not silently mutate rows that reads treat as gone — otherwise `GET /:id` returns 404 while
  `PUT`/`DELETE` succeed, an internal inconsistency.

Historically this was left unsupported because the chance of needing custom behavior is high. But _not_ providing a sane
default pushes users toward custom endpoints, which erodes the value of using COG at all. This spec provides the default
while preserving the existing override surface.

## Decisions

| Question                                    | Decision                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update/delete on a soft-deleted record      | **Lock** — treated as 404 (`NotFoundException`), consistent with read filtering.                                                                     |
| Restore / undelete                          | **Not in v1.** One-way at the API level; undelete is a DB/admin concern.                                                                             |
| Re-delete of an already soft-deleted record | **404** — consistent with GET/PUT.                                                                                                                   |
| Unique constraints on soft-delete models    | **Partial indexes** scoped `WHERE deleted_at IS NULL`.                                                                                               |
| `updatedAt` on soft delete                  | **Not touched** — only `deletedAt` is set. `modifiedAt` means "last content change," and deletion is not one.                                        |
| `deletedAt` exposure                        | `expose: 'hidden'`, `accept: 'never'` — any returned record is live, so the field would always serialize as `null`; exposing it is misleading noise. |
| Scope of opt-in                             | Per-model, off by default.                                                                                                                           |

## Design

### 1. Opt-in & config

A new top-level model property, parallel to `timestamps`:

```json
{ "softDelete": true }                            // column "deleted_at"
{ "softDelete": { "deletedAt": "removed_at" } }   // custom column name
```

Off by default. A model pays for soft delete only if it asks.

- **Types** (`src/types/model.types.ts`): add `softDelete?: boolean | { deletedAt?: string }` to the model definition.
- **Parser** (`src/parser/model-parser.ts`): read and pass through `softDelete`, mirroring the existing `timestamps`
  handling.

### 2. Schema column

`deletedAt: bigint('deleted_at', { mode: 'number' })` — **nullable, no default**.

- Injected via the same meta-column path currently named `getAllFieldsWithTimestamps` in
  `src/generators/drizzle-schema.generator.ts`. Generalize this method (and its sibling column emitter) to cover
  soft-delete in addition to timestamps.
- Unlike `createdAt`/`updatedAt`, **no** `.notNull()` and **no** `.default(...)`.
- DDL emitted by `src/generators/database-init.generator.ts`: `deleted_at INT8` (nullable, no default).

### 3. Field metadata

Add `{ name: 'deletedAt', type: 'date', expose: 'hidden', accept: 'never' }` to the model's field set when soft delete
is enabled. Resulting `FieldMeta`: `exposeCreate: false, exposeRead: false, acceptCreate: false, acceptUpdate: false`.

Consequences:

- Server-managed: stripped from POST/PUT input via `stripUnacceptedFields`.
- Hidden from responses (always `null` on any returned record anyway).
- Because `exposeRead: false`, the field is **not** filterable through the public `where` API — which is correct; the
  base filter handles it (§6), and internal access goes through the bypass option.

### 4. delete() becomes an UPDATE (soft-delete models only)

In `src/generators/domain-api.generator.ts`, for soft-delete models the generated `delete` swaps the hard DELETE for an
UPDATE that sets only `deletedAt`:

```typescript
const [deleted] = await tx
  .update(table)
  .set({ deletedAt: sql`(extract(epoch from now()) * 1000)::bigint` })
  .where(and(eq(table.id, id), isNull(table.deletedAt)))
  .returning();
if (!deleted) throw new NotFoundException(/* ... */);
```

- Empty `.returning()` → `NotFoundException`. Covers both _missing_ and _already soft-deleted_ → 404 (re-delete
  decision).
- Atomic, single round-trip, race-free — no read-then-write.
- `updatedAt` is **not** modified.
- All existing `beforeDelete` / `preDelete` / `postDelete` / `afterDelete` hooks fire unchanged; only the in-transaction
  DB op differs. Return shape stays "the affected record."
- Non-soft-delete models keep the current hard-delete codegen.

### 5. update() locks

For soft-delete models, the update WHERE gains `isNull(deletedAt)`:

```typescript
.where(and(eq(table.id, id), isNull(table.deletedAt)))
```

Empty `.returning()` → `NotFoundException`. Atomic, no pre-query.

### 6. findMany / findById filter

In `src/generators/filter-utils.generator.ts`, the generated `buildWhereSQL` (or the domain query assembly) AND-composes
`isNull(deletedAt)` at the root with any user-supplied filter, for soft-delete models.

- A domain-level query option `withSoftDeleted: true` (mirroring the existing `skipSanitization`) bypasses the filter
  for internal/admin reads.
- **Not** REST-exposed — consistent with "one-way at the API level." There is no public way to view soft-deleted records
  in v1.

### 7. Unique → partial indexes

For soft-delete models, both field-level `unique` and declared unique `indexes` emit a partial index scoped to live
rows:

```sql
CREATE UNIQUE INDEX ... ON ... (...) WHERE deleted_at IS NULL;
```

- Prevents a soft-deleted row from permanently reserving its unique value.
- Non-unique indexes are unchanged.
- Affects `src/generators/drizzle-schema.generator.ts` (index generation) and
  `src/generators/database-init.generator.ts` (DDL).

### 8. OpenAPI

`src/generators/openapi-metadata.generator.ts` / `openapi-builder.generator.ts`: reflect the `deletedAt` column and the
soft-delete behavior in generated metadata, consistent with how the field meta is exposed (hidden field → not advertised
as a writable/readable property).

### 9. Relationship loading & joins (the propagation guarantee)

Soft delete must exclude soft-deleted rows from **every** read, including when a model is loaded as another model's
relationship. An audit of all row-loading paths shows COG has no Drizzle relational auto-joins (no `db.query.*` usage;
`relations.ts` is declared but unused for querying). Every `?include=` path loads related rows by delegating to the
**target model's own `findById` / `findMany`**:

| `?include=` path           | Loads via                               | Result with §5/§6 filter in place                                  |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `oneToMany` (the 1:N case) | nested `findMany({ where: fk })`        | Soft-deleted children excluded automatically.                      |
| `manyToOne` / `oneToOne`   | nested `findById(fk)`                   | Resolves to **null** if the referenced row is soft-deleted (gone). |
| `manyToMany` target side   | nested `findMany({ where: id in […] })` | Soft-deleted targets excluded automatically.                       |
| pagination `total` count   | reuses the same filtered `whereSQL`     | Count matches the filtered result set.                             |

Because the `isNull(deletedAt)` guard lives **inside** `findById`/`findMany` (§6), it propagates to all of the above for
free. **The single exception** is the dedicated many-to-many list endpoint `GET /:id/{relation}List`, which is served by
`getJunctionTargets()` in `junction.utils.ts` (`junction-utils.generator.ts`). That function performs a raw `innerJoin`
from the junction table to the target table and returns target rows **directly**, bypassing `findMany`. If the target
model is soft-deletable, soft-deleted rows would leak.

**Fix:** the generated per-relationship junction config (`<rel>JunctionConfig` in `domain-api.generator.ts`) gains a
`targetHasSoftDelete: boolean` field, set from `this.models.find((m) => m.name === rel.target)?.softDelete`.
`getJunctionTargets` then AND-composes `isNull(config.targetTable.deletedAt)` into the join's `WHERE` when the flag is
set. `hasJunction` and `setJunctions` operate only on the (always hard-deleted) junction table and need no change. The
junction-table selects that gather target IDs inside `findById`/`findMany` includes (domain-api) need no change either:
they over-fetch IDs, but the subsequent target `findMany` filters soft-deleted rows out.

## Scope boundaries (v1)

- No restore endpoint or `restore()` domain method.
- No REST-exposed way to view soft-deleted records.
- Junction (many-to-many) rows remain **hard-deleted** — soft delete applies to a model's own table only.
- No global/default soft delete — strictly per-model opt-in.

## Database compatibility

Partial indexes require **CockroachDB v20.2+** (already past the v22.2 enum floor noted in AGENTS.md) and are supported
by **all** PostgreSQL versions. Portable across both targets.

## Testing

### New test model — `example/models/softdeletetestentity.json`

Follows the dedicated-test-entity convention (`exposuretestentity`, `acceptancetestentity`) rather than enabling
`softDelete` on `Employee` (which would change behavior across the existing suite and break its cleanup assumptions).

```
SoftDeleteTestEntity: softDelete: true, timestamps: true, full CRUD endpoints
  - code  (string, unique)   → exercises the partial-unique-index path
  - name  (string)           → ordinary mutable field
```

Both `timestamps` and `softDelete` enabled to test their interaction.

### Relationship test models (to prove §9 propagation)

To verify includes and the many-to-many join exclude soft-deleted rows, add dedicated related entities (kept separate
from `Employee`/`Skill` so the existing suite is undisturbed):

```
SoftDeleteParent: full CRUD endpoints (no softDelete on the parent itself)
  - name (string)
  - relationships:
      oneToMany  childList → SoftDeleteChild (foreignKey: parentId)
      manyToMany tagList   → SoftDeleteTag (junction, get/add/remove endpoints)

SoftDeleteChild: softDelete: true, full CRUD endpoints
  - parentId (uuid, references SoftDeleteParent)
  - name (string)

SoftDeleteTag: softDelete: true, full CRUD endpoints
  - label (string)
```

### Integration tests — append to `example/test/integration.test.ts`

Same `logStep` / `assert` style, with a new `createdIds` bucket. The harness already exposes a raw `postgres` connection
(used by `db-clean.ts`) for DB-level assertions.

1. **Create** → response does **not** contain `deletedAt` (hidden field).
2. **Soft delete** → `DELETE /:id` returns the record; **DB-level assertion** via the raw connection that the row
   _physically still exists_ with `deleted_at` populated — proves soft, not hard.
3. **List excludes it** → `GET /api/...` no longer returns the row; `pagination.total` drops by one.
4. **Get by id** → `GET /:id` → **404**.
5. **Update locked** → `PUT /:id` on soft-deleted → **404**; DB row unchanged.
6. **Re-delete** → `DELETE /:id` again → **404**.
7. **Partial unique index (footgun fix)** → create `code:"X"`, soft-delete it, create a new `code:"X"` → **succeeds**;
   two _live_ rows with `code:"X"` → still rejected.
8. **Timestamp interaction** → `createdAt` unchanged through the soft delete; `deletedAt` ≈ now (within 5s, mirroring
   the existing timestamp recency check); `updatedAt` not advanced by the soft delete.
9. **Include excludes soft-deleted child (oneToMany)** → create a parent with two children, soft-delete one, then
   `GET /api/softdeleteparent/:id?include=childList` → returns only the live child.
10. **manyToMany list excludes soft-deleted target** → attach two tags to a parent, soft-delete one tag, then
    `GET /api/softdeleteparent/:id/tagList` → returns only the live tag (this exercises `getJunctionTargets`).
11. **manyToOne include resolves to null when parent soft-deleted** → if a child references a parent and that parent is
    soft-deletable, soft-deleting it makes `?include=parent` return `null` for that side. (Covered via whichever side is
    soft-deletable in the fixtures; assert the gone-row is absent/null.)

**Plumbing:** add the new tables to `db-clean.ts` delete ordering (raw `DELETE` ignores the soft-delete filter, so it
physically purges — correct for cleanup; delete the junction and child tables before the parent). The schema column and
partial index land via regenerate → `db:init`.

### Generator unit tests — `test/generator.test.ts`

Locks the generated _output_, not just runtime behavior:

- `softDelete: true` emits a nullable `deleted_at` column with no default.
- Unique indexes on a soft-delete model carry `WHERE deleted_at IS NULL`.
- Generated `update`/`delete` WHERE clauses include the `isNull(deletedAt)` guard.
- The base find filter injects `isNull(deletedAt)`.
- A generated junction config whose target is soft-deletable carries `targetHasSoftDelete: true`, and
  `getJunctionTargets` applies the target filter.
- `softDelete` off → no `deleted_at` column, hard delete preserved (regression guard).

## Affected files

| File                                                                                 | Change                                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/model.types.ts`                                                           | Add `softDelete` to model definition.                                                                                           |
| `src/parser/model-parser.ts`                                                         | Parse/pass-through `softDelete`.                                                                                                |
| `src/generators/drizzle-schema.generator.ts`                                         | Inject nullable `deletedAt`; partial unique indexes; generalize meta-column injection.                                          |
| `src/generators/database-init.generator.ts`                                          | `deleted_at INT8` DDL; partial-index DDL.                                                                                       |
| `src/generators/domain-api.generator.ts`                                             | Soft-delete `delete()`; `isNull(deletedAt)` lock in `update()`/finds; `withSoftDeleted`; junction config `targetHasSoftDelete`. |
| `src/generators/junction-utils.generator.ts`                                         | `getJunctionTargets` filters soft-deleted targets when `config.targetHasSoftDelete`.                                            |
| `src/generators/openapi-metadata.generator.ts`, `openapi-builder.generator.ts`       | Reflect column/behavior (verify hidden field is not advertised).                                                                |
| `example/models/softdeletetestentity.json`                                           | New dedicated test model.                                                                                                       |
| `example/models/softdeleteparent.json`, `softdeletechild.json`, `softdeletetag.json` | Relationship fixtures for §9 (include + m2m) tests.                                                                             |
| `example/test/integration.test.ts`                                                   | Soft-delete integration tests.                                                                                                  |
| `example/db-clean.ts`                                                                | Add new tables to cleanup ordering (junction + children before parent).                                                         |
| `test/generator.test.ts`                                                             | Generator output tests.                                                                                                         |
| `AGENTS.md`, `README.md`                                                             | Document `softDelete`.                                                                                                          |

## Out of scope / future

- Restore/undelete endpoint and `restore()` method.
- Public (REST) access to soft-deleted records.
- Soft delete for junction tables.
- Cascade soft delete to related records (left to hooks for now).
