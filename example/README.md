# COG Example Project

This directory contains a comprehensive example demonstrating the full capabilities of the COG code generator.

## Overview

The example showcases a blog-like application with users, posts, comments, categories, tags, and locations with spatial
data. It demonstrates:

- All supported data types including PostgreSQL enums and PostGIS spatial types
- All relationship patterns (one-to-many, many-to-many, one-to-one, self-referential)
- Hook system implementation
- Transaction management
- Custom business logic integration
- Complex queries with relationships

## Data Models

### User

The central entity representing system users with authentication fields, profile data, and relationships to posts,
comments, and roles.

**Key Features:**

- UUID primary keys
- Email and username uniqueness
- **Enum type for account type** (free/premium)
- JSON metadata storage
- Array fields for tags
- Decimal type for balance
- Big integer for login count
- Relationships: posts (one-to-many), comments (one-to-many), profile (one-to-one), roles (many-to-many)

### Post

Blog posts with rich content, categorization, and tagging.

**Key Features:**

- Slug-based URLs
- Foreign key to User (author)
- Optional category relationship
- Many-to-many relationship with tags via junction table
- JSON metadata
- View counting

### Comment

Comments on posts demonstrating nested relationships.

**Key Features:**

- References both Post and User
- Self-referential for reply threads
- Soft delete support
- Automatic timestamps

### Location

Demonstrates PostGIS spatial data types and self-referential relationships.

**Key Features:**

- Point data for coordinates (SRID 4326)
- Polygon for boundaries
- LineString for routes
- Geometry and Geography types
- Parent-child hierarchy (self-referential)
- Spatial indexes (GIST)

### Category

Simple categorization with parent-child hierarchy.

**Key Features:**

- Self-referential relationships
- Unique slug field
- One-to-many relationship with posts

### Tag

Tags for posts with many-to-many relationships.

**Key Features:**

- Many-to-many with posts through junction table
- Unique tag names
- Slug generation

### Role

User roles demonstrating many-to-many relationships.

**Key Features:**

- Many-to-many with users through junction table
- Permission storage in JSON
- Role hierarchies

### UserProfile

One-to-one relationship example with extended user data.

**Key Features:**

- One-to-one with User
- Additional profile fields
- Optional fields demonstration

### Index

Example with custom plural handling.

**Key Features:**

- Custom pluralization (Index -> indices)
- Demonstrates naming edge cases
- Foreign key to User

## Running the Example

### Prerequisites

1. PostgreSQL database with PostGIS extension
2. Database connection string
3. SSL certificate (optional)

### Setup Environment

Create a `.env` file in the example directory:

```env
DB_URL=postgresql://username:password@localhost:5432/dbname
DB_SSL_CERT_FILE=path/to/cert.pem  # Optional
```

### Generate the Code

From the example directory:

```bash
# Generate code from model definitions
deno run -A ../src/cli.ts --modelsPath ./models --outputPath ./generated --verbose
```

This will generate:

- 9 model schemas
- 2 junction table schemas (user_roles, post_tags)
- Domain classes for all models
- REST endpoints for all models
- Relationship endpoints
- Hook type definitions
- Database initialization code

### Run the Server

```bash
# Start the example server
deno run -A example.ts
```

The server will start on http://localhost:3000

## API Endpoints

### User Endpoints

- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (soft delete)
- `GET /api/users/:id/posts` - Get user's posts
- `GET /api/users/:id/comments` - Get user's comments
- `GET /api/users/:id/profile` - Get user's profile
- `GET /api/users/:id/roles` - Get user's roles
- `POST /api/users/:id/roles` - Add role to user
- `DELETE /api/users/:id/roles/:roleId` - Remove role from user

### Post Endpoints

- `GET /api/posts` - List all posts
- `GET /api/posts/:id` - Get post by ID
- `POST /api/posts` - Create new post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `GET /api/posts/:id/comments` - Get post comments
- `GET /api/posts/:id/tags` - Get post tags
- `POST /api/posts/:id/tags` - Add tag to post
- `DELETE /api/posts/:id/tags/:tagId` - Remove tag from post

### Location Endpoints

- `GET /api/locations` - List all locations
- `GET /api/locations/:id` - Get location by ID
- `POST /api/locations` - Create new location
- `PUT /api/locations/:id` - Update location
- `DELETE /api/locations/:id` - Delete location
- `GET /api/locations/:id/children` - Get child locations
- `GET /api/locations/:id/parent` - Get parent location

### Custom Endpoints (in example.ts)

