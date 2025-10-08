# COG - CRUD Operations Generator

A powerful TypeScript code generator that creates complete, production-ready CRUD backends from simple JSON model definitions.

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) runtime installed
- PostgreSQL database (or CockroachDB)
- PostGIS extension (optional, for spatial data)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/cog.git
cd cog

# Cache dependencies
deno cache --reload src/mod.ts
```

### Generate Your First Backend

1. Create a models directory with your JSON model definitions:

```bash
mkdir models
```

2. Create a model file `models/user.json`:

```json
{
  "name": "User",
  "tableName": "users",
  "fields": [
    {
      "name": "id",
      "type": "uuid",
      "primaryKey": true,
      "defaultValue": "gen_random_uuid()"
    },
    {
      "name": "email",
      "type": "string",
      "unique": true,
      "required": true
    },
    {
      "name": "name",
      "type": "string",
      "required": true
    }
  ],
  "timestamps": true
}
```

3. Generate the backend code:

```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated
```

4. Use the generated code in your application:

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated/index.ts';

const app = new Hono();

await initializeGenerated({
  database: {
    connectionString: 'postgresql://user:pass@localhost/mydb'
  },
  app
});

Deno.serve({ port: 3000 }, app.fetch);
```

## What Gets Generated?

COG generates a complete backend stack with:

- **Database Schema** - Type-safe Drizzle ORM schemas
- **Zod Validation Schemas** - Automatic input validation for all operations
- **Domain Layer** - Business logic with CRUD operations
- **REST API** - RESTful endpoints using Hono framework
- **OpenAPI Specification** - Complete OpenAPI 3.1.0 docs for all endpoints
- **TypeScript Types** - Full type safety throughout
- **Hook System** - Extensible pre/post operation hooks
- **Transaction Management** - Automatic transaction handling

## Features

### Comprehensive Data Type Support

- All PostgreSQL primitive types (text, integer, boolean, date, etc.)
- PostGIS spatial types (point, polygon, linestring, etc.)
- JSON/JSONB for structured data
- Arrays and composite types
- Big numbers support (bigint, decimal with precision)

### Relationship Management

- One-to-Many relationships
- Many-to-One relationships
- Many-to-Many with junction tables
- One-to-One relationships
- Self-referential relationships

### Advanced Features

- **Input Validation** - Automatic Zod validation for all CRUD operations
- **OpenAPI Documentation** - Auto-generated API documentation
- Automatic timestamps (createdAt, updatedAt)
- Soft deletes with automatic filtering
- Database transactions with rollback
- Extensible hook system for custom logic
- Rich query capabilities with filtering and pagination
- Multi-schema support
- Custom indexes (composite, partial, spatial)

## Example Project

Check out the `/example` directory for a complete demonstration:

```bash
cd example

# Generate the example code
deno run -A ../src/cli.ts --modelsPath ./models --outputPath ./generated-c

# Run the example server
deno run -A example.ts
```

The example showcases:
- Complex data models with various field types
- All relationship types
- PostGIS spatial data
- Hook implementations
- Custom business logic integration

## CLI Options

```bash
deno run -A src/cli.ts [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--modelsPath` | Path to JSON model files | `./models` |
| `--outputPath` | Where to generate code | `./generated` |
| `--dbType` | Database type (`postgresql` or `cockroachdb`) | `postgresql` |
| `--schema` | Database schema name | - |
| `--no-postgis` | Disable PostGIS support | false |
| `--no-timestamps` | Disable automatic timestamps | false |
| `--no-softDeletes` | Disable soft delete feature | false |
| `--verbose` | Show generated file paths | false |
| `--help` | Show help message | - |

## Model Definition Format

Models are defined in JSON with this structure:

```json
{
  "name": "ModelName",
  "tableName": "table_name",
  "fields": [
    {
      "name": "fieldName",
      "type": "dataType",
      "primaryKey": true,
      "unique": false,
      "required": true,
      "defaultValue": "value",
      "references": {
        "model": "OtherModel",
        "field": "id",
        "onDelete": "CASCADE"
      }
    }
  ],
  "relationships": [
    {
      "type": "oneToMany",
      "name": "relationshipName",
      "target": "TargetModel",
      "foreignKey": "foreign_key_field"
    }
  ],
  "timestamps": true,
  "softDelete": true,
  "indexes": [
    {
      "fields": ["field1", "field2"],
      "unique": true
    }
  ]
}
```

## Documentation

- [WARP.md](./WARP.md) - Complete technical documentation
- [Example README](./example/README.md) - Example project walkthrough
- [Type Definitions](./src/types/model.types.ts) - TypeScript type documentation

## Use Cases

COG is perfect for:

