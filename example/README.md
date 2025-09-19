# CRUD Operations Generator - All-In-One Example

This example demonstrates **EVERY** feature of the CRUD Operations Generator in a single, comprehensive demo.

## 📁 Contents

```
example/
├── models/               # JSON model definitions
│   ├── user.json        # User model with all data types
│   ├── post.json        # Blog posts with relationships
│   ├── location.json    # PostGIS spatial data & self-referential
│   ├── comment.json     # Comments (many-to-one relationships)
│   ├── category.json    # Categories for posts
│   ├── tag.json         # Tags (many-to-many with posts)
│   ├── role.json        # User roles (many-to-many with users)
│   └── userprofile.json # User profiles (one-to-one with users)
│
├── generated/           # Generated code (after running generate.ts)
│   ├── db/             # Database schemas and migrations
│   ├── domain/         # Domain API layer
│   └── rest/           # REST endpoints
│
├── .env.template       # Database configuration template
├── generate.ts         # Code generation script
├── run-backend.ts      # Backend server with test scenario
└── README.md          # This file
```

## 🚀 Quick Start

This example demonstrates real-world usage of the CRUD Operations Generator with an actual PostgreSQL database.

### Prerequisites

1. **PostgreSQL** with PostGIS extension installed and running
2. **Deno** runtime installed
3. A PostgreSQL database created for testing

### Setup Instructions

#### Step 1: Generate the Backend Code
```bash
cd example
deno run --allow-read --allow-write generate.ts
```

This generates all the backend code from the model definitions in `models/`.

#### Step 2: Configure Database Connection
```bash
cp .env.template .env
# Edit .env with your database credentials
```

Configure either:
- `DATABASE_URL` for a connection string, or
- Individual parameters (`DB_HOST`, `DB_PORT`, etc.)
- SSL certificates if required by your database

#### Step 3: Run the Backend with Tests
```bash
deno run --allow-all run-backend.ts
```

This will:
1. Connect to your database
2. Run migrations to create tables
3. Execute a comprehensive test scenario
4. Start an HTTP server with REST endpoints

### What the Example Demonstrates

#### 1. **Real Database Operations**
- Creates actual database tables via migrations
- Performs real INSERT, SELECT, UPDATE, DELETE operations
- Shows transaction management with commits and rollbacks

#### 2. **Complete Feature Set**
- **All Data Types**: strings, numbers, booleans, dates, JSON, arrays, bigint
- **All Relationships**: one-to-one, one-to-many, many-to-many
- **PostGIS Spatial**: points, polygons, spatial queries
- **Hooks System**: pre-hooks, post-hooks (in transaction), after-hooks (async)

#### 3. **Production Patterns**
- Domain API layer with business logic
- REST endpoints with proper routing
- Transaction management in middleware
- Error handling and rollback scenarios

### Project Structure

```
example/
├── models/              # Model definitions
│   ├── user.json       # User model with all data types
│   ├── post.json       # Blog posts with relationships
│   ├── comment.json    # Comments with foreign keys
│   ├── category.json   # Post categories
│   ├── tag.json        # Tags for many-to-many
│   ├── location.json   # PostGIS spatial data
│   ├── role.json       # User roles
│   └── userprofile.json # One-to-one profiles
├── generated/          # Generated code (after running generate.ts)
│   ├── db/            # Database schemas and migrations
│   ├── domain/        # Domain API layer
│   └── rest/          # REST endpoints
├── .env.template      # Database configuration template
├── generate.ts        # Code generation script
└── run-backend.ts     # Backend server with test scenario
```

### Understanding the Test Scenario

The `run-backend.ts` script creates a complete test scenario:

1. **Users & Roles** - Creates users with different roles (admin, user)
2. **Profiles** - One-to-one user profiles with social links
3. **Posts & Categories** - Blog posts in different categories
4. **Tags** - Many-to-many relationships via junction table
5. **Comments** - Nested comments on posts
6. **Locations** - Spatial data with PostGIS points and polygons
7. **Transactions** - Demonstrates commits and rollbacks
8. **Hooks** - Shows pre, post, and after hook execution

### API Endpoints

Once running, the server provides REST endpoints for all entities:

- `GET /api/users` - List all users
- `POST /api/users` - Create a user
- `GET /api/users/:id` - Get specific user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

Similar endpoints are available for:
- `/api/posts`
- `/api/comments`
- `/api/categories`
- `/api/tags`
- `/api/locations`
- `/api/roles`
- `/api/profiles`

