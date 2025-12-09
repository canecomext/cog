/**
 * Shared constants for COG code generators
 */

/**
 * PostGIS spatial data types
 */
export const POSTGIS_TYPES = [
  'point',
  'linestring',
  'polygon',
  'multipoint',
  'multilinestring',
  'multipolygon',
  'geometry',
  'geography',
] as const;

/**
 * PostGIS type union
 */
export type PostGISType = (typeof POSTGIS_TYPES)[number];

/**
 * Check if a type is a PostGIS spatial type
 */
export const isPostGISType = (type: string): type is PostGISType => {
  return POSTGIS_TYPES.includes(type as PostGISType);
};

/**
 * All valid data types supported by COG
 */
export const VALID_DATA_TYPES = [
  'text',
  'string',
  'integer',
  'bigint',
  'decimal',
  'boolean',
  'date',
  'uuid',
  'json',
  'jsonb',
  'enum',
  ...POSTGIS_TYPES,
] as const;

/**
 * Data type union
 */
export type DataType = (typeof VALID_DATA_TYPES)[number];

/**
 * Check if a type is a valid data type
 */
export const isValidDataType = (type: string): type is DataType => {
  return VALID_DATA_TYPES.includes(type as DataType);
};
