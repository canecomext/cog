import { ModelDefinition, FieldDefinition, RelationshipDefinition } from '../types/model.types.ts';

/**
 * Generates Drizzle ORM schema files from model definitions
 */
export class DrizzleSchemaGenerator {
  private models: ModelDefinition[];
  private isCockroachDB: boolean;
  
  constructor(models: ModelDefinition[], options: { isCockroachDB?: boolean } = {}) {
    this.models = models;
    this.isCockroachDB = options.isCockroachDB || false;
  }

  /**
   * Generate all schema files
   */
  generateSchemas(): Map<string, string> {
    const schemas = new Map<string, string>();
    
    // Generate individual model schemas
    for (const model of this.models) {
      const schemaContent = this.generateModelSchema(model);
      schemas.set(`schema/${model.name.toLowerCase()}.schema.ts`, schemaContent);
    }
    
    // Generate relations file
    const relationsContent = this.generateRelations();
    schemas.set('schema/relations.ts', relationsContent);
    
    // Generate index file that exports everything
    const indexContent = this.generateIndexFile();
    schemas.set('schema/index.ts', indexContent);
    
    return schemas;
  }

  /**
   * Generate schema for a single model
   */
  private generateModelSchema(model: ModelDefinition): string {
    const imports = this.generateImports(model);
    const tableDefinition = this.generateTableDefinition(model);
    const typeExports = this.generateTypeExports(model);
    
    return `${imports}\n\n${tableDefinition}\n\n${typeExports}`;
  }

  /**
   * Generate imports for a model schema
   */
  private generateImports(model: ModelDefinition): string {
    const drizzleImports = new Set<string>();
    
    // Add table import
    drizzleImports.add('pgTable');
    if (model.schema) {
      drizzleImports.add('pgSchema');
    }
    
    // Add field type imports based on model fields
    for (const field of model.fields) {
      const importType = this.getDrizzleImportForType(field);
      if (importType) {
        drizzleImports.add(importType);
      }
    }
    
    // Add index imports if needed
    if (model.indexes && model.indexes.length > 0) {
      drizzleImports.add('index');
      drizzleImports.add('uniqueIndex');
    }
    
    let imports = `import { ${Array.from(drizzleImports).join(', ')} } from 'drizzle-orm/pg-core';\n`;
    imports += `import { sql } from 'drizzle-orm';\n`;
    
    // Add PostGIS imports if needed
    if (this.hasPostGISFields(model)) {
      imports += `import { geometry, geography } from 'drizzle-orm/pg-core';\n`;
    }
    
    return imports;
  }

  /**
   * Get Drizzle import type for a field type
   */
  private getDrizzleImportForType(field: FieldDefinition): string | null {
    const typeMap: Record<string, string> = {
      'text': 'text',
      'string': 'varchar',
      'integer': 'integer',
      'bigint': 'bigint',
      'decimal': 'decimal',
      'boolean': 'boolean',
      'date': 'timestamp',
      'uuid': 'uuid',
      'json': 'json',
      'jsonb': 'jsonb',
      'point': 'geometry',
      'linestring': 'geometry',
      'polygon': 'geometry',
      'multipoint': 'geometry',
      'multilinestring': 'geometry',
      'multipolygon': 'geometry',
      'geometry': 'geometry',
      'geography': 'geography'
    };
    
    return typeMap[field.type] || null;
  }

  /**
   * Generate table definition
   */
  private generateTableDefinition(model: ModelDefinition): string {
    let code = '';
    
    // Handle schema if specified
    if (model.schema) {
      code += `const ${model.schema}Schema = pgSchema('${model.schema}');\n\n`;
    }
    
    // Start table definition
    const tableFunction = model.schema ? `${model.schema}Schema.table` : 'pgTable';
    code += `export const ${model.name.toLowerCase()}Table = ${tableFunction}('${model.tableName}', {\n`;
    
    // Add fields
    const fieldDefinitions: string[] = [];
    
    for (const field of model.fields) {
      fieldDefinitions.push(this.generateFieldDefinition(field));
    }
    
    // Add timestamp fields if enabled
    if (model.timestamps) {
      const timestampFields = this.generateTimestampFields(model.timestamps);
      fieldDefinitions.push(...timestampFields);
    }
    
    // Add soft delete field if enabled
    if (model.softDelete) {
      fieldDefinitions.push(`  deletedAt: timestamp('deleted_at')`);
    }
    
    code += fieldDefinitions.join(',\n') + '\n';
    code += '}';
    
    // Add indexes
    if (model.indexes && model.indexes.length > 0) {
      code += ', (table) => {\n  return {\n';
      const indexDefinitions = model.indexes.map(idx => this.generateIndexDefinition(idx));
      code += indexDefinitions.join(',\n');
      code += '\n  };\n}';
    }
    
    code += ');\n';
    
    return code;
  }

