# COG - Technical Reference

**COG (CRUD Operations Generator)** transforms JSON model definitions into production-ready TypeScript backends.

**Stack**: Deno + TypeScript + Drizzle ORM + Hono + Zod + PostgreSQL/CockroachDB

## Project Structure

```
cog/
├── src/
│   ├── cli.ts                              # CLI entry point
│   ├── mod.ts                              # Main generator orchestrator
│   ├── constants.ts                        # Shared constants (POSTGIS_TYPES, etc.)
│   ├── types/model.types.ts                # TypeScript type definitions
│   ├── parser/model-parser.ts              # JSON model validation & parsing
│   ├── utils/
│   │   ├── string.utils.ts                 # String utilities (capitalize, toSnakeCase, toCamelCase)
│   │   └── field.utils.ts                  # Field normalization (normalizeExpose, normalizeAccept)
│   └── generators/
│       ├── drizzle-schema.generator.ts     # Drizzle ORM schemas
│       ├── database-init.generator.ts      # DB connection & init
│       ├── domain-api.generator.ts         # Business logic layer (per-model)
│       ├── domain-exceptions.generator.ts  # Exception classes
│       ├── base-domain.generator.ts        # Abstract base domain class
│       ├── junction-utils.generator.ts     # Many-to-many junction utilities
│       ├── rest-api.generator.ts           # Hono REST endpoints (per-model)
│       ├── rest-crud-factory.generator.ts  # Generic CRUD handler factory
│       ├── openapi-metadata.generator.ts   # OpenAPI model metadata
│       ├── openapi-builder.generator.ts    # Dynamic OpenAPI spec builder
│       ├── filter-utils.generator.ts       # Filter system utilities
│       ├── field-meta-utils.generator.ts   # Field metadata utilities
│       └── spatial-utils.generator.ts      # PostGIS GeoJSON conversion
├── test/generator.test.ts                  # Generator unit tests
├── example/
│   ├── models/                             # Example JSON model definitions
│   ├── generated/                          # Example generated code
│   ├── src/main.ts                         # Example server entry point
│   ├── test/integration.test.ts            # Integration tests
│   ├── db-init.ts                          # Database initialization script
│   └── db-clean.ts                         # Database cleanup script
├── .github/
│   ├── workflows/ci.yml                    # CI pipeline (lint, check, test, coverage)
│   └── hooks/pre-commit                    # Pre-commit hook script
├── .vscode/                                # VSCode Deno configuration
├── deno.json                               # Root workspace config & tasks
├── AGENTS.md                               # This file
└── README.md                               # User-facing documentation
```

## Deno Tasks Reference

**Root (`deno.json`):**

| Task          | Command                  |
| ------------- | ------------------------ |
| `setup:hooks` | Install pre-commit hook  |
| `fmt`         | Format code              |
| `fmt:check`   | Check formatting         |
| `lint`        | Lint src/                |
| `check`       | Type check src/          |
| `test`        | Run generator tests      |
| `cov`         | Generate coverage report |

**Example (`example/deno.json`):**

| Task                | Command                   |
| ------------------- | ------------------------- |
| `cog:psql:generate` | Generate for PostgreSQL   |
| `cog:crdb:generate` | Generate for CockroachDB  |
| `db:init`           | Initialize database       |
| `db:clean`          | Clean database            |
| `fmt` / `fmt:check` | Format / check formatting |
| `lint` / `check`    | Lint / type check         |
| `test:integration`  | Run integration tests     |

## Generated Code Architecture

```
generated/
├── index.ts                    # initializeGenerated() entry point
├── db/
│   ├── database.ts             # Connection pooling, transactions
│   └── initialize-database.ts  # Table creation, PostGIS setup
├── schema/
│   ├── [model].schema.ts       # Drizzle tables + Zod schemas
│   ├── spatial-utils.ts        # GeoJSON <-> WKT conversion
│   └── relations.ts            # Drizzle relationships
├── domain/
│   ├── [model].domain.ts       # CRUD operations with hooks (per-model)
│   ├── base.domain.ts          # Abstract base class with shared CRUD logic
│   ├── junction.utils.ts       # Many-to-many relationship utilities
│   ├── exceptions.ts           # DomainException, NotFoundException
│   └── hooks.types.ts          # Hook type definitions
├── utils/
│   ├── filter.utils.ts         # Filter parsing & SQL building
│   └── field-meta.utils.ts     # Field metadata utilities
└── rest/
    ├── [model].rest.ts         # Hono REST endpoints (thin routing layer)
    ├── crud.factory.ts         # Generic CRUD handler factory
    ├── openapi.ts              # Dynamic OpenAPI spec builder
    ├── openapi-metadata.ts     # Model metadata for OpenAPI
    ├── types.ts                # Shared REST types
    └── helpers.ts              # Shared REST helpers
```

## Architecture Patterns

### REST Layer (Thin Routing)

