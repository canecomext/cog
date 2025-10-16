# COG - CRUD Operations Generator

A powerful TypeScript code generator that creates complete, production-ready CRUD backends from simple JSON model
definitions.

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
    connectionString: 'postgresql://user:pass@localhost/mydb',
  },
  app,
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
- PostgreSQL Enum types with standard and bitwise modes
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

- Automatic Zod validation for all CRUD operations
- Auto-generated API documentation
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

| Option             | Description                                   | Default       |
| ------------------ | --------------------------------------------- | ------------- |
| `--modelsPath`     | Path to JSON model files                      | `./models`    |
| `--outputPath`     | Where to generate code                        | `./generated` |
| `--dbType`         | Database type (`postgresql` or `cockroachdb`) | `postgresql`  |
| `--schema`         | Database schema name                          | (default)     |
| `--no-postgis`     | Disable PostGIS support                       | enabled       |
| `--no-timestamps`  | Disable automatic timestamps globally         | enabled       |
| `--no-softDeletes` | Disable soft delete feature globally          | enabled       |
| `--verbose`        | Show generated file paths                     | false         |
| `--help`           | Show help message                             | -             |

### Global Feature Flags

The `--no-*` flags provide global control over features across all models:

#### `--no-softDeletes`

Disables soft delete functionality for **all models**, regardless of model-level `"softDelete"` settings:

- Removes `deletedAt` timestamp field from all tables
- Disables soft delete filtering in queries
- Delete operations become hard deletes

```bash
# Generate without soft deletes
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-softDeletes
```

#### `--no-timestamps`

Disables automatic timestamp fields for **all models**, regardless of model-level `"timestamps"` settings:

- Removes `createdAt` and `updatedAt` fields from all tables
- No automatic timestamp management on create/update operations

```bash
# Generate without timestamps
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-timestamps
```

#### `--no-postgis`

Disables PostGIS spatial data type support:

- Spatial field types (point, polygon, etc.) fall back to JSONB
- GIST indexes are converted to GIN indexes for JSONB compatibility
- Spatial data stored as GeoJSON in JSONB columns
- Database initialization skips PostGIS extension setup

```bash
# Generate without PostGIS
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated --no-postgis
```

**Note:** CLI flags **override** model-level settings. If you use `--no-timestamps`, all models will be generated
without timestamps even if `"timestamps": true` is set in individual model JSON files.

### Validation is Always Enabled

**Important:** Zod validation is mandatory and cannot be disabled in COG. All CRUD operations automatically validate
input data at two points:

1. **Initial validation** before pre-hooks execute
2. **Pre-hook output validation** before database operations

