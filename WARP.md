# WARP.md - COG Internal Documentation

## What is COG?

COG (CRUD Operations Generator) transforms JSON model definitions into a complete, production-ready TypeScript backend. Think of it as a compiler for backend applications - you describe your data models, and COG generates all the layers you need: database schemas, domain logic, REST APIs, and the glue that holds them together.

## The Problem It Solves

Writing CRUD operations is repetitive. Every model needs the same patterns: database tables, validation, API endpoints, error handling, transactions. Developers spend countless hours writing this boilerplate instead of focusing on unique business logic. COG eliminates this waste by generating consistent, well-structured code that follows best practices.

## How COG Works

### The Generation Pipeline

1. **Parse** - Read JSON model definitions from a directory
2. **Validate** - Check model integrity, relationships, and data types
3. **Transform** - Convert models into internal representation
4. **Generate** - Produce TypeScript code for each layer
5. **Write** - Output organized code structure ready for use

### Input: Model Definitions

Models are defined in JSON files with a simple, declarative structure:

```json
{
  "name": "User",
  "tableName": "users",
  "fields": [
    {
      "name": "id",
      "type": "uuid",
      "primaryKey": true
    },
    {
      "name": "email",
      "type": "string",
      "unique": true,
      "required": true
    }
  ],
  "relationships": [
    {
      "type": "oneToMany",
      "name": "posts",
      "target": "Post"
    }
  ],
  "timestamps": true,
  "softDelete": true
}
```

### Output: Layered Architecture

COG generates four distinct layers that work together:

#### Database Layer (`/db`)
Manages connections, transactions, and database initialization. Uses Drizzle ORM for type-safe SQL operations with PostgreSQL or CockroachDB.

#### Schema Layer (`/schema`)
Drizzle ORM table definitions with full TypeScript types, relationships, indexes, and constraints. Supports all PostgreSQL types including PostGIS spatial data.

#### Domain Layer (`/domain`)
Pure business logic implementation. Each model gets a domain class with:
- CRUD operations (create, findOne, findMany, update, delete)
- Relationship management (fetch related data, manage associations)
- Hook integration points
- Transaction support
- No HTTP dependencies - can be used by any interface

#### REST Layer (`/rest`)
HTTP interface using Hono framework. Translates HTTP requests to domain operations:
- Standard CRUD endpoints (GET, POST, PUT, DELETE)
- Relationship endpoints (GET /users/:id/posts)
- Automatic transaction wrapping
- Error handling and status codes
- Request/response validation

## Supported Data Types

### Primitives
- `text` - Unlimited text
- `string` - VARCHAR with optional maxLength
- `integer` - 32-bit integers
- `bigint` - 64-bit integers for large numbers
- `decimal` - Precise decimal numbers with scale/precision
- `boolean` - True/false values
- `date` - Timestamps stored as epoch milliseconds
- `uuid` - Universally unique identifiers
- `json`/`jsonb` - Structured JSON data

### Spatial Types (PostGIS)
- `point` - Single coordinate
- `linestring` - Connected line segments
- `polygon` - Closed area
- `multipoint` - Multiple points
- `multilinestring` - Multiple lines
- `multipolygon` - Multiple polygons
- `geometry` - Generic geometry type
- `geography` - Geographic data on sphere

Each spatial type supports:
- SRID (Spatial Reference ID) specification
- Geometry type constraints
- Dimension configuration (2D, 3D, 4D)

## Relationships

COG handles all standard relationship patterns:

### One-to-Many / Many-to-One
Parent-child relationships like User -> Posts. Foreign key in child table.

### Many-to-Many
Requires junction table. Automatically generates the junction schema.

### One-to-One
Direct relationship with foreign key in either table.

### Self-Referential
Models can reference themselves (e.g., Location with parent/children).

## The Hook System

Hooks provide extension points for custom business logic. They execute in a specific order within the transaction boundary:

### Execution Flow
```
Begin Transaction
  → Pre-hook (modify input)
  → Main Operation
  → Post-hook (modify output)
Commit Transaction
→ After-hook (async side effects)
```

### Hook Types

**Pre-operation hooks**
- Execute before the main operation
- Can modify input data
- Can validate or reject operations
- Run within transaction

**Post-operation hooks**
- Execute after successful operation
- Can modify response data
- Can perform additional database operations
- Run within same transaction

**After-operation hooks**
- Execute after transaction commits
- Cannot modify response
- Perfect for notifications, logging, external API calls
- Run asynchronously

### Hook Context

Hooks receive a context object that flows through the entire operation:
- `requestId` - Unique request identifier
- `userId` - Current user (from authentication)
- `metadata` - Custom data passed between hooks
- `transaction` - Active database transaction

## Advanced Features

### Transaction Management

Every REST endpoint automatically wraps operations in a transaction:
1. Begin transaction
2. Execute pre-hooks
3. Execute main operation
4. Execute post-hooks
5. Commit or rollback on error
6. Execute after-hooks if successful

### Query Capabilities

The domain layer supports rich queries:
- Complex WHERE conditions using SQL expressions
- Pagination with limit/offset
- Sorting by any field
- Including related data
- Partial updates
- Batch operations

### Database Flexibility

**PostgreSQL Support**
- Full feature set
- PostGIS extension
- JSON/JSONB operations
- Array types
- Custom types