  /**
   * Generate field definition
   */
  private generateFieldDefinition(field: FieldDefinition): string {
    let definition = `  ${field.name}: `;
    
    // Generate the field type
    switch (field.type) {
      case 'text':
        definition += `text('${this.toSnakeCase(field.name)}')`;
        break;
      case 'string':
        definition += `varchar('${this.toSnakeCase(field.name)}'${field.maxLength ? `, { length: ${field.maxLength} }` : ''})`;
        break;
      case 'integer':
        definition += `integer('${this.toSnakeCase(field.name)}')`;
        break;
      case 'bigint':
        definition += `bigint('${this.toSnakeCase(field.name)}', { mode: 'number' })`;
        break;
      case 'decimal':
        const decimalOpts = [];
        if (field.precision) decimalOpts.push(`precision: ${field.precision}`);
        if (field.scale !== undefined) decimalOpts.push(`scale: ${field.scale}`);
        definition += `decimal('${this.toSnakeCase(field.name)}'${decimalOpts.length ? `, { ${decimalOpts.join(', ')} }` : ''})`;
        break;
      case 'boolean':
        definition += `boolean('${this.toSnakeCase(field.name)}')`;
        break;
      case 'date':
        definition += `timestamp('${this.toSnakeCase(field.name)}', { mode: 'date' })`;
        break;
      case 'uuid':
        definition += `uuid('${this.toSnakeCase(field.name)}')`;
        break;
      case 'json':
        definition += `json('${this.toSnakeCase(field.name)}')`;
        break;
      case 'jsonb':
        definition += `jsonb('${this.toSnakeCase(field.name)}')`;
        break;
      case 'point':
      case 'linestring':
      case 'polygon':
      case 'multipoint':
      case 'multilinestring':
      case 'multipolygon':
        definition += this.generatePostGISField(field);
        break;
      case 'geometry':
        definition += `geometry('${this.toSnakeCase(field.name)}', { type: '${field.geometryType || 'geometry'}', srid: ${field.srid || 4326} })`;
        break;
      case 'geography':
        definition += `geography('${this.toSnakeCase(field.name)}', { type: '${field.geometryType || 'geometry'}', srid: ${field.srid || 4326} })`;
        break;
      default:
        definition += `text('${this.toSnakeCase(field.name)}')`;
    }
    
    // Add modifiers
    const modifiers: string[] = [];
    
    if (field.primaryKey) {
      modifiers.push('.primaryKey()');
    }
    
    if (field.unique) {
      modifiers.push('.unique()');
    }
    
    if (field.required || field.primaryKey) {
      modifiers.push('.notNull()');
    }
    
    if (field.defaultValue !== undefined) {
      if (typeof field.defaultValue === 'string' && field.defaultValue.includes('()')) {
        // SQL function
        modifiers.push(`.default(sql\`${field.defaultValue}\`)`);
      } else if (typeof field.defaultValue === 'string') {
        modifiers.push(`.default('${field.defaultValue}')`);
      } else {
        modifiers.push(`.default(${field.defaultValue})`);
      }
    }
    
    if (field.references) {
      modifiers.push(`.references(() => ${field.references.model.toLowerCase()}Table.${field.references.field})`);
    }
    
    if (field.array) {
      modifiers.push('.array()');
    }
    
    definition += modifiers.join('');
    
    return definition;
  }

  /**
   * Generate PostGIS field definition
   */
  private generatePostGISField(field: FieldDefinition): string {
    const geometryType = field.type.toUpperCase();
    const srid = field.srid || 4326;
    const dimensions = field.dimensions || 2;
    
    if (this.isCockroachDB) {
      // CockroachDB PostGIS format
      return `geometry('${this.toSnakeCase(field.name)}', { type: '${geometryType}', srid: ${srid} })`;
    } else {
      // Standard PostGIS format
      return `geometry('${this.toSnakeCase(field.name)}', { type: '${geometryType}', srid: ${srid}, dimensions: ${dimensions} })`;
    }
  }

