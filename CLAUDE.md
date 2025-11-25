# CLAUDE.md - AI Assistant Reference

> **Quick Reference for AI Assistants** For complete technical documentation, see [WARP.md](./WARP.md)

---

## Purpose

This file serves as a quick-reference guide for AI assistants (like Claude) working on the COG codebase.

**For comprehensive documentation, always refer to [WARP.md](./WARP.md)**

---

## What is COG?

**COG (CRUD Operations Generator)** - TypeScript code generator that transforms JSON model definitions into
production-ready backends.

**Stack**: Deno + TypeScript + Drizzle ORM + Hono + Zod + PostgreSQL/CockroachDB

**See**: [WARP.md - What is COG?](./WARP.md#what-is-cog)

---

## Quick Reference Tables

### Supported Data Types

| Type             | Description                 | Example                                                  |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `string`, `text` | Text fields                 | `"type": "string", "maxLength": 100`                     |
| `integer`        | 32-bit integer              | `"type": "integer"`                                      |
| `bigint`         | 64-bit integer              | `"type": "bigint"` (max default: 2^53-1)                 |
| `decimal`        | Fixed-point decimal         | `"type": "decimal", "precision": 10, "scale": 2`         |
| `boolean`        | True/false                  | `"type": "boolean"`                                      |
| `date`           | EPOCH milliseconds (bigint) | `"type": "date"` (API uses numbers like `1704067200000`) |
| `uuid`           | UUID                        | `"type": "uuid"`                                         |
| `json`, `jsonb`  | JSON data                   | `"type": "jsonb"`                                        |
| `enum`           | Enumerated type             | `"type": "enum", "enumName": "Status"`                   |

**Date Fields**: Stored as EPOCH millisecond integers. Use `Date.getTime()` in JavaScript/TypeScript to convert to/from
Date objects. OpenAPI documents date fields as `type: integer, format: int64` with "(EPOCH milliseconds)" description.

**PostGIS Spatial Types**: `point`, `linestring`, `polygon`, `multipoint`, `multilinestring`, `multipolygon`,
`geometry`, `geography`

**PostGIS GeoJSON**: COG automatically converts between GeoJSON (API) and WKT (database). Use standard GeoJSON objects
in REST requests/responses.

**See**: [WARP.md - Supported Data Types](./WARP.md#supported-data-types)

### Relationship Types

| Type             | Description                 | Example                          |
| ---------------- | --------------------------- | -------------------------------- |
| `oneToMany`      | Parent → Children           | User → PostList                  |
| `manyToOne`      | Child → Parent              | Post → User                      |
| `manyToMany`     | Bidirectional with junction | User ↔ RoleList via user_role    |
| `oneToOne`       | Direct 1:1                  | User → Profile                   |
| Self-referential | Model → Self                | Employee → mentorList/menteeList |

**See**: [WARP.md - Relationship Types](./WARP.md#relationship-types)

### CLI Flags

| Flag                  | Description                   | Default       |
| --------------------- | ----------------------------- | ------------- |
| `--modelsPath <path>` | Path to JSON models           | `./models`    |
| `--outputPath <path>` | Where to generate code        | `./generated` |
| `--dbType <type>`     | `postgresql` or `cockroachdb` | `postgresql`  |
| `--schema <name>`     | Database schema name          | (default)     |
| `--verbose`           | Show generated file paths     | false         |
| `--help`              | Show help message             | -             |

**See**: [WARP.md - CLI Reference](./WARP.md#cli-reference)

### Database Compatibility Matrix

| Feature                    | PostgreSQL | CockroachDB                    |
| -------------------------- | ---------- | ------------------------------ |
| BTREE, GIN, GIST indexes   | ✓          | ✓                              |
| HASH, SPGIST, BRIN indexes | ✓          | ✗ (use BTREE)                  |
| GEOMETRY type              | ✓          | ✓                              |
| GEOGRAPHY type             | ✓          | ✗ (auto-converted to GEOMETRY) |
| Enums                      | ✓          | ✓ (v22.2+)                     |
| Numeric defaults           | 2^53-1 max | 2^53-1 max                     |

**See**: [WARP.md - Database Compatibility](./WARP.md#database-compatibility)

### Hook Types

| Hook Type        | Layer  | Transaction | Use Case                                              |
| ---------------- | ------ | ----------- | ----------------------------------------------------- |
| Domain Before    | Domain | ✗ No        | Auth checks, input transformation (before validation) |
| Domain Pre       | Domain | ✓ Yes       | Data transformation, validation (before operation)    |
| Domain Post      | Domain | ✓ Yes       | Data transformation (after operation)                 |
| Domain After     | Domain | ✗ No        | Async side effects (notifications, logging)           |
| Junction Before  | Domain | ✗ No        | Auth checks (before validation)                       |
| Junction Pre     | Domain | ✓ Yes       | Many-to-many validation (before operation)            |
| Junction Post    | Domain | ✓ Yes       | Many-to-many operations (after operation)             |
| Junction After   | Domain | ✗ No        | Async side effects for relationships                  |

**HTTP-layer concerns (auth, logging, headers):** Use Hono middleware instead.

**See**: [WARP.md - Hook System](./WARP.md#hook-system) for complete hook signatures and parameters

---

## Common Patterns

### Basic Model Definition

```json
{
  "name": "User",
  "tableName": "user",
  "fields": [
    {
      "name": "id",
      "type": "uuid",
      "primaryKey": true,
      "defaultValue": "gen_random_uuid()",
      "required": true
    },
    {
      "name": "email",
      "type": "string",
      "maxLength": 100,
      "unique": true,
      "required": true
    }
  ],
  "relationships": [
    {
      "type": "oneToMany",
      "name": "postList",
      "target": "Post",
      "foreignKey": "authorId"
    }
  ],
  "timestamps": true
}
```

**See**: [WARP.md - Model Definition Structure](./WARP.md#model-definition-structure)

### Generated REST Endpoints

```
GET    /api/{model}                      # List (paginated)
POST   /api/{model}                      # Create
GET    /api/{model}/:id                  # Get by ID
PUT    /api/{model}/:id                  # Update
DELETE /api/{model}/:id                  # Delete
```

**Many-to-Many Relationships Only:**

```
GET    /api/{model}/:id/{relation}List      # Get related
POST   /api/{model}/:id/{relation}List      # Add multiple
POST   /api/{model}/:id/{relation}          # Add single
PUT    /api/{model}/:id/{relation}List      # Replace all
DELETE /api/{model}/:id/{relation}List      # Remove multiple
DELETE /api/{model}/:id/{relation}/:targetId # Remove single
```

**Note:** oneToMany/manyToOne relationships do NOT generate dedicated endpoints.

**See**: [WARP.md - Generated REST Endpoints](./WARP.md#generated-rest-endpoints)

---

## File Organization

### Project Structure

```
cog/
├── src/
│   ├── cli.ts                    # CLI entry point
│   ├── mod.ts                    # Main generator
│   ├── types/model.types.ts      # Type definitions
│   ├── parser/model-parser.ts    # JSON validation
│   └── generators/               # Code generators
├── example/
│   ├── models/                   # Example models
│   └── generated/                # Generated code
├── WARP.md                       # Complete technical docs (THIS IS THE SOURCE OF TRUTH)
├── CLAUDE.md                     # This file (brief reference)
└── README.md                     # User-facing docs
```

### Generated Code Structure

```
generated/
├── index.ts                      # Main entry point
├── db/                           # Database layer
├── schema/                       # Drizzle schemas + Zod
├── domain/                       # Business logic
└── rest/                         # HTTP/REST layer
```

**See**: [WARP.md - Project Structure](./WARP.md#project-structure)

---

## Key Concepts Summary

### 1. Layered Architecture

```
REST Layer (HTTP) → Domain Layer (Business Logic) → Schema Layer (Types) → Database Layer (Connection)
```

**See**: [WARP.md - Generated Code Architecture](./WARP.md#generated-code-architecture)

### 2. Naming Conventions

- **Table names**: Singular, snake_case (`user`, `user_role`)
- **Model names**: PascalCase (`User`, `UserProfile`)
- **Field names**: camelCase (`userId`, `createdAt`)
- **Relationship names**: camelCase with `List` suffix (`postList`, `skillList`)

**See**: [WARP.md - File Naming Conventions](./WARP.md#file-naming-conventions)

### 3. Validation is Always Enabled

Zod validation is MANDATORY and runs twice:

1. Before pre-hook
2. After pre-hook, before database operation

**See**: [WARP.md - Validation System](./WARP.md#validation-system-always-enabled)

### 4. Check Constraints

COG supports PostgreSQL check constraints:

```json
{
  "check": {
    "numNotNulls": [
      {
        "fields": ["field1", "field2", "field3"],
        "num": 2
      }
    ]
  }
}
```

Generates: `CHECK (num_nonnulls(field1, field2, field3) >= 2)`

**See**: [WARP.md - Check Constraints](./WARP.md#check-constraints)

### 5. Foreign Key Actions

Supported actions: `CASCADE`, `SET NULL`, `RESTRICT`, `NO ACTION`

```json
{
  "references": {
    "model": "User",
    "field": "id",
    "onDelete": "CASCADE",
    "onUpdate": "NO ACTION"
  }
}
```

**See**: [WARP.md - Foreign Key References](./WARP.md#4-foreign-key-references)

### 6. Exception Handling

| Exception Type | Thrown By | Caught By | Maps To | Use Case |
|----------------|-----------|-----------|---------|----------|
| `NotFoundException` | Domain | REST layer | HTTP 404 | Entity not found (update/delete missing record) |
| `DomainException` | Domain | REST layer | HTTP 500 | General domain errors, business rule violations |

**Architecture Pattern:**
```
Domain layer throws transport-agnostic exceptions
    ↓
REST layer catches via handleDomainException()
    ↓
Converts to HTTP responses (404, 500, etc.)
```

**Key Principle**: Domain layer NEVER uses `HTTPException`. All HTTP concerns handled at REST boundary.

**Transaction Rollback**: Exceptions thrown within `withTransaction()` automatically rollback database changes.

**See**: [WARP.md - Exception Handling](./WARP.md#exception-handling-domain-vs-rest) for complete details

---

## Important Reminders

1. **Table names are SINGULAR** - Use `user` not `users`, `employee` not `employees`
2. **Numeric defaults limited** - Max safe value: `9007199254740991` (Number.MAX_SAFE_INTEGER)
3. **CockroachDB differences**:
   - No HASH/SPGIST/BRIN indexes
   - No GEOGRAPHY type (auto-converted to GEOMETRY)
   - Enums require v22.2+
4. **Validation cannot be disabled** - Zod validation is always on
5. **Junction tables need `through` field** - Explicit table name required for many-to-many
6. **PostGIS is always enabled** - Spatial types and GIST indexes work out of the box
7. **Domain layer uses transport-agnostic exceptions** - Never use `HTTPException` in domain code, only `DomainException` or `NotFoundException`
8. **REST layer handles exception conversion** - All domain exceptions converted to HTTP responses via `handleDomainException()`

**See**: [WARP.md - Critical Gotchas & Edge Cases](./WARP.md#critical-gotchas--edge-cases)

---

## For Complete Documentation

**All topics covered in depth in [WARP.md](./WARP.md)**:

- Model Definition Structure
- Hook System (Domain vs REST)
- Database Compatibility (PostgreSQL vs CockroachDB)
- OpenAPI Documentation
- Generated Code Usage Examples
- Development Patterns
- Testing Strategies
- Dependencies
- And much more...

---

## Last Updated

2025-11-21

**Always refer to [WARP.md](./WARP.md) as the authoritative source of technical documentation.**
