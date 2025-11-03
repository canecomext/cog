# WARP.md - COG Internal Documentation

## What is COG?

COG (CRUD Operations Generator) transforms JSON model definitions into a complete, production-ready TypeScript backend.
Think of it as a compiler for backend applications - you describe your data models, and COG generates all the layers you
need: database schemas, domain logic, REST APIs, and the glue that holds them together.

## The Problem It Solves

Writing CRUD operations is repetitive. Every model needs the same patterns: database tables, validation, API endpoints,
error handling, transactions. Developers spend countless hours writing this boilerplate instead of focusing on unique
business logic. COG eliminates this waste by generating consistent, well-structured code that follows best practices.

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

Manages connections, transactions, and database initialization. Uses Drizzle ORM for type-safe SQL operations with
PostgreSQL or CockroachDB.

#### Schema Layer (`/schema`)

Drizzle ORM table definitions with full TypeScript types, relationships, indexes, and constraints. Supports all
PostgreSQL types including PostGIS spatial data. Also includes Zod validation schemas automatically generated from table
definitions.

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
- Automatic transaction wrapping for write operations
- Error handling and status codes
- Request/response validation
- REST hook integration (pre/post hooks at HTTP layer)
- Class-based route structure for dynamic hook injection

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
- `enum` - PostgreSQL enum type with single or multiple value support (via bitwise flags)

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

### Enum Types

COG supports PostgreSQL enum types with two modes: standard enums (single value) and bitwise enums (multiple values).

#### Standard Enum Mode

For fields that can only have ONE value from a predefined set:

```json
{
  "name": "User",
  "enums": [
    {
      "name": "Role",
      "values": ["admin", "editor", "viewer"]
    }
  ],
  "fields": [
    {
      "name": "role",
      "type": "enum",
      "enumName": "Role",
      "required": true
    }
  ]
}
```

Generates:

```typescript
export const roleEnum = pgEnum('role', ['admin', 'editor', 'viewer']);

export const userTable = pgTable('user', {
  role: roleEnum('role').notNull(),
  // ...
});
```

#### Bitwise Enum Mode

For fields that can have MULTIPLE values stored as bitwise flags (efficient for preferences, permissions, filters):

```json
{
  "name": "Profile",
  "enums": [
    {
      "name": "Gender",
      "values": ["man", "woman", "non_binary"]
    }
  ],
  "fields": [
    {
      "name": "gender",
      "type": "enum",
      "enumName": "Gender",
      "required": true
    },
    {
      "name": "genderPreference",
      "type": "integer",
      "required": true,
      "defaultValue": 7
    }
  ]
}
```

**Bit Mapping:**

- Each enum value is assigned a power of 2
- `man` = 1 (2^0), `woman` = 2 (2^1), `non_binary` = 4 (2^2)
- Combine values using bitwise OR: `1 | 2 | 4 = 7` (all values)
- Check values using bitwise AND: `(value & flag) > 0`

**Querying with bitwise operations:**

```typescript
import { and, sql } from 'drizzle-orm';

// Find profiles matching gender preferences (bidirectional)
const genderBits = { 'man': 1, 'woman': 2, 'non_binary': 4 };
const myGenderBit = genderBits[currentProfile.gender];

const matches = await tx
  .select()
  .from(profileTable)
  .where(
    and(
      // Their preference includes my gender
      sql`(${profileTable.genderPreference} & ${myGenderBit}) > 0`,
      // My preference includes their gender
      sql`(${currentProfile.genderPreference} & 
        CASE ${profileTable.gender}
          WHEN 'man' THEN 1
          WHEN 'woman' THEN 2
          WHEN 'non_binary' THEN 4
        END) > 0`,
    ),
  );
```

**Use cases for bitwise enums:**

- User preferences (dating apps, content filtering)
- Permission systems (read, write, execute flags)
- Feature flags (multiple enabled features)
- Multi-select filters

**Benefits:**

