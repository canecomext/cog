# CRUD Operations Generator (COG)

## Overview
A TypeScript-based code generator for Deno runtime that creates complete CRUD backend infrastructure from JSON model definitions. It generates Drizzle ORM schemas, domain APIs with hooks, REST endpoints, and handles complex relationships including PostGIS spatial data.

## Quick Start

```bash
# Generate code from model definitions
deno task generate

# Or with custom paths
deno run --allow-read --allow-write --allow-env src/cli.ts \
  --modelsPath ./models \
  --outputPath ./generated

# Run the example
cd example
deno run --allow-all run-demo.ts
```

## Project Structure

```
cog/
├── src/
│   ├── types/            # TypeScript type definitions
│   ├── parser/           # Model JSON parser
│   ├── generators/       # Code generators
│   │   ├── drizzle-schema.generator.ts
│   │   ├── database-init.generator.ts
│   │   ├── domain-api.generator.ts
│   │   └── rest-api.generator.ts
│   └── cli.ts           # Main CLI
├── example/             # Complete working example
│   ├── models/          # Example model definitions
│   └── run-demo.ts      # All-in-one demo
└── deno.json           # Deno configuration
```

## Key Features

### Three-Tier Hooks System
- **Pre-hooks**: Transform input data (within transaction)
- **Post-hooks**: Enrich output (within same transaction)
- **After-hooks**: Async operations (outside transaction, at domain level)

### Architecture
```
REST Layer:   [Middleware: Tx] → Domain → [Commit] → Response
Domain Layer: [Pre] → [Op] → [Post] → Return → [After async]
```

### Data Types
- Primitives: UUID, string, text, integer, bigint, decimal, boolean, date
- Complex: JSON/JSONB, arrays
- PostGIS: point, polygon, linestring, geometry, geography

### Relationships
- One-to-One, One-to-Many, Many-to-One, Many-to-Many
- Self-referential relationships
- Junction tables for Many-to-Many

## Model Definition Format

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
      "maxLength": 255,
      "unique": true,
      "required": true
    },
    {
      "name": "location",
      "type": "point",
      "srid": 4326
    }
  ],
  "relationships": [
    {
      "type": "oneToMany",
      "name": "posts",
      "target": "Post",
      "foreignKey": "authorId"
    }
  ],
  "timestamps": true,
  "softDelete": true
}
```

## Generated Code Usage

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated';

const app = new Hono();

await initializeGenerated({
  database: {
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    user: 'postgres',
    password: 'password'
  },
  app,
  hooks: {
    user: {
      preCreate: async (input) => {
        input.passwordHash = hash(input.password);
        delete input.password;
        return { data: input };
      },
      postCreate: async (input, result, tx) => {
        await tx.insert(auditLog).values({...});
        return { data: result };
      },
      afterCreate: async (result) => {
        await sendWelcomeEmail(result.email);
      }
    }
  }
});

app.listen(3000);
```

## Commands

- `deno task generate` - Generate code from models
- `deno task example` - Run the complete example

## Technologies
- **Runtime**: Deno
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL with PostGIS
- **Web Framework**: Hono
- **Language**: TypeScript