  /**
   * Generate timestamp fields
   */
  private generateTimestampFields(timestamps: boolean | any): string[] {
    const fields: string[] = [];
    
    if (timestamps === true) {
      fields.push(`  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull()`);
      fields.push(`  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull()`);
    } else if (typeof timestamps === 'object') {
      if (timestamps.createdAt) {
        const fieldName = typeof timestamps.createdAt === 'string' ? timestamps.createdAt : 'created_at';
        fields.push(`  createdAt: timestamp('${fieldName}', { mode: 'date' }).defaultNow().notNull()`);
      }
      if (timestamps.updatedAt) {
        const fieldName = typeof timestamps.updatedAt === 'string' ? timestamps.updatedAt : 'updated_at';
        fields.push(`  updatedAt: timestamp('${fieldName}', { mode: 'date' }).defaultNow().notNull()`);
      }
      if (timestamps.deletedAt) {
        const fieldName = typeof timestamps.deletedAt === 'string' ? timestamps.deletedAt : 'deleted_at';
        fields.push(`  deletedAt: timestamp('${fieldName}', { mode: 'date' })`);
      }
    }
    
    return fields;
  }

  /**
   * Generate index definition
   */
  private generateIndexDefinition(idx: any): string {
    const indexName = idx.name || `idx_${idx.fields.join('_')}`;
    const indexType = idx.unique ? 'uniqueIndex' : 'index';
    const fields = idx.fields.map((f: string) => `table.${f}`).join(', ');
    
    let definition = `    ${indexName}: ${indexType}('${indexName}').on(${fields})`;
    
    if (idx.where) {
      definition += `.where(sql\`${idx.where}\`)`;
    }
    
    return definition;
  }

  /**
   * Generate relations file
   */
  private generateRelations(): string {
    let code = `import { relations } from 'drizzle-orm';\n`;
    
    // Import all tables
    for (const model of this.models) {
      code += `import { ${model.name.toLowerCase()}Table } from './${model.name.toLowerCase()}.schema';\n`;
    }
    
    code += '\n';
    
    // Generate relations for each model
    for (const model of this.models) {
      if (!model.relationships || model.relationships.length === 0) continue;
      
      code += `export const ${model.name.toLowerCase()}Relations = relations(${model.name.toLowerCase()}Table, ({ one, many }) => ({\n`;
      
      const relationDefinitions: string[] = [];
      
      for (const rel of model.relationships) {
        relationDefinitions.push(this.generateRelationDefinition(model, rel));
      }
      
      code += relationDefinitions.join(',\n');
      code += '\n}));\n\n';
    }
    
    return code;
  }

  /**
   * Generate relation definition
   */
  private generateRelationDefinition(model: ModelDefinition, rel: RelationshipDefinition): string {
    switch (rel.type) {
      case 'oneToMany':
        return `  ${rel.name}: many(${rel.target.toLowerCase()}Table)`;
      case 'manyToOne':
        return `  ${rel.name}: one(${rel.target.toLowerCase()}Table, {
    fields: [${model.name.toLowerCase()}Table.${rel.foreignKey}],
    references: [${rel.target.toLowerCase()}Table.id]
  })`;
      case 'oneToOne':
        return `  ${rel.name}: one(${rel.target.toLowerCase()}Table, {
    fields: [${model.name.toLowerCase()}Table.${rel.foreignKey}],
    references: [${rel.target.toLowerCase()}Table.id]
  })`;
      case 'manyToMany':
        // Many-to-many relationships are handled through a junction table
        return `  ${rel.name}: many(${rel.target.toLowerCase()}Table)`;
      default:
        return '';
    }
  }

  /**
   * Generate type exports
   */
  private generateTypeExports(model: ModelDefinition): string {
    let code = `// Type exports\n`;
    code += `export type ${model.name} = typeof ${model.name.toLowerCase()}Table.$inferSelect;\n`;
    code += `export type New${model.name} = typeof ${model.name.toLowerCase()}Table.$inferInsert;`;
    
    return code;
  }

  /**
   * Generate index file
   */
  private generateIndexFile(): string {
    let code = '// Export all schemas and relations\n';
    
    for (const model of this.models) {
      code += `export * from './${model.name.toLowerCase()}.schema';\n`;
    }
    
    code += `export * from './relations';\n`;
    
    return code;
  }

  /**
   * Check if model has PostGIS fields
   */
  private hasPostGISFields(model: ModelDefinition): boolean {
    const postgisTypes = [
      'point', 'linestring', 'polygon', 'multipoint', 
      'multilinestring', 'multipolygon', 'geometry', 'geography'
    ];
    
    return model.fields.some(f => postgisTypes.includes(f.type));
  }

  /**
   * Convert string to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
  }
}