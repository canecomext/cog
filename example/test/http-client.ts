/**
 * Simple HTTP client for testing the generated API
 */

const BASE_URL = 'http://localhost:3000';

export interface HttpResponse<T> {
  data: T;
  status: number;
}

/**
 * Make a GET request
 */
export async function GET<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GET ${path} failed: ${response.status} ${error}`);
  }

  const json = await response.json();
  // Return the full response for endpoints that have pagination
  // Otherwise unwrap data
  if (json.pagination !== undefined) {
    return json;
  }
  return json.data || json;
}

/**
 * Make a POST request
 */
export async function POST<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`POST ${path} failed: ${response.status} ${error}`);
  }

  const json = await response.json();
  return json.data;
}

/**
 * Make a PUT request
 */
export async function PUT<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PUT ${path} failed: ${response.status} ${error}`);
  }

  const json = await response.json();
  return json.data;
}

/**
 * Make a DELETE request
 */
export async function DELETE<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DELETE ${path} failed: ${response.status} ${error}`);
  }

  const json = await response.json();
  return json.data;
}

/**
 * Make a request that may fail and return full response info
 * Used for testing error responses (404, 500, etc.)
 */
export async function REQUEST(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; ok: boolean; data?: unknown; error?: string }> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.ok) {
    const json = await response.json();
    return { status: response.status, ok: true, data: json.data };
  } else {
    const errorText = await response.text();
    let error = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      error = errorJson.error || errorText;
    } catch {
      // Keep errorText as-is if not JSON
    }
    return { status: response.status, ok: false, error };
  }
}

/**
 * Validation helpers
 */

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    console.error(`${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual: ${actual}`);
    throw new Error(message);
  }
}

export function assertExists<T>(value: T | null | undefined, fieldName: string): asserts value is T {
  if (value === null || value === undefined) {
    console.error(`${fieldName} should exist but is ${value}`);
    throw new Error(`${fieldName} should exist`);
  }
}

export function assertIsUUID(value: string, fieldName: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    console.error(`${fieldName} should be a valid UUID, got: ${value}`);
    throw new Error(`${fieldName} should be a valid UUID`);
  }
}

export function assertArray(value: unknown, fieldName: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    console.error(`${fieldName} should be an array, got: ${typeof value}`);
    throw new Error(`${fieldName} should be an array`);
  }
}

/**
 * Logging helpers
 */

export function logSection(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

export function logStep(step: string): void {
  console.log(`\n> ${step}`);
}

export function logSuccess(message: string): void {
  console.log(`  ${message}`);
}

export function logData(label: string, data: unknown): void {
  console.log(`  ${label}:`, JSON.stringify(data, null, 2).split('\n').slice(0, 10).join('\n  '));
}
