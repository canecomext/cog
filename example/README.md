# Corporate ORM Example

Complete demonstration of COG features through a 9-model Corporate ORM system.

---

## What This Demonstrates

This example showcases every major COG feature through interconnected business models.

### Models Overview

| Model | Key Features |
|-------|--------------|
| **Employee** | All relationship types, self-referential many-to-many (mentors/mentees), composite indexes |
| **Department** | PostGIS point field, GIST spatial index, one-to-many relationships |
| **Project** | PostGIS polygon field, GIST spatial index, one-to-many relationships |
| **Assignment** | Junction-like table, composite unique index, foreign key CASCADE actions |
| **IDCard** | One-to-one relationship, date fields, unique constraints |
| **Skill** | Many-to-many with Employee via `employee_skill` junction table |
| **DataTypeDemo** | All primitive types (text, bigint, decimal, json, jsonb, boolean), enums, arrays, GIN indexes |
| **SpatialDemo** | All PostGIS types (linestring, multipoint, multilinestring, multipolygon, geometry, geography), custom SRIDs |
| **AdvancedDemo** | Custom schema (`analytics`), self-referential relationships, check constraints, named indexes with WHERE clauses |

### Relationship Types Demonstrated

```
Employee ──[manyToOne]──→ Department
Employee ──[oneToMany]──→ Assignment
Employee ──[oneToOne]───→ IDCard
Employee ──[manyToMany]─→ Skill (via employee_skill)
Employee ──[manyToMany]─→ Employee (mentors/mentees via employee_mentor)

Department ──[oneToMany]──→ Employee
Project ──[oneToMany]─────→ Assignment
Assignment ──[manyToOne]──→ Employee
Assignment ──[manyToOne]──→ Project
IDCard ──[oneToOne]───────→ Employee
Skill ──[manyToMany]──────→ Employee

AdvancedDemo ──[manyToOne]──→ AdvancedDemo (parent)
AdvancedDemo ──[oneToMany]──→ AdvancedDemo (children)
```

### Features Demonstrated

**Data Types:**
- Primitives: `text`, `string`, `integer`, `bigint`, `decimal`, `boolean`, `date`, `uuid`
- Structured: `json`, `jsonb`, `enum` (Status, Priority)
- Spatial: `point`, `polygon`, `linestring`, `multipoint`, `multilinestring`, `multipolygon`, `geometry`, `geography`
- Arrays: `string[]`, `integer[]`

**Index Types:**
- BTREE (standard, composite, named)
- GIN (for JSONB and arrays)
- GIST (for PostGIS spatial data)
- Partial indexes with WHERE clauses

**Check Constraints:**
- `numNotNulls` - Require N of M fields to be non-null (AdvancedDemo)

**Foreign Key Actions:**
- `CASCADE` (Assignment → Employee/Project)
- `SET NULL` (AdvancedDemo → parent)
- `RESTRICT` (Employee → Department)
- `NO ACTION` (AdvancedDemo → related)

**Hooks System:**
- **Domain Hooks** - Employee model (all CRUD operations, within transaction)
- **REST Hooks** - Department model (HTTP layer, no transaction)
- **Junction Hooks** - Employee.skillList (many-to-many operations)

**Advanced Features:**
- Custom database schemas (`analytics` for AdvancedDemo)
- Self-referential relationships (Employee mentors, AdvancedDemo hierarchy)
- Named indexes with WHERE clauses
- Composite unique constraints
- Custom SRIDs (4326 for WGS 84, 3857 for Web Mercator)
- Custom Hono context variables (`Env` type)

---

## Quick Start

### 1. Database Setup

Create a PostgreSQL database with PostGIS:

```sql
CREATE DATABASE corporate_orm;
\c corporate_orm
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA analytics;
```

### 2. Environment Configuration

Create `.env` file:

```bash
DB_URL=postgresql://user:password@localhost:5432/corporate_orm
DB_SSL_CA_FILE=path/to/ca-certificate.crt  # Or leave empty for local dev
```

For local development without SSL, modify `src/main.ts` to remove the `ssl` option.

### 3. Generate Code

**For PostgreSQL:**
```bash
deno task cog:psql:generate
```

