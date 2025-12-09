/**
 * Generates field metadata utility functions
 * These utilities derive exposed/accepted field arrays from FieldMeta at runtime
 */
export class FieldMetaUtilsGenerator {
  /**
   * Generate field metadata utilities file
   */
  generate(): string {
    return `/**
 * Field Metadata Utilities
 *
 * Provides runtime derivation of field visibility and acceptance arrays from FieldMeta.
 * This centralizes the logic instead of generating static arrays per model.
 */

/**
 * Enhanced field metadata with visibility and acceptance controls
 */
export interface FieldMeta {
  /** Field data type */
  type: string;
  /** Whether field is an array type */
  array: boolean;
  /** Whether field is visible in create (POST) responses */
  exposeCreate: boolean;
  /** Whether field is visible in read (GET) responses */
  exposeRead: boolean;
  /** Whether field is accepted in create (POST) input */
  acceptCreate: boolean;
  /** Whether field is accepted in update (PUT) input */
  acceptUpdate: boolean;
}

/**
 * Get all fields that are exposed (visible) in responses
 * Used for filter validation - only exposed fields can be filtered
 */
export const getExposedFields = (fieldMeta: Map<string, FieldMeta>): Set<string> => {
  const exposed = new Set<string>();
  for (const [name, meta] of fieldMeta) {
    if (meta.exposeRead) {
      exposed.add(name);
    }
  }
  return exposed;
};

/**
 * Get fields to strip from create (POST) responses
 * Fields where exposeCreate is false
 */
export const getCreateUnexposedFields = (fieldMeta: Map<string, FieldMeta>): string[] => {
  const fields: string[] = [];
  for (const [name, meta] of fieldMeta) {
    if (!meta.exposeCreate) {
      fields.push(name);
    }
  }
  return fields;
};

/**
 * Get fields to strip from read (GET) responses
 * Fields where exposeRead is false
 */
export const getReadUnexposedFields = (fieldMeta: Map<string, FieldMeta>): string[] => {
  const fields: string[] = [];
  for (const [name, meta] of fieldMeta) {
    if (!meta.exposeRead) {
      fields.push(name);
    }
  }
  return fields;
};

/**
 * Get fields to strip from create (POST) input
 * Fields where acceptCreate is false (e.g., timestamps, server-managed fields)
 */
export const getCreateUnacceptedFields = (fieldMeta: Map<string, FieldMeta>): string[] => {
  const fields: string[] = [];
  for (const [name, meta] of fieldMeta) {
    if (!meta.acceptCreate) {
      fields.push(name);
    }
  }
  return fields;
};

/**
 * Get fields to strip from update (PUT) input
 * Fields where acceptUpdate is false (e.g., id, timestamps, immutable fields)
 */
export const getUpdateUnacceptedFields = (fieldMeta: Map<string, FieldMeta>): string[] => {
  const fields: string[] = [];
  for (const [name, meta] of fieldMeta) {
    if (!meta.acceptUpdate) {
      fields.push(name);
    }
  }
  return fields;
};

/**
 * Check if a field is exposed (for backwards compatibility)
 * A field is considered exposed if it's visible in read responses
 */
export const isFieldExposed = (fieldMeta: Map<string, FieldMeta>, fieldName: string): boolean => {
  const meta = fieldMeta.get(fieldName);
  return meta?.exposeRead ?? false;
};
`;
  }
}
