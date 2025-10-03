/**
 * Model definition types for the CRUD Operations Generator
 */

// Supported primitive data types
export type PrimitiveType = 
  | 'text'
  | 'string'
  | 'integer'
  | 'bigint'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'uuid'
  | 'json'
  | 'jsonb';

// PostGIS data types (supporting both standard and CockroachDB implementations)
export type PostGISType = 
  | 'point'
  | 'linestring'
  | 'polygon'
  | 'multipoint'
  | 'multilinestring'
  | 'multipolygon'
  | 'geometry'
  | 'geography';

export type DataType = PrimitiveType | PostGISType;

// Field definition
export interface FieldDefinition {
  name: string;
  type: DataType;
  primaryKey?: boolean;
  unique?: boolean;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  maxLength?: number; // For string type
  precision?: number; // For decimal type
  scale?: number; // For decimal type
  array?: boolean; // Support for array types
  srid?: number; // For PostGIS types (Spatial Reference ID)
  geometryType?: string; // For PostGIS geometry specification
  dimensions?: number; // For PostGIS dimensions (2D, 3D, 4D)
  index?: boolean;
  references?: {
    model: string;
    field: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  };
}

// Relationship types
export type RelationshipType = 'oneToMany' | 'manyToOne' | 'manyToMany' | 'oneToOne';

// Relationship definition
export interface RelationshipDefinition {
  type: RelationshipType;
  name: string; // Name of the relationship field
  target: string; // Target model name
  through?: string; // For many-to-many: junction table name
  foreignKey?: string; // Foreign key field name
  targetForeignKey?: string; // For many-to-many: foreign key in junction table pointing to target
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  eager?: boolean; // Whether to eagerly load this relationship
  nullable?: boolean;
}

// Index definition
export interface IndexDefinition {
  name?: string;
  fields: string[];
  unique?: boolean;
  type?: 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin';
  where?: string; // Partial index condition
}

// Model definition
export interface ModelDefinition {
  name: string; // Model name (e.g., "User")
  tableName: string; // Database table name (e.g., "users")
  plural?: string; // Custom plural form (e.g., "indices" for "index")
  schema?: string; // Database schema name
  fields: FieldDefinition[];
  relationships?: RelationshipDefinition[];
  indexes?: IndexDefinition[];
  timestamps?: boolean | {
    createdAt?: string | boolean;
    updatedAt?: string | boolean;
    deletedAt?: string | boolean; // For soft deletes
  };
  softDelete?: boolean;
  description?: string;
  hooks?: {
    // Hook definitions at the model level
    beforeCreate?: boolean;
    afterCreate?: boolean;
    beforeUpdate?: boolean;
    afterUpdate?: boolean;
    beforeDelete?: boolean;
    afterDelete?: boolean;
    beforeFind?: boolean;
    afterFind?: boolean;
  };
}

// Generator configuration
export interface GeneratorConfig {
  modelsPath: string; // Path to models JSON files
  outputPath: string; // Path where generated code will be written
  database: {
    type: 'postgresql' | 'cockroachdb';
    postgis?: boolean;
    schema?: string; // Default schema
  };
  features?: {
    softDeletes?: boolean;
    timestamps?: boolean;
    uuid?: boolean;
    hooks?: boolean;
    validation?: boolean;
  };
  naming?: {
    tableNaming?: 'snake_case' | 'camelCase' | 'PascalCase';
    columnNaming?: 'snake_case' | 'camelCase';
  };
}

// Generated file metadata
export interface GeneratedFile {
  path: string;
  content: string;
  description: string;
}

// Validation error
export interface ValidationError {
  model?: string;
  field?: string;
  relationship?: string;
  message: string;
  severity: 'error' | 'warning';
}