/**
 * Test Data Cleanup Script
 *
 * Safely deletes all test data created by the api-demo.ts script.
 * Deletes records in reverse dependency order to avoid FK violations.
 *
 * Prerequisites:
 * - Server must be running: deno task run
 *
 * Usage: deno task test:clean
 */

import { DELETE, GET, logSection, logStep, logSuccess } from './http-client.ts';

/**
 * Safely delete a resource, ignoring 404 errors
 */
async function safeDelete(path: string, description: string): Promise<boolean> {
  try {
    await DELETE(path);
    console.log(`  Deleted: ${description}`);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      console.log(`  Not found (already deleted): ${description}`);
      return false;
    }
    console.error(`  Failed to delete: ${description}`);
    console.error(`    Error: ${error}`);
    return false;
  }
}

/**
 * Get all records of a given type and extract their IDs
 */
async function getAllIds(endpoint: string): Promise<string[]> {
  try {
    const response = await GET<{ data: Array<{ id: string }> }>(endpoint);
    return response.data.map((item) => item.id);
  } catch (error) {
    console.error(`  Failed to fetch ${endpoint}:`, error);
    return [];
  }
}

/**
 * Delete many-to-many junction table records
 */
async function cleanupManyToMany(
  parentEndpoint: string,
  parentIds: string[],
  relationshipName: string,
  description: string,
): Promise<number> {
  let deletedCount = 0;

  for (const parentId of parentIds) {
    try {
      // Get the related records
      const related = await GET<{ data: Array<{ id: string }> }>(
        `${parentEndpoint}/${parentId}/${relationshipName}`,
      );

      if (related.data && related.data.length > 0) {
        const relatedIds = related.data.map((item) => item.id);

        // Remove the relationships
        await DELETE(`${parentEndpoint}/${parentId}/${relationshipName}?ids=${relatedIds.join(',')}`);
        deletedCount += relatedIds.length;
        console.log(`  Removed ${relatedIds.length} ${description} relationships`);
      }
    } catch (error) {
      // Relationship might not exist or already deleted, continue
      if (!(error instanceof Error && error.message.includes('404'))) {
        console.log(`  Could not clean ${description} for ${parentId}`);
      }
    }
  }

  return deletedCount;
}

/**
 * Main cleanup execution
 */
async function main() {
  console.log('\nStarting Test Data Cleanup...\n');

  let totalDeleted = 0;

  try {
    // ========================================
    // 1. GET ALL IDS
    // ========================================
    logSection('1. Discovering Test Data');

    logStep('Finding all assignments');
    const assignmentIds = await getAllIds('/api/assignment');
    console.log(`  Found ${assignmentIds.length} assignments`);

    logStep('Finding all employees');
    const employeeIds = await getAllIds('/api/employee');
    console.log(`  Found ${employeeIds.length} employees`);

    logStep('Finding all ID cards');
    const idCardIds = await getAllIds('/api/idcard');
    console.log(`  Found ${idCardIds.length} ID cards`);

    logStep('Finding all skills');
    const skillIds = await getAllIds('/api/skill');
    console.log(`  Found ${skillIds.length} skills`);

    logStep('Finding all projects');
    const projectIds = await getAllIds('/api/project');
    console.log(`  Found ${projectIds.length} projects`);

    logStep('Finding all departments');
    const departmentIds = await getAllIds('/api/department');
    console.log(`  Found ${departmentIds.length} departments`);

    logStep('Finding all secure entities');
    const secureEntityIds = await getAllIds('/api/secureentity');
    console.log(`  Found ${secureEntityIds.length} secure entities`);

    // ========================================
    // 2. DELETE JUNCTION TABLE RECORDS
    // ========================================
    logSection('2. Cleaning Many-to-Many Relationships');

    logStep('Removing employee-skill relationships');
    const skillRelCount = await cleanupManyToMany('/api/employee', employeeIds, 'skillList', 'employee-skill');
    totalDeleted += skillRelCount;

    logStep('Removing employee-mentor relationships (mentees)');
    const menteeRelCount = await cleanupManyToMany('/api/employee', employeeIds, 'menteeList', 'mentor-mentee');
    totalDeleted += menteeRelCount;

    logStep('Removing employee-mentor relationships (mentors)');
    const mentorRelCount = await cleanupManyToMany('/api/employee', employeeIds, 'mentorList', 'mentor-mentee');
    totalDeleted += mentorRelCount;

    logSuccess('Junction tables cleaned');

    // ========================================
    // 3. DELETE ASSIGNMENTS (depends on Employee + Project)
    // ========================================
    logSection('3. Deleting Assignments');

    for (const id of assignmentIds) {
      if (await safeDelete(`/api/assignment/${id}`, `assignment ${id.slice(0, 8)}`)) {
        totalDeleted++;
      }
    }

    // ========================================
    // 4. DELETE ID CARDS (depends on Employee)
    // ========================================
    logSection('4. Deleting ID Cards');

    for (const id of idCardIds) {
      if (await safeDelete(`/api/idcard/${id}`, `ID card ${id.slice(0, 8)}`)) {
        totalDeleted++;
      }
    }

    // ========================================
    // 5. DELETE EMPLOYEES (depends on Department)
    // ========================================
    logSection('5. Deleting Employees');

    for (const id of employeeIds) {
      if (await safeDelete(`/api/employee/${id}`, `employee ${id.slice(0, 8)}`)) {
        totalDeleted++;
      }
    }

    // ========================================
    // 6. DELETE SKILLS
    // ========================================
    logSection('6. Deleting Skills');

    for (const id of skillIds) {
      if (await safeDelete(`/api/skill/${id}`, `skill ${id.slice(0, 8)}`)) {
        totalDeleted++;
      }
    }

    // ========================================
    // 7. DELETE PROJECTS
    // ========================================
    logSection('7. Deleting Projects');

    for (const id of projectIds) {
      if (await safeDelete(`/api/project/${id}`, `project ${id.slice(0, 8)}`)) {
        totalDeleted++;
      }
    }

    // ========================================
    // 8. DELETE DEPARTMENTS
    // ========================================
    logSection('8. Deleting Departments');

    for (const id of departmentIds) {
      if (await safeDelete(`/api/department/${id}`, `department ${id.slice(0, 8)}`)) {
        totalDeleted++;
      }
    }

    // ========================================
    // 9. DELETE SECURE ENTITIES
    // ========================================
    logSection('9. Deleting Secure Entities');

    for (const id of secureEntityIds) {
      if (await safeDelete(`/api/secureentity/${id}`, `secure entity ${id.slice(0, 8)}`)) {
        totalDeleted++;
      }
    }

    // ========================================
    // SUCCESS
    // ========================================
    logSection('Cleanup Complete!');
    console.log(`\nSummary: Deleted ${totalDeleted} records\n`);

    Deno.exit(0);
  } catch (error) {
    console.error('\nCleanup failed!');
    console.error(error);
    Deno.exit(1);
  }
}

// Run the cleanup
if (import.meta.main) {
  main();
}
