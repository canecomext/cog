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
├── run-demo.ts          # All-in-one demonstration script
└── README.md           # This file
```

## 🚀 Quick Start

This example is a complete, self-contained demonstration of the CRUD Operations Generator.

### Running the Example

From the project root:
```bash
cd example
deno run --allow-all run-demo.ts
```

Or using the npm-style task:
```bash
deno task example
```

### What Happens When You Run It

1. **Code Generation Phase**
   - Reads the 8 model definitions from `models/` directory
   - Generates complete backend code in `generated/` directory
   - Shows progress and file creation

2. **Feature Demonstration Phase**
   - Demonstrates the three-tier hooks system
   - Shows all data types in action
   - Executes all relationship types
   - Performs PostGIS spatial queries
   - Shows transaction flow

3. **Output Structure Display**
   - Shows the complete generated file structure
   - Explains what each file contains

### Understanding the Example

#### Model Files (`models/`)
- `user.json` - Demonstrates all data types and multiple relationships
- `post.json` - Shows foreign keys and many-to-many relationships
- `location.json` - PostGIS types and self-referential relationships
- `comment.json` - Simple many-to-one relationships
- `category.json` - One-to-many relationship
- `tag.json` - Many-to-many via junction table
- `role.json` - User roles with permissions
- `userprofile.json` - One-to-one relationship

#### Generated Code (`generated/`)
After running, explore the generated code to see:
- Type-safe Drizzle schemas
- Domain APIs with hooks
- REST endpoints
- Transaction management

### Customizing the Example

1. **Modify Models**: Edit any JSON file in `models/` and re-run
2. **Add Hooks**: Modify the hooks in `run-demo.ts` to see different behaviors
3. **Test Queries**: Add custom queries in the demo script

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

## 🎬 Running the Demo

When you run `run-demo.ts`, you'll see:

1. **Code Generation Output**: Shows all files being generated
2. **Feature Demonstrations**: Live examples of each feature
3. **Database Operations**: Simulated SQL showing what would execute
4. **Hook Execution**: Visual flow of pre/post/after hooks
5. **File Structure**: Complete overview of generated code

## 📚 Next Steps

After running the demo:

1. Explore the `generated/` folder to see the actual generated code
2. Modify the model definitions in `models/` and regenerate
3. Use the generated code in a real backend application
4. Connect to a real PostgreSQL database with PostGIS

## 🛠️ Customization

You can customize the generation by modifying:
- Model definitions in `models/*.json`
- Generator options in `run-demo.ts`
- Database type (PostgreSQL vs CockroachDB)
- Feature flags (soft deletes, timestamps, etc.)

---

This example demonstrates that the CRUD Operations Generator can handle complex, real-world applications with sophisticated requirements including spatial data, complex relationships, and transactional hooks.