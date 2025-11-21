# COG API Test Suite

This directory contains executable scripts that demonstrate how to use the generated REST API and validate that all operations work correctly.

## Files

- **`http-client.ts`** - HTTP helper utilities and validation functions
- **`api-demo.ts`** - Main demonstration and test script
- **`cleanup.ts`** - Data cleanup script

## Prerequisites

1. **Initialize the database:**
   ```bash
   deno task db:init
   ```

2. **Start the server:**
   ```bash
   deno task run
   ```

   The server should be running on `http://localhost:3000`

## Usage

### Run the Test Suite

```bash
deno task test
```

This will:
- Create departments with spatial data
- Create employees and link them to departments
- Create skills and add them to employees (many-to-many)
- Create projects with spatial boundaries
- Create assignments (employee-project relationships)
- Create ID cards (one-to-one relationships)
- Create mentor relationships (self-referential many-to-many)
- Query data with relationship includes
- Update records
- Test pagination and ordering
- Validate all responses

### Clean Up Test Data

```bash
deno task test:clean
```

This will safely delete all test data in the correct order to avoid foreign key violations.

## What Gets Tested

### Basic Operations
- ✅ Create operations (POST)
- ✅ Read operations (GET by ID)
- ✅ Update operations (PUT)
- ✅ List operations (GET with pagination)
- ✅ Delete operations (via cleanup script)

### Relationships
- ✅ One-to-Many (Department → Employees)
- ✅ Many-to-One (Employee → Department)
- ✅ One-to-One (Employee → IDCard)
- ✅ Many-to-Many (Employee ↔ Skills)
- ✅ Self-Referential (Employee mentors/mentees)
- ✅ Junction Tables (Employee-Project Assignments)

### Query Features
- ✅ Include related data (`?include=department,skillList`)
- ✅ Pagination (`?limit=10&offset=0`)
- ✅ Ordering (`?orderBy=lastName&orderDirection=asc`)

### Advanced Features
- ✅ PostGIS spatial data (Point, Polygon) with GeoJSON format
- ✅ Foreign key constraints
- ✅ Unique constraints
- ✅ Timestamps (createdAt, updatedAt) as EPOCH milliseconds
- ✅ Date fields as EPOCH millisecond integers

## Response Validation

The test suite validates:
- ✓ Generated UUIDs are valid
- ✓ Response data matches request data
- ✓ Foreign keys are properly set
- ✓ Relationships are correctly established
- ✓ Updates actually change values
- ✓ Includes return related data
- ✓ Pagination returns correct counts

## Example Flow

```typescript
// 1. Create a department
const engineering = await POST('/api/department', {
  name: 'Engineering',
  location: { type: 'Point', coordinates: [-122.4194, 37.7749] }
});

// 2. Create an employee linked to that department
const john = await POST('/api/employee', {
  firstName: 'John',
  email: 'john@example.com',
  departmentId: engineering.id  // Use the generated ID
});

// 3. Create skills
const typescript = await POST('/api/skill', { name: 'TypeScript' });

// 4. Add skills to employee (many-to-many)
await POST(`/api/employee/${john.id}/skillList`, {
  ids: [typescript.id]
});

// 5. Query with relationships included
const johnWithSkills = await GET(
  `/api/employee/${john.id}?include=department,skillList`
);

// Validate the response
assert(johnWithSkills.department.name === 'Engineering');
assert(johnWithSkills.skillList.length === 1);
```

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Debugging

If tests fail, check:
1. Is the database initialized? (`deno task db:init`)
2. Is the server running? (`deno task run`)
3. Is the server on port 3000?
4. Are there existing test records? Run cleanup first

## Educational Value

This test suite serves as:
- Living documentation for the API
- Examples of how to use relationships
- Validation that COG-generated code works
- Starting point for your own integration tests
