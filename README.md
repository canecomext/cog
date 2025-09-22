# CRUD Operations Generator (COG)

A powerful TypeScript code generator for Deno that creates production-ready CRUD
backend infrastructure from JSON model definitions. COG generates type-safe
Drizzle ORM schemas, domain APIs with a sophisticated three-tier hooks system,
REST endpoints using Hono, and handles complex relationships including PostGIS
spatial data.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Model Definition](#model-definition)
- [Generated Code Structure](#generated-code-structure)
- [Hooks System](#hooks-system)
- [Data Types](#data-types)
- [Relationships](#relationships)
- [PostGIS Support](#postgis-support)
- [Transaction Management](#transaction-management)
- [Example Project](#example-project)
- [API Reference](#api-reference)

## Architecture

COG follows a clean, layered architecture that separates concerns and ensures
maintainability:

```
┌─────────────────────────────────────────────────────┐
│  REST Layer (Hono)                                  │
│  • HTTP handling                                    │
│  • Transaction middleware                           │
│  • Request/Response formatting                      │
├─────────────────────────────────────────────────────┤
│  Domain Layer                                       │
│  • Business logic                                   │
│  • CRUD operations                                  │
│  • Three-tier hooks (pre/post/after)                │
│  • Self-contained, reusable                         │
├─────────────────────────────────────────────────────┤
│  Schema Layer                                       │
│  • Drizzle ORM schemas                              │
│  • Type definitions                                 │
│  • Relationships                                    │
├─────────────────────────────────────────────────────┤
│  Database Layer                                     │
│  • PostgreSQL with PostGIS                          │
│  • Connection management                            │
│  • Transaction handling                             │
└─────────────────────────────────────────────────────┘
```

### Execution Flow

**REST Layer:**

```
[Middleware: Start Tx] → Call Domain → [Middleware: Commit/Rollback] → [Send Response]
```

**Domain Layer:**

```
[Pre-Hook] → [Database Operation] → [Post-Hook] → Return → [After-Hook (async)]
```

## Features

### Core Features

- ✅ **Complete CRUD Operations**: Create, Read, Update, Delete with full type
  safety
- ✅ **Three-Tier Hooks System**: Pre-hooks, post-hooks, and after-hooks for
  flexible business logic
- ✅ **Transaction Management**: Automatic transaction handling with proper
  rollback on errors
- ✅ **Type Safety**: Fully typed TypeScript code with Drizzle ORM
- ✅ **RESTful API**: Auto-generated REST endpoints with Hono
- ✅ **Relationship Support**: All relationship types including self-referential
- ✅ **PostGIS Integration**: Full spatial data support for both PostgreSQL and
  CockroachDB
- ✅ **Soft Deletes**: Optional soft delete support with `deletedAt` timestamps
- ✅ **Automatic Timestamps**: Optional `createdAt` and `updatedAt` fields
- ✅ **Pagination & Filtering**: Built-in support for paginated queries
- ✅ **Database Migrations**: Migration generation and runner

### Advanced Features

- 🔧 **Domain Independence**: Domain layer can be used standalone or with REST
- 🔧 **Custom Indexes**: Support for various index types (B-tree, GiST, GIN,
  etc.)
- 🔧 **Cascade Operations**: Configurable cascade deletes and updates
- 🔧 **Default Values**: Support for default values and SQL functions
- 🔧 **Array Types**: Support for array fields
- 🔧 **JSON/JSONB**: Full support for JSON data types
- 🔧 **BigInt & Decimal**: Support for large numbers with precision

## Installation

### Prerequisites

- Deno 1.40+ installed
- PostgreSQL 14+ (with PostGIS extension for spatial features)
- Basic knowledge of TypeScript and REST APIs

### Setup

1. Clone the repository:

```bash
git clone https://github.com/canecomext/cog.git
cd cog
```

2. Install Deno (if not already installed):

```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
```

## Usage

### Basic Usage

1. **Create model definitions** in JSON format:

```bash
mkdir models
# Create your model JSON files in the models/ directory
```

2. **Run the generator**:

```bash
# Using the deno task
deno task generate

# Or directly with options
deno run --allow-read --allow-write --allow-env src/cli.ts \
  --modelsPath ./models \
  --outputPath ./generated \
  --dbType postgresql \
  --postgis
```

3. **Use the generated code** in your application:

```typescript
import { Hono } from "@hono/hono";
import { initializeGenerated } from "./generated";

const app = new Hono();

const backend = await initializeGenerated({
  database: {
    host: "localhost",
    port: 5432,
    database: "myapp",
    user: "postgres",
    password: "password",
  },
  app,
  hooks: {
    // Define your hooks here
  },
});

await Deno.serve({ port: 3000 }, app.fetch);
```

### CLI Options

```bash
deno run --allow-read --allow-write --allow-env src/cli.ts [options]

Options:
  --modelsPath <path>    Path to models directory (default: ./models)
  --outputPath <path>    Path to output directory (default: ./generated)
  --dbType <type>        Database type: postgresql or cockroachdb (default: postgresql)
  --schema <name>        Database schema name
  --no-postgis          Disable PostGIS support
  --no-softDeletes      Disable soft deletes
  --no-timestamps       Disable timestamps
  --no-uuid            Disable UUID support
  --no-validation      Disable validation
  --no-migration       Disable migration generation
  --help               Show help message
```

## Model Definition

Models are defined as JSON files in the models directory. Each file represents
one database table/entity.

### Basic Structure

```json
{
  "name": "ModelName",
  "tableName": "table_name",
  "description": "Optional description",
  "schema": "optional_schema",
  "fields": [...],
  "relationships": [...],
  "indexes": [...],
  "timestamps": true,
  "softDelete": true
}
```

### Field Definition

```json
{
  "name": "fieldName",
  "type": "string",
  "primaryKey": false,
  "unique": false,
  "required": true,
  "defaultValue": "default_value",
  "maxLength": 255,
  "index": true,
  "references": {
    "model": "OtherModel",
    "field": "id",
    "onDelete": "CASCADE",
    "onUpdate": "CASCADE"
  }
}
```

### Complete Example

```json
{
  "name": "User",
  "tableName": "users",
  "description": "User account model",
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
      "maxLength": 255,
      "unique": true,
      "required": true,
      "index": true
    },
    {
      "name": "passwordHash",
      "type": "string",
      "maxLength": 255,
      "required": true
    },
    {
      "name": "profile",
      "type": "jsonb"
    },
    {
      "name": "location",
      "type": "point",
      "srid": 4326
    },
    {
      "name": "tags",
      "type": "text",
      "array": true
    },
    {
      "name": "balance",
      "type": "decimal",
      "precision": 10,
      "scale": 2
    },
    {
      "name": "loginCount",
      "type": "bigint",
      "defaultValue": 0
    }
  ],
  "relationships": [
    {
      "type": "oneToMany",
      "name": "posts",
      "target": "Post",
      "foreignKey": "authorId"
    },
    {
      "type": "manyToMany",
      "name": "roles",
      "target": "Role",
      "through": "user_roles",
      "foreignKey": "user_id",
      "targetForeignKey": "role_id"
    }
  ],
  "indexes": [
    {
      "fields": ["email", "isActive"],
      "unique": false,
      "name": "idx_users_email_active"
    }
  ],
  "timestamps": true,
  "softDelete": true
}
```

## Generated Code Structure

The generator creates the following structure:

```
generated/
├── schema/                  # Drizzle ORM Schemas
│   ├── [model].schema.ts   # Individual model schemas
│   ├── relations.ts        # All relationships
│   └── index.ts            # Schema exports
│
├── db/                     # Database Layer
│   ├── database.ts        # Connection & transaction management
│   └── migrations.ts      # Migration utilities
│
├── domain/                 # Business Logic Layer
│   ├── [model].domain.ts  # Domain API with CRUD operations
│   ├── hooks.types.ts     # Hook type definitions
│   └── index.ts           # Domain exports
│
├── api/                    # REST API Layer
│   ├── [model].api.ts     # REST endpoints for each model
│   ├── middleware.ts      # Transaction, error, CORS middleware
│   └── index.ts           # API registration
│
└── index.ts               # Main entry point
```

## Hooks System

The generator implements a sophisticated three-tier hooks system:

### Hook Types

1. **Pre-Hooks**: Execute before the operation, within the transaction
   - Can modify input data
   - Can perform validation
   - Can cancel the operation by throwing an error

2. **Post-Hooks**: Execute after the operation, within the same transaction
   - Can modify the output
   - Can perform additional database operations
   - Transaction will rollback if hook fails

3. **After-Hooks**: Execute asynchronously after the transaction commits
   - Used for non-critical operations
   - Won't affect the response
   - Examples: sending emails, logging, analytics

### Hook Implementation

```typescript
const hooks = {
  user: {
    // Pre-hook: Transform input
    preCreate: async (input, context) => {
      // Hash password
      input.passwordHash = await hashPassword(input.password);
      delete input.password;

      // Validate email
      if (!isValidEmail(input.email)) {
        throw new Error("Invalid email");
      }

      return { data: input, context };
    },

    // Post-hook: Enrich output (in transaction)
    postCreate: async (input, result, tx, context) => {
      // Add computed fields
      result.profileUrl = `/users/${result.id}`;

      // Create related records in same transaction
      await tx.insert(userProfileTable).values({
        userId: result.id,
        bio: "",
      });

      return { data: result, context };
    },

    // After-hook: Async operations (outside transaction)
    afterCreate: async (result, context) => {
      // These won't block the response
      await sendWelcomeEmail(result.email);
      await trackAnalytics("user.created", result.id);
      await indexSearchEngine(result);
    },
  },
};
```

## Data Types

### Primitive Types

- `text`: Unlimited text
- `string`: VARCHAR with optional maxLength
- `integer`: 32-bit integer
- `bigint`: 64-bit integer
- `decimal`: Decimal with precision and scale
- `boolean`: True/false
- `date`: Stored as EPOCH milliseconds
- `uuid`: UUID v4

### Complex Types

- `json`: JSON data
- `jsonb`: Binary JSON (PostgreSQL)
- Arrays: Any primitive type with `array: true`

### PostGIS Types

- `point`: 2D point
- `linestring`: Line
- `polygon`: Closed polygon
- `multipoint`: Multiple points
- `multilinestring`: Multiple lines
- `multipolygon`: Multiple polygons
- `geometry`: Generic geometry with specified type
- `geography`: Geographic data

## Relationships

### Supported Relationship Types

1. **One-to-One**

```json
{
  "type": "oneToOne",
  "name": "profile",
  "target": "UserProfile",
  "foreignKey": "userId"
}
```

2. **One-to-Many**

```json
{
  "type": "oneToMany",
  "name": "posts",
  "target": "Post",
  "foreignKey": "authorId"
}
```

3. **Many-to-One**

```json
{
  "type": "manyToOne",
  "name": "author",
  "target": "User",
  "foreignKey": "authorId"
}
```

4. **Many-to-Many**

```json
{
  "type": "manyToMany",
  "name": "tags",
  "target": "Tag",
  "through": "post_tags",
  "foreignKey": "post_id",
  "targetForeignKey": "tag_id"
}
```

5. **Self-Referential**

```json
{
  "type": "oneToMany",
  "name": "children",
  "target": "Category",
  "foreignKey": "parentId"
}
```

## PostGIS Support

### Configuration

Enable PostGIS in your model fields:

```json
{
  "name": "location",
  "type": "point",
  "srid": 4326,
  "index": true
}
```

### Spatial Queries

The generated code supports spatial operations:

```typescript
// Find locations within radius
const nearby = await locationDomain.findMany({
  where:
    sql`ST_DWithin(point, ST_MakePoint(${lng}, ${lat})::geography, ${radius})`,
});

// Find locations in polygon
const within = await locationDomain.findMany({
  where: sql`ST_Within(point, ST_GeomFromText('POLYGON((...))', 4326))`,
});
```

### CockroachDB Support

The generator supports both standard PostgreSQL PostGIS and CockroachDB's
implementation:

```bash
deno task generate --dbType cockroachdb
```

## Transaction Management

### Automatic Transaction Handling

The REST layer automatically manages transactions:

1. Middleware creates transaction before handler
2. Domain methods receive transaction
3. Pre and post hooks execute within transaction
4. Transaction commits on success or rolls back on error
5. After-hooks execute outside transaction

### Manual Transaction Usage

You can also use the domain API directly with manual transactions:

```typescript
import { withTransaction } from "./generated/db/database";

await withTransaction(async (tx) => {
  // All operations in same transaction
  const user = await userDomain.create(userData, context, tx);
  const profile = await profileDomain.create(profileData, context, tx);

  // Transaction commits if all succeed
  return { user, profile };
});
```

## Example Project

The repository includes a comprehensive example that demonstrates all features:

```bash
cd example
deno run --allow-all run-demo.ts
```

This will:

1. Generate code from example models
2. Demonstrate all features including hooks, transactions, relationships, and
   PostGIS
3. Show the generated file structure

See [example/README.md](example/README.md) for detailed information.

## API Reference

### Generated Domain API

Each model gets a domain class with these methods:

```typescript
class ModelDomain {
  // Create a new record
  async create(
    input: NewModel,
    context?: HookContext,
    tx?: Transaction,
  ): Promise<Model>;

  // Find by ID
  async findById(
    id: string,
    options?: FilterOptions,
    context?: HookContext,
    tx?: Transaction,
  ): Promise<Model | null>;

  // Find many with pagination
  async findMany(
    filter?: FilterOptions,
    pagination?: PaginationOptions,
    context?: HookContext,
    tx?: Transaction,
  ): Promise<{ data: Model[]; total: number }>;

  // Update by ID
  async update(
    id: string,
    input: Partial<NewModel>,
    context?: HookContext,
    tx?: Transaction,
  ): Promise<Model>;

  // Delete by ID (soft or hard)
  async delete(
    id: string,
    context?: HookContext,
    tx?: Transaction,
  ): Promise<Model>;
}
```

### Generated REST Endpoints

Each model gets these REST endpoints:

- `GET /api/[models]` - List with pagination
- `GET /api/[models]/:id` - Get by ID
- `POST /api/[models]` - Create new
- `PUT /api/[models]/:id` - Full update
- `PATCH /api/[models]/:id` - Partial update
- `DELETE /api/[models]/:id` - Delete

### Query Parameters

- `limit`: Number of records to return
- `offset`: Number of records to skip
- `orderBy`: Field to order by
- `orderDirection`: `asc` or `desc`
- `include`: Comma-separated relationships to include

## Best Practices

1. **Model Design**
   - Always define a primary key
   - Use UUID for primary keys for better distribution
   - Define indexes for frequently queried fields
   - Use appropriate data types (don't use text when string with maxLength
     works)

2. **Hooks**
   - Keep pre/post hooks lightweight (they're in transaction)
   - Use after-hooks for heavy operations (emails, external APIs)
   - Always handle errors in after-hooks
   - Return proper hook results with data and context

3. **Relationships**
   - Define foreign keys explicitly
   - Use cascade options carefully
   - Consider junction tables for many-to-many
   - Index foreign key columns

4. **PostGIS**
   - Always specify SRID (usually 4326 for WGS84)
   - Create spatial indexes for geometry columns
   - Use geography type for large-scale distance calculations
   - Use geometry type for planar calculations

## Troubleshooting

### Common Issues

1. **Generation Errors**
   - Check JSON syntax in model files
   - Ensure all referenced models exist
   - Verify relationship foreign keys match field names

2. **Runtime Errors**
   - Ensure PostgreSQL is running
   - Check database credentials
   - Verify PostGIS extension is installed (if using spatial features)

3. **Type Errors**
   - Regenerate after model changes
   - Check that hooks return correct format
   - Ensure transaction is passed correctly

## Contributing

Contributions are welcome! Please ensure:

- Code follows TypeScript best practices
- All tests pass
- Documentation is updated
- Examples work correctly

## License

MIT

## Support

For issues and questions:

- Create an issue on GitHub
- Check the example project for reference
- Review generated code for understanding

---

Built with ❤️ for the Deno community