- Efficient storage: 4 bytes for up to 32 flags (or 8 bytes for 64 flags with bigint)
- Fast queries: Bitwise operations are very performant
- Index-friendly: Can create standard B-tree indexes on integer columns
- Compact: No junction tables or array types needed

**Limitations:**

- Maximum 32 values with integer (64 with bigint)
- Requires application-level bit mapping
- Less readable than array types without helper constants

#### Array of Enums (Alternative)

For more readable multi-value enums when performance is less critical:

```json
{
  "name": "genderPreferences",
  "type": "enum",
  "enumName": "Gender",
  "array": true
}
```

Generates:

```typescript
genderPreferences: genderEnum('gender_preferences').array();
```

This provides better readability and doesn't require bit mapping, but queries using array operators (`@>`, `&&`) are
slower than bitwise operations.

#### CockroachDB Compatibility

**Enum Support:**

- PostgreSQL-style enums are supported in **CockroachDB v22.2+** (released December 2022)
- Earlier CockroachDB versions do NOT support enum types
- For older versions, use `varchar` fields with `CHECK` constraints as an alternative

**Bitwise Operations:**

- Fully supported in all CockroachDB versions
- Bitwise operators (`&`, `|`, `^`, `~`) work identically to PostgreSQL
- Recommended approach for multi-value enums on CockroachDB

**Generated Code:** When generating for CockroachDB (`--dbType cockroachdb`), schemas include comments noting the v22.2+
requirement for enum types.

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

