# COG (CRUD Operations Generator)

COG is a powerful code generator built with Deno that creates a complete CRUD backend from JSON model definitions. It generates a fully-featured TypeScript backend with proper separation of concerns, type safety, and modern best practices.

## Table of Contents
- [Core Features](#core-features)
- [Model Definition System](#model-definition-system)
- [Generated Code Structure](#generated-code-structure)
- [Advanced Features](#advanced-features)
- [Database Support](#database-support)
- [API Features](#api-features)
- [Getting Started](#getting-started)

## Core Features

### 1. Model-Driven Development
- Define your data models in JSON format
- Automatic code generation from model definitions
- Type-safe code generation with TypeScript
- Built-in validation of model definitions

### 2. Code Generation Components
- Drizzle ORM schema definitions
- Database initialization and connection management
- Domain layer with CRUD operations
- REST API endpoints using Hono framework
- TypeScript types and interfaces

### 3. Project Organization
```
/src
├── cli.ts           # CLI entry point
├── mod.ts           # Main module exports
├── parser/          # Model parsing
├── generators/      # Code generators
└── types/          # TypeScript definitions
```

## Model Definition System

### 1. Data Types Support
- **Primitive Types**
  - text
  - string (with length constraints)
  - integer
  - bigint
  - decimal (with precision and scale)
  - boolean
  - date
  - uuid
  - json/jsonb

- **PostGIS Types**
  - point
  - linestring
  - polygon
  - multipoint
  - multilinestring
  - multipolygon
  - geometry
  - geography

### 2. Field Features
- Primary key definition
- Unique constraints
- Required/optional fields
- Default values
- Field length constraints
- Index support
- Array type support
- Foreign key relationships

### 3. Relationship Types
- One-to-Many
- Many-to-One
- Many-to-Many (with junction tables)
- One-to-One
- Support for self-referential relationships

### 4. Model-Level Features
- Automatic timestamps (created_at, updated_at)
- Soft delete support
- Schema support
- Custom hooks
- Indexes (including composite and partial)

## Generated Code Structure

### 1. Schema Layer (`/schema`)
- Drizzle ORM schema definitions
- Type definitions for models
- Relationship configurations
- Index definitions

### 2. Database Layer (`/db`)
- Connection management
- Transaction support
- Health checks
- Connection pooling
- Type-safe database operations

### 3. Domain Layer (`/domain`)

#### Purpose and Responsibility
- Core business logic implementation
- CRUD operations with full type safety
- Complex relationship handling
- Hook system for extensibility
- Transaction management
- Domain-level validation

#### Key Characteristics
- Framework-agnostic
- Doesn't depend on HTTP/REST concepts
- Pure business logic focus
- Reusable across different interfaces

#### Domain Operations
- Focused on business operations rather than HTTP methods
- Rich input/output types
- Complex validation rules
- Business rule enforcement
- Transaction coordination

### 4. REST API Layer (`/rest`)

#### Purpose and Responsibility
- HTTP interface to domain operations
- RESTful endpoint mapping
- HTTP-specific concerns:
  - Request parsing and validation
  - Response formatting
  - Status code selection
  - Error handling
  - CORS and security headers

#### Separation from Domain Layer
- **REST Layer**
  - Handles HTTP-specific logic
  - Maps URLs to domain operations
  - Manages HTTP metadata (headers, status codes)
  - Handles HTTP-specific validation
  - Formats responses for HTTP clients

- **Domain Layer**
  - Contains pure business logic
  - No knowledge of HTTP/REST
  - Reusable across different interfaces
  - Handles business validation
  - Manages data consistency

#### Benefits of Separation
1. **Modularity**
   - Domain logic can be used with different interfaces (REST, GraphQL, gRPC)
   - REST endpoints can be modified without touching business logic
   - Easier to maintain and test each layer independently

2. **Responsibility Isolation**
   - REST layer focuses on HTTP concerns
   - Domain layer focuses on business rules
   - Clear separation of concerns

3. **Reusability**
   - Domain logic can be reused across different projects
   - Multiple interfaces can use the same domain logic
   - Easier to add new interface types

## Advanced Features

### 1. Hook System and Execution Flow

#### Hook Types and Ordering
1. **Pre-operation hooks**
   - Executed first, within the transaction
   - Can modify input data before operation
   - Can enrich context
   - Hooks: preCreate, preUpdate, preDelete, preFindOne, preFindMany

2. **Main Operation**
   - Executes after pre-hooks
   - Core database operation (create/update/delete/find)
   - Still within the same transaction

3. **Post-operation hooks**
   - Executed immediately after operation
   - Still within the same transaction
   - Can modify operation result
   - Can perform additional transactional operations
   - Hooks: postCreate, postUpdate, postDelete, postFindOne, postFindMany

4. **After-operation hooks**
   - Executed after transaction commits
   - Asynchronous, fire-and-forget style
   - Cannot modify operation result
   - Ideal for side effects (notifications, logging, etc.)
   - Hooks: afterCreate, afterUpdate, afterDelete, afterFindOne, afterFindMany

#### Transaction Behavior
```
Begin Transaction
├─ Pre-operation hook
├─ Main operation
├─ Post-operation hook
Commit Transaction
└─ After-operation hook (async)
```

#### Hook Context Flow
- Each hook can modify the context object
- Context changes are passed forward to subsequent hooks
- Context includes:
  - requestId: For request tracking
  - userId: For authentication/authorization
  - metadata: Custom data

### 2. Transaction Support
- Automatic transaction management
- Transaction middleware for REST endpoints
- Transaction propagation
- Rollback support

### 3. Error Handling
- Structured error responses
- Request ID tracking
- Error middleware
- Type-safe error handling

### 4. Query Features
- Pagination support
- Filtering capabilities
- Sorting options
- Relationship includes

## Database Support

### 1. PostgreSQL Features
- Native PostgreSQL support
- CockroachDB compatibility
- PostGIS integration
- JSON/JSONB support
- Array types
- Custom types

### 2. Schema Management
- Multi-schema support
- Index management
- Foreign key constraints
- Cascade operations

## API Features

### 1. REST Endpoints
- Standard CRUD operations
- Relationship endpoints
- Health check endpoint
- API documentation endpoint

### 2. Middleware Stack
- Transaction middleware
- Request ID tracking
- Error handling
- CORS support
- Custom middleware support

### 3. Request/Response Features
- JSON request/response handling
- Status code management
- Error responses
- Pagination metadata
- Request tracking

## Getting Started

### 1. Installation
```bash
# Clone the repository
git clone <repository-url>

# Install required dependencies
deno cache --reload src/mod.ts
```

Deno doesn't use a package.json or similar dependency manifest. Instead, it downloads and caches dependencies on-demand. The `deno cache` command pre-downloads all dependencies by analyzing import statements in the codebase, starting from the entry point. This ensures all required packages are available locally before running the application.

### 2. Basic Usage
```bash
# Generate code from models
deno run -A src/cli.ts --modelsPath ./models --outputPath ./generated
```

### 3. Configuration Options
- `--modelsPath`: Path to model definitions (default: ./models)
- `--outputPath`: Output directory (default: ./generated)
- `--dbType`: Database type (postgresql/cockroachdb)
- `--schema`: Database schema name
- `--no-postgis`: Disable PostGIS support
- `--no-softDeletes`: Disable soft deletes
- `--no-timestamps`: Disable timestamps
- `--no-uuid`: Disable UUID support
- `--no-validation`: Disable validation

### 4. Model Definition Example
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

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.