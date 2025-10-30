# CLAUDE.md - AI Assistant Reference Guide

> **Purpose**: Quick reference for AI assistants (like Claude) working on the COG codebase.
> This document provides essential context, project structure, and common patterns.

---

## What is COG?

**COG (CRUD Operations Generator)** is a TypeScript code generator that transforms JSON model definitions into production-ready backend code. Think of it as a compiler for backend applications.

**Input**: Simple JSON model definitions (users, posts, comments, etc.)
**Output**: Complete layered TypeScript backend with database, domain logic, REST APIs, and OpenAPI docs

**Stack**: Deno + TypeScript + Drizzle ORM + Hono + Zod + PostgreSQL/CockroachDB

---

## Project Structure

```
cog/
├── src/
│   ├── cli.ts                           # CLI entry point
│   ├── mod.ts                           # Main generator orchestrator
│   ├── types/
│   │   └── model.types.ts               # TypeScript type definitions
│   ├── parser/
│   │   └── model-parser.ts              # JSON model validation & parsing
│   └── generators/
│       ├── drizzle-schema.generator.ts  # Generates Drizzle ORM schemas
│       ├── database-init.generator.ts   # Generates DB connection & init
│       ├── domain-api.generator.ts      # Generates business logic layer
│       ├── rest-api.generator.ts        # Generates Hono REST endpoints
│       └── openapi.generator.ts         # Generates OpenAPI 3.1.0 docs
├── example/
│   ├── models/                          # Example JSON model definitions
│   └── generated/                       # Example generated code
├── WARP.md                              # Complete technical documentation
├── README.md                            # User-facing documentation
└── CLAUDE.md                            # This file (AI assistant reference)
```

---

## Generation Pipeline

```
JSON Models → Parse & Validate → Transform → Generate → Write Files
     ↓              ↓                ↓          ↓           ↓
  models/    model-parser.ts    mod.ts    generators/   generated/
```

### Pipeline Steps:

1. **Parse** - Read & validate JSON model definitions from `modelsPath`
2. **Validate** - Check model integrity, relationships, data types
3. **Transform** - Convert to internal representation (`ModelDefinition[]`)
4. **Generate** - Each generator produces TypeScript code strings
5. **Write** - Output organized code structure to `outputPath`

---

## Generated Code Architecture

COG generates a 4-layer architecture:

```
generated/
├── index.ts                     # Main entry point + initializeGenerated()
├── db/
│   ├── database.ts             # Database connection & pooling
│   └── initialize-database.ts  # Database initialization & PostGIS setup
├── schema/
│   ├── [model].schema.ts       # Drizzle table definitions + Zod schemas
│   ├── relations.ts            # Drizzle relationship definitions
│   └── index.ts
├── domain/
│   ├── [model].domain.ts       # Business logic (CRUD operations)
│   ├── hooks.types.ts          # Hook type definitions
│   └── index.ts
└── rest/
    ├── [model].rest.ts         # Hono REST endpoints
    ├── openapi.ts              # OpenAPI specification (TypeScript)
    ├── openapi.json            # OpenAPI specification (JSON)
    ├── middleware.ts
    ├── types.ts
    └── index.ts
```

### Layer Responsibilities:

1. **Database Layer** (`/db`) - Connection management, transactions, initialization
2. **Schema Layer** (`/schema`) - Drizzle ORM tables, relations, Zod validation schemas
3. **Domain Layer** (`/domain`) - Pure business logic (CRUD + relationships), no HTTP dependencies
4. **REST Layer** (`/rest`) - HTTP interface, translates requests to domain operations

---

## Key Concepts

### 1. Model Definition Structure

Models are defined in JSON with this structure:

```json
{
  "name": "User",                    // Model name (PascalCase)
  "tableName": "users",              // Database table name (snake_case)
  "plural": "indices",               // Optional: custom plural (for irregular plurals)
  "schema": "public",                // Optional: database schema
  "enums": [                         // Optional: enum definitions
    {
      "name": "AccountType",
      "values": ["free", "premium"]
    }
  ],
  "fields": [                        // Required: field definitions
    {
      "name": "id",
      "type": "uuid",
      "primaryKey": true,
      "defaultValue": "gen_random_uuid()",
      "required": true
    }
  ],
  "relationships": [                 // Optional: relationships
    {
      "type": "oneToMany",
      "name": "posts",
      "target": "Post",
      "foreignKey": "authorId"
    }
  ],
  "indexes": [                       // Optional: custom indexes
    {
      "fields": ["email", "isActive"],
      "unique": true
    }
  ],
  "timestamps": true,                // Optional: auto createdAt/updatedAt
  "softDelete": true                 // Optional: soft delete support
}
```

### 2. Supported Data Types

**Primitives:**
- `text`, `string`, `integer`, `bigint`, `decimal`, `boolean`, `date`, `uuid`
- `json`, `jsonb` (structured data)
- `enum` (PostgreSQL enums with standard or bitwise modes)

**PostGIS Spatial Types:**
- `point`, `linestring`, `polygon`, `multipoint`, `multilinestring`, `multipolygon`
- `geometry`, `geography`

**Special Features:**
- Array types: `"array": true` on any field
- Foreign keys: `"references": { "model": "...", "field": "..." }`
- Enums: Standard (single value) or bitwise (multiple values via integer flags)

### 3. Relationship Types

- **oneToMany** - Parent-child (e.g., User → Posts)
- **manyToOne** - Child-parent (e.g., Post → User)
- **manyToMany** - Junction table (e.g., User ↔ Roles via user_roles)
- **oneToOne** - Direct relationship (e.g., User → Profile)
- **Self-referential** - Model references itself (e.g., Location → parent/children)

### 4. Hook System

Hooks provide extension points for custom logic:

```
Begin Transaction
  → Input Validation (Zod)
  → Pre-hook (modify input, within transaction)
  → Pre-hook Output Validation (Zod)
  → Main Operation (database operation)
  → Post-hook (modify output, within transaction)
Commit Transaction
→ After-hook (async side effects, outside transaction)
```

**Hook Types:**
- **Pre-hooks** - Modify input before operation (validated twice: before and after hook)
- **Post-hooks** - Modify output after operation (within transaction)
- **After-hooks** - Side effects after commit (notifications, logging, external APIs)

**Hook Context:**
- `requestId` - Unique request identifier
- `userId` - Current user from authentication
- `metadata` - Custom data passed between hooks
- `transaction` - Active database transaction

#### Domain Hooks vs REST Hooks

COG provides TWO types of hooks that run at different layers:

**Domain Hooks** (within transactions):
- Run at the domain layer
- Have access to database transaction
- Execute within transaction boundary
- For database-related logic, validation, data transformation
- Signature includes `tx: DbTransaction` parameter

**REST Hooks** (at HTTP layer):
- Run at the REST layer BEFORE/AFTER domain operations
- NO access to database transaction
- Have access to full Hono context (`c: Context`)
- For HTTP-specific operations: request/response transformation, authorization, logging
- Execute outside transaction boundary

**Execution Flow with Both Hooks:**
```
HTTP Request
  → REST Pre-hook (no transaction)
    → Begin Transaction
      → Domain Pre-hook (within transaction)
      → Main Operation
      → Domain Post-hook (within transaction)
    → Commit Transaction
  → REST Post-hook (no transaction)
  → Domain After-hook (async, no transaction)
→ HTTP Response
```

**Use Domain Hooks when:**
- Modifying data before/after database operations
- Validating business rules that require DB queries
- Enriching data with related records from database
- Any operation that needs transaction safety

**Use REST Hooks when:**
- Transforming HTTP request/response formats
- HTTP-specific authorization checks
- Logging HTTP requests/responses
- Setting HTTP headers
- Rate limiting
- Request/response sanitization at HTTP level

**REST Hooks Configuration:**