- `GET /` - Welcome message
- `GET /api/users/search?email=...` - Search users by email
- `GET /xxx` - Demo endpoint creating a user with generated data

## Hook System

The example demonstrates the hook system with the User model:

### Pre-Create Hook

Executes before user creation within the transaction. Can validate or modify input data.

```typescript
async preCreate(input, tx, context) {
  // Validate or transform input
  return { data: input, context };
}
```

### Post-Create Hook

Executes after user creation but before transaction commit. Can enrich the response.

```typescript
async postCreate(input, result, tx, context) {
  // Enrich response data
  return { data: result, context };
}
```

### After-Create Hook

Executes asynchronously after transaction commit. Perfect for side effects.

```typescript
async afterCreate(result, context) {
  console.log(`User created: ${result.id}`);
  // Send notifications, trigger webhooks, etc.
}
```

## Middleware Integration

The example shows how to integrate custom middleware:

### Request ID Middleware

Adds a unique request ID to each request for tracing.

### User ID Middleware

Extracts user ID from headers for authentication context.

### Timing Middleware

Logs request processing time.

## Database Features Demonstrated

### Transactions

All operations are wrapped in database transactions with automatic rollback on error.

### Spatial Queries

The Location model can be queried with PostGIS functions:

```sql
-- Find locations within 10km
SELECT * FROM locations 
WHERE ST_DWithin(point, ST_MakePoint(lng, lat)::geography, 10000);
```

### JSON Operations

User metadata and role permissions use JSONB for flexible data storage.

### Soft Deletes

Users and posts support soft deletes with automatic filtering of deleted records.

### Timestamps

Automatic `createdAt` and `updatedAt` timestamps on all models.

## Testing the API

### Create a User

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "fullName": "Test User",
    "passwordHash": "hashed_password",
    "accountType": "premium",
    "isActive": true
  }'
```

### Create a Post

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Post",
    "slug": "my-first-post",
    "content": "This is the content",
    "authorId": "user-uuid-here"
  }'
```

### Create a Location with Spatial Data

```bash
curl -X POST http://localhost:3000/api/locations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Central Park",
    "point": {
      "type": "Point",
      "coordinates": [-73.965355, 40.782865]
    },
    "boundary": {
      "type": "Polygon",
      "coordinates": [[...]]
    }
  }'
```

## Project Structure

```
example/
├── models/                  # Model definitions
│   ├── user.json
│   ├── post.json
│   ├── comment.json
│   ├── location.json
│   ├── category.json
│   ├── tag.json
│   ├── role.json
│   ├── userprofile.json
│   └── index.json
├── generated-c/             # Generated code (git-ignored)
│   ├── db/                 # Database layer
│   ├── schema/             # Drizzle schemas
│   ├── domain/             # Business logic
│   ├── rest/               # REST endpoints
│   └── index.ts           # Main entry
├── example.ts              # Example server implementation
├── deno.json              # Deno configuration
├── .env                   # Environment variables (create this)
└── README.md              # This file
```

## Key Learning Points

1. **Model Definition**: How to define complex data models with relationships
2. **Code Generation**: The generation process creates clean, maintainable code
3. **Layered Architecture**: Clear separation between HTTP, domain, and data layers
4. **Hook System**: Extensibility through pre/post/after hooks
5. **Type Safety**: Full TypeScript support throughout the stack
6. **Spatial Data**: PostGIS integration for geographic applications
7. **Relationships**: Proper handling of all relationship types
8. **Transactions**: Automatic transaction management with rollback

## Customization

The generated code can be customized:

1. Add custom middleware to the Hono app
2. Implement hooks for business logic
3. Add custom endpoints alongside generated ones
4. Extend domain classes with custom methods
5. Add validation rules in hooks
6. Integrate authentication/authorization

## Performance Tips

1. Use indexes on frequently queried fields
2. Enable connection pooling in production
3. Use pagination for large result sets
4. Include only needed relationships
5. Use spatial indexes for geographic queries
6. Cache frequently accessed data

## Troubleshooting

### PostGIS Not Found

Ensure PostGIS extension is installed:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Connection Issues

Check your database connection string and SSL certificate path.

### Generation Errors

Run with `--verbose` flag to see detailed output.

### Type Errors

Ensure all model references are correct and models are defined before relationships.

## Next Steps

1. Modify the models to fit your needs
2. Add custom business logic through hooks
3. Implement authentication middleware
4. Add validation rules
5. Deploy to production with proper environment variables

---

This example provides a solid foundation for building real-world applications with COG.