This ensures data integrity and prevents malformed data from reaching your database. The validation schemas are
automatically generated from your Drizzle table definitions using [drizzle-zod](https://orm.drizzle.team/docs/zod).

## Model Definition Format

Models are defined in JSON with this structure:

```json
{
  "name": "ModelName",
  "tableName": "table_name",
  "enums": [
    {
      "name": "EnumName",
      "values": ["value1", "value2", "value3"]
    }
  ],
  "fields": [
    {
      "name": "fieldName",
      "type": "dataType",
      "primaryKey": true,
      "unique": false,
      "required": true,
      "defaultValue": "value",
      "enumName": "EnumName",
      "array": false,
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

### Field Properties

| Property       | Type    | Description                                                                                                                       |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | string  | Field name                                                                                                                        |
| `type`         | string  | Data type: `text`, `string`, `integer`, `bigint`, `decimal`, `boolean`, `date`, `uuid`, `json`, `jsonb`, `enum`, or PostGIS types |
| `primaryKey`   | boolean | Mark as primary key                                                                                                               |
| `unique`       | boolean | Add unique constraint                                                                                                             |
| `required`     | boolean | Mark as NOT NULL                                                                                                                  |
| `defaultValue` | any     | Default value for the field                                                                                                       |
| `enumName`     | string  | Reference to enum (when `type: "enum"`)                                                                                           |
| `array`        | boolean | Mark as array type                                                                                                                |
| `maxLength`    | number  | Max length for `string` type                                                                                                      |
| `precision`    | number  | Precision for `decimal` type                                                                                                      |
| `scale`        | number  | Scale for `decimal` type                                                                                                          |
| `index`        | boolean | Create index on this field                                                                                                        |
| `references`   | object  | Foreign key reference to another model                                                                                            |

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

## Enum Types

> COG supports PostgreSQL enum types with two powerful modes

COG provides first-class support for enum types, perfect for fields with predefined values like user roles, statuses, or
preferences.

### Standard Enum (Single Value)

Use when a field can only have **one value** from the enum.

#### Example: User Gender

**Model Definition:**

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
    }
  ]
}
```

**Generated Schema:**

```typescript
export const genderEnum = pgEnum('gender', ['man', 'woman', 'non_binary']);

export const profileTable = pgTable('profile', {
  gender: genderEnum('gender').notNull(),
  // ...
});
```

**Usage:**

```typescript
// Create a profile
await profileDomain.create({
  gender: 'woman', // Only one value allowed
  // ...
}, tx);

// Query by gender
const profiles = await tx
  .select()
  .from(profileTable)
  .where(eq(profileTable.gender, 'man'));
```

### Bitwise Enum (Multiple Values)

Use when a field can have **multiple values** from the enum, stored efficiently as bitwise flags.

#### Example: Dating App Preferences

**Perfect for:**

- User preferences (e.g., interested in multiple genders)
- Permission systems (e.g., read + write + execute)
- Feature flags (e.g., multiple enabled features)
- Filter selections (e.g., multiple categories)

**Model Definition:**

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

Each enum value gets a power of 2:

| Value        | Bit Position | Integer Value |
| ------------ | ------------ | ------------- |
| `man`        | 0            | 1             |
| `woman`      | 1            | 2             |
| `non_binary` | 2            | 4             |

**Combining Values:**

```typescript
// Helper constants
const GenderBits = {
  MAN: 1,
  WOMAN: 2,
  NON_BINARY: 4,
  ALL: 7, // 1 | 2 | 4
};

// Interested in men and women only
const preference1 = GenderBits.MAN | GenderBits.WOMAN; // = 3

// Interested in all genders
const preference2 = GenderBits.ALL; // = 7

// Interested in women and non-binary only
const preference3 = GenderBits.WOMAN | GenderBits.NON_BINARY; // = 6
```

**Querying with Bitwise Operations:**

```typescript
import { and, sql } from 'drizzle-orm';

// Find profiles where mutual preferences match
const currentProfile = {
  id: 'uuid-here',
  gender: 'man', // Their actual gender
  genderPreference: 6, // Interested in: woman (2) + non_binary (4)
};

const genderBits = { 'man': 1, 'woman': 2, 'non_binary': 4 };
const currentGenderBit = genderBits[currentProfile.gender]; // 1

const matches = await tx
  .select()
  .from(profileTable)
  .where(
    and(
      // Their preference includes my gender
      sql`(${profileTable.genderPreference} & ${currentGenderBit}) > 0`,
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

Complete Dating App Example

**Models:**

```json
// models/profile.json
{
  "name": "Profile",
  "enums": [
    {
      "name": "Gender",
      "values": ["man", "woman", "non_binary"]
    }
  ],
  "fields": [
    {"name": "id", "type": "uuid", "primaryKey": true},
    {"name": "userId", "type": "uuid", "required": true, "unique": true},
    {"name": "displayName", "type": "string", "required": true},
    {"name": "gender", "type": "enum", "enumName": "Gender", "required": true},
    {"name": "genderPreference", "type": "integer", "required": true, "defaultValue": 7},
    {"name": "location", "type": "point", "required": true, "index": true},
    {"name": "maxDistance", "type": "integer", "defaultValue": 50}
  ],
  "timestamps": true
}

// models/swipe.json
{
  "name": "Swipe",
  "fields": [
    {"name": "id", "type": "uuid", "primaryKey": true},
    {"name": "swiperId", "type": "uuid", "required": true},
    {"name": "swipedId", "type": "uuid", "required": true},
    {"name": "liked", "type": "boolean", "required": true}
  ],
  "indexes": [
    {"fields": ["swiperId", "swipedId"], "unique": true}
  ]
}
```

**Find Matching Profiles Query:**

```typescript
import { and, ne, sql } from 'drizzle-orm';

async function findMatches(currentProfileId: string, tx: DbTransaction) {
  const currentProfile = await tx
    .select()
    .from(profileTable)
    .where(eq(profileTable.id, currentProfileId))
    .limit(1)
    .then((rows) => rows[0]);

  const genderBits = { 'man': 1, 'woman': 2, 'non_binary': 4 };
  const myGenderBit = genderBits[currentProfile.gender];

  return await tx
    .select()
    .from(profileTable)
    .where(
      and(
        ne(profileTable.id, currentProfileId),
        // Mutual gender preference match
        sql`(${profileTable.genderPreference} & ${myGenderBit}) > 0`,
        sql`(${currentProfile.genderPreference} & 
          CASE ${profileTable.gender}
            WHEN 'man' THEN 1
            WHEN 'woman' THEN 2  
            WHEN 'non_binary' THEN 4
          END) > 0`,
        // Within distance (PostGIS)
        sql`ST_DWithin(
          ${profileTable.location}::geography,
          ${currentProfile.location}::geography,
          ${currentProfile.maxDistance * 1000}
        )`,
        // Not already swiped
        sql`NOT EXISTS (
          SELECT 1 FROM ${swipeTable}
          WHERE ${swipeTable.swiperId} = ${currentProfileId}
            AND ${swipeTable.swipedId} = ${profileTable.id}
        )`,
      ),
    );
}
```

### Array of Enums (Alternative)

For cases where you need to list all selected values individually:

```json
{
  "name": "genderPreferences",
  "type": "enum",
  "enumName": "Gender",
  "array": true
}
```

**Generated:**

```typescript
genderPreferences: genderEnum('gender_preferences').array();
```

### ⚡ Performance Comparison

| Feature           | Bitwise Integer | Array of Enums |
| ----------------- | --------------- | -------------- |
| Storage           | 4 bytes         | Variable       |
| Query Performance | Very Fast       | Slower         |
| Index Support     | Standard        | GIN needed     |
| Readability       | Needs mapping   | Clear          |
| Max Values        | 32 (or 64)      | Unlimited      |
| Best For          | Flags, filters  | Lists, arrays  |

### When to Use Which?

**Standard Enum:**

- Field has only ONE value (e.g., user status, account type)
- Need PostgreSQL enum constraints
- Want database-level type safety

**Bitwise Enum (Integer):**

- Field can have MULTIPLE values (e.g., preferences, permissions)
- Need fast bitwise queries
- Have < 32 distinct values
- Want efficient storage and indexing

**Array of Enums:**

- Need to list all selected values
- More readable code
- Don't need maximum query performance
- Have > 32 possible values

### CockroachDB Compatibility

**PostgreSQL Enums:**

- **Supported** in CockroachDB v22.2+ (December 2022)
- **Not supported** in earlier CockroachDB versions
- Alternative: Use `varchar` with `CHECK` constraints for older versions

**Bitwise Integer Operations:**

- **Fully supported** in all CockroachDB versions
- Standard bitwise operators (`&`, `|`, `^`) work identically
- Recommended for multi-value scenarios on CockroachDB

**Generated Code Note:** When using `--dbType cockroachdb`, generated schemas include compatibility comments reminding
you of the v22.2+ requirement for enum types.

## OpenAPI Documentation

COG automatically generates a complete OpenAPI 3.1.0 specification for all CRUD endpoints and provides automatic
documentation endpoints.

### Auto-Generated Documentation Endpoints

When you call `initializeGenerated()`, two documentation endpoints are automatically registered:

#### `/cog/openapi.json`

- Serves the complete OpenAPI 3.1.0 specification in JSON format
- Ready to use immediately - no configuration required
- Import into Postman, Insomnia, or use with OpenAPI Generator

#### `/cog/reference`

- Beautiful, interactive API documentation powered by [Scalar](https://scalar.com)
- Modern UI with search, "Try it" functionality, and dark mode
- Browse endpoints by model/tag
- Mobile-responsive design
- Default theme: purple (customizable)

**Example:**

```typescript
import { Hono } from '@hono/hono';
import { initializeGenerated } from './generated/index.ts';

const app = new Hono();

await initializeGenerated({
  database: {
    connectionString: 'postgresql://user:pass@localhost/mydb',
  },
  app,
});

Deno.serve({ port: 3000 }, app.fetch);

// Documentation is now automatically available at:
// http://localhost:3000/cog/openapi.json - OpenAPI JSON spec
// http://localhost:3000/cog/reference - Interactive API docs
```

### Generated Files

COG also generates static documentation files:

- `generated/rest/openapi.ts` - TypeScript module with OpenAPI spec and `mergeOpenAPISpec()` utility
- `generated/rest/openapi.json` - Static JSON specification file

### Customization

**Change Scalar Theme:**

Edit `generated/rest/index.ts` to change the documentation theme:

```typescript
// Find the /cog/reference endpoint in registerRestRoutes()
app.get(
  '/cog/reference',
  apiReference({
    url: '/cog/openapi.json',
    theme: 'solarized', // Options: 'alternate', 'default', 'moon', 'purple', 'solarized'
  }) as any,
);
```

**Add Custom Endpoints:**

Extend the OpenAPI spec with your custom (non-generated) endpoints:

```typescript
import { mergeOpenAPISpec } from './generated/rest/openapi.ts';

const customSpec = {
  info: {
    title: 'My Complete API',
    description: 'Generated CRUD + Custom Endpoints',
  },
  paths: {
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

// Update the endpoint in your app or generated/rest/index.ts
app.get('/cog/openapi.json', (c) => c.json(completeSpec));
```

### Features

- **Zero Configuration** - Documentation endpoints work out of the box
- **Always Up-to-Date** - Regenerating code automatically updates documentation
- **Complete Coverage** - All CRUD and relationship endpoints documented
- **Schema Definitions** - Full request/response schemas for all models
- **Extendable** - Merge with custom OpenAPI specs for your endpoints
- **Type-Safe** - Uses TypeScript types from `openapi-types`
- **Beautiful UI** - Modern, professional API reference powered by Scalar

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
