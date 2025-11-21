# COG - CRUD Operations Generator

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Deno](https://img.shields.io/badge/Deno-000000?style=flat&logo=deno&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![PostGIS](https://img.shields.io/badge/PostGIS-478FCA?style=flat)
![MIT License](https://img.shields.io/badge/License-MIT-green.svg)

**Transform JSON models into production-ready TypeScript backends**

COG is a code generator that creates complete CRUD backends from simple JSON model definitions. Define your data model, generate everything else.

```
JSON Models → COG → REST API + Domain Logic + Database Schema + OpenAPI Docs
```

---

## Quick Start

### 1. Define Your Model

Create `models/department.json`:

```json
{
  "name": "Department",
  "tableName": "department",
  "fields": [
    {
      "name": "id",
      "type": "uuid",
      "primaryKey": true,
      "defaultValue": "gen_random_uuid()",
      "required": true
    },
    {
      "name": "name",
      "type": "string",
      "maxLength": 100,
      "required": true,
      "unique": true
    },
    {
      "name": "location",
      "type": "point",
      "srid": 4326,
      "required": true
    }
  ],
  "timestamps": true
}
```

### 2. Generate Code

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated
```

### 3. Use Generated Backend

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

That's it! Your REST API is ready:

```bash
GET    /api/department       # List departments
POST   /api/department       # Create department
GET    /api/department/:id   # Get department
PUT    /api/department/:id   # Update department
DELETE /api/department/:id   # Delete department
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   HTTP Request                      │
└────────────────┬────────────────────────────────────┘
                 │
        ┌────────▼─────────┐
        │   REST Layer     │  HTTP/JSON Interface
        │  (Hono Routes)   │  • Request validation
        │                  │  • REST hooks
        └────────┬─────────┘  • Error handling
                 │
        ┌────────▼─────────┐
        │  Domain Layer    │  Business Logic
        │ (Pure Functions) │  • CRUD operations
        │                  │  • Domain hooks
        └────────┬─────────┘  • Validation
                 │
        ┌────────▼─────────┐
        │  Schema Layer    │  Type Definitions
        │  (Drizzle ORM)   │  • Table schemas
        │                  │  • Relations
        └────────┬─────────┘  • Zod validation
                 │
        ┌────────▼─────────┐
        │ Database Layer   │  PostgreSQL/CockroachDB
        │  (Connection)    │  • Transactions
        │                  │  • PostGIS
        └──────────────────┘
```

---

## Features

### Comprehensive Type Support

| Category | Types |
|----------|-------|
| **Primitives** | `string`, `text`, `integer`, `bigint`, `decimal`, `boolean`, `date` (EPOCH milliseconds), `uuid` |
| **Structured** | `json`, `jsonb`, `enum` |
| **Spatial** | `point`, `linestring`, `polygon`, `multipoint`, `multilinestring`, `multipolygon`, `geometry`, `geography` (uses GeoJSON in API, WKT in DB) |
| **Arrays** | Any type with `"array": true` |

**Note:** `date` fields are stored as EPOCH millisecond integers (`bigint`) in the database. The API accepts and returns numeric timestamps. Use `Date.getTime()` in JavaScript/TypeScript.

### Relationship Support

```mermaid
erDiagram
    Department ||--o{ Employee : "oneToMany"
    Employee }o--|| Department : "manyToOne"

    Employee ||--|| IDCard : "oneToOne"

    Employee ||--o{ Assignment : "oneToMany"
    Assignment }o--|| Employee : "manyToOne"

    Project ||--o{ Assignment : "oneToMany"
    Assignment }o--|| Project : "manyToOne"

    Employee }o--o{ Skill : "manyToMany (via employee_skill)"

    Employee }o--o{ Employee : "self-referential manyToMany (mentors/mentees)"
```

| Type | Description | Example |
|------|-------------|---------|
| **oneToMany** | Parent → Children | Department → Employees, Project → Assignments |
| **manyToOne** | Child → Parent | Employee → Department, Assignment → Project |
| **manyToMany** | Junction table | Employee ↔ Skills (via employee_skill) |
| **oneToOne** | Direct link | Employee → IDCard |
| **Self-referential** | Model → Self | Employee ↔ Employee (mentors/mentees) |

### Hook System

Extend generated code without modification:

```
HTTP Request
  → REST Pre-hook (HTTP layer)
    → Transaction Start
      → Domain Pre-hook (business logic)
      → Database Operation
      → Domain Post-hook (transform output)
    → Transaction Commit
  → REST Post-hook (set headers)
  → Domain After-hook (async side effects)
→ HTTP Response
```

**Two Hook Types:**

| Hook Type | Layer | Transaction | Use Case |
|-----------|-------|-------------|----------|
| **Domain Hooks** | Business Logic | Yes | Data validation, transformation |
| **REST Hooks** | HTTP | No | Authorization, headers, logging |

### Database Compatibility

| Feature | PostgreSQL | CockroachDB |
|---------|:----------:|:-----------:|
| **Index Types** |
| BTREE, GIN, GIST | ✓ | ✓ |
| HASH, SPGIST, BRIN | ✓ | Use BTREE |
| **Data Types** |
| Enums | ✓ | ✓ (v22.2+) |
| GEOMETRY | ✓ | ✓ |
| GEOGRAPHY | ✓ | Auto-converted |
| JSONB, Arrays | ✓ | ✓ |

---

## CLI Reference

```bash
deno run -A src/cli.ts [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--modelsPath <path>` | Path to JSON models | `./models` |
| `--outputPath <path>` | Output directory | `./generated` |
| `--dbType <type>` | `postgresql` or `cockroachdb` | `postgresql` |
| `--schema <name>` | Database schema | (default) |
| `--no-postgis` | Disable PostGIS | enabled |
| `--no-timestamps` | Disable timestamps | enabled |
| `--no-documentation` | Disable OpenAPI | enabled |
| `--verbose` | Show file paths | false |

---

## Generated REST Endpoints

For each model, COG generates:

```
GET    /api/{model}                    # List (paginated)
POST   /api/{model}                    # Create
GET    /api/{model}/:id                # Get by ID
PUT    /api/{model}/:id                # Update
DELETE /api/{model}/:id                # Delete
GET    /api/{model}/:id/{relation}List # Get related
```

**Query Parameters:**
- `limit` - Pagination limit
- `offset` - Pagination offset
- `orderBy` - Sort field
- `order` - Sort direction (`asc`/`desc`)

---

## Example

See the `/example` directory for a complete Corporate ORM demonstration featuring:

- 9 interconnected models (Employee, Department, Project, etc.)
- All relationship types
- PostGIS spatial data
- Hook implementations
- Check constraints
- Self-referential relationships

```bash
cd example
deno run -A ../src/cli.ts --modelsPath ./models --outputPath ./generated
deno run -A src/main.ts
```

Documentation: http://localhost:3000/docs/reference

---

## OpenAPI Documentation

COG generates complete OpenAPI 3.1.0 specifications but doesn't automatically expose them. You control where and how:

```typescript
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';
import { Scalar } from '@scalar/hono-api-reference';

// Expose spec
app.get('/api/openapi.json', (c) => c.json(generatedOpenAPISpec));

// Interactive docs
app.get('/api/docs', Scalar({ url: '/api/openapi.json' }) as any);
```

---

## Advanced Features

### Check Constraints

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

### Custom Schemas

```json
{
  "name": "Employee",
  "tableName": "employee",
  "schema": "hr"
}
```

### Foreign Key Actions

```json
{
  "references": {
    "model": "Department",
    "field": "id",
    "onDelete": "CASCADE",
    "onUpdate": "NO ACTION"
  }
}
```

**Actions:** `CASCADE`, `SET NULL`, `RESTRICT`, `NO ACTION`

---

## Important Notes

**Table Naming:** Use singular names (`employee`, not `employees`)

**Numeric Limits:** Default values limited to `Number.MAX_SAFE_INTEGER` (2^53-1)

**Validation:** Zod validation is always enabled and cannot be disabled

**CLI Flags Override:** `--no-timestamps` affects ALL models, regardless of JSON settings

**CockroachDB:** GEOGRAPHY types auto-convert to GEOMETRY, HASH indexes to BTREE

---

## Requirements

- **Deno** 1.37 or higher
- **PostgreSQL** 12+ or **CockroachDB**
- **PostGIS** (optional, for spatial data)

### Generated Code Dependencies

Add to your `deno.json`:

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

## Documentation

- **[WARP.md](./WARP.md)** - Complete technical reference
- **[CLAUDE.md](./CLAUDE.md)** - Quick AI assistant reference
- **[example/README.md](./example/README.md)** - Example walkthrough

---

## License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**Built with TypeScript and Deno for modern backend development.**