### Customizing the Example

1. **Modify Models**: Edit JSON files in `models/` and regenerate
2. **Add Hooks**: Modify hooks in `run-backend.ts` for custom logic
3. **Test Queries**: Add your own test scenarios
4. **API Testing**: Use curl or Postman to test the REST endpoints

## 🎯 Features Demonstrated

### 1. **Data Types** - All Supported Types
- ✅ UUID (primary keys with auto-generation)
- ✅ String (with maxLength constraints)
- ✅ Text (unlimited length)
- ✅ Integer & BigInt
- ✅ Decimal (with precision/scale)
- ✅ Boolean
- ✅ Date (stored as EPOCH milliseconds)
- ✅ JSON & JSONB
- ✅ Arrays
- ✅ PostGIS: point, polygon, linestring
- ✅ PostGIS: geometry & geography (with SRID)

### 2. **Relationships** - Every Type
- ✅ **One-to-One**: User ↔ UserProfile
- ✅ **One-to-Many**: User → Posts, User → Comments
- ✅ **Many-to-One**: Post → User, Post → Category
- ✅ **Many-to-Many**: Posts ↔ Tags, Users ↔ Roles (via junction tables)
- ✅ **Self-Referential**: Location → Children Locations

### 3. **Hooks System** - Three-Tier Architecture

**REST Layer:**
```
[Middleware: Start Tx] → Call Domain → [Middleware: Commit] → [Send Response]
```

**Domain Layer:**
```
[Pre-Hook] → [Operation] → [Post-Hook] → Return → [After-Hook async]
```

- **Transaction**: Created by Hono middleware, passed to domain
- **Pre-Hook**: Transform input (within transaction)
- **Operation**: Database operation (within transaction)
- **Post-Hook**: Enrich output (within same transaction)
- **After-Hook**: Scheduled at domain level, runs async outside transaction
- **Domain Independence**: After-hook is part of domain API, not REST layer

### 4. **PostGIS Features**
- Spatial data types (point, polygon, linestring)
- Geometry vs Geography distinction
- SRID support (4326 for WGS84)
- Spatial indexes (GiST)
- Spatial queries (ST_DWithin, ST_MakePoint)

### 5. **Additional Features**
- ✅ Automatic timestamps (createdAt, updatedAt)
- ✅ Soft deletes (deletedAt field)
- ✅ Transaction boundaries
- ✅ Cascading deletes
- ✅ Unique constraints
- ✅ Composite indexes
- ✅ Default values
- ✅ Required/nullable fields
- ✅ Foreign key constraints

## 📊 Model Relationships Diagram

```
┌──────────┐        ┌──────────────┐
│   User   │1------1│ UserProfile  │
├──────────┤        └──────────────┘
│ id       │
│ email    │1-------*┌──────────┐
│ username │         │   Post   │
│ ...      │         ├──────────┤
└──────────┘         │ id       │
     │               │ title    │*------*┌─────────┐
     │               │ authorId │        │   Tag   │
     │               │ ...      │        └─────────┘
     │               └──────────┘
     │                     │
     │*                    │*
     │                     │
┌──────────┐         ┌──────────┐
│ Comment  │*-------1│ Category │
└──────────┘         └──────────┘

┌──────────┐*-------*┌──────────┐
│   User   │         │   Role   │
└──────────┘         └──────────┘
  (via user_roles)

┌──────────┐
│ Location │◄──┐ (self-referential)
├──────────┤   │
│ parentId ├───┘
└──────────┘
```

## 🏗️ Generated Code Structure

After running the demo, check the `generated/` folder:

```
generated/
├── schema/                 # Drizzle ORM Schemas
│   ├── user.schema.ts     # User table with all field types
│   ├── post.schema.ts     # Posts with foreign keys
│   ├── location.schema.ts # PostGIS spatial types
│   ├── comment.schema.ts
│   ├── category.schema.ts
│   ├── tag.schema.ts
│   ├── role.schema.ts
│   ├── userprofile.schema.ts
│   ├── relations.ts       # All relationships defined
│   └── index.ts
│
├── db/                    # Database Layer
│   ├── database.ts       # Connection, transactions
│   └── migrations.ts     # Migration runner
│
├── domain/               # Business Logic Layer
│   ├── user.domain.ts   # User CRUD with hooks
│   ├── post.domain.ts   # Post CRUD with relationships
│   ├── location.domain.ts # Spatial queries
│   ├── hooks.types.ts   # Hook type definitions
│   └── index.ts
│
├── api/                  # REST API Layer
│   ├── user.api.ts      # User endpoints
│   ├── post.api.ts      # Post endpoints
│   ├── location.api.ts  # Location endpoints
│   ├── middleware.ts    # Transaction, CORS, error handling
│   └── index.ts
│
└── index.ts             # Main entry point
```