**For CockroachDB:**
```bash
deno task cog:crdb:generate
```

### 4. Initialize Database

```bash
deno task db:init
```

This creates all tables, indexes, relationships, and check constraints.

### 5. Start Server

```bash
deno task run
```

Server starts at `http://localhost:3000`

---

## API Endpoints

COG generates REST endpoints for each model:

### Employee Endpoints

```
GET    /api/employee                    # List employees (paginated)
POST   /api/employee                    # Create employee
GET    /api/employee/:id                # Get employee by ID
PUT    /api/employee/:id                # Update employee
DELETE /api/employee/:id                # Delete employee
GET    /api/employee/:id/assignmentList # Get employee's assignments
GET    /api/employee/:id/skillList      # Get employee's skills
GET    /api/employee/:id/menteeList     # Get employee's mentees
GET    /api/employee/:id/mentorList     # Get employee's mentors
```

### Department Endpoints

```
GET    /api/department                  # List departments
POST   /api/department                  # Create department
GET    /api/department/:id              # Get department by ID
PUT    /api/department/:id              # Update department
DELETE /api/department/:id              # Delete department
GET    /api/department/:id/employeeList # Get department's employees
```

### Project Endpoints

```
GET    /api/project                     # List projects
POST   /api/project                     # Create project
GET    /api/project/:id                 # Get project by ID
PUT    /api/project/:id                 # Update project
DELETE /api/project/:id                 # Delete project
GET    /api/project/:id/assignmentList  # Get project's assignments
```

**Similar patterns apply to all other models.**

### Query Parameters

All `GET` list endpoints support:
- `limit` - Pagination limit (default: 10)
- `offset` - Pagination offset (default: 0)
- `orderBy` - Sort field (e.g., `createdAt`)
- `order` - Sort direction (`asc` or `desc`)

---

## Example API Calls

### Create Department

```bash
curl -X POST http://localhost:3000/api/department \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering",
    "location": {
      "type": "Point",
      "coordinates": [-122.4194, 37.7749]
    }
  }'
```

### Create Employee

```bash
curl -X POST http://localhost:3000/api/employee \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Alice",
    "lastName": "Johnson",
    "email": "alice@example.com",
    "departmentId": "uuid-of-department"
  }'
```

### Create Skill

```bash
curl -X POST http://localhost:3000/api/skill \
  -H "Content-Type: application/json" \
  -d '{ "name": "TypeScript" }'
```

### Add Skill to Employee (Many-to-Many)

```bash
curl -X POST http://localhost:3000/api/employee/:employeeId/skillList/:skillId
```

### Create Project

```bash
curl -X POST http://localhost:3000/api/project \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform Rewrite",
    "boundary": {
      "type": "Polygon",
      "coordinates": [[
        [-122.5, 37.7],
        [-122.4, 37.7],
        [-122.4, 37.8],
        [-122.5, 37.8],
        [-122.5, 37.7]
      ]]
    }
  }'
```

### Assign Employee to Project

```bash
curl -X POST http://localhost:3000/api/assignment \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "uuid-of-employee",
    "projectId": "uuid-of-project",
    "role": "Senior Engineer",
    "hours": 40
  }'
```

### Create Record with Check Constraint

```bash
curl -X POST http://localhost:3000/api/advanceddemo \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Record",
    "optionalField1": "value1",
    "optionalField2": 42,
    "isActive": true
  }'
```

**Note:** At least 2 of the 3 optional fields must be non-null due to check constraint.

### Query with Pagination

```bash
curl "http://localhost:3000/api/employee?limit=20&offset=0&orderBy=lastName&order=asc"
```

---

## Documentation

### OpenAPI Specification

- **JSON Spec**: http://localhost:3000/docs/openapi.json
- **Interactive Docs**: http://localhost:3000/docs/reference

The interactive docs (powered by Scalar) provide:
- All endpoints with request/response schemas
- Try-it-out functionality
- Generated type definitions
- Relationship documentation

---

## Hook Implementations

This example demonstrates both hook types:

### Domain Hooks (Employee)

