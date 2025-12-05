/**
 * API Demo & Test Suite for COG Generated Backend
 *
 * This script demonstrates how to use the generated REST API and validates
 * that all operations work correctly. It creates entities, establishes
 * relationships, queries data, and validates responses.
 *
 * Prerequisites:
 * 1. Database must be initialized: deno task db:init
 * 2. Server must be running: deno task run
 *
 * Usage: deno task test
 * Cleanup: deno task test:clean
 */

import { Assignment, Department, Employee, IDCard, Project, SecureEntity, Skill } from '../generated/index.ts';
import {
  assert,
  assertArray,
  assertEqual,
  assertExists,
  assertIsUUID,
  encodeFilter,
  GET,
  logData,
  logSection,
  logStep,
  logSuccess,
  POST,
  PUT,
  REQUEST,
} from './http-client.ts';

// Extended types for responses with included relationships
type EmployeeWithRelations = Employee & {
  department?: Department;
  skillList?: Skill[];
  assignmentList?: Assignment[];
  idCard?: IDCard;
};

type DepartmentWithRelations = Department & {
  employeeList?: Employee[];
};

// Store created entity IDs for cleanup and relationships
const createdIds = {
  departments: [] as string[],
  employees: [] as string[],
  projects: [] as string[],
  skills: [] as string[],
  assignments: [] as string[],
  idCards: [] as string[],
  secureEntities: [] as string[],
};

/**
 * Main test execution
 */