## 🔥 Example Hook Implementation

The demo shows this hook flow for user creation:

```typescript
// Generated Domain API (self-contained with hooks)
class UserDomain {
  async create(input: NewUser, context?: HookContext, tx?: any): Promise<User> {
    const executeInTransaction = async (transaction: any) => {
      // Pre-Hook (within transaction)
      if (this.hooks.preCreate) {
        const result = await this.hooks.preCreate(input, context);
        input = result.data;
      }
      
      // Database Operation
      const [created] = await transaction
        .insert(userTable)
        .values(input)
        .returning();
      
      // Post-Hook (within same transaction)
      if (this.hooks.postCreate) {
        const result = await this.hooks.postCreate(input, created, transaction, context);
        created = result.data;
      }
      
      return created;
    };
    
    // Execute transaction
    const result = tx 
      ? await executeInTransaction(tx)
      : await withTransaction(executeInTransaction);
    
    // After-Hook (domain level, outside transaction)
    if (this.hooks.afterCreate) {
      setTimeout(() => {
        this.hooks.afterCreate!(result, context).catch(console.error);
      }, 0);
    }
    
    return result;
  }
}

// REST Endpoint (thin layer)
app.post('/api/users', transactionMiddleware, async (c) => {
  const result = await userDomain.create(
    await c.req.json(),
    { requestId: c.get('requestId'), userId: c.get('userId') },
    c.get('transaction')  // Pass transaction from middleware
  );
  return c.json(result, 201);
});

// Hook Definitions
const hooks = {
  preCreate: async (input) => {
    input.passwordHash = await hash(input.password);
    delete input.password;
    input.email = input.email.toLowerCase();
    return { data: input };
  },
  
  postCreate: async (input, result, tx) => {
    result.displayName = result.fullName || result.username;
    await tx.insert(auditLog).values({...}); // More DB ops in same tx
    return { data: result };
  },
  
  afterCreate: async (result) => {
    await sendWelcomeEmail(result.email);  // Won't block response
    await trackEvent('user.created', result.id);
  }
};
```

## 🌍 Example PostGIS Query

The generated code supports spatial queries like:

```sql
-- Find locations within 1000m of a point
SELECT * FROM locations
WHERE ST_DWithin(
  point, 
  ST_MakePoint(-74.0060, 40.7128)::geography, 
  1000
);
```

## 💡 Key Insights

1. **Transaction Flow**: Middleware creates tx → Domain uses it → Middleware commits/rollbacks
2. **Domain Independence**: After-hook executes at domain level, not tied to REST
3. **Hook Execution**: Pre and post hooks within transaction, after-hook outside
4. **Flexibility**: Domain API works standalone or with REST layer
5. **Type Safety**: All generated code is fully typed with TypeScript
6. **Relationship Loading**: Supports eager loading via include parameters
7. **Spatial Indexing**: PostGIS fields automatically get GiST indexes

## 🎬 Running the Example

Follow these steps to run the complete example:

### 1. Generate the Code
```bash
deno run --allow-read --allow-write generate.ts
```
This generates all backend code from the model definitions.

### 2. Configure Database
```bash
cp .env.template .env
# Edit .env with your database credentials
```

### 3. Run the Backend
```bash
deno run --allow-all run-backend.ts
```

This will:
- Connect to your PostgreSQL database
- Run migrations to create tables
- Execute a comprehensive test scenario
- Start an HTTP server with REST API endpoints

## 📚 Next Steps

After running the demo:

1. Explore the `generated/` folder to see the actual generated code
2. Modify the model definitions in `models/` and regenerate
3. Use the generated code in a real backend application
4. Connect to a real PostgreSQL database with PostGIS

## 🛐️ Customization

You can customize the generation by modifying:
- Model definitions in `models/*.json`
- Hook implementations in `run-backend.ts`
- Database configuration in `.env`
- Feature flags (soft deletes, timestamps, etc.)

---

This example demonstrates that the CRUD Operations Generator can handle complex, real-world applications with sophisticated requirements including spatial data, complex relationships, and transactional hooks.