COG integrates [Zod](https://zod.dev) validation using [drizzle-zod](https://orm.drizzle.team/docs/zod) for automatic
input validation on all CRUD operations.

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
    error.errors.forEach((err) => {
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

COG provides two types of hooks that operate at different architectural layers, allowing you to customize behavior at both the HTTP and domain levels.

### Two-Layer Hook Architecture

**Domain Hooks** (`DomainHooks`)
- Run at the domain layer within database transactions
- Have access to database transaction for queries and modifications
- Perfect for: data validation, business rules, database-dependent logic
- Execute within transaction boundary
- Configured via `domainHooks` parameter

**REST Hooks** (`RestHooks`)
- Run at the REST/HTTP layer outside of transactions
- Have access to full Hono context (request, response, headers)
- Perfect for: HTTP-specific logic, authorization, logging, rate limiting
- Execute outside transaction boundary
- Configured via `restHooks` parameter

### Execution Flow

```
HTTP Request
  → REST Pre-hook (HTTP layer, no transaction)
    → Begin Transaction
      → Input Validation (Zod)
      → Domain Pre-hook (within transaction)
      → Domain Pre-hook Output Validation (Zod)
      → Main Operation (database)
      → Domain Post-hook (within transaction)
    → Commit Transaction
  → REST Post-hook (HTTP layer, no transaction)
  → Domain After-hook (async side effects, no transaction)
→ HTTP Response
```

### Domain Hook Types

**Pre-operation hooks**

- Execute before the main database operation
- Receive validated input (Zod validation already applied)
- Can modify input data
- Output is validated before main operation
- Run within transaction
- Receive `tx: DbTransaction` parameter

**Post-operation hooks**

- Execute after successful database operation
- Can modify response data
- Can perform additional database operations
- Run within same transaction
- Receive `tx: DbTransaction` parameter

**After-operation hooks**

- Execute after transaction commits
- Cannot modify response
- Perfect for notifications, logging, external API calls
- Run asynchronously outside transaction
- Do NOT receive transaction parameter

### REST Hook Types

**Pre-operation hooks**

- Execute before domain operation
- Can access and modify request data
- Can check authorization, rate limits
- Can throw HTTPException to abort request
- Run outside transaction
- Receive `c: Context` (Hono context) parameter

**Post-operation hooks**

- Execute after domain operation completes
- Can modify response data
- Can set response headers
- Can sanitize output (remove sensitive fields)
- Run outside transaction
- Receive `c: Context` (Hono context) parameter

### Hook Context

Both hook types receive a context object that flows through the operation:

- `requestId` - Unique request identifier
- `userId` - Current user (from authentication)
- `metadata` - Custom data passed between hooks
- Additional custom fields from your Hono context variables

**Domain hooks** also receive:
- `transaction` - Active database transaction

**REST hooks** also receive:
- `c` - Full Hono context (request, response, headers, etc.)

## Advanced Features

### Transaction Management

Every REST write endpoint (POST, PUT, PATCH, DELETE) automatically wraps domain operations in a transaction:

1. Execute REST pre-hooks (outside transaction)
2. Begin transaction
3. Execute domain pre-hooks (within transaction)
4. Execute main database operation
5. Execute domain post-hooks (within transaction)
6. Commit or rollback on error
7. Execute REST post-hooks (outside transaction)
8. Execute domain after-hooks if successful (outside transaction, async)

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

**Timestamps** Automatic `createdAt` and `updatedAt` fields with proper timezone handling.

**Soft Deletes** Records are marked as deleted rather than removed, with automatic filtering.

**Indexes** Composite indexes, unique indexes, partial indexes, and spatial indexes (GIST, GIN).

**Input Validation** Automatic Zod validation for all CRUD operations (always enabled, cannot be disabled). Schemas are
generated from Drizzle table definitions and validate both initial input and pre-hook output. Includes field-level
constraints: required, unique, length, precision, scale, and type checking.

**Custom Pluralization** Handle irregular plurals (e.g., "Index" -> "indices" instead of "indexes").

**OpenAPI Documentation** Automatic OpenAPI 3.1.0 specification generation for all CRUD endpoints. Generated spec (`generatedOpenAPISpec`) can be exposed at any URL you choose, merged with custom endpoints, and used with any documentation UI (Scalar, Swagger UI, Redoc). Includes complete request/response schemas and TypeScript types.

## OpenAPI Specification Generation

COG automatically generates a complete OpenAPI 3.1.0 specification for all generated CRUD endpoints.

> **Philosophy:** COG generates OpenAPI specifications but **does not automatically expose** documentation endpoints. This gives you full control over where and how to expose your API documentation.

> **Configuration:** Documentation generation can be disabled with `--no-documentation` at generation time. See [Command-Line Usage](#command-line-usage) for details.

### Generated Files

**`generated/rest/openapi.ts`**

- TypeScript module with the complete OpenAPI specification
- Exports `generatedOpenAPISpec` constant for programmatic access
- Includes TypeScript types from `openapi-types` package
- Ready to use with any OpenAPI-compatible tools

**`generated/rest/openapi.json`**

- Static JSON file with the OpenAPI specification
- Can be served directly or used with API documentation tools

### Manual Documentation Exposure

COG does not automatically register documentation endpoints. You have full control over:

- **URL structure** - Choose your own documentation paths
- **Security** - Expose docs only in specific environments
- **Customization** - Merge with custom endpoint documentation before exposing
- **UI choice** - Use Scalar, Swagger UI, Redoc, or any other tool

**Basic Example:**

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated/index.ts';
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';
import { Scalar } from '@scalar/hono-api-reference';

const app = new Hono();

await initializeGenerated({
  database: { connectionString: 'postgresql://...' },
  app,
});

// Expose OpenAPI spec at your chosen URL
app.get('/api/openapi.json', (c) => c.json(generatedOpenAPISpec));

// Expose interactive documentation with Scalar
app.get('/api/docs', Scalar({
  url: '/api/openapi.json',
  theme: 'purple',
}) as any);

Deno.serve({ port: 3000 }, app.fetch);

// Documentation available at:
// - http://localhost:3000/api/openapi.json
// - http://localhost:3000/api/docs
```

**Environment-Specific Exposure:**

```typescript
const isDevelopment = Deno.env.get('ENVIRONMENT') === 'development';

if (isDevelopment) {
  app.get('/docs/openapi.json', (c) => c.json(generatedOpenAPISpec));
  app.get('/docs', Scalar({
    url: '/docs/openapi.json',
  }) as any);
}
```

**Disable Documentation at Generation Time:**

```bash
deno run -A src/cli.ts --modelsPath ./models --no-documentation
# No openapi.ts or openapi.json files generated
```

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

### Merging with Custom Endpoints

Combine generated CRUD endpoints with your custom authentication, analytics, or business logic endpoints:

```typescript
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';
import type { OpenAPIV3_1 } from 'openapi-types';

// Define your custom endpoints
const customPaths: OpenAPIV3_1.PathsObject = {
  '/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'User login',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string' },
              },
              required: ['email', 'password'],
            },
          },
        },
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
                  user: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Merge specs