- Rapid prototyping of database-backed applications
- Building microservices with consistent structure
- Creating admin panels and CRUD interfaces
- Generating boilerplate for complex applications
- Learning projects and hackathons

## Architecture

COG follows Domain-Driven Design principles:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   REST API  │────▶│   Domain    │────▶│  Database   │
│   (Hono)    │     │   Logic     │     │  (Drizzle)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                     │
       ▼                   ▼                     ▼
   HTTP Layer      Business Layer         Data Layer
```

## Input Validation

COG automatically integrates [Zod](https://zod.dev) validation using [drizzle-zod](https://orm.drizzle.team/docs/zod):

- **Automatic Schema Generation** - Zod schemas derived from Drizzle table definitions
- **Pre-hook Validation** - Input validated before hooks execute
- **Post-hook Validation** - Hook output validated before database operations
- **Type Safety** - Runtime validation matches your TypeScript types
- **Clear Error Messages** - Detailed validation errors with field-level information

### Validation Flow

```typescript
// Create operation with automatic validation
const user = await userDomain.create({
  email: 'user@example.com',
  username: 'johndoe',
  fullName: 'John Doe',
  passwordHash: 'hashed_password',
}, tx);
// ✓ Input validated before operation
// ✓ Hook output validated before database insert
// ✓ Invalid data rejected with clear error messages
```

### Generated Schemas

For each model, three Zod schemas are generated:

```typescript
// For create operations - validates required fields
export const userInsertSchema = createInsertSchema(userTable);

// For update operations - all fields optional
export const userUpdateSchema = createUpdateSchema(userTable);

// For select operations - validates query results
export const userSelectSchema = createSelectSchema(userTable);
```

## OpenAPI Documentation

COG automatically generates a complete OpenAPI 3.1.0 specification for all CRUD endpoints:

### Generated Files

- `generated/rest/openapi.ts` - TypeScript module with OpenAPI spec
- `generated/rest/openapi.json` - Static JSON specification file

### Features

- **Complete Coverage** - All CRUD and relationship endpoints documented
- **Schema Definitions** - Includes request/response schemas for all models
- **Extendable** - Merge with custom OpenAPI specs for your endpoints
- **Type-Safe** - Uses TypeScript types from `openapi-types`

### Usage

**Serve OpenAPI JSON:**

```typescript
import { Hono } from '@hono/hono';
import { generatedOpenAPISpec, mergeOpenAPISpec } from './generated/rest/openapi.ts';

const app = new Hono();

// Serve generated OpenAPI spec
app.get('/openapi.json', (c) => c.json(generatedOpenAPISpec));

// Or merge with custom endpoints
const customSpec = {
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User login',
        // ... your custom endpoint spec
      }
    }
  }
};

const completeSpec = mergeOpenAPISpec(customSpec);
app.get('/openapi.json', (c) => c.json(completeSpec));
```

**Integrate with Scalar (Beautiful API Reference):**

```typescript
import { apiReference } from '@scalar/hono-api-reference';

app.get('/reference', apiReference({
  url: '/openapi.json',
  theme: 'purple', // 'alternate', 'default', 'moon', 'purple', 'solarized'
  pageTitle: 'My API Documentation',
}));

// Visit http://localhost:3000/reference to see your beautiful API docs
```

### Extending the Specification

The generated OpenAPI spec can be extended with your custom endpoints:

```typescript
import { mergeOpenAPISpec } from './generated/rest/openapi.ts';
import { myCustomEndpoints } from './custom-api-spec.ts';

const fullSpec = mergeOpenAPISpec({
  info: {
    title: 'My Complete API',
    description: 'Generated CRUD + Custom Endpoints',
  },
  paths: myCustomEndpoints,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      }
    }
  },
  security: [{ bearerAuth: [] }],
});
```

## Requirements

- Deno 1.37 or higher
- PostgreSQL 12+ or CockroachDB
- PostGIS extension (optional)

### Dependencies for Generated Code

Projects using COG-generated code need:

- `drizzle-orm` - Database ORM
- `drizzle-zod` - Zod schema generation from Drizzle tables
- `@hono/hono` - Web framework
- `postgres` - PostgreSQL client

Add to your `deno.json`:

```json
{
  "imports": {
    "drizzle-orm": "npm:drizzle-orm@^0.44.5",
    "drizzle-zod": "npm:drizzle-zod@^0.8.0",
    "@hono/hono": "jsr:@hono/hono@^4.6.0",
    "postgres": "npm:postgres@^3.4.7"
  }
}
```

## Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests.

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Authors

See [AUTHORS](./AUTHORS) file for the list of contributors.

## Support

For questions and support:
- Open an issue on GitHub
- Check the documentation in WARP.md
- Review the example project

---

Built with TypeScript and Deno for modern backend development.