REST files are thin routing layers that delegate to the CRUD factory:

```typescript
// [model].rest.ts - delegates to factory
const config: CrudConfig<Model, NewModel> = {
  domain: modelDomain,
  fieldMeta: modelFieldMeta,
  modelName: 'Model',
  endpoints: { readMany: true, readOne: true, create: true, update: true, delete: true },
};
registerCrudRoutes(this.routes, config);
```

The `crud.factory.ts` provides generic handlers (`createListHandler`, `createGetByIdHandler`, etc.) that:

1. Parse query parameters (limit, offset, orderBy, include, where)
2. Validate filters against field metadata
3. Call domain methods
4. Convert BigInt to Number for JSON serialization

### Domain Layer (Business Logic)

Each model has a domain class with CRUD operations and hook orchestration:

- `create()`, `findById()`, `findMany()`, `update()`, `delete()`
- Hook flow: before → validate → pre → DB operation → post → after
- Relationship loading via `include` parameter
- Field sanitization (strip unexposed/unaccepted fields)

The `base.domain.ts` provides an abstract `BaseDomain<T, TNew>` class with shared CRUD logic. The `junction.utils.ts`
provides utilities for many-to-many relationships.

### OpenAPI (Dynamic Generation)

OpenAPI spec is built dynamically from metadata at runtime:

- `openapi-metadata.ts` - exports model metadata (fields, relationships, endpoints)
- `openapi.ts` - builds OpenAPI 3.1.0 spec from metadata using `buildOpenAPISpec()`

## Model Definition

```json
{
  "name": "User",
  "tableName": "user",
  "schema": "public",
  "enums": [{ "name": "AccountType", "values": ["free", "premium"] }],
  "fields": [
    { "name": "id", "type": "uuid", "primaryKey": true, "defaultValue": "gen_random_uuid()", "required": true },
    { "name": "email", "type": "string", "maxLength": 255, "required": true, "unique": true }
  ],
  "relationships": [{ "type": "oneToMany", "name": "postList", "target": "Post", "foreignKey": "authorId" }],
  "indexes": [{ "fields": ["email", "isActive"], "unique": true }],
  "check": { "numNotNulls": [{ "fields": ["field1", "field2"], "num": 1 }] },
  "endpoints": { "create": true, "readOne": true, "readMany": true, "update": true, "delete": true },
  "timestamps": true
}
```

## Data Types

| Category   | Types                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Primitives | `text`, `string`, `integer`, `bigint`, `decimal`, `boolean`, `uuid`                                        |
| Date       | `date` - stored as EPOCH milliseconds (`bigint`)                                                           |
| Structured | `json`, `jsonb`, `enum` (standard or bitwise)                                                              |
| Spatial    | `point`, `linestring`, `polygon`, `multipoint`, `multilinestring`, `multipolygon`, `geometry`, `geography` |
| Arrays     | Any type with `"array": true`                                                                              |

**Notes:**

- Date fields: API uses numeric timestamps (e.g., `1704067200000`), stored as `bigint`
- Spatial fields: API uses GeoJSON, stored as WKT/EWKB
- Numeric defaults limited to `Number.MAX_SAFE_INTEGER` (2^53-1)

## Field Properties

| Property     | Values                                   | Description                  |
| ------------ | ---------------------------------------- | ---------------------------- |
| `expose`     | `default`, `hidden`, `create`            | Controls response visibility |
| `accept`     | `default`, `create`, `never`             | Controls input acceptance    |
| `references` | `{ model, field, onDelete?, onUpdate? }` | Foreign key definition       |

**`expose`**: `hidden` = never visible, `create` = visible only in POST response **`accept`**: `create` = immutable
after creation, `never` = server-managed (use hook or defaultValue)

## Relationships

| Type         | Description       | Generates Endpoints |
| ------------ | ----------------- | ------------------- |
| `oneToMany`  | Parent → Children | No                  |
| `manyToOne`  | Child → Parent    | No                  |
| `manyToMany` | Junction table    | Yes                 |
| `oneToOne`   | Direct link       | No                  |

**Many-to-Many Endpoints:**

```
GET    /:id/{relation}List     POST   /:id/{relation}List     POST   /:id/{relation}
PUT    /:id/{relation}List     DELETE /:id/{relation}List     DELETE /:id/{relation}/:targetId
```

**Relationship endpoint configuration:**

```json
{ "type": "manyToMany", "endpoints": { "get": true, "add": true, "remove": true, "replace": false } }
```

## Hook System

```
Before-hook (outside tx) → Zod validation → Begin TX → Pre-hook → Zod → DB op → Post-hook → Commit → After-hook
```