```typescript
await initializeGenerated({
  database: { connectionString: '...' },
  app,
  restHooks: {
    user: {
      async preCreate(input, c, context) {
        // Access HTTP context
        console.log('Request from:', c.req.header('user-agent'));

        // Transform input at HTTP layer
        return { data: input, context };
      },
      async postCreate(input, result, c, context) {
        // Set response headers
        c.header('X-Resource-Id', result.id);

        // Return modified response
        return { data: result, context };
      },
      async preFindMany(c, context) {
        // Check authorization at HTTP layer
        if (!c.req.header('authorization')) {
          throw new HTTPException(401, { message: 'Unauthorized' });
        }

        return { data: {}, context };
      }
    }
  },
  domainHooks: {
    user: {
      async preCreate(input, tx, context) {
        // Hash password (needs to be in transaction)
        const hashedPassword = await hashPassword(input.password);

        // Check for duplicates in database
        const existing = await tx
          .select()
          .from(userTable)
          .where(eq(userTable.email, input.email));

        if (existing.length > 0) {
          throw new Error('Email already exists');
        }

        return {
          data: { ...input, password: hashedPassword },
          context
        };
      }
    }
  }
});
```

**REST Hooks Interface:**

```typescript
interface RestHooks<T, CreateInput, UpdateInput, EnvVars> {
  // Pre-operation hooks (before domain, no transaction)
  preCreate?: (input: CreateInput, c: Context, context?) => Promise<PreHookResult>;
  preUpdate?: (id: string, input: UpdateInput, c: Context, context?) => Promise<PreHookResult>;
  preDelete?: (id: string, c: Context, context?) => Promise<PreHookResult>;
  preFindById?: (id: string, c: Context, context?) => Promise<PreHookResult>;
  preFindMany?: (c: Context, context?) => Promise<PreHookResult>;

  // Post-operation hooks (after domain, no transaction)
  postCreate?: (input, result: T, c: Context, context?) => Promise<PostHookResult>;
  postUpdate?: (id, input, result: T, c: Context, context?) => Promise<PostHookResult>;
  postDelete?: (id, result: T, c: Context, context?) => Promise<PostHookResult>;
  postFindById?: (id, result: T | null, c: Context, context?) => Promise<PostHookResult>;
  postFindMany?: (results: {data: T[]; total: number}, c: Context, context?) => Promise<PostHookResult>;
}
```

**Key Differences:**

| Feature | Domain Hooks | REST Hooks |
|---------|--------------|------------|
| Layer | Domain | REST |
| Transaction | Yes | No |
| Hono Context | No | Yes (full `c` param) |
| Use Case | Database operations | HTTP operations |
| Validation | Zod (twice) | No automatic validation |
| Async Side Effects | After-hooks | N/A |

### 5. Validation System (Always Enabled)

**CRITICAL**: Zod validation is MANDATORY and cannot be disabled.

**Generated Schemas (per model):**
```typescript
export const userInsertSchema = createInsertSchema(userTable);  // Create ops
export const userUpdateSchema = createUpdateSchema(userTable);  // Update ops (partial)
export const userSelectSchema = createSelectSchema(userTable);  // Select ops
```

**Dual Validation Flow:**
1. Initial input validated before pre-hook
2. Pre-hook output validated before database operation

This prevents hooks from emitting malformed data.

### 6. OpenAPI Documentation (Auto-Generated)

When `--no-documentation` flag is NOT used, COG generates:

**Files:**
- `generated/rest/openapi.ts` - TypeScript module with spec + `mergeOpenAPISpec()` utility
- `generated/rest/openapi.json` - Static JSON specification

**Auto-Generated Endpoints:**
- `/docs/openapi.json` (default, runtime configurable) - OpenAPI 3.1.0 JSON spec
- `/docs/reference` (default, runtime configurable) - Interactive Scalar UI docs

**Runtime Configuration:**
```typescript
await initializeGenerated({
  database: { connectionString: '...' },
  app,
  docs: {
    enabled: true,           // Enable/disable (default: true if generated)
    basePath: '/docs/v1',   // Custom path (default: '/docs')
  },
});
```

---

## CLI Reference

