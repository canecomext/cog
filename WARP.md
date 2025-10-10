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
Drizzle ORM table definitions with full TypeScript types, relationships, indexes, and constraints. Supports all PostgreSQL types including PostGIS spatial data. Also includes Zod validation schemas automatically generated from table definitions.

#### Domain Layer (`/domain`)
Pure business logic implementation. Each model gets a domain class with:
- CRUD operations (create, findOne, findMany, update, delete)
- Automatic input validation using Zod schemas
- Relationship management (fetch related data, manage associations)
- Hook integration points
- Transaction support
- No HTTP dependencies - can be used by any interface

#### REST Layer (`/rest`)
HTTP interface using Hono framework. Translates HTTP requests to domain operations:
- Standard CRUD endpoints (GET, POST, PUT, DELETE)
- Relationship endpoints (GET /users/:id/posts)
- OpenAPI 3.1.0 specification for all endpoints
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

## Input Validation

COG integrates [Zod](https://zod.dev) validation using [drizzle-zod](https://orm.drizzle.team/docs/zod) for automatic input validation on all CRUD operations.

### Automatic Schema Generation

For each model, three Zod schemas are automatically generated from Drizzle table definitions:

```typescript
// In generated/schema/user.schema.ts

// For create operations - validates all required fields
export const userInsertSchema = createInsertSchema(userTable);

// For update operations - all fields are optional (partial updates)
export const userUpdateSchema = createUpdateSchema(userTable);

// For select operations - validates query results  
export const userSelectSchema = createSelectSchema(userTable);
```

### Validation Execution Flow

Validation happens at two critical points in every create and update operation:

```
1. Initial Input Validation
   ↓ (Zod schema validation)
2. Pre-hook receives validated input
   ↓ (Pre-hook can modify input)
3. Pre-hook Output Validation  
   ↓ (Zod schema validation again)
4. Database operation with validated data
```

This dual-validation approach ensures:
- Invalid data is rejected immediately
- Hooks receive only valid input
- Hooks cannot emit malformed data to database operations
- Data integrity is maintained throughout the operation

### Implementation in Domain API

**Create Operation:**
```typescript
async create(input: NewUser, tx: DbTransaction, context?: HookContext): Promise<User> {
  // 1. Validate input before pre-hook
  const validatedInput = userInsertSchema.parse(input);

  // 2. Pre-create hook (within transaction)
  let processedInput = validatedInput;
  if (this.hooks.preCreate) {
    const preResult = await this.hooks.preCreate(validatedInput, tx, context);
    // 3. Validate pre-hook output to ensure it didn't emit malformed data
    processedInput = userInsertSchema.parse(preResult.data);
    context = { ...context, ...preResult.context };
  }

  // 4. Perform create operation with validated data
  const [created] = await tx
    .insert(userTable)
    .values(processedInput)
    .returning();

  // ... post-hook and after-hook logic
}
```

**Update Operation:**
```typescript
async update(id: string, input: Partial<NewUser>, tx: DbTransaction, context?: HookContext): Promise<User> {
  // 1. Validate input before pre-hook (partial update)
  const validatedInput = userUpdateSchema.parse(input);

  // 2. Pre-update hook
  let processedInput = validatedInput;
  if (this.hooks.preUpdate) {
    const preResult = await this.hooks.preUpdate(id, validatedInput, tx, context);
    // 3. Validate pre-hook output to ensure it didn't emit malformed data
    processedInput = userUpdateSchema.parse(preResult.data);
    context = { ...context, ...preResult.context };
  }

  // 4. Perform update operation with validated data
  const [updated] = await tx
    .update(userTable)
    .set({
      ...processedInput,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, id))
    .returning();

  // ... post-hook and after-hook logic
}
```

### Error Handling

When validation fails, Zod throws a `ZodError` with detailed field-level information:

```typescript
import { ZodError } from 'zod';

try {
  await userDomain.create({
    email: 'invalid-email',
    username: 'user',
    // Missing required field: fullName
  }, tx);
} catch (error) {
  if (error instanceof ZodError) {
    // Access detailed validation errors
    error.errors.forEach(err => {
      console.log(`${err.path.join('.')}: ${err.message}`);
    });
    // Output:
    // fullName: Required
    // passwordHash: Required
  }
}
```

### Benefits

**Single Source of Truth**
- Validation rules derived directly from Drizzle table definitions
- No manual Zod schema creation needed
- Schema changes automatically update validation

**Type Safety**
- Runtime validation matches TypeScript types
- Compile-time and runtime type checking
- Catch invalid data before it reaches the database

**Hook Safety**
- Pre-hooks receive validated input
- Pre-hook output validated before database operations
- Prevents hooks from corrupting data

**Developer Experience**
- Automatic - no configuration required
- Clear, detailed error messages
- Works seamlessly with existing code

## The Hook System

Hooks provide extension points for custom business logic. They execute in a specific order within the transaction boundary:

### Execution Flow
```
Begin Transaction
  → Input Validation (Zod)
  → Pre-hook (modify input)
  → Pre-hook Output Validation (Zod)
  → Main Operation
  → Post-hook (modify output)
Commit Transaction
→ After-hook (async side effects)
```

### Hook Types

**Pre-operation hooks**
- Execute before the main operation
- Receive validated input (Zod validation already applied)
- Can modify input data
- Output is validated before main operation
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

**Input Validation**
Automatic Zod validation for all CRUD operations (always enabled, cannot be disabled). Schemas are generated from Drizzle table definitions and validate both initial input and pre-hook output. Includes field-level constraints: required, unique, length, precision, scale, and type checking.

**Custom Pluralization**
Handle irregular plurals (e.g., "Index" -> "indices" instead of "indexes").

**OpenAPI Documentation**
Automatic OpenAPI 3.1.0 specification generation for all CRUD endpoints. Includes complete request/response schemas, can be extended with custom endpoints, and supports Scalar API Reference integration.

## OpenAPI Specification Generation

COG automatically generates a complete OpenAPI 3.1.0 specification for all generated CRUD endpoints.

### Generated Files

**`generated/rest/openapi.ts`**
- TypeScript module with the complete OpenAPI specification
- Exports `generatedOpenAPISpec` object
- Provides `mergeOpenAPISpec()` function for extending with custom endpoints
- Includes TypeScript types from `openapi-types` package

**`generated/rest/openapi.json`**
- Static JSON file with the OpenAPI specification
- Can be served directly or used with API documentation tools

### What's Included

**Paths**
- All CRUD endpoints (list, create, get, update, delete)
- Relationship endpoints (one-to-many, many-to-many)
- Query parameters for pagination, filtering, and sorting
- Path parameters for resource IDs

**Schemas**
- Model schemas with all fields and their types
- Input schemas for create operations
- Update schemas for partial updates
- Response schemas matching domain types

**Components**
- Reusable parameters (limit, offset, orderBy, etc.)
- Common responses (NotFound, ValidationError, ServerError)
- Field constraints (maxLength, format, nullable, etc.)

**Metadata**
- Operation IDs for each endpoint
- Tags for grouping by model
- Descriptions for endpoints and parameters
- HTTP status codes and response types

### Serving the Specification

**Basic Usage:**
```typescript
import { Hono } from '@hono/hono';
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';

const app = new Hono();

// Serve the OpenAPI spec
app.get('/openapi.json', (c) => c.json(generatedOpenAPISpec));
```

**With Scalar (Beautiful API Reference):**
```typescript
import { apiReference } from '@scalar/hono-api-reference';

app.get('/reference', apiReference({
  url: '/openapi.json',
  theme: 'purple', // Options: 'alternate', 'default', 'moon', 'purple', 'solarized'
  pageTitle: 'My API Documentation',
}));

// Visit http://localhost:3000/reference to see your API documentation
```

### Extending with Custom Endpoints

The `mergeOpenAPISpec()` function allows you to add your custom endpoints:

```typescript
import { mergeOpenAPISpec } from './generated/rest/openapi.ts';

const customSpec = {
  info: {
    title: 'My Complete API',
    description: 'Generated CRUD operations plus custom endpoints',
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login user',
        operationId: 'loginUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Invalid credentials'
          }
        }
      }
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Refresh access token',
        // ... your endpoint spec
      }
    }
  },
  components: {
    schemas: {
      LoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [{ bearerAuth: [] }]
};

const completeSpec = mergeOpenAPISpec(customSpec);

// Serve the combined specification
app.get('/openapi.json', (c) => c.json(completeSpec));
```

### Schema Type Mapping

COG maps model field types to OpenAPI schema types:

| Model Type | OpenAPI Type | Format |
|------------|--------------|--------|
| `text` | `string` | - |
| `string` | `string` | - |
| `integer` | `integer` | `int32` |
| `bigint` | `integer` | `int64` |
| `decimal` | `number` | `double` |
| `boolean` | `boolean` | - |
| `date` | `string` | `date-time` |
| `uuid` | `string` | `uuid` |
| `json`/`jsonb` | `object` | - |
| PostGIS types | `object` | (GeoJSON) |

### Benefits

**Automatic Synchronization**
- OpenAPI spec is always in sync with your models
- Changes to models automatically update the documentation
- No manual documentation maintenance required

**Development Tools**
- Generate client SDKs with OpenAPI Generator
- Beautiful API documentation with Scalar
- Import into Postman or Insomnia
- Validate requests/responses

**API Discovery**
- Self-documenting API
- Clear endpoint structure
- Type definitions for all operations
- Example values and constraints

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
│   ├── rest-api.generator.ts
│   └── openapi.generator.ts  # OpenAPI 3.1.0 spec generation
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
    ├── openapi.ts           # OpenAPI specification (TypeScript)
    ├── openapi.json         # OpenAPI specification (JSON)
    └── index.ts
```

## Command-Line Usage

### Basic Generation
```bash
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated
```

### Configuration Options

#### Required Options
- `--modelsPath <path>` - Location of JSON model files (default: `./models`)
- `--outputPath <path>` - Where to generate code (default: `./generated`)

#### Database Options
- `--dbType <type>` - Database type: `postgresql` or `cockroachdb` (default: `postgresql`)
- `--schema <name>` - Database schema name (optional, uses default schema if not specified)
- `--no-postgis` - Disable PostGIS spatial extension support (default: enabled)

#### Feature Options
- `--no-softDeletes` - Disable soft delete feature globally for all models (default: enabled)
- `--no-timestamps` - Disable automatic timestamps globally for all models (default: enabled)

#### Output Options
- `--verbose` - Show generated file paths during generation (default: false)
- `--help` - Display help message with all available options

### Global Feature Override Flags

The `--no-*` flags provide **global overrides** that apply to all models, superseding individual model-level settings:

#### `--no-softDeletes`

When specified, this flag disables soft delete functionality across **all models**, regardless of their individual `"softDelete"` configuration in model JSON files:

**Effect:**
- Removes `deletedAt: timestamp('deleted_at')` field from all generated table schemas
- Delete operations become permanent (hard deletes)
- No automatic filtering of soft-deleted records in queries

**Example:**
```bash
# All models will be generated without soft delete support
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-softDeletes
```

**Use Case:** When you don't need soft delete functionality or prefer to implement custom deletion logic.

#### `--no-timestamps`

When specified, this flag disables automatic timestamp management across **all models**, regardless of their individual `"timestamps"` configuration:

**Effect:**
- Removes `createdAt: timestamp('created_at')` field from all tables
- Removes `updatedAt: timestamp('updated_at')` field from all tables
- No automatic timestamp updates on create or update operations

**Example:**
```bash
# All models will be generated without automatic timestamps
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-timestamps
```

**Use Case:** When you want to manage timestamps manually or don't need audit trails.

#### `--no-postgis`

Disables PostGIS extension support:
- Spatial field types (point, linestring, polygon, etc.) fall back to JSONB storage
- GIST indexes are automatically converted to GIN indexes for JSONB compatibility
- Useful when deploying to databases without PostGIS extension

**Effect:**
- All spatial types (`point`, `linestring`, `polygon`, `multipoint`, `multilinestring`, `multipolygon`, `geometry`, `geography`) are generated as `jsonb()` fields instead of PostGIS custom types
- Spatial data must be stored as GeoJSON format in JSONB columns
- GIST indexes on spatial fields are converted to GIN indexes (JSONB-compatible)
- Database initialization does not attempt to enable PostGIS extension

**Example:**
```bash
# Generate without PostGIS - spatial types become JSONB
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-postgis
```

**Use Case:** When your database doesn't have the PostGIS extension installed or you don't need spatial query capabilities.

#### Priority Rules

**Important:** CLI flags have **higher priority** than model-level settings:

```json
// user.json - Model definition
{
  "name": "User",
  "timestamps": true,     // ← Model says: enable timestamps
  "softDelete": true      // ← Model says: enable soft delete
}
```

```bash
# CLI override - disables both features for ALL models
deno run -A src/cli.ts --modelsPath ./models --no-timestamps --no-softDeletes
```

**Result:** The generated User model will have neither timestamps nor soft delete fields, regardless of the JSON configuration.

### Important Note on Validation

**Zod validation is always enabled and cannot be disabled.** COG automatically generates Zod schemas from Drizzle table definitions and applies validation at two critical points:

1. **Initial Input Validation** - Before pre-hooks execute
2. **Pre-hook Output Validation** - Before database operations

This dual-validation approach ensures data integrity and prevents hooks from emitting malformed data. All CRUD operations (create, update) automatically validate input against the generated Zod schemas, providing runtime type safety that matches your TypeScript types.

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