| Hook           | Signature                                                | When                |
| -------------- | -------------------------------------------------------- | ------------------- |
| `beforeCreate` | `(rawInput, ctx?) => Promise<unknown>`                   | Before validation   |
| `preCreate`    | `(input, rawInput, tx, ctx?) => Promise<input>`          | Before DB operation |
| `postCreate`   | `(input, result, rawInput, tx, ctx?) => Promise<result>` | After DB (in tx)    |
| `afterCreate`  | `(result, rawInput, ctx?) => Promise<void>`              | After commit        |

Same pattern for `Update`, `Delete`, `FindById`, `FindMany`, and junction operations (`AddJunction`, `RemoveJunction`).

**Context**: `{ requestId, userId, metadata }` - set via Hono middleware

## Exceptions

Domain layer throws `DomainException` or `NotFoundException`. REST layer converts to HTTP status codes.

| Exception           | HTTP Status |
| ------------------- | ----------- |
| `NotFoundException` | 404         |
| `DomainException`   | 500         |

Exceptions in hooks trigger transaction rollback.

## Filtering

Filters passed via `where` query parameter as base64-encoded JSON.

```json
{ "field": "status", "op": "eq", "value": "active" }
{ "and": [{ "field": "age", "op": "gte", "value": 18 }, { "field": "active", "op": "eq", "value": true }] }
```

| Operators by Type                                                          |
| -------------------------------------------------------------------------- |
| String: `eq`, `neq`, `like`, `ilike`, `in`, `nin`, `isNull`                |
| Numeric/Date: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `isNull` |
| Boolean: `eq`, `isNull`                                                    |
| Array: `contains`, `overlaps`, `isNull`                                    |

**Domain filtering**: Use `skipSanitization: true` to access hidden fields in internal calls.

## Database Compatibility

| Feature   | PostgreSQL                           | CockroachDB                |
| --------- | ------------------------------------ | -------------------------- |
| Indexes   | BTREE, GIN, GIST, HASH, SPGIST, BRIN | BTREE, GIN, GIST only      |
| Enums     | All versions                         | v22.2+                     |
| GEOGRAPHY | Supported                            | Auto-converted to GEOMETRY |

## CLI

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated [--dbType postgresql|cockroachdb] [--schema name] [--verbose]
```

## Naming Conventions

| Type               | Convention              | Example                 |
| ------------------ | ----------------------- | ----------------------- |
| Model names        | PascalCase              | `User`, `UserProfile`   |
| Table names        | snake_case, singular    | `user`, `user_role`     |
| Field/Column names | camelCase / snake_case  | `userId` / `user_id`    |
| Relationship names | camelCase + List suffix | `postList`, `skillList` |

## Dependencies (Generated Code)

```json
{
  "imports": {
    "drizzle-orm": "npm:drizzle-orm@^0.44.5",
    "drizzle-zod": "npm:drizzle-zod@^0.8.0",
    "@hono/hono": "jsr:@hono/hono@^4.6.0",
    "postgres": "npm:postgres@^3.4.7",
    "zod": "npm:zod@^3.23.0",
    "@scalar/hono-api-reference": "npm:@scalar/hono-api-reference@^0.5.0"
  }
}
```

---

## Agent Rules

### Coding patterns and principles

- Follow separation-of-concerns and single-responsibility design principles
- Complexity must be kept at minimum level
- Avoid code duplication, multiple occurrences of code of very similar patterns must be factored into a function

### Dependency rules

- Add packages using `deno add <package spec>`, never add packages directly to deno.json
- Do not add any packages without approval

### Code quality rules

- Avoid using the "any" type
- Avoid using the "function" keyword, use arrow functions
- Always be type specific in method signatures and returns

### Task rules

- The task plan file you use must be called .{projectName}-agent-plan.md and it must be placed into the project root
- Create a multi step plan on every tasks (or a single step one on simple tasks) that you append to the task plan file
- Mark a task done explicitly
- Clear the task plan file only on developer request, do not auto-clean it

### End-of-a-task rules

Finish each task with the following (in this order):

Update AGENTS.md (this file) whenever major architectural changes, new features or important patterns added to the
codebase, an existing feature changes, new or updated information surfaces. Then:

1. Update integration tests to capture every new features or feature changes
2. Format the code with `deno task fmt` in the project root and in example/
3. Check formatting with with `deno task fmt:check` in the project root and in example/
4. Check for linter errors with `deno task lint` in the project root and in example/
5. Check for type errors with `deno task check` in the project root and in example/
6. Ask the developer to run the integation test

Should any of the deno tasks fail, fix the errors before continuing the restart the above list.

### Never do the following automatically yourselves

- code generation
- database initialization
- database cleaning
- testing

### Never run the following automatically yourselves

- `deno task cog:crdb:generate`, ask the developer to run it
- `deno task cog:psql:generate`, ask the developer to run it
- `deno task db:init`, ask the developer to run it
- `deno task db:clean`, ask the developer to run it
- `deno task test`, ask the developer to run it
- `deno task test:integration`, ask the developer to run it
- `deno task test:clean`, ask the developer to run it