### Basic Command

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated
```

### All CLI Options

| Flag                 | Description                              | Default       |
| -------------------- | ---------------------------------------- | ------------- |
| `--modelsPath`       | Path to JSON model files                 | `./models`    |
| `--outputPath`       | Where to generate code                   | `./generated` |
| `--dbType`           | `postgresql` or `cockroachdb`            | `postgresql`  |
| `--schema`           | Database schema name                     | (default)     |
| `--no-postgis`       | Disable PostGIS (spatial → JSONB)        | enabled       |
| `--no-timestamps`    | Disable timestamps globally              | enabled       |
| `--no-softDeletes`   | Disable soft deletes globally            | enabled       |
| `--no-documentation` | Disable OpenAPI generation               | enabled       |
| `--verbose`          | Show generated file paths                | false         |
| `--help`             | Show help message                        | -             |

**IMPORTANT**: CLI flags OVERRIDE model-level settings. If you use `--no-timestamps`, ALL models will be generated without timestamps, even if `"timestamps": true` in JSON.

---

## Common Development Patterns

### Adding a New Data Type

1. Update `PrimitiveType` or `PostGISType` in `src/types/model.types.ts`
2. Update `model-parser.ts` validation
3. Update `drizzle-schema.generator.ts` to map type to Drizzle column
4. Update `openapi.generator.ts` to map type to OpenAPI schema
5. Test with example model

### Adding a New Generator

1. Create new generator in `src/generators/[name].generator.ts`
2. Implement generation logic (input: `ModelDefinition[]`, output: `Map<string, string>`)
3. Import and call in `src/mod.ts` `generateFromModels()`
4. Add files to output map

### Modifying Generated Code Structure

Edit the specific generator:
- **Schema structure**: `drizzle-schema.generator.ts`
- **Domain API**: `domain-api.generator.ts`
- **REST endpoints**: `rest-api.generator.ts`
- **OpenAPI spec**: `openapi.generator.ts`
- **Main index**: `mod.ts` → `generateMainIndex()`

### Testing Changes

```bash
# Generate example code
cd example
deno run -A ../src/cli.ts --modelsPath ./models --outputPath ./generated

# Run example server
deno run -A example.ts

# Test endpoints
curl http://localhost:3000/api/users
curl http://localhost:3000/docs/openapi.json
open http://localhost:3000/docs/reference
```

---

## Important Implementation Details

### 1. Transaction Wrapping

Every REST endpoint automatically wraps operations in a transaction:
```
Begin → Pre-hooks → Operation → Post-hooks → Commit → After-hooks
```

If any step fails, transaction rolls back (except after-hooks).

### 2. Soft Delete Implementation

When enabled, adds `deletedAt: timestamp('deleted_at')` to schema.
- Delete operations set `deletedAt = now()` instead of hard delete
- Queries automatically filter `WHERE deletedAt IS NULL`

### 3. Timestamp Implementation

When enabled, adds:
- `createdAt: timestamp('created_at').defaultNow().notNull()`
- `updatedAt: timestamp('updated_at').defaultNow().notNull()`

Update operations automatically set `updatedAt = new Date()`.

### 4. Enum Implementation

**Standard Enum (single value):**
```typescript
export const roleEnum = pgEnum('role', ['admin', 'editor', 'viewer']);
role: roleEnum('role').notNull()
```

**Bitwise Enum (multiple values):**
- Uses `integer` field with bitwise flags
- Each enum value = power of 2 (1, 2, 4, 8, ...)
- Combine with OR: `1 | 2 | 4 = 7`
- Query with AND: `(value & flag) > 0`

### 5. PostGIS Integration

**With PostGIS (`--postgis` default):**
- Spatial types use PostGIS custom types
- Database init enables PostGIS extension
- GIST indexes for spatial fields

**Without PostGIS (`--no-postgis`):**
- Spatial types become `jsonb()` fields
- GeoJSON format in JSONB
- GIST indexes become GIN indexes
- No extension required

### 6. CockroachDB Compatibility

**Key Differences:**
- PostgreSQL enums supported in CockroachDB v22.2+ only
- Bitwise operations fully supported (all versions)
- Generator adds compatibility comments when `--dbType cockroachdb`

---

## File Naming Conventions

| Type         | Pattern                  | Example                   |
| ------------ | ------------------------ | ------------------------- |
| Models       | `[name].json`            | `user.json`               |
| Schemas      | `[name].schema.ts`       | `user.schema.ts`          |
| Domain       | `[name].domain.ts`       | `user.domain.ts`          |
| REST         | `[name].rest.ts`         | `user.rest.ts`            |
| Tables       | `[tableName]` (snake)    | `users`, `user_roles`     |
| Columns      | `snake_case`             | `created_at`, `user_id`   |
| Model names  | `PascalCase`             | `User`, `UserProfile`     |
| Field names  | `camelCase`              | `userId`, `createdAt`     |

---

## Generated Code Usage Example

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated/index.ts';

const app = new Hono();

await initializeGenerated({
  database: {
    connectionString: 'postgresql://user:pass@localhost:5432/mydb',
    ssl: { ca: '...' }, // Optional
  },
  app,
  api: {
    basePath: '/api/v1',  // Optional (default: '/api')
  },
  docs: {
    enabled: true,         // Optional (default: true if generated)
    basePath: '/docs',     // Optional (default: '/docs')
  },
  // Domain hooks (within transaction)
  domainHooks: {
    user: {
      async preCreate(input, tx, context) {
        // Hash password at domain layer (within transaction)
        const hashedPassword = await hashPassword(input.password);
        return { data: { ...input, password: hashedPassword }, context };
      },
      async postCreate(input, result, tx, context) {
        // Enrich response with related data
        return { data: result, context };
      },
      async afterCreate(result, context) {
        // Send welcome email (async, outside transaction)
        await sendWelcomeEmail(result.email);
      },
    },
  },
  // REST hooks (HTTP layer, no transaction)
  restHooks: {
    user: {
      async preCreate(input, c, context) {
        // Log HTTP request at REST layer
        console.log('Create user request from:', c.req.header('user-agent'));

        // Check authorization
        const token = c.req.header('authorization');
        if (!token) {
          throw new HTTPException(401, { message: 'Unauthorized' });
        }

        return { data: input, context };
      },
      async postCreate(input, result, c, context) {
        // Set custom response headers
        c.header('X-Resource-Id', result.id);
        c.header('X-Request-Time', Date.now().toString());

        // Remove sensitive fields from response
        const { password, ...safeResult } = result as any;

        return { data: safeResult, context };
      },
      async preFindMany(c, context) {
        // Rate limiting check at HTTP layer
        const ip = c.req.header('x-forwarded-for') || 'unknown';
        await checkRateLimit(ip);

        return { data: {}, context };
      },
    },
  },
});

Deno.serve({ port: 3000 }, app.fetch);
```