const completeSpec: OpenAPIV3_1.Document = {
  ...generatedOpenAPISpec,
  info: {
    ...generatedOpenAPISpec.info,
    title: 'My Complete API',
    description: 'Generated CRUD + Custom Endpoints',
  },
  paths: {
    ...generatedOpenAPISpec.paths,
    ...customPaths,
  },
  components: {
    ...generatedOpenAPISpec.components,
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// Expose the merged specification
app.get('/api/openapi.json', (c) => c.json(completeSpec));
app.get('/api/docs', Scalar({
  url: '/api/openapi.json',
}) as any);
```

### Documentation UI Options

COG-generated OpenAPI specs work with any documentation UI:

**Scalar (Recommended):**

```typescript
import { Scalar } from '@scalar/hono-api-reference';

app.get('/docs', Scalar({
  url: '/api/openapi.json', // Point to your OpenAPI spec URL
  theme: 'purple', // Options: 'alternate', 'default', 'moon', 'purple', 'solarized'
}) as any);
```

**Swagger UI:**

```typescript
import { swaggerUI } from '@hono/swagger-ui';

app.get('/docs/*', swaggerUI({ url: '/api/openapi.json' }));
```

### Advanced OpenAPI Customization

For more complex scenarios, you can modify the spec structure:

```typescript
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';

const customSpec = {
  info: {
    title: 'My Complete API',
    version: '2.0.0',
    description: 'Generated CRUD operations plus custom endpoints',
    contact: {
      name: 'API Support',
      email: 'support@example.com',
    },
  },
  servers: [
    {
      url: 'https://api.example.com',
      description: 'Production server',
    },
    {
      url: 'https://staging.api.example.com',
      description: 'Staging server',
    },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User login',
        operationId: 'loginUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
                required: ['email', 'password'],
              },
            },
          },
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
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid credentials',
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const completeSpec = mergeOpenAPISpec(customSpec);

// Serve the customized specification
app.get('/docs/openapi.json', (c) => c.json(completeSpec));
```

### Schema Type Mapping

COG maps model field types to OpenAPI schema types:

| Model Type     | OpenAPI Type | Format      |
| -------------- | ------------ | ----------- |
| `text`         | `string`     | -           |
| `string`       | `string`     | -           |
| `integer`      | `integer`    | `int32`     |
| `bigint`       | `integer`    | `int64`     |
| `decimal`      | `number`     | `double`    |
| `boolean`      | `boolean`    | -           |
| `date`         | `string`     | `date-time` |
| `uuid`         | `string`     | `uuid`      |
| `json`/`jsonb` | `object`     | -           |
| PostGIS types  | `object`     | (GeoJSON)   |

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

#### Documentation Options

- `--no-documentation` - Disable OpenAPI documentation generation (default: enabled)

#### Output Options

- `--verbose` - Show generated file paths during generation (default: false)
- `--help` - Display help message with all available options

### Global Feature Override Flags

The `--no-*` flags provide **global overrides** that apply to all models, superseding individual model-level settings:

#### `--no-softDeletes`

When specified, this flag disables soft delete functionality across **all models**, regardless of their individual
`"softDelete"` configuration in model JSON files:

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

When specified, this flag disables automatic timestamp management across **all models**, regardless of their individual
`"timestamps"` configuration:

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

- All spatial types (`point`, `linestring`, `polygon`, `multipoint`, `multilinestring`, `multipolygon`, `geometry`,
  `geography`) are generated as `jsonb()` fields instead of PostGIS custom types
- Spatial data must be stored as GeoJSON format in JSONB columns
- GIST indexes on spatial fields are converted to GIN indexes (JSONB-compatible)
- Database initialization does not attempt to enable PostGIS extension

**Example:**

```bash
# Generate without PostGIS - spatial types become JSONB
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-postgis
```

**Use Case:** When your database doesn't have the PostGIS extension installed or you don't need spatial query
capabilities.

#### `--no-documentation`

Disables OpenAPI documentation generation entirely:

**Effect:**

- No `openapi.ts` or `openapi.json` files generated in the `rest/` directory
- No documentation endpoints registered
- No Scalar API reference UI included
- Reduces generated code size and eliminates documentation dependencies

**Example:**

```bash
# Generate without documentation
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-documentation
```

**Use Case:** Production builds where you don't want to expose API documentation, or when you have a custom
documentation solution.

**Note:** The documentation base path is now runtime-configurable via `InitializationConfig.docs.basePath` (default: `/docs`). You can enable/disable docs and customize the path when calling `initializeGenerated()`.

#### Priority Rules

#### Priority Rules

**Important:** CLI flags have **higher priority** than model-level settings:

```json
// user.json - Model definition
{
  "name": "User",
  "timestamps": true, // ← Model says: enable timestamps
  "softDelete": true // ← Model says: enable soft delete
}
```

```bash
# CLI override - disables both features for ALL models
deno run -A src/cli.ts --modelsPath ./models --no-timestamps --no-softDeletes
```

**Result:** The generated User model will have neither timestamps nor soft delete fields, regardless of the JSON
configuration.

### Important Note on Validation

**Zod validation is always enabled and cannot be disabled.** COG automatically generates Zod schemas from Drizzle table
definitions and applies validation at two critical points:

1. **Initial Input Validation** - Before pre-hooks execute
2. **Pre-hook Output Validation** - Before database operations

This dual-validation approach ensures data integrity and prevents hooks from emitting malformed data. All CRUD
operations (create, update) automatically validate input against the generated Zod schemas, providing runtime type
safety that matches your TypeScript types.

## Integration Example

After generation, integrate the code into your Hono application:

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated/index.ts';

const app = new Hono();

await initializeGenerated({
  database: {
    connectionString: 'postgresql://...',
    ssl: { ca: '...' },
  },
  app,
  // Domain hooks - run within database transaction
  domainHooks: {
    user: {
      async preCreate(input, tx, context) {
        // Validate or modify input at domain layer
        // Can perform database queries within transaction
        return { data: input, context };
      },
      async postCreate(input, result, tx, context) {
        // Enrich response with additional data
        return { data: result, context };
      },
      async afterCreate(result, context) {
        // Send notification (async, outside transaction)
        console.log('User created:', result.id);
      },
    },
  },
  // REST hooks - run at HTTP layer, no transaction
  restHooks: {
    user: {
      async preCreate(input, c, context) {
        // HTTP-layer validation, authorization, rate limiting
        const auth = c.req.header('authorization');
        if (!auth) {
          throw new HTTPException(401, { message: 'Unauthorized' });
        }
        return { data: input, context };
      },
      async postCreate(input, result, c, context) {
        // Set response headers, sanitize output
        c.header('X-Resource-Id', result.id);
        const { passwordHash, ...safeResult } = result;
        return { data: safeResult, context };
      },
    },
  },
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

Any operation can be extended with custom logic through the two-layer hook system:
- **Domain Hooks**: Extend database operations with business logic within transactions
- **REST Hooks**: Extend HTTP endpoints with request/response transformations and HTTP-specific logic

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
- Migration file generation
- Built-in authentication patterns
- Real-time subscriptions support
- More database engine support
- WebSocket support for real-time features
- Batch operation endpoints

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
