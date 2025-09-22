# COG Example Application

This example demonstrates the CRUD Operations Generator (COG) with a
comprehensive blog/content management system data model.

## Data Model Overview

The example includes the following entities and their relationships:

### Core Entities

1. **User** - System users with authentication and profile data
   - Fields: email, username, full name, password hash, active status, metadata
   - Features: Soft delete support, login tracking, array fields (tags)

2. **Role** - User roles for authorization
   - Fields: name, permissions (JSONB)
   - Relationship: Many-to-Many with Users

3. **UserProfile** - Extended user information
   - Fields: bio, avatar URL, social links, preferences
   - Relationship: One-to-One with User

4. **Post** - Blog posts/articles
   - Fields: title, slug, content, excerpt, publication date, view count
   - Features: Soft delete support, metadata storage
   - Relationships:
     - Many-to-One with User (author)
     - Many-to-One with Category
     - Many-to-Many with Tags

5. **Category** - Post categories for organization
   - Fields: name, slug, description
   - Relationship: One-to-Many with Posts

6. **Tag** - Flexible tagging system
   - Fields: name, color
   - Relationship: Many-to-Many with Posts

7. **Comment** - User comments on posts
   - Fields: content
   - Relationships:
     - Many-to-One with User
     - Many-to-One with Post

8. **Location** - Spatial data example with PostGIS
   - Fields: Various geometry types (point, polygon, linestring)
   - Features: Self-referential relationship (parent location)
   - Spatial indexes for geographic queries

### Relationships Summary

- **One-to-One**: User ↔ UserProfile
- **One-to-Many**:
  - User → Posts (author)
  - User → Comments
  - Category → Posts
  - Post → Comments
  - Location → Location (self-referential)
- **Many-to-Many**:
  - Users ↔ Roles (via user_roles junction table)
  - Posts ↔ Tags (via post_tags junction table)

## Getting Started

### Prerequisites

- Deno runtime installed
- PostgreSQL database with PostGIS extension
- Node.js (for Drizzle Kit)

### 1. Generate the Code

```bash
deno run -A ../src/cli.ts --modelsPath ./models --outputPath ./generated
```

This will generate:

- `generated/schema/` - Drizzle ORM schemas
- `generated/domain/` - Business logic layer with CRUD operations
- `generated/rest/` - REST API endpoints
- `generated/db/` - Database connection utilities
- `generated/deno.json` - Deno configuration with import maps

### 2. Set Up Environment Variables

Create a `.env` file based on `.env.template`:

```bash
cp .env.template .env
# Edit .env with your database credentials
```

### 3. Database Setup

#### Install Drizzle Kit

```bash
npm install -D drizzle-kit
```

#### Create drizzle.config.ts

Create a `drizzle.config.ts` file in the generated folder:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema/*.schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "myapp",
  },
});
```

#### Push Schema to Database

Use Drizzle Kit to synchronize your schema with the database:

```bash
cd generated

# Push the schema to your database (creates/updates tables)
npx drizzle-kit push

# Or generate SQL migrations
npx drizzle-kit generate
npx drizzle-kit migrate
```

#### Alternative: Using Drizzle Studio

Drizzle Studio provides a GUI for managing your database:

```bash
cd generated
npx drizzle-kit studio
```

### 4. Run the Application

Create a simple server file `server.ts`:

```typescript
import { Hono } from "@hono/hono";
import { initializeGenerated } from "./generated/index.ts";

const app = new Hono();

// Initialize the generated backend
await initializeGenerated({
  database: {
    host: Deno.env.get("DB_HOST") || "localhost",
    port: parseInt(Deno.env.get("DB_PORT") || "5432"),
    database: Deno.env.get("DB_NAME") || "myapp",
    user: Deno.env.get("DB_USER") || "postgres",
    password: Deno.env.get("DB_PASSWORD") || "postgres",
  },
  app,
  hooks: {
    // Add custom business logic hooks here
    user: {
      preCreate: async (input) => {
        // Hash password before saving
        console.log("Creating user:", input.email);
        return { data: input };
      },
    },
  },
});

// Start the server
Deno.serve({ port: 3000 }, app.fetch);
console.log("🚀 Server running on http://localhost:3000");
```

Run the server:

```bash
deno run --allow-net --allow-env --allow-read server.ts
```

## API Endpoints

Once running, the following REST endpoints are available:

- **Users**: `/api/users`
- **Roles**: `/api/roles`
- **Posts**: `/api/posts`
- **Categories**: `/api/categories`
- **Tags**: `/api/tags`
- **Comments**: `/api/comments`
- **Locations**: `/api/locations`
- **User Profiles**: `/api/userprofiles`

All endpoints support:

- `GET /` - List all (with pagination)
- `GET /:id` - Get by ID
- `POST /` - Create new
- `PUT /:id` - Update
- `PATCH /:id` - Partial update
- `DELETE /:id` - Delete

### Query Parameters

For listing endpoints:

- `limit` - Number of items per page (default: 10)
- `offset` - Number of items to skip
- `orderBy` - Field to order by
- `orderDirection` - `asc` or `desc`

## Features Demonstrated

1. **Complex Relationships** - All types of database relationships
2. **PostGIS Integration** - Spatial data types and indexes
3. **Soft Deletes** - Logical deletion for Users and Posts
4. **JSON Fields** - Flexible metadata storage
5. **Array Fields** - PostgreSQL array support
6. **Composite Indexes** - Multi-column indexes for performance
7. **Hooks System** - Pre/post/after operation hooks for business logic
8. **Transaction Support** - Automatic transaction handling for mutations

## Development Workflow

1. Modify model definitions in `models/`
2. Create your .env file with `cp .env.template .env`
3. Regenerate code with
   `deno run -A ../src/cli.ts --modelsPath ./models --outputPath ./generated`
4. Push schema changes with `npx drizzle-kit push`
5. Restart your application

## Notes

- The generated code uses PostgreSQL-specific features (arrays, JSONB, PostGIS)
- PostGIS extension must be installed in your PostgreSQL database
- All timestamps use PostgreSQL's `TIMESTAMP` type
- UUIDs are used as primary keys for all tables