**Generated REST Endpoints (example for User model):**

```
GET    /api/users                   # List users (paginated)
POST   /api/users                   # Create user
GET    /api/users/:id               # Get user by ID
PUT    /api/users/:id               # Update user
DELETE /api/users/:id               # Delete user
GET    /api/users/:id/posts         # Get user's posts (relationship)
GET    /api/users/:id/roles         # Get user's roles (many-to-many)
```

**Query Parameters:**
- `limit` - Pagination limit
- `offset` - Pagination offset
- `orderBy` - Sort field
- `order` - Sort direction (asc/desc)

---

## Critical Gotchas & Edge Cases

### 1. CLI Flag Priority

CLI flags OVERRIDE model settings:
```json
// user.json
{ "timestamps": true }  // ← Ignored if --no-timestamps used
```

### 2. Junction Table Naming

Many-to-many relationships require `through` field with explicit junction table name:
```json
{
  "type": "manyToMany",
  "name": "roles",
  "target": "Role",
  "through": "user_roles",        // ← REQUIRED
  "foreignKey": "user_id",
  "targetForeignKey": "role_id"
}
```

### 3. Self-Referential Relationships

Model can reference itself:
```json
{
  "name": "Location",
  "relationships": [
    {
      "type": "manyToOne",
      "name": "parent",
      "target": "Location",
      "foreignKey": "parentId"
    },
    {
      "type": "oneToMany",
      "name": "children",
      "target": "Location",
      "foreignKey": "parentId"
    }
  ]
}
```

### 4. Custom Pluralization

For irregular plurals:
```json
{
  "name": "Index",
  "plural": "indices",  // ← Instead of "indexes"
  "tableName": "indices"
}
```

### 5. Foreign Key References