**CockroachDB Support**
- Distributed SQL
- Geo-partitioning
- Built-in spatial types
- PostgreSQL compatibility

### Model Features

**Timestamps**
Automatic `createdAt` and `updatedAt` fields with proper timezone handling.

**Soft Deletes**
Records are marked as deleted rather than removed, with automatic filtering.

**Indexes**
Composite indexes, unique indexes, partial indexes, and spatial indexes (GIST, GIN).

**Validation**
Field-level constraints: required, unique, length, precision, scale, references.

**Custom Pluralization**
Handle irregular plurals (e.g., "Index" -> "indices" instead of "indexes").

## File Organization

### Generator Structure
```
src/
├── cli.ts                    # Command-line interface
├── mod.ts                    # Main module exports
├── parser/
│   └── model-parser.ts       # JSON model validation
├── generators/
│   ├── database-init.generator.ts
│   ├── domain-api.generator.ts
│   ├── drizzle-schema.generator.ts
│   └── rest-api.generator.ts
└── types/
    └── model.types.ts        # TypeScript definitions
```

### Generated Code Structure
```
generated/
├── index.ts                  # Main entry point
├── db/
│   ├── database.ts          # Connection management
│   └── initialize-database.ts
├── schema/
│   ├── [model].schema.ts    # Drizzle table definitions
│   ├── relations.ts         # Relationship definitions
│   └── index.ts
├── domain/
│   ├── [model].domain.ts    # Business logic
│   ├── hooks.types.ts
│   └── index.ts
└── rest/
    ├── [model].rest.ts      # HTTP endpoints
    ├── middleware.ts
    ├── types.ts
    └── index.ts
```

## Command-Line Usage

### Basic Generation
```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated
```

### Configuration Options
- `--modelsPath <path>` - Location of JSON model files
- `--outputPath <path>` - Where to generate code
- `--dbType <type>` - Database type (postgresql/cockroachdb)
- `--schema <name>` - Database schema name
- `--no-postgis` - Disable PostGIS support
- `--no-softDeletes` - Disable soft delete feature
- `--no-timestamps` - Disable automatic timestamps
- `--no-uuid` - Disable UUID support
- `--no-validation` - Skip validation
- `--verbose` - Show generated file paths

## Integration Example

After generation, integrate the code into your Hono application:

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated/index.ts';

const app = new Hono();

await initializeGenerated({
  database: {
    connectionString: 'postgresql://...',
    ssl: { ca: '...' }
  },
  app,
  hooks: {
    user: {
      async preCreate(input, tx, context) {
        // Validate or modify input
        return { data: input, context };
      },
      async postCreate(input, result, tx, context) {
        // Enrich response
        return { data: result, context };
      },
      async afterCreate(result, context) {
        // Send notification
        console.log('User created:', result.id);
      }
    }
  }
});

Deno.serve({ port: 3000 }, app.fetch);
```

## Design Decisions

### Why Deno?
- Built-in TypeScript support without configuration
- Secure by default with explicit permissions
- Modern JavaScript features and APIs
- Simplified dependency management

### Why Drizzle ORM?
- Type-safe SQL with TypeScript
- Lightweight with minimal abstraction
- Excellent PostgreSQL support
- Migration-free schema definition

### Why Hono?
- Ultra-fast web framework
- Small bundle size
- Excellent TypeScript support
- Works seamlessly with Deno

### Why Separate Domain and REST?
- Domain logic remains pure and reusable
- Easy to add GraphQL or gRPC later
- Better testability
- Clear separation of concerns

## Performance Considerations

### Connection Pooling
Database connections are pooled and reused to minimize overhead.

### Transaction Batching
Multiple operations within a request share the same transaction.

### Lazy Loading
Relationships are loaded on-demand unless explicitly included.

### Index Optimization
Generated indexes based on unique constraints and foreign keys.

## Security Features

### SQL Injection Prevention
All queries use parameterized statements through Drizzle ORM.

### Transaction Isolation
Each request gets its own transaction with proper isolation.

### Error Sanitization
Internal errors are caught and sanitized before sending to clients.

## Extensibility

### Custom Generators
The generator architecture allows adding new code generators by implementing the generator interface.

### Hook System
Any operation can be extended with custom logic through hooks.

### Middleware Support
The REST layer supports standard Hono middleware for cross-cutting concerns.

### Custom Types
Support for custom database types through Drizzle's customType API.

## Limitations

### Current Constraints
- PostgreSQL/CockroachDB only (no MySQL/SQLite yet)
- REST API only (no GraphQL generation)
- No migration generation (schema-first approach)
- No built-in authentication/authorization

### Design Boundaries
- Focuses on CRUD operations, not complex business workflows
- Generates code, not a runtime framework
- Requires manual integration with existing codebases

## Future Enhancements

Potential areas for expansion:
- GraphQL API generation
- OpenAPI specification generation
- Migration file generation
- Built-in authentication patterns
- Real-time subscriptions support
- More database engine support

## Contributing

COG is designed to be hackable. The codebase is organized for clarity:
- Parsers handle input validation
- Generators produce code strings
- Types define the contract
- CLI orchestrates the pipeline

To add a new feature:
1. Update types in `model.types.ts`
2. Extend parser in `model-parser.ts`
3. Modify relevant generators
4. Test with example models

## License

MIT License - see LICENSE file for details.

## Authors

See AUTHORS file for contributors.