async function main() {
  try {
    console.log('\nStarting API Demo & Test Suite...\n');

    // ========================================
    // 1. CREATE DEPARTMENTS
    // ========================================
    logSection('1. Creating Departments with Spatial Data');

    logStep('Creating Engineering department in San Francisco');
    const engineering = await POST('/api/department', {
      name: 'Engineering',
      location: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749], // San Francisco
      },
    }) as Department;

    assertExists(engineering.id, 'engineering.id');
    assertIsUUID(engineering.id, 'engineering.id');
    assertEqual(engineering.name, 'Engineering', 'Department name should match');
    assertExists(engineering.location, 'engineering.location');
    logSuccess(`Created department: ${engineering.name} (ID: ${engineering.id})`);
    createdIds.departments.push(engineering.id);

    logStep('Creating Marketing department in Los Angeles');
    const marketing = await POST('/api/department', {
      name: 'Marketing',
      location: {
        type: 'Point',
        coordinates: [-118.2437, 34.0522], // Los Angeles
      },
    }) as Department;

    assertExists(marketing.id, 'marketing.id');
    assertEqual(marketing.name, 'Marketing', 'Department name should match');
    logSuccess(`Created department: ${marketing.name} (ID: ${marketing.id})`);
    createdIds.departments.push(marketing.id);

    // ========================================
    // 2. CREATE EMPLOYEES
    // ========================================
    logSection('2. Creating Employees with Foreign Keys');

    logStep('Creating John Doe in Engineering department');
    const john = await POST('/api/employee', {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      departmentId: engineering.id,
    }) as Employee;

    assertExists(john.id, 'john.id');
    assertIsUUID(john.id, 'john.id');
    assertEqual(john.firstName, 'John', 'First name should match');
    assertEqual(john.email, 'john.doe@example.com', 'Email should match');
    assertEqual(john.departmentId, engineering.id, 'Department FK should match');
    logSuccess(`Created employee: ${john.firstName} ${john.lastName} (ID: ${john.id})`);
    createdIds.employees.push(john.id);

    logStep('Creating Jane Smith in Engineering department');
    const jane = await POST('/api/employee', {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      departmentId: engineering.id,
    }) as Employee;

    assertExists(jane.id, 'jane.id');
    assertEqual(jane.departmentId, engineering.id, 'Department FK should match');
    logSuccess(`Created employee: ${jane.firstName} ${jane.lastName} (ID: ${jane.id})`);
    createdIds.employees.push(jane.id);

    logStep('Creating Bob Wilson in Marketing department');
    const bob = await POST('/api/employee', {
      firstName: 'Bob',
      lastName: 'Wilson',
      email: 'bob.wilson@example.com',
      departmentId: marketing.id,
    }) as Employee;

    assertExists(bob.id, 'bob.id');
    assertEqual(bob.departmentId, marketing.id, 'Department FK should match');
    logSuccess(`Created employee: ${bob.firstName} ${bob.lastName} (ID: ${bob.id})`);
    createdIds.employees.push(bob.id);

    // ========================================
    // 3. CREATE SKILLS
    // ========================================
    logSection('3. Creating Skills');

    const skillNames = ['TypeScript', 'PostgreSQL', 'Deno', 'React', 'Docker'];
    const skills = [];

    for (const skillName of skillNames) {
      logStep(`Creating skill: ${skillName}`);
      const skill = await POST('/api/skill', { name: skillName }) as Skill;

      assertExists(skill.id, `skill.id for ${skillName}`);
      assertEqual(skill.name, skillName, 'Skill name should match');
      logSuccess(`Created skill: ${skill.name} (ID: ${skill.id})`);

      skills.push(skill);
      createdIds.skills.push(skill.id);
    }

    // ========================================
    // 4. ADD SKILLS TO EMPLOYEES (Many-to-Many)
    // ========================================
    logSection('4. Adding Skills to Employees (Many-to-Many)');

    logStep('Adding TypeScript and PostgreSQL skills to John');
    await POST(`/api/employee/${john.id}/skillList`, {
      ids: [skills[0].id, skills[1].id], // TypeScript, PostgreSQL
    });
    logSuccess('Skills added successfully');

    logStep('Verifying John has 2 skills');
    const johnSkills = await GET<unknown[]>(`/api/employee/${john.id}/skillList`);
    assertArray(johnSkills, 'johnSkills');
    assertEqual(johnSkills.length, 2, 'John should have 2 skills');
    logSuccess('Verified skill count');

    logStep('Adding React and Docker skills to Jane');
    await POST(`/api/employee/${jane.id}/skillList`, {
      ids: [skills[3].id, skills[4].id], // React, Docker
    });
    logSuccess('Skills added successfully');

    // ========================================
    // 5. CREATE ID CARDS (One-to-One)
    // ========================================
    logSection('5. Creating ID Cards (One-to-One Relationship)');

    logStep('Creating ID card for John');
    const johnCard = await POST('/api/idcard', {
      employeeId: john.id,
      cardNumber: 'EMP-001',
      issueDate: new Date('2024-01-01').getTime(),
      expiryDate: new Date('2029-01-01').getTime(),
    }) as IDCard;

    assertExists(johnCard.id, 'johnCard.id');
    assertEqual(johnCard.employeeId, john.id, 'Employee FK should match');
    assertEqual(johnCard.cardNumber, 'EMP-001', 'Card number should match');
    logSuccess(`Created ID card: ${johnCard.cardNumber} for ${john.firstName}`);
    createdIds.idCards.push(johnCard.id);

    // ========================================
    // 6. CREATE MENTOR RELATIONSHIPS (Self-Referential Many-to-Many)
    // ========================================
    logSection('6. Creating Mentor Relationships (Self-Referential)');

    logStep('Making John a mentor of Jane');
    await POST(`/api/employee/${john.id}/menteeList`, {
      ids: [jane.id],
    });
    logSuccess('Mentor relationship created');

    logStep('Verifying John has 1 mentee');
    const johnMentees = await GET<unknown[]>(`/api/employee/${john.id}/menteeList`);
    assertArray(johnMentees, 'johnMentees');
    assertEqual(johnMentees.length, 1, 'John should have 1 mentee');
    logSuccess('Verified mentee relationship');

    // ========================================
    // 7. CREATE PROJECTS
    // ========================================
    logSection('7. Creating Projects with Spatial Boundaries');

    logStep('Creating Mobile App project');
    const mobileApp = await POST('/api/project', {
      name: 'Mobile App Redesign',
      boundary: {
        type: 'Polygon',
        coordinates: [[
          [-122.5, 37.7],
          [-122.3, 37.7],
          [-122.3, 37.8],
          [-122.5, 37.8],
          [-122.5, 37.7],
        ]],
      },
    }) as Project;

    assertExists(mobileApp.id, 'mobileApp.id');
    assertEqual(mobileApp.name, 'Mobile App Redesign', 'Project name should match');
    logSuccess(`Created project: ${mobileApp.name} (ID: ${mobileApp.id})`);
    createdIds.projects.push(mobileApp.id);

    logStep('Creating Backend API project');
    const backendAPI = await POST('/api/project', {
      name: 'Backend API Development',
      boundary: {
        type: 'Polygon',
        coordinates: [[
          [-118.3, 34.0],
          [-118.1, 34.0],
          [-118.1, 34.1],
          [-118.3, 34.1],
          [-118.3, 34.0],
        ]],
      },
    }) as Project;

    assertExists(backendAPI.id, 'backendAPI.id');
    logSuccess(`Created project: ${backendAPI.name} (ID: ${backendAPI.id})`);
    createdIds.projects.push(backendAPI.id);

    // ========================================
    // 8. CREATE ASSIGNMENTS (Employee-Project Junction)
    // ========================================
    logSection('8. Creating Assignments (Employee-Project Relationships)');

    logStep('Assigning John to Mobile App project as Lead Developer');
    const assignment1 = await POST('/api/assignment', {
      employeeId: john.id,
      projectId: mobileApp.id,
      role: 'Lead Developer',
      hours: 40,
    }) as Assignment;

    assertExists(assignment1.id, 'assignment1.id');
    assertEqual(assignment1.employeeId, john.id, 'Employee FK should match');
    assertEqual(assignment1.projectId, mobileApp.id, 'Project FK should match');
    assertEqual(assignment1.role, 'Lead Developer', 'Role should match');
    logSuccess('Assignment created');
    createdIds.assignments.push(assignment1.id);

    logStep('Assigning Jane to Backend API project as Developer');
    const assignment2 = await POST('/api/assignment', {
      employeeId: jane.id,
      projectId: backendAPI.id,
      role: 'Developer',
      hours: 35,
    }) as Assignment;

    assertExists(assignment2.id, 'assignment2.id');
    logSuccess('Assignment created');
    createdIds.assignments.push(assignment2.id);

    logStep('Assigning Bob to Mobile App project as Designer');
    const assignment3 = await POST('/api/assignment', {
      employeeId: bob.id,
      projectId: mobileApp.id,
      role: 'UI/UX Designer',
      hours: 30,
    }) as Assignment;

    assertExists(assignment3.id, 'assignment3.id');
    logSuccess('Assignment created');
    createdIds.assignments.push(assignment3.id);

    // ========================================
    // 9. QUERY WITH INCLUDES
    // ========================================
    logSection('9. Querying with Relationship Includes');

    logStep('Getting John with department and skills included');
    const johnFull = await GET(`/api/employee/${john.id}?include=department,skillList`) as EmployeeWithRelations;

    assertExists(johnFull.department, 'johnFull.department');
    assertEqual(johnFull.department!.name, 'Engineering', 'Department name should match');
    assertArray(johnFull.skillList, 'johnFull.skillList');
    assertEqual(johnFull.skillList!.length, 2, 'Should have 2 skills included');
    logSuccess('Successfully loaded employee with relationships');
    logData('John with relationships', johnFull);

    logStep('Getting department with employee list');
    const engWithEmployees = await GET(`/api/department/${engineering.id}?include=employeeList`) as DepartmentWithRelations;

    assertArray(engWithEmployees.employeeList, 'engWithEmployees.employeeList');
    assertEqual(engWithEmployees.employeeList!.length, 2, 'Engineering should have 2 employees');
    logSuccess('Successfully loaded department with employees');

    // ========================================
    // 10. UPDATE OPERATIONS
    // ========================================
    logSection('10. Testing Update Operations');

    logStep("Updating John's first name to Johnny");
    const updatedJohn = await PUT(`/api/employee/${john.id}`, {
      firstName: 'Johnny',
    }) as Employee;

    assertEqual(updatedJohn.id, john.id, 'ID should not change');
    assertEqual(updatedJohn.firstName, 'Johnny', 'First name should be updated');
    assertEqual(updatedJohn.lastName, john.lastName, 'Last name should remain unchanged');
    logSuccess('Employee updated successfully');

    logStep('Updating assignment hours');
    const updatedAssignment = await PUT(`/api/assignment/${assignment1.id}`, {
      hours: 45,
    }) as Assignment;

    assertEqual(updatedAssignment.hours, 45, 'Hours should be updated');
    logSuccess('Assignment updated successfully');

    // ========================================
    // 10.5. ERROR HANDLING - 404 NOT FOUND
    // ========================================
    logSection('10.5. Testing 404 Error Handling');

    // Test UPDATE with non-existent ID
    logStep('Attempting to update non-existent employee (should return 404)');
    const fakeEmployeeId = crypto.randomUUID();
    const updateResponse = await REQUEST('PUT', `/api/employee/${fakeEmployeeId}`, {
      firstName: 'Should',
      lastName: 'Fail',
    });

    assertEqual(updateResponse.status, 404, 'Should return HTTP 404');
    assertEqual(updateResponse.ok, false, 'Response should not be ok');
    assertExists(updateResponse.error, 'Error message should exist');
    assert(
      updateResponse.error!.includes(fakeEmployeeId),
      'Error message should include the entity ID',
    );
    logSuccess(`✓ UPDATE returned 404 for non-existent employee: ${updateResponse.error}`);

    // Test DELETE with non-existent ID
    logStep('Attempting to delete non-existent employee (should return 404)');
    const deleteResponse = await REQUEST('DELETE', `/api/employee/${fakeEmployeeId}`);

    assertEqual(deleteResponse.status, 404, 'Should return HTTP 404');
    assertEqual(deleteResponse.ok, false, 'Response should not be ok');
    assertExists(deleteResponse.error, 'Error message should exist');
    assert(
      deleteResponse.error!.includes(fakeEmployeeId),
      'Error message should include the entity ID',
    );
    logSuccess(`✓ DELETE returned 404 for non-existent employee: ${deleteResponse.error}`);

    // Test GET with non-existent ID (should also return 404)
    logStep('Attempting to get non-existent employee (should return 404)');
    const getResponse = await REQUEST('GET', `/api/employee/${fakeEmployeeId}`);

    assertEqual(getResponse.status, 404, 'Should return HTTP 404');
    assertEqual(getResponse.ok, false, 'Response should not be ok');
    assertExists(getResponse.error, 'Error message should exist');
    logSuccess(`✓ GET returned 404 for non-existent employee: ${getResponse.error}`);

    logSuccess('All 404 error handling tests passed!');

    // ========================================
    // 11. PAGINATION AND ORDERING
    // ========================================
    logSection('11. Testing Pagination and Ordering');

    logStep('Getting employees with pagination (limit=2, offset=0)');
    const page1 = await GET<{ data: unknown[]; pagination: { total: number } }>('/api/employee?limit=2&offset=0');

    assertArray(page1.data, 'page1.data');
    assertEqual(page1.data.length, 2, 'Should return 2 employees');
    assert(page1.pagination.total >= 3, 'Total should be at least 3');
    logSuccess(`Got page 1: ${page1.data.length} employees out of ${page1.pagination.total} total`);

    logStep('Getting employees ordered by lastName ascending');
    const ordered = await GET<{ data: Array<{ lastName: string }> }>(
      '/api/employee?orderBy=lastName&orderDirection=asc',
    );

    assertArray(ordered.data, 'ordered.data');
    assert(ordered.data.length > 0, 'Should have employees');
    logSuccess('Employees ordered successfully');

    // ========================================
    // 12. LIST OPERATIONS
    // ========================================
    logSection('12. Testing List Operations');

    logStep('Listing all departments');
    const allDepts = await GET<{ data: unknown[] }>('/api/department');

    assertArray(allDepts.data, 'allDepts.data');
    assert(allDepts.data.length >= 2, 'Should have at least 2 departments');
    logSuccess(`Found ${allDepts.data.length} departments`);

    logStep('Listing all projects');
    const allProjects = await GET<{ data: unknown[] }>('/api/project');

    assertArray(allProjects.data, 'allProjects.data');
    assert(allProjects.data.length >= 2, 'Should have at least 2 projects');
    logSuccess(`Found ${allProjects.data.length} projects`);

    // ========================================
    // 13. MANY-TO-MANY RELATIONSHIP QUERIES
    // ========================================
    logSection('13. Querying Many-to-Many Relationship Endpoints');

    logStep("Getting John's skills via many-to-many endpoint");
    const johnSkillsViaEndpoint = await GET<unknown[]>(`/api/employee/${john.id}/skillList`);

    assertArray(johnSkillsViaEndpoint, 'johnSkillsViaEndpoint');
    assertEqual(johnSkillsViaEndpoint.length, 2, 'John should have 2 skills');
    logSuccess(`Found ${johnSkillsViaEndpoint.length} skills for John via many-to-many endpoint`);

    logStep("Getting John's mentees via self-referential many-to-many endpoint");
    const johnMenteesViaEndpoint = await GET<unknown[]>(`/api/employee/${john.id}/menteeList`);

    assertArray(johnMenteesViaEndpoint, 'johnMenteesViaEndpoint');
    assertEqual(johnMenteesViaEndpoint.length, 1, 'John should have 1 mentee');
    logSuccess(`Found ${johnMenteesViaEndpoint.length} mentees for John via many-to-many endpoint`);

    // ========================================
    // 12. ENDPOINT CONFIGURATION TESTS
    // ========================================
    logSection('12. Testing Endpoint Configuration (RestrictedEntity)');

    logStep('Testing that all RestrictedEntity endpoints are disabled');

    // Test readMany endpoint (GET /api/restrictedentity)
    logStep('Attempting to list RestrictedEntity (should return 404)');
    const listResponse = await REQUEST('GET', '/api/restrictedentity');
    assertEqual(listResponse.status, 404, 'GET /api/restrictedentity should return HTTP 404');
    assertEqual(listResponse.ok, false, 'Response should not be ok');
    logSuccess('✓ List endpoint correctly returns 404 (disabled)');

    // Test create endpoint (POST /api/restrictedentity)
    logStep('Attempting to create RestrictedEntity (should return 404)');
    const createResponse = await REQUEST('POST', '/api/restrictedentity', {
      name: 'Test Entity',
    });
    assertEqual(createResponse.status, 404, 'POST /api/restrictedentity should return HTTP 404');
    assertEqual(createResponse.ok, false, 'Response should not be ok');
    logSuccess('✓ Create endpoint correctly returns 404 (disabled)');

    // Test readOne endpoint (GET /api/restrictedentity/:id)
    logStep('Attempting to get RestrictedEntity by ID (should return 404)');
    const testId = crypto.randomUUID();
    const getOneResponse = await REQUEST('GET', `/api/restrictedentity/${testId}`);
    assertEqual(getOneResponse.status, 404, 'GET /api/restrictedentity/:id should return HTTP 404');
    assertEqual(getOneResponse.ok, false, 'Response should not be ok');
    logSuccess('✓ Get-by-ID endpoint correctly returns 404 (disabled)');

    // Test update endpoint (PUT /api/restrictedentity/:id)
    logStep('Attempting to update RestrictedEntity (should return 404)');
    const updateRestrictedResponse = await REQUEST('PUT', `/api/restrictedentity/${testId}`, {
      name: 'Updated Name',
    });
    assertEqual(updateRestrictedResponse.status, 404, 'PUT /api/restrictedentity/:id should return HTTP 404');
    assertEqual(updateRestrictedResponse.ok, false, 'Response should not be ok');
    logSuccess('✓ Update endpoint correctly returns 404 (disabled)');

    // Test delete endpoint (DELETE /api/restrictedentity/:id)
    logStep('Attempting to delete RestrictedEntity (should return 404)');
    const deleteRestrictedResponse = await REQUEST('DELETE', `/api/restrictedentity/${testId}`);
    assertEqual(deleteRestrictedResponse.status, 404, 'DELETE /api/restrictedentity/:id should return HTTP 404');
    assertEqual(deleteRestrictedResponse.ok, false, 'Response should not be ok');
    logSuccess('✓ Delete endpoint correctly returns 404 (disabled)');

    logSuccess('All endpoint configuration tests passed!');

    // ========================================
    // 13. FILTERING
    // ========================================
    logSection('13. Testing Filtering (where parameter)');

    // 13.1 Simple Equality Filter
    logStep('13.1 Filter employees by firstName (eq)');
    const filteredByFirstName = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'firstName', op: 'eq', value: 'Jane' })}`,
    );
    assertArray(filteredByFirstName.data, 'filteredByFirstName.data');
    assertEqual(filteredByFirstName.data.length, 1, 'Should find exactly 1 employee named Jane');
    assertEqual((filteredByFirstName.data[0] as Employee).firstName, 'Jane', 'Should be Jane');
    logSuccess('✓ Simple equality filter works');

    // 13.2 Numeric Comparison (gte)
    logStep('13.2 Filter employees created after a timestamp (gte)');
    const timestampBefore = Date.now() - 60000; // 1 minute ago
    const filteredByDate = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'createdAt', op: 'gte', value: timestampBefore })}`,
    );
    assertArray(filteredByDate.data, 'filteredByDate.data');
    assert(filteredByDate.data.length >= 1, 'Should find employees created recently');
    logSuccess('✓ Numeric comparison filter (gte) works');

    // 13.3 Pattern Matching (ilike) - case insensitive
    logStep('13.3 Filter employees by email pattern (ilike)');
    const filteredByEmail = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'email', op: 'ilike', value: '%@example.com' })}`,
    );
    assertArray(filteredByEmail.data, 'filteredByEmail.data');
    assert(filteredByEmail.data.length >= 3, 'Should find all employees with @example.com emails');
    logSuccess('✓ Pattern matching filter (ilike) works');

    // 13.4 IN Operator
    logStep('13.4 Filter employees by firstName IN list');
    const filteredByIn = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'firstName', op: 'in', value: ['Jane', 'Bob'] })}`,
    );
    assertArray(filteredByIn.data, 'filteredByIn.data');
    assertEqual(filteredByIn.data.length, 2, 'Should find Jane and Bob');
    const names = filteredByIn.data.map((e) => (e as Employee).firstName).sort();
    assert(names.includes('Jane') && names.includes('Bob'), 'Should include Jane and Bob');
    logSuccess('✓ IN operator filter works');

    // 13.5 Nested AND Filter
    logStep('13.5 Filter with AND (department AND firstName)');
    const filteredByAnd = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${
        encodeFilter({
          and: [
            { field: 'departmentId', op: 'eq', value: engineering.id },
            { field: 'firstName', op: 'eq', value: 'Jane' },
          ],
        })
      }`,
    );
    assertArray(filteredByAnd.data, 'filteredByAnd.data');
    assertEqual(filteredByAnd.data.length, 1, 'Should find only Jane in Engineering');
    assertEqual((filteredByAnd.data[0] as Employee).firstName, 'Jane', 'Should be Jane');
    assertEqual((filteredByAnd.data[0] as Employee).departmentId, engineering.id, 'Should be in Engineering');
    logSuccess('✓ Nested AND filter works');

    // 13.6 Nested OR Filter
    logStep('13.6 Filter with OR (firstName OR firstName)');
    const filteredByOr = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${
        encodeFilter({
          or: [
            { field: 'firstName', op: 'eq', value: 'Jane' },
            { field: 'firstName', op: 'eq', value: 'Bob' },
          ],
        })
      }`,
    );
    assertArray(filteredByOr.data, 'filteredByOr.data');
    assertEqual(filteredByOr.data.length, 2, 'Should find Jane and Bob via OR');
    logSuccess('✓ Nested OR filter works');

    // 13.7 Complex Nested AND/OR
    logStep('13.7 Filter with complex AND/OR nesting');
    const filteredComplex = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${
        encodeFilter({
          and: [
            { field: 'departmentId', op: 'eq', value: engineering.id },
            {
              or: [
                { field: 'firstName', op: 'eq', value: 'Johnny' }, // Updated John -> Johnny earlier
                { field: 'firstName', op: 'eq', value: 'Jane' },
              ],
            },
          ],
        })
      }`,
    );
    assertArray(filteredComplex.data, 'filteredComplex.data');
    assertEqual(filteredComplex.data.length, 2, 'Should find Johnny and Jane in Engineering');
    logSuccess('✓ Complex nested AND/OR filter works');

    // 13.8 isNull Operator - Test on createdAt (never null for existing records)
    logStep('13.8 Test isNull operator');

    // Filter employees where createdAt is NOT null (all employees should match)
    const employeesCreatedAtNotNull = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'createdAt', op: 'isNull', value: false })}`,
    );
    assertArray(employeesCreatedAtNotNull.data, 'employeesCreatedAtNotNull.data');
    assert(employeesCreatedAtNotNull.data.length >= 3, 'Should find all employees (createdAt is never null)');
    logSuccess('✓ isNull: false filter works');

    // Filter employees where createdAt IS null (none should match)
    const employeesCreatedAtNull = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'createdAt', op: 'isNull', value: true })}`,
    );
    assertArray(employeesCreatedAtNull.data, 'employeesCreatedAtNull.data');
    assertEqual(employeesCreatedAtNull.data.length, 0, 'Should find no employees with null createdAt');
    assertEqual(employeesCreatedAtNull.pagination.total, 0, 'Total should be 0');
    logSuccess('✓ isNull: true filter works');

    // 13.9 Filter with Pagination
    logStep('13.9 Filter with pagination');
    const filteredWithPagination = await GET<{ data: Employee[]; pagination: { total: number; limit: number; offset: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'departmentId', op: 'eq', value: engineering.id })}&limit=1&offset=0`,
    );
    assertArray(filteredWithPagination.data, 'filteredWithPagination.data');
    assertEqual(filteredWithPagination.data.length, 1, 'Should return 1 employee (limit=1)');
    assertEqual(filteredWithPagination.pagination.total, 2, 'Total should be 2 (Johnny and Jane in Engineering)');
    assertEqual(filteredWithPagination.pagination.limit, 1, 'Limit should be 1');
    logSuccess('✓ Filter with pagination works');

    // 13.10 Filter with Include
    logStep('13.10 Filter with include');
    const filteredWithInclude = await GET<{ data: EmployeeWithRelations[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'firstName', op: 'eq', value: 'Jane' })}&include=department,skillList`,
    );
    assertArray(filteredWithInclude.data, 'filteredWithInclude.data');
    assertEqual(filteredWithInclude.data.length, 1, 'Should find Jane');
    assertExists((filteredWithInclude.data[0] as EmployeeWithRelations).department, 'Department should be included');
    assertArray((filteredWithInclude.data[0] as EmployeeWithRelations).skillList, 'skillList should be included');
    logSuccess('✓ Filter with include works');

    // 13.11 Error Cases
    logStep('13.11 Error cases - Invalid field name');
    const invalidFieldResult = await REQUEST(
      'GET',
      `/api/employee?where=${encodeFilter({ field: 'nonexistent', op: 'eq', value: 'x' })}`,
    );
    assertEqual(invalidFieldResult.status, 400, 'Invalid field should return 400');
    assert(
      (invalidFieldResult.error?.toLowerCase().includes('unknown') || invalidFieldResult.error?.toLowerCase().includes('field')) ?? false,
      'Error should mention unknown field',
    );
    logSuccess('✓ Invalid field returns 400');

    logStep('13.11 Error cases - Malformed base64');
    const malformedBase64Result = await REQUEST('GET', '/api/employee?where=not-valid-base64!!!');
    assertEqual(malformedBase64Result.status, 400, 'Malformed base64 should return 400');
    logSuccess('✓ Malformed base64 returns 400');

    logStep('13.11 Error cases - Invalid JSON');
    const invalidJsonResult = await REQUEST('GET', `/api/employee?where=${btoa('not json')}`);
    assertEqual(invalidJsonResult.status, 400, 'Invalid JSON should return 400');
    logSuccess('✓ Invalid JSON returns 400');

    // 13.12 Empty Filter (no results)
    logStep('13.12 Filter with no matching results');
    const emptyResult = await GET<{ data: Employee[]; pagination: { total: number } }>(
      `/api/employee?where=${encodeFilter({ field: 'firstName', op: 'eq', value: 'NonexistentName12345' })}`,
    );
    assertArray(emptyResult.data, 'emptyResult.data');
    assertEqual(emptyResult.data.length, 0, 'Should return empty array');
    assertEqual(emptyResult.pagination.total, 0, 'Total should be 0');
    logSuccess('✓ Empty filter result works');

    logSuccess('All filtering tests passed!');

    // ========================================
    // 14. FIELD EXPOSURE CONTROL
    // ========================================
    logSection('14. Testing Field Exposure Control (exposed: false)');

    // 14.1 Create SecureEntity with unexposed fields
    logStep('14.1 Create SecureEntity with secret fields');
    const secureEntity = await POST('/api/secureentity', {
      publicName: 'Test Entity',
      secretToken: 'super-secret-token-123',
      internalScore: 42,
    }) as SecureEntity;

    assertExists(secureEntity.id, 'secureEntity.id should exist');
    assertEqual(secureEntity.publicName, 'Test Entity', 'publicName should be present');
    assert(!('secretToken' in secureEntity), 'secretToken should be stripped from POST response');
    assert(!('internalScore' in secureEntity), 'internalScore should be stripped from POST response');
    createdIds.secureEntities.push(secureEntity.id);
    logSuccess('✓ Unexposed fields stripped from POST response');

    // 14.2 Unexposed fields stripped from GET by ID
    logStep('14.2 Get SecureEntity by ID - verify unexposed fields stripped');
    const fetchedEntity = await GET<SecureEntity>(`/api/secureentity/${secureEntity.id}`);
    assertExists(fetchedEntity, 'fetchedEntity should exist');
    assertEqual(fetchedEntity.publicName, 'Test Entity', 'publicName should be present');
    assert(!('secretToken' in fetchedEntity), 'secretToken should be stripped from GET by ID');
    assert(!('internalScore' in fetchedEntity), 'internalScore should be stripped from GET by ID');
    logSuccess('✓ Unexposed fields stripped from GET by ID response');

    // 14.3 Unexposed fields stripped from list response
    logStep('14.3 List SecureEntities - verify unexposed fields stripped');
    const entityList = await GET<{ data: SecureEntity[] }>('/api/secureentity');
    assertArray(entityList.data, 'entityList.data should be array');
    assert(entityList.data.length >= 1, 'Should have at least 1 entity');
    for (const item of entityList.data) {
      assert(!('secretToken' in (item as Record<string, unknown>)), 'secretToken should be stripped from list items');
      assert(!('internalScore' in (item as Record<string, unknown>)), 'internalScore should be stripped from list items');
    }
    logSuccess('✓ Unexposed fields stripped from list response');

    // 14.4 Unexposed fields stripped from PUT response
    logStep('14.4 Update SecureEntity - verify unexposed fields stripped');
    const updatedEntity = await PUT(`/api/secureentity/${secureEntity.id}`, {
      publicName: 'Updated Entity',
    }) as SecureEntity;
    assertEqual(updatedEntity.publicName, 'Updated Entity', 'publicName should be updated');
    assert(!('secretToken' in updatedEntity), 'secretToken should be stripped from PUT response');
    assert(!('internalScore' in updatedEntity), 'internalScore should be stripped from PUT response');
    logSuccess('✓ Unexposed fields stripped from PUT response');

    // 14.5 Filter on unexposed field should return 400
    logStep('14.5 Filter on unexposed string field (secretToken) - should return 400');
    const filterSecretTokenResult = await REQUEST(
      'GET',
      `/api/secureentity?where=${encodeFilter({ field: 'secretToken', op: 'eq', value: 'x' })}`,
    );
    assertEqual(filterSecretTokenResult.status, 400, 'Filtering on unexposed field should return 400');
    assert(
      (filterSecretTokenResult.error?.toLowerCase().includes('not filterable') ||
        filterSecretTokenResult.error?.toLowerCase().includes('secrettoken')) ?? false,
      'Error should mention field is not filterable',
    );
    logSuccess('✓ Filtering on unexposed string field returns 400');

    // 14.6 Filter on unexposed integer field should return 400
    logStep('14.6 Filter on unexposed integer field (internalScore) - should return 400');
    const filterInternalScoreResult = await REQUEST(
      'GET',
      `/api/secureentity?where=${encodeFilter({ field: 'internalScore', op: 'gte', value: 10 })}`,
    );
    assertEqual(filterInternalScoreResult.status, 400, 'Filtering on unexposed integer field should return 400');
    logSuccess('✓ Filtering on unexposed integer field returns 400');

    // 14.7 Filter on exposed field should still work
    logStep('14.7 Filter on exposed field (publicName) - should work');
    const filterExposedResult = await GET<{ data: SecureEntity[]; pagination: { total: number } }>(
      `/api/secureentity?where=${encodeFilter({ field: 'publicName', op: 'eq', value: 'Updated Entity' })}`,
    );
    assertArray(filterExposedResult.data, 'filterExposedResult.data');
    assert(filterExposedResult.data.length >= 1, 'Should find at least 1 entity');
    assertEqual((filterExposedResult.data[0] as SecureEntity).publicName, 'Updated Entity', 'Should match the updated entity');
    logSuccess('✓ Filtering on exposed field works correctly');

    logSuccess('All field exposure tests passed!');

    // ========================================
    // SUCCESS
    // ========================================
    logSection('All Tests Passed!');
    console.log('\nSummary:');
    console.log(`  Departments created: ${createdIds.departments.length}`);
    console.log(`  Employees created: ${createdIds.employees.length}`);
    console.log(`  Skills created: ${createdIds.skills.length}`);
    console.log(`  Projects created: ${createdIds.projects.length}`);
    console.log(`  Assignments created: ${createdIds.assignments.length}`);
    console.log(`  ID Cards created: ${createdIds.idCards.length}`);
    console.log(`  Secure Entities created: ${createdIds.secureEntities.length}`);
    console.log(`\nTip: Run 'deno task db:clean' to remove test data\n`);

    Deno.exit(0);
  } catch (error) {
    console.error('\nTest suite failed!');
    console.error(error);
    Deno.exit(1);
  }
}

// Run the test suite
if (import.meta.main) {
  main();
}