When using `references` in fields, ensure target model exists:
```json
{
  "name": "authorId",
  "type": "uuid",
  "required": true,
  "references": {
    "model": "User",           // ← Must match existing model name
    "field": "id",             // ← Must match field in User model
    "onDelete": "CASCADE"      // ← Optional
  }
}
```

### 6. Enum vs Bitwise Enum

**IMPORTANT**: There's NO automatic bitwise enum generation. You must:
1. Define standard enum in `enums` array
2. Manually add integer field for bitwise storage
3. Document bit mapping in code comments

Example:
```json
{
  "enums": [
    { "name": "Gender", "values": ["man", "woman", "non_binary"] }
  ],
  "fields": [
    { "name": "gender", "type": "enum", "enumName": "Gender" },
    { "name": "genderPreference", "type": "integer", "defaultValue": 7 }
  ]
}
```

### 7. PostGIS SRID

For spatial fields, optionally specify SRID:
```json
{
  "name": "location",
  "type": "point",
  "srid": 4326,        // ← WGS 84 (GPS coordinates)
  "required": true
}
```

### 8. Index Types

GIST indexes only work with PostGIS:
```json
{
  "indexes": [
    {
      "fields": ["location"],
      "type": "gist"        // ← Requires --postgis (default)
    }
  ]
}
```

If using `--no-postgis`, GIST indexes are automatically converted to GIN.

---

## Code Generation Flow in mod.ts

```typescript
// 1. Parse models from JSON files
const parser = new ModelParser();
const { models, errors } = await parser.parseModelsFromDirectory(modelsPath);

// 2. Apply global CLI flag overrides
for (const model of models) {
  if (config.features.softDeletes === false) model.softDelete = false;
  if (config.features.timestamps === false) model.timestamps = false;
  if (config.database.schema) model.schema = config.database.schema;
}

// 3. Generate code files
const files = new Map<string, string>();

// Schema layer (Drizzle + Zod)
const schemaGenerator = new DrizzleSchemaGenerator(models, { ... });
schemaGenerator.generateSchemas().forEach((content, path) => files.set(path, content));

// Database layer
const dbInitGenerator = new DatabaseInitGenerator(models, { ... });
files.set('db/database.ts', dbInitGenerator.generateDatabaseInit());
files.set('db/initialize-database.ts', dbInitGenerator.generateDatabaseInitialization());

// Domain layer
const domainGenerator = new DomainAPIGenerator(models);
domainGenerator.generateDomainAPIs().forEach((content, path) => files.set(path, content));

// REST layer
const restGenerator = new RestAPIGenerator(models, { ... });
restGenerator.generateRestAPIs().forEach((content, path) => files.set(path, content));

// OpenAPI (if enabled)
if (config.documentation?.enabled !== false) {
  const openAPIGenerator = new OpenAPIGenerator(models);
  openAPIGenerator.generateOpenAPI().forEach((content, path) => files.set(path, content));
}

// Main index
files.set('index.ts', generateMainIndex(models));

// 4. Write all files to disk
await writeGeneratedFiles(outputPath, files, verbose);
```

---

## Dependencies

### COG Generator Dependencies (dev)
- Deno runtime (no external packages needed)

### Generated Code Dependencies (runtime)
Projects using generated code need these in `deno.json`:

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

## Quick Command Reference

```bash
# Generate code
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated

# Generate with options
deno run -A src/cli.ts \
  --modelsPath ./models \
  --outputPath ./generated \
  --dbType postgresql \
  --schema public \
  --no-postgis \
  --no-documentation \
  --verbose

# Run example
cd example
deno run -A ../src/cli.ts --modelsPath ./models --outputPath ./generated
deno run -A example.ts

# Format code
deno fmt

# Lint code
deno lint

# Cache dependencies
deno cache --reload src/mod.ts
```

---

## Related Documentation

- **WARP.md** - Complete technical documentation (comprehensive, detailed)
- **README.md** - User-facing documentation (getting started, features)
- **example/README.md** - Example project walkthrough
- **src/types/model.types.ts** - TypeScript type definitions with comments

---

## Last Updated

Generated: 2025-10-30

**NOTE**: This file should be updated whenever major architectural changes, new features, or important patterns are added to the codebase.
