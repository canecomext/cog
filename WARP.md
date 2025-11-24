# WARP - Complete Technical Documentation

> **WARP**: **W**ork **A**rchitecture **R**eference **P**ackage
> Complete technical reference for COG (CRUD Operations Generator)

---

## Table of Contents

- [What is COG?](#what-is-cog)
- [Project Structure](#project-structure)
- [Generation Pipeline](#generation-pipeline)
- [Generated Code Architecture](#generated-code-architecture)
- [Key Concepts](#key-concepts)
  - [Model Definition Structure](#model-definition-structure)
  - [Supported Data Types](#supported-data-types)
  - [Relationship Types](#relationship-types)
  - [Hook System](#hook-system)
  - [Exception Handling (Domain vs REST)](#exception-handling-domain-vs-rest)
  - [Validation System](#validation-system)
  - [Check Constraints](#check-constraints)
- [Database Compatibility](#database-compatibility)
- [CLI Reference](#cli-reference)
- [Generated Code Usage](#generated-code-usage)
- [Common Development Patterns](#common-development-patterns)
- [File Naming Conventions](#file-naming-conventions)
- [Critical Gotchas & Edge Cases](#critical-gotchas--edge-cases)
- [Dependencies](#dependencies)
- [Related Documentation](#related-documentation)

---

## What is COG?

**COG (CRUD Operations Generator)** is a TypeScript code generator that transforms JSON model definitions into production-ready backend code. Think of it as a compiler for backend applications.

**Input**: Simple JSON model definitions (user, post, comment, etc.)
**Output**: Complete layered TypeScript backend with database, domain logic, REST APIs, and OpenAPI docs

**Stack**: Deno + TypeScript + Drizzle ORM + Hono + Zod + PostgreSQL/CockroachDB

### Design Philosophy

COG follows these principles:

1. **Model-First Development** - Define your data model in JSON, generate everything else
2. **Layered Architecture** - Clean separation between REST, Domain, Schema, and Database layers
3. **Type Safety** - Full TypeScript types throughout the stack
4. **Database Agnostic** - Support for both PostgreSQL and CockroachDB with automatic compatibility handling
5. **Extensible** - Hook system allows custom logic without modifying generated code
6. **OpenAPI First** - Complete API documentation generated automatically
7. **Validation Always On** - Zod validation cannot be disabled, ensuring data integrity

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
├── WARP.md                              # This file (complete technical docs)
├── CLAUDE.md                            # Brief reference (points to WARP.md)
└── README.md                            # User-facing documentation
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

#### Database Layer (`/db`)

Manages connections, transactions, and database initialization. Uses Drizzle ORM for type-safe SQL operations with PostgreSQL or CockroachDB.

**Key Files:**
- `database.ts` - Connection pooling, transaction management, SQL client access
- `initialize-database.ts` - Creates tables, indexes, constraints, PostGIS setup

#### Schema Layer (`/schema`)

Drizzle ORM table definitions and Zod validation schemas. This layer defines the data structure and validation rules.

**Key Files:**
- `[model].schema.ts` - Table schema, Zod schemas (insert/update/select)
- `relations.ts` - Drizzle relationship definitions
- `index.ts` - Exports all schemas

#### Domain Layer (`/domain`)

Pure business logic layer with no HTTP dependencies. All operations accept a database transaction parameter.

**Key Features:**
- CRUD operations (create, findById, findMany, update, delete)
- Relationship operations (add/remove for many-to-many)
- Hook integration (pre/post/after for all operations)
- Transaction-based (all operations run within provided transaction)

#### REST Layer (`/rest`)

HTTP interface using Hono framework. Translates HTTP requests to domain operations.

**Key Features:**
- RESTful endpoints for all CRUD operations
- Relationship endpoints (e.g., `/employee/:id/skillList`)
- Input validation via Zod
- Hook integration (pre/post at HTTP layer)
- Error handling and status codes

---

## Key Concepts

### Model Definition Structure

Models are defined in JSON with this structure:

```json
{
  "name": "User",                    // Model name (PascalCase)
  "tableName": "user",               // Database table name (singular, snake_case)
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
      "name": "postList",
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
  "check": {                         // Optional: check constraints
    "numNotNulls": [
      {
        "fields": ["field1", "field2"],
        "num": 1
      }
    ]
  },
  "timestamps": true                 // Optional: auto createdAt/updatedAt
}
```

### Supported Data Types

**Primitives:**
- `text`, `string`, `integer`, `bigint`, `decimal`, `boolean`, `date` (EPOCH milliseconds), `uuid`
- `json`, `jsonb` (structured data)
- `enum` (PostgreSQL enums with standard or bitwise modes)

**Date Type - EPOCH Milliseconds:**

COG stores all `date` fields as EPOCH millisecond integers (`bigint`) in the database:
- **API Input/Output**: Use numeric timestamps (EPOCH milliseconds)
- **Database Storage**: `bigint` column with values like `1704067200000`
- **JavaScript/TypeScript**: Use `Date.getTime()` to get timestamp, `new Date(timestamp)` to create Date object
- **Example**: Send `1704067200000` (represents 2024-01-01) via REST API
- **Timestamps**: `createdAt` and `updatedAt` automatically use SQL formula: `(extract(epoch from now()) * 1000)::bigint`
- **Rationale**: Avoids timezone complexities, ISO string parsing issues, and provides universal compatibility

**PostGIS Spatial Types:**
- `point`, `linestring`, `polygon`
- `multipoint`, `multilinestring`, `multipolygon`
- `geometry`, `geography`

**PostGIS GeoJSON Support:**

COG automatically converts between GeoJSON (JavaScript/JSON standard) and WKT (PostGIS format):
- **API Input/Output**: Use standard GeoJSON objects
- **Database Storage**: Automatically converted to WKT/EWKB format
- **Example**: Send `{ type: 'Point', coordinates: [-122.4194, 37.7749] }` via REST API
- **Database**: Stored as `SRID=4326;POINT(-122.4194 37.7749)` or EWKB hex
- **Conversion**: Bidirectional - GeoJSON in requests/responses, WKT in database

**Special Features:**
- Array types: `"array": true` on any field
- Foreign keys: `"references": { "model": "...", "field": "..." }`
- Enums: Standard (single value) or bitwise (multiple values via integer flags)

**Numeric Precision Limitation:**

COG supports numeric default values only up to JavaScript's `Number.MAX_SAFE_INTEGER` (2^53 - 1 = 9007199254740991).

**Why**: JSON numbers beyond 2^53 - 1 lose precision when parsed by JavaScript.

**Workaround**: Omit default values for large bigint fields and set them at runtime.

### Relationship Types

- **oneToMany** - Parent-child (e.g., User → Post)
- **manyToOne** - Child-parent (e.g., Post → User)
- **manyToMany** - Junction table (e.g., User ↔ Role via user_role)
- **oneToOne** - Direct relationship (e.g., User → Profile)
- **Self-referential** - Model references itself (e.g., Employee → mentor/mentee)

**Relationship Endpoint URL Patterns:**

COG only generates endpoints for many-to-many relationships (junction tables are hidden from direct access):

| Operation | URL Pattern | Body | Example |
|-----------|-------------|------|---------|
| GET (list) | `GET /:id/{relationName}List` | N/A | `GET /employee/:id/skillList` |
| POST (add multiple) | `POST /:id/{relationName}List` | `{ ids: [...] }` | `POST /employee/:id/skillList` |
| POST (add single) | `POST /:id/{singularRelName}` | `{ id: "..." }` | `POST /employee/:id/skill` |
| PUT (replace all) | `PUT /:id/{relationName}List` | `{ ids: [...] }` | `PUT /employee/:id/skillList` |
| DELETE (remove multiple) | `DELETE /:id/{relationName}List` | `{ ids: [...] }` | `DELETE /employee/:id/skillList` |
| DELETE (remove single) | `DELETE /:id/{singularRelName}` | `{ id: "..." }` | `DELETE /employee/:id/skill` |

**Note:** oneToMany and manyToOne relationships do NOT generate dedicated endpoints. Use generic CRUD endpoints with foreign keys or query parameters with `?include` instead.

### Hook System

Hooks provide extension points for custom logic without modifying generated code.

#### Hook Execution Flow

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

#### Hook Signatures Reference

**Domain Hooks (CRUD Operations):**

| Hook | Signature | When It Runs |
|------|-----------|--------------|
| **preCreate** | `(input, rawInput, tx, context?) => Promise<{ data, context }>` | Before creating entity |
| **postCreate** | `(input, result, rawInput, tx, context?) => Promise<{ data, context }>` | After creating entity (in transaction) |
| **afterCreate** | `(result, rawInput, context?) => Promise<void>` | After transaction commits (async) |
| **preUpdate** | `(id, input, rawInput, tx, context?) => Promise<{ data, context }>` | Before updating entity |
| **postUpdate** | `(id, input, result, rawInput, tx, context?) => Promise<{ data, context }>` | After updating entity (in transaction) |
| **afterUpdate** | `(result, rawInput, context?) => Promise<void>` | After transaction commits (async) |
| **preDelete** | `(id, tx, context?) => Promise<{ data, context }>` | Before deleting entity |
| **postDelete** | `(id, result, tx, context?) => Promise<{ data, context }>` | After deleting entity (in transaction) |
| **afterDelete** | `(result, context?) => Promise<void>` | After transaction commits (async) |

**Junction Hooks (Many-to-Many):**

| Hook | Signature | When It Runs |
|------|-----------|--------------|
| **preAddJunction** | `(ids, rawInput, tx, context?) => Promise<{ data, context }>` | Before adding relationship |
| **postAddJunction** | `(ids, rawInput, tx, context?) => Promise<{ data, context }>` | After adding relationship (in transaction) |
| **afterAddJunction** | `(ids, rawInput, context?) => Promise<void>` | After transaction commits (async) |
| **preRemoveJunction** | `(ids, rawInput, tx, context?) => Promise<{ data, context }>` | Before removing relationship |
| **postRemoveJunction** | `(ids, rawInput, tx, context?) => Promise<{ data, context }>` | After removing relationship (in transaction) |
| **afterRemoveJunction** | `(ids, rawInput, context?) => Promise<void>` | After transaction commits (async) |

**Hook Parameters:**
- `input` - Validated input data (after Zod parsing)
- `rawInput` - Original unvalidated request body (for nested creates or metadata). Only on create/update/junction operations, not delete.
- `result` - Entity returned from database operation
- `id`/`ids` - Entity identifier(s)
- `tx` - Database transaction (use for operations that must be atomic)
- `context` - Shared state (`requestId`, `userId`, `metadata`, custom variables from Hono middleware)

#### Domain Hooks

All hooks run at the domain layer within database transactions, providing:
- Access to database transaction (`tx: DbTransaction`)
- Transaction safety for all operations
- Data validation and transformation capabilities
- Business logic execution

**Use Domain Hooks for:**
- Modifying data before/after database operations
- Validating business rules that require DB queries
- Enriching data with related records from database
- Any operation that needs transaction safety
- Audit logging within the same transaction

**HTTP-Layer Concerns (auth, logging, headers):** Use Hono middleware instead of hooks for HTTP-specific operations

### Exception Handling (Domain vs REST)

COG implements a clean separation between domain-level exceptions and transport-specific error handling. This architecture ensures the domain layer remains transport-agnostic while the REST layer handles HTTP-specific error conversion.

#### Architecture Overview

```
Domain Layer (Business Logic)
    ↓ throws DomainException/NotFoundException
REST Layer (HTTP Transport)
    ↓ catches and converts via handleDomainException()
HTTP Response (404, 500, etc.)
```

**Key Principle**: Domain layer never imports or uses `HTTPException`. All HTTP concerns are handled at the REST layer boundary.

#### Domain Exception Classes

COG generates two transport-agnostic exception classes in `generated/domain/exceptions.ts`:

**1. DomainException (Base Class)**

```typescript
export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainException';

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DomainException);
    }
  }
}
```

**Use When**: General domain-level errors (business rule violations, invalid operations)

**2. NotFoundException (Extends DomainException)**

```typescript
export class NotFoundException extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}
```

**Use When**: Requested entity doesn't exist (maps to HTTP 404)

#### Domain Layer Usage

Domain methods throw exceptions when operations fail:

```typescript
// generated/domain/user.domain.ts
import { NotFoundException } from './exceptions.ts';

class UserDomain {
  async update(id: string, input: Partial<NewUser>, tx: DbTransaction) {
    // ... validation and pre-hooks ...

    const updated = await db.update(userTable)
      .set(validatedInput)
      .where(eq(userTable.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    // ... post-hooks and return ...
  }
}
```

**IMPORTANT**: Domain layer NEVER imports `HTTPException` from Hono. It only uses transport-agnostic domain exceptions.

#### REST Layer Exception Handling

The REST layer provides centralized exception handling via `handleDomainException()`:

```typescript
// generated/rest/user.rest.ts
import { HTTPException } from '@hono/hono/http-exception';
import { NotFoundException, DomainException } from '../domain/exceptions.ts';

/**
 * Converts domain exceptions to HTTP exceptions
 * Handles centralized error conversion from domain layer
 */
function handleDomainException(error: unknown): never {
  if (error instanceof NotFoundException) {
    throw new HTTPException(404, { message: error.message });
  }
  if (error instanceof DomainException) {
    throw new HTTPException(500, { message: error.message });
  }
  throw error; // Re-throw unknown errors
}
```

**All REST endpoints wrap domain calls in try-catch blocks:**

```typescript
// Update endpoint example
this.routes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const context = c.var as RestEnvVars;

    const result = await withTransaction(async (tx) => {
      return await userDomain.update(id, body, tx, context);
    });

    return c.json({ data: result });
  } catch (error) {
    handleDomainException(error);  // Converts to HTTP response
  }
});
```

#### HTTP Status Code Mapping

| Domain Exception | HTTP Status | Use Case |
|------------------|-------------|----------|
| `NotFoundException` | 404 Not Found | Entity not found (update/delete missing record) |
| `DomainException` | 500 Internal Server Error | General domain errors, business rule violations |
| Unknown errors | Re-thrown | Handled by Hono's global error handler |

#### Transaction Rollback Behavior

**Critical**: When exceptions are thrown within `withTransaction()` blocks:

1. Domain operation throws exception (e.g., `NotFoundException`)
2. Transaction automatically rolls back (no database changes persisted)
3. Exception propagates to REST layer
4. REST layer catches and converts to HTTP response
5. Client receives appropriate HTTP status code

**Example Flow:**
```typescript
// User attempts to update non-existent record
PUT /api/user/invalid-id

→ REST layer calls domain.update() within transaction
→ Domain layer throws NotFoundException
→ Transaction automatically rolls back
→ REST layer catches NotFoundException
→ Converts to HTTPException(404)
→ Client receives: { error: "User with id invalid-id not found" }, status: 404
```

#### Custom Exception Patterns

**Extending Domain Exceptions:**

You can create custom domain exceptions for specific business rules:

```typescript
// In your application code (not generated)
import { DomainException } from './generated/domain/exceptions.ts';

export class InsufficientPermissionsException extends DomainException {
  constructor(action: string) {
    super(`Insufficient permissions to perform: ${action}`);
    this.name = 'InsufficientPermissionsException';
  }
}
```

**Handling Custom Exceptions in REST Layer:**

Extend the generated REST routes to handle custom exceptions:

```typescript
// In your application code
import { InsufficientPermissionsException } from './your-exceptions.ts';

// Wrap generated routes with custom error handling
app.onError((err, c) => {
  if (err instanceof InsufficientPermissionsException) {
    return c.json({ error: err.message }, 403);
  }
  // Fall through to default handling
});
```

#### Best Practices

1. **Domain Layer**:
   - Only throw `DomainException` or `NotFoundException`
   - Never import or use `HTTPException`
   - Keep exception messages descriptive but transport-agnostic

2. **REST Layer**:
   - All domain calls must be wrapped in try-catch
   - Use `handleDomainException()` for conversion
   - Custom HTTP error handling goes in Hono middleware

3. **Hook Functions**:
   - Can throw domain exceptions (will trigger transaction rollback)
   - Exceptions in pre/post hooks abort the operation
   - Exceptions in after hooks don't affect transactions (already committed)

4. **Testing**:
   - Test domain methods throw correct exception types
   - Test REST endpoints return correct HTTP status codes
   - Verify transaction rollback on exceptions

### Validation System (Always Enabled)

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

### Check Constraints

COG supports PostgreSQL check constraints via the `"check"` property in model definitions.

**Supported Constraint Types:**

#### num_nonnulls Constraint

Ensures a minimum number of fields are non-null from a specified list.

**Example:**
```json
{
  "name": "AdvancedDemo",
  "fields": [
    {"name": "optionalField1", "type": "string"},
    {"name": "optionalField2", "type": "integer"},
    {"name": "optionalField3", "type": "boolean"}
  ],
  "check": {
    "numNotNulls": [
      {
        "fields": ["optionalField1", "optionalField2", "optionalField3"],
        "num": 2
      }
    ]
  }
}
```

**Generated SQL:**
```sql
CHECK (num_nonnulls(optional_field1, optional_field2, optional_field3) >= 2)
```

**Use Case**: Require at least N fields to be filled out from a group of optional fields.

### Endpoint Configuration

COG allows fine-grained control over which endpoints are generated for each model and relationship.

#### Model Endpoint Configuration

Control which CRUD endpoints are generated using the `endpoints` property:

```json
{
  "name": "User",
  "fields": [...],
  "endpoints": {
    "create": true,    // POST /api/user (default: true)
    "readOne": true,   // GET /api/user/:id (default: true)
    "readMany": true,  // GET /api/user (default: true)
    "update": false,   // PUT /api/user/:id (disabled)
    "delete": false    // DELETE /api/user/:id (disabled)
  }
}
```

**Default Behavior:** All endpoints are enabled by default. Set to `false` to disable specific endpoints.

**Security Approach:** 404 (don't generate) - Disabled endpoints are not generated at all, providing "security by absence".

#### Relationship Endpoint Configuration

Control which many-to-many relationship endpoints are generated:

```json
{
  "type": "manyToMany",
  "name": "skillList",
  "target": "Skill",
  "through": "employee_skill",
  "endpoints": {
    "get": true,      // GET /api/employee/:id/skillList (default: true)
    "add": true,      // POST /api/employee/:id/skillList (default: true)
    "remove": true,   // DELETE /api/employee/:id/skillList (default: true)
    "replace": false  // PUT /api/employee/:id/skillList (disabled)
  }
}
```

**Note:** Endpoint configuration only applies to many-to-many relationships. oneToMany/manyToOne relationships do not generate dedicated endpoints.

---

## Database Compatibility

COG supports both PostgreSQL and CockroachDB as target databases. While most features work identically across both platforms, there are important differences.

### PostgreSQL vs CockroachDB Feature Comparison

| Feature | PostgreSQL | CockroachDB | Notes |
|---------|------------|-------------|-------|
| **Index Types** | | | |
| BTREE | Supported | Supported | Default index type |
| GIN | Supported | Supported | For JSONB, arrays |
| GIST | Supported | Supported | For spatial data (PostGIS) |
| HASH | Supported | Not Supported | Use BTREE instead |
| SPGIST | Supported | Not Supported | Use BTREE or GIST |
| BRIN | Supported | Not Supported | Use BTREE |
| **Data Types** | | | |
| Enums | All versions | v22.2+ only | See enum section |
| PostGIS Spatial | GEOMETRY + GEOGRAPHY | GEOMETRY only | GEOGRAPHY converted to GEOMETRY |
| JSONB | Supported | Supported | Full support |
| Arrays | Supported | Supported | Full support |
| **Numeric Precision** | | | |
| Bigint defaults | Limited to 2^53-1 | Limited to 2^53-1 | JavaScript limitation |

### Index Type Compatibility

When defining indexes in your model JSON files, be aware of CockroachDB's limitations:

**PostgreSQL-Only Index Types:**

```json
{
  "indexes": [
    {
      "name": "idx_score_hash",
      "fields": ["score"],
      "type": "hash"  // Fails on CockroachDB
    }
  ]
}
```

**Cross-Compatible Indexes:**

```json
{
  "indexes": [
    {
      "name": "idx_score_btree",
      "fields": ["score"],
      "type": "btree"  // Works on both
    },
    {
      "name": "idx_metadata_gin",
      "fields": ["metadata"],
      "type": "gin"  // Works on both (for JSONB)
    },
    {
      "name": "idx_location_gist",
      "fields": ["location"],
      "type": "gist"  // Works on both (for spatial data)
    }
  ]
}
```

### Spatial Data Type Compatibility

CockroachDB does NOT support the PostGIS `GEOGRAPHY` type:

| Feature | PostgreSQL | CockroachDB | COG Behavior |
|---------|------------|-------------|--------------|
| GEOMETRY | Supported | Supported | Used as-is |
| GEOGRAPHY | Supported | Not Supported | Auto-converted to GEOMETRY |

When `--dbType cockroachdb` is used, COG automatically converts:
- `type: "geography"` → `GEOMETRY` column type
- `type: "geography", geometryType: "POINT"` → `GEOMETRY(POINT, srid)`
- Generic geometry/geography fields → `GEOMETRY` (without subtype)

This conversion is transparent - your model definitions remain database-agnostic.

### Enum Support

**PostgreSQL Enums:**
- Supported in all PostgreSQL versions
- Generated as `pgEnum()` in Drizzle schemas

**CockroachDB Enums:**
- Supported in CockroachDB v22.2+ (December 2022)
- Earlier versions do NOT support enum types
- Alternative: Use `varchar` with `CHECK` constraints for older versions

**Bitwise Integer Operations:**
- Fully supported in all CockroachDB versions
- Bitwise operators (`&`, `|`, `^`, `~`) work identically to PostgreSQL
- Recommended approach for multi-value enums on CockroachDB

### Best Practices for Multi-Database Support

If you need to support both PostgreSQL and CockroachDB:

1. **Use compatible index types** - Stick to BTREE, GIN, and GIST
2. **Test on target database** - Run `deno task db:init` against your target database early
3. **Avoid HASH indexes** - While faster for equality comparisons in PostgreSQL, not supported in CockroachDB
4. **Check enum support** - Ensure CockroachDB v22.2+ if using enum types
5. **Keep defaults reasonable** - Use numeric defaults within JavaScript's safe integer range

---

## CLI Reference

### Basic Command

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated
```

### All CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--modelsPath <path>` | Path to JSON model files | `./models` |
| `--outputPath <path>` | Where to generate code | `./generated` |
| `--dbType <type>` | `postgresql` or `cockroachdb` | `postgresql` |
| `--schema <name>` | Database schema name | (default) |
| `--no-postgis` | Disable PostGIS support | enabled |
| `--no-timestamps` | Disable timestamps globally | enabled |
| `--no-documentation` | Disable OpenAPI generation | enabled |
| `--verbose` | Show generated file paths | false |
| `--help` | Show help message | - |

**IMPORTANT**: CLI flags OVERRIDE model-level settings. If you use `--no-timestamps`, ALL models will be generated without timestamps, even if `"timestamps": true` in JSON.

### Global Feature Flags

#### `--no-timestamps`

Disables automatic timestamp fields for **all models**, regardless of model-level `"timestamps"` settings:

- Removes `createdAt` and `updatedAt` fields from all tables
- No automatic timestamp management on create/update operations

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-timestamps
```

#### `--no-postgis`

Disables PostGIS spatial data type support:

- Spatial field types (point, polygon, etc.) fall back to JSONB
- GIST indexes are converted to GIN indexes for JSONB compatibility
- Spatial data stored as GeoJSON in JSONB columns
- Database initialization skips PostGIS extension setup

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-postgis
```

#### `--no-documentation`

Disables OpenAPI documentation generation entirely:

- No `openapi.ts` or `openapi.json` files generated
- Reduces generated code size
- Useful when you don't need API documentation

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-documentation
```

**Note:** By default, OpenAPI specs are generated but not automatically exposed. See the Generated Code Usage section for how to expose documentation.

---

## Generated Code Usage

### Basic Setup

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated/index.ts';

const app = new Hono();

await initializeGenerated({
  database: {
    connectionString: 'postgresql://user:pass@localhost:5432/mydb',
  },
  app,
});

Deno.serve({ port: 3000 }, app.fetch);
```

### With Hooks

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
  // Domain hooks (within transaction)
  domainHooks: {
    user: {
      async preCreate(input, rawInput, tx, context) {
        // Hash password at domain layer (within transaction)
        const hashedPassword = await hashPassword(input.password);
        return { data: { ...input, password: hashedPassword }, context };
      },
      async postCreate(input, result, rawInput, tx, context) {
        // Enrich response with related data
        return { data: result, context };
      },
      async afterCreate(result, rawInput, context) {
        // Send welcome email (async, outside transaction)
        await sendWelcomeEmail(result.email);
      },
    },
  },
});

// For HTTP-layer concerns (auth, logging, headers), use Hono middleware:
app.use('*', async (c, next) => {
  console.log('Request from:', c.req.header('user-agent'));
  await next();
  c.header('X-Powered-By', 'COG');
});

Deno.serve({ port: 3000 }, app.fetch);
```

### Generated REST Endpoints

For each model, COG generates these CRUD endpoints:

```
GET    /api/{model}                   # List (paginated)
POST   /api/{model}                   # Create
GET    /api/{model}/:id               # Get by ID
PUT    /api/{model}/:id               # Update
DELETE /api/{model}/:id               # Delete
```

**Many-to-Many Relationship Endpoints** (junction tables only):

```
GET    /api/{model}/:id/{relation}List      # Get related items
POST   /api/{model}/:id/{relation}List      # Add multiple items
POST   /api/{model}/:id/{relation}          # Add single item
PUT    /api/{model}/:id/{relation}List      # Replace all items
DELETE /api/{model}/:id/{relation}List      # Remove multiple items
DELETE /api/{model}/:id/{relation}/:targetId # Remove single item
```

**Note:** oneToMany/manyToOne relationships do NOT generate dedicated endpoints. Use query parameters or includes instead.

**Query Parameters:**
- `limit` - Pagination limit
- `offset` - Pagination offset
- `orderBy` - Sort field
- `order` - Sort direction (asc/desc)

### Exposing API Documentation

COG generates OpenAPI specs but does NOT automatically expose documentation endpoints. You control where and how to expose them:

```typescript
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';
import { Scalar } from '@scalar/hono-api-reference';

// Expose OpenAPI spec at your chosen URL
app.get('/api/openapi.json', (c) => c.json(generatedOpenAPISpec));

// Expose interactive API documentation with Scalar
app.get('/api/docs', Scalar({
  url: '/api/openapi.json',
}) as any);
```

**Why Manual Exposure?**
- Full control over documentation URLs
- Merge generated docs with custom endpoints
- Choose whether to expose in production or development only
- Use any documentation UI (Scalar, Swagger UI, Redoc)

---

## Common Development Patterns

### Adding a New Data Type

1. Update `PrimitiveType` or `PostGISType` in `src/types/model.types.ts`
2. Update `model-parser.ts` validation
3. Update `database-init.generator.ts` to map type to SQL column type
4. Update `drizzle-schema.generator.ts` to map type to Drizzle column
5. Update `openapi.generator.ts` to map type to OpenAPI schema
6. Test with example model

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
deno run -A src/main.ts

# Test endpoints
curl http://localhost:3000/api/employee
curl http://localhost:3000/docs/openapi.json
```

---

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Models | `[name].json` | `user.json` |
| Schemas | `[name].schema.ts` | `user.schema.ts` |
| Domain | `[name].domain.ts` | `user.domain.ts` |
| REST | `[name].rest.ts` | `user.rest.ts` |
| Tables | `[tableName]` (snake_case, singular) | `user`, `user_role` |
| Columns | `snake_case` | `created_at`, `user_id` |
| Model names | `PascalCase` | `User`, `UserProfile` |
| Field names | `camelCase` | `userId`, `createdAt` |
| Relationship names | `camelCase` with `List` suffix | `postList`, `skillList` |

**Important**: Table names should be **singular** (e.g., `user`, not `users`). Relationship endpoints automatically add the "List" suffix for collections.

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
  "name": "roleList",
  "target": "Role",
  "through": "user_role",        // ← REQUIRED
  "foreignKey": "user_id",
  "targetForeignKey": "role_id"
}
```

### 3. Self-Referential Relationships

Model can reference itself:
```json
{
  "name": "Employee",
  "relationships": [
    {
      "type": "manyToOne",
      "name": "mentor",
      "target": "Employee",
      "foreignKey": "mentorId"
    },
    {
      "type": "oneToMany",
      "name": "menteeList",
      "target": "Employee",
      "foreignKey": "mentorId"
    }
  ]
}
```

### 4. Foreign Key References

When using `references` in fields, ensure target model exists:
```json
{
  "name": "authorId",
  "type": "uuid",
  "required": true,
  "references": {
    "model": "User",           // ← Must match existing model name
    "field": "id",             // ← Must match field in User model
    "onDelete": "CASCADE"      // ← Optional: CASCADE, SET NULL, RESTRICT, NO ACTION
  }
}
```

**Supported Foreign Key Actions:**
- `CASCADE` - Delete/update child records when parent is deleted/updated
- `SET NULL` - Set foreign key to NULL when parent is deleted/updated
- `RESTRICT` - Prevent deletion/update of parent if children exist
- `NO ACTION` - Similar to RESTRICT but checked at end of transaction

### 5. PostGIS SRID

For spatial fields, optionally specify SRID:
```json
{
  "name": "location",
  "type": "point",
  "srid": 4326,        // ← WGS 84 (GPS coordinates)
  "required": true
}
```

Common SRIDs:
- `4326` - WGS 84 (GPS coordinates, lat/long)
- `3857` - Web Mercator (used by Google Maps, OpenStreetMap)

### 6. Index Types and Database Compatibility

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

For CockroachDB: HASH, SPGIST, and BRIN index types are not supported. Use BTREE instead.

### 7. Numeric Default Values

**Maximum safe default value**: `Number.MAX_SAFE_INTEGER` (9007199254740991)

```json
{
  "name": "bigintField",
  "type": "bigint",
  "defaultValue": 9007199254740991  // ✓ Maximum safe value
}
```

```json
{
  "name": "bigintField",
  "type": "bigint",
  "defaultValue": 9223372036854775807  // ✗ Too large - will lose precision
}
```

**Workaround**: Omit default values for large bigint fields and set them at runtime.

---

## Dependencies

### COG Generator Dependencies (dev)

- Deno runtime (no external packages needed for generation)

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

## Related Documentation

- [README.md](./README.md) - User-facing documentation with visual guides
- [CLAUDE.md](./CLAUDE.md) - Brief reference (points to this document)
- [example/README.md](./example/README.md) - Example project walkthrough
- [src/types/model.types.ts](./src/types/model.types.ts) - TypeScript type definitions with comments

---

## Last Updated

Generated: 2025-11-21

**NOTE**: This file should be updated whenever major architectural changes, new features, or important patterns are added to the codebase.