```typescript
domainHooks: {
  employee: {
    // All CRUD operations (pre/post/after)
    preCreate: async (input, tx, context) => { /* ... */ },
    postCreate: async (input, result, tx, context) => { /* ... */ },
    afterCreate: async (result, context) => { /* ... */ },

    // Junction table operations (many-to-many)
    skillListJunctionHooks: {
      preAddJunction: async (ids, tx, context) => { /* ... */ },
      postAddJunction: async (ids, tx, context) => { /* ... */ },
      afterAddJunction: async (ids, context) => { /* ... */ },
    }
  }
}
```

**Use domain hooks for:**
- Data validation with database access
- Enriching data with related records
- Enforcing business rules
- Side effects within transaction

### REST Hooks (Department)

```typescript
restHooks: {
  department: {
    // All CRUD operations at HTTP layer
    preCreate: async (input, c, context) => {
      console.log('Request from:', c.req.header('user-agent'));
      return { data: input, context };
    },
    postCreate: async (input, result, c, context) => {
      c.header('X-Resource-Id', result.id);
      return { data: result, context };
    }
  }
}
```

**Use REST hooks for:**
- HTTP-specific operations (headers, logging)
- Authorization checks
- Request/response transformation
- Rate limiting

### Custom Context Variables

```typescript
// Define custom Env type in context.ts
type Env = {
  Variables: {
    someString: string;
    someDeepStructure: { someOtherString: Date };
  };
};

// Set in middleware
app.use('*', async (c, next) => {
  c.set('someString', crypto.randomUUID());
  c.set('someDeepStructure', { someOtherString: new Date() });
  await next();
});

// Access in REST hooks
preCreate: (input, c, context) => {
  const value = c.get('someString');
  // ...
}
```

---

## Model Files

All model definitions are in `models/` directory:

```
models/
├── employee.json         # Core entity with all relationships
├── department.json       # PostGIS point + one-to-many
├── project.json          # PostGIS polygon + one-to-many
├── assignment.json       # Junction-like table
├── idcard.json          # One-to-one relationship
├── skill.json           # Many-to-many with Employee
├── datatypedemo.json    # Primitive types, enums, arrays
├── spatialdemo.json     # All PostGIS types
└── advanceddemo.json    # Advanced features showcase
```

---

## Database Compatibility

This example works with both PostgreSQL and CockroachDB:

**PostgreSQL:**
- Full PostGIS support (GEOGRAPHY + GEOMETRY)
- All index types (BTREE, GIN, GIST)
- Enums supported (all versions)

**CockroachDB:**
- PostGIS GEOMETRY support (GEOGRAPHY auto-converts)
- All index types (BTREE, GIN, GIST)
- Enums supported (v22.2+)

Generate with appropriate flag:
- PostgreSQL: `deno task cog:psql:generate`
- CockroachDB: `deno task cog:crdb:generate`

---

## Project Structure

```
example/
├── models/                    # JSON model definitions
│   ├── employee.json
│   ├── department.json
│   └── ...
├── src/
│   ├── main.ts               # Server setup with hooks
│   ├── context.ts            # Custom Env type definition
│   └── generated/            # COG-generated code
│       ├── db/               # Database connection
│       ├── schema/           # Drizzle schemas + Zod
│       ├── domain/           # Business logic
│       └── rest/             # REST endpoints + OpenAPI
├── db-init.ts                # Database initialization script
├── deno.json                 # Dependencies + tasks
└── .env                      # Database configuration
```

---

## Key Takeaways

This example demonstrates:

1. **Layered Architecture**: REST → Domain → Schema → Database
2. **Type Safety**: Full TypeScript types generated from JSON models
3. **Hook System**: Two types (Domain + REST) for different concerns
4. **Spatial Data**: Complete PostGIS integration with multiple SRIDs
5. **Relationships**: All types including self-referential and many-to-many
6. **Validation**: Always-on Zod validation at every layer
7. **Database Compatibility**: Works with PostgreSQL and CockroachDB
8. **Check Constraints**: Database-level validation beyond simple types
9. **OpenAPI**: Auto-generated documentation for all endpoints

**See [../README.md](../README.md) for COG overview and [../WARP.md](../WARP.md) for complete technical reference.**
