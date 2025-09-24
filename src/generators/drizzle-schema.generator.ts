import {
  FieldDefinition,
  ModelDefinition,
  RelationshipDefinition,
} from "../types/model.types.ts";

/**
 * Generates Drizzle ORM schema files from model definitions
 */
export class DrizzleSchemaGenerator {
  private models: ModelDefinition[];
  private isCockroachDB: boolean;

  constructor(
    models: ModelDefinition[],
    options: { isCockroachDB?: boolean } = {},
  ) {
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
      schemas.set(
        `schema/${model.name.toLowerCase()}.schema.ts`,
        schemaContent,
      );
    }

    // Generate relations file
    const relationsContent = this.generateRelations();
    schemas.set("schema/relations.ts", relationsContent);

    // Generate index file that exports everything
    const indexContent = this.generateIndexFile();
    schemas.set("schema/index.ts", indexContent);

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
    drizzleImports.add("pgTable");
    if (model.schema) {
      drizzleImports.add("pgSchema");
    }

    // Check if this table has self-referential foreign keys
    const hasSelfReference = model.fields.some((field) =>
      field.references &&
      field.references.model.toLowerCase() === model.name.toLowerCase()
    );

    // Add AnyPgColumn for self-referential tables
    if (hasSelfReference) {
      drizzleImports.add("AnyPgColumn");
    }

    // Add field type imports based on model fields
    for (const field of model.fields) {
      const importType = this.getDrizzleImportForType(field);
      if (importType) {
        drizzleImports.add(importType);
      }
    }

    // Check if we need customType for PostGIS
    if (this.hasPostGISFields(model)) {
      drizzleImports.add("customType");
    }

    // Ensure timestamp is imported when generated timestamp columns are present
    if (model.timestamps || model.softDelete) {
      drizzleImports.add("timestamp");
    }

    // Base imports from pg-core and drizzle-orm
    let imports = `import { ${
      Array.from(drizzleImports).join(", ")
    } } from 'drizzle-orm/pg-core';\n`;

    // Always add index imports since we're using table-level definitions
    imports += `import { index, uniqueIndex } from 'drizzle-orm/pg-core';\n`;

    imports += `import { sql } from 'drizzle-orm';\n`;

    // Import other tables referenced by foreign keys in this schema
    const referencedModels = new Set<string>();
    for (const field of model.fields) {
      if (field.references && field.references.model) {
        const refModel = field.references.model;
        if (refModel && refModel.toLowerCase() !== model.name.toLowerCase()) {
          referencedModels.add(refModel);
        }
      }
    }
    for (const refModel of referencedModels) {
      const refLower = refModel.toLowerCase();
      imports +=
        `import { ${refLower}Table } from './${refLower}.schema.ts';\n`;
    }

    return imports;
  }

  /**
   * Get Drizzle import type for a field type
   */
  private getDrizzleImportForType(field: FieldDefinition): string | null {
    const typeMap: Record<string, string | null> = {
      "text": "text",
      "string": "varchar",
      "integer": "integer",
      "bigint": "bigint",
      "decimal": "decimal",
      "boolean": "boolean",
      "date": "timestamp",
      "uuid": "uuid",
      "json": "json",
      "jsonb": "jsonb",
      // PostGIS types don't have direct imports, they use customType
      "point": null,
      "linestring": null,
      "polygon": null,
      "multipoint": null,
      "multilinestring": null,
      "multipolygon": null,
      "geometry": null,
      "geography": null,
    };

    return typeMap[field.type] || null;
  }

  /**
   * Generate table definition
   */
  private generateTableDefinition(model: ModelDefinition): string {
    let code = "";

    // Handle schema if specified
    if (model.schema) {
      code += `const ${model.schema}Schema = pgSchema('${model.schema}');\n\n`;
    }

    // Start table definition (no type annotation needed)
    const tableFunction = model.schema
      ? `${model.schema}Schema.table`
      : "pgTable";
    code +=
      `export const ${model.name.toLowerCase()}Table = ${tableFunction}('${model.name.toLowerCase()}', {\n`;

    // Add fields
    const fieldDefinitions: string[] = [];

    for (const field of model.fields) {
      fieldDefinitions.push(this.generateFieldDefinition(field, model));
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

    code += fieldDefinitions.map((def) => {
      // For lines with comments, put the comma before the comment
      if (def.includes(' // ')) {
        const [code, comment] = def.split(' // ');
        return `${code}, // ${comment}`;
      }
      return def + ',';
    }).join("\n") + "\n";

    // Close the fields object and start the table-level definitions
    code += "}, (table) => [\n";

    // Generate indexes within the table definition
    const tableIndexes = [];

    // Field-level indexes
    for (const field of model.fields) {
      if (field.index) {
        const isPostGISField = ['point', 'linestring', 'polygon', 'multipolygon', 'geometry', 'geography'].includes(field.type);
        const indexName = `idx_${model.name.toLowerCase()}_${field.name}`;
        
        if (isPostGISField) {
          tableIndexes.push(`  index('${indexName}').using('gist', table.${field.name})`); 
        } else {
          tableIndexes.push(`  index('${indexName}').on(table.${field.name})`);  
        }
      }
    }

    // Model-level indexes
    if (model.indexes) {
      for (const idx of model.indexes) {
        const indexName = idx.name || `idx_${model.name.toLowerCase()}_${idx.fields.join('_')}`;
        const indexType = idx.unique ? 'uniqueIndex' : 'index';
        const fields = idx.fields.map(f => `table.${f}`).join(', ');

        // Check if the first field is a PostGIS field
        const firstField = model.fields.find(f => f.name === idx.fields[0]);
        const isPostGISField = firstField && ['point', 'linestring', 'polygon', 'multipolygon', 'geometry', 'geography'].includes(firstField.type);

        if (isPostGISField) {
          tableIndexes.push(`  ${indexType}('${indexName}').using('gist', ${fields})`);  
        } else {
          tableIndexes.push(`  ${indexType}('${indexName}').on(${fields})`);  
        }
      }
    }

    code += tableIndexes.join(',\n') + "\n]);"; 


    return code;
  }

  /**
   * Generate field definition
   */
  private generateFieldDefinition(
    field: FieldDefinition,
    model: ModelDefinition,
  ): string {
    let definition = `  ${field.name}: `;
    let comment = "";

    // Generate the field type
    switch (field.type) {
      case "text":
        definition += `text('${this.toSnakeCase(field.name)}')`;
        break;
      case "string":
        definition += `varchar('${this.toSnakeCase(field.name)}'${
          field.maxLength ? `, { length: ${field.maxLength} }` : ""
        })`;
        break;
      case "integer":
        definition += `integer('${this.toSnakeCase(field.name)}')`;
        break;
      case "bigint":
        definition += `bigint('${
          this.toSnakeCase(field.name)
        }', { mode: 'number' })`;
        break;
      case "decimal":
        const decimalOpts = [];
        if (field.precision) decimalOpts.push(`precision: ${field.precision}`);
        if (field.scale !== undefined) {
          decimalOpts.push(`scale: ${field.scale}`);
        }
        definition += `decimal('${this.toSnakeCase(field.name)}'${
          decimalOpts.length ? `, { ${decimalOpts.join(", ")} }` : ""
        })`;
        break;
      case "boolean":
        definition += `boolean('${this.toSnakeCase(field.name)}')`;
        break;
      case "date":
        definition += `timestamp('${
          this.toSnakeCase(field.name)
        }', { mode: 'date' })`;
        break;
      case "uuid":
        definition += `uuid('${this.toSnakeCase(field.name)}')`;
        break;
      case "json":
        definition += `json('${this.toSnakeCase(field.name)}')`;
        break;
      case "jsonb":
        definition += `jsonb('${this.toSnakeCase(field.name)}')`;
        break;
      case "point":
      case "linestring":
      case "polygon":
      case "multipoint":
      case "multilinestring":
      case "multipolygon":
      case "geometry":
      case "geography":
        definition += this.generatePostGISField(field);
        break;
      default:
        definition += `text('${this.toSnakeCase(field.name)}')`;
    }

    // Add modifiers
    const modifiers: string[] = [];

    if (field.primaryKey) {
      modifiers.push(".primaryKey()");
    }

    if (field.unique) {
      modifiers.push(".unique()");
    }

    if (field.required || field.primaryKey) {
      modifiers.push(".notNull()");
    }

    if (field.defaultValue !== undefined) {
      if (
        typeof field.defaultValue === "string" &&
        field.defaultValue.includes("()")
      ) {
        // SQL function
        modifiers.push(`.default(sql\`${field.defaultValue}\`)`);
      } else if (typeof field.defaultValue === "string") {
        modifiers.push(`.default('${field.defaultValue}')`);
      } else {
        modifiers.push(`.default(${field.defaultValue})`);
      }
    }

    if (field.references) {
      // Check if this is a self-reference
      if (field.references.model.toLowerCase() === model.name.toLowerCase()) {
        // Use AnyPgColumn type hint for self-references
        modifiers.push(
          `.references((): AnyPgColumn => ${field.references.model.toLowerCase()}Table.${field.references.field})`,
        );
        comment =
          " // Self-reference: AnyPgColumn breaks circular type dependency";
      } else {
        modifiers.push(
          `.references(() => ${field.references.model.toLowerCase()}Table.${field.references.field})`,
        );
      }
    }

    if (field.array) {
      modifiers.push(".array()");
    }

    definition += modifiers.join("") + comment;

    return definition;
  }

  /**
   * Generate PostGIS field definition
   */
  private generatePostGISField(field: FieldDefinition): string {
    const fieldName = this.toSnakeCase(field.name);
    const geometryType = field.geometryType || field.type.toUpperCase();
    const srid = field.srid || 4326;
    const isGeography = field.type === "geography";
    const columnType = isGeography ? "geography" : "geometry";

    // Use customType for PostGIS fields since Drizzle doesn't have native support
    return `customType<any>({
    dataType() {
      return '${columnType}(${geometryType}, ${srid})';
    },
    toDriver(value) {
      return value;
    },
    fromDriver(value) {
      return value;
    }
  })('${fieldName}')`;
  }

  /**
   * Generate timestamp fields
   */
  private generateTimestampFields(timestamps: boolean | any): string[] {
    const fields: string[] = [];

    if (timestamps === true) {
      fields.push(
        `  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull()`,
      );
      fields.push(
        `  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull()`,
      );
    } else if (typeof timestamps === "object") {
      if (timestamps.createdAt) {
        const fieldName = typeof timestamps.createdAt === "string"
          ? timestamps.createdAt
          : "created_at";
        fields.push(
          `  createdAt: timestamp('${fieldName}', { mode: 'date' }).defaultNow().notNull()`,
        );
      }
      if (timestamps.updatedAt) {
        const fieldName = typeof timestamps.updatedAt === "string"
          ? timestamps.updatedAt
          : "updated_at";
        fields.push(
          `  updatedAt: timestamp('${fieldName}', { mode: 'date' }).defaultNow().notNull()`,
        );
      }
      if (timestamps.deletedAt) {
        const fieldName = typeof timestamps.deletedAt === "string"
          ? timestamps.deletedAt
          : "deleted_at";
        fields.push(`  deletedAt: timestamp('${fieldName}', { mode: 'date' })`);
      }
    }

    return fields;
  }

  /**
   * Generate modern index definition (outside of table definition)
   */
  private generateModernIndexDefinition(tableName: string, idx: any): string {
    const indexName = idx.name || `idx_${tableName}_${idx.fields.join("_")}`;
    const indexType = idx.unique ? "uniqueIndex" : "index";
    const fields = idx.fields.map((f: string) => `${tableName}Table.${f}`);
    
    // Check if any of the fields is a PostGIS type
    const model = this.models.find(m => m.name.toLowerCase() === tableName);
    const firstField = model?.fields.find(f => f.name === idx.fields[0]);
    const isPostGISField = firstField && ['point', 'linestring', 'polygon', 'multipolygon', 'geometry', 'geography'].includes(firstField.type);

    let definition = `export const ${indexName} = ${indexType}('${indexName}')`;

    // For PostGIS fields, use GiST index method
    if (isPostGISField) {
      definition += `\n  .using('gist', ${fields.join(', ')})`;
    } else {
      // For normal fields, use the new .on() API
      definition += `\n  .on(${fields.join(', ')})`;
    }

    if (idx.where) {
      definition += `\n  .where(sql\`${idx.where}\`)`;
    }

    // Add concurrent creation for PostgreSQL (not supported in CockroachDB)
    if (this.dbType === 'postgresql') {
      definition += '\n  .concurrently()';
    }

    definition += ';';
    return definition;
  }

  /**
   * Generate relations file
   */
  private generateRelations(): string {
    let code = `import { relations } from 'drizzle-orm';\n`;

    // Import all tables
    for (const model of this.models) {
      code +=
        `import { ${model.name.toLowerCase()}Table } from './${model.name.toLowerCase()}.schema.ts';\n`;
    }

    code += "\n";

    // Generate relations for each model
    for (const model of this.models) {
      if (!model.relationships || model.relationships.length === 0) continue;

      code +=
        `export const ${model.name.toLowerCase()}Relations = relations(${model.name.toLowerCase()}Table, ({ one, many }) => ({\n`;

      const relationDefinitions: string[] = [];

      for (const rel of model.relationships) {
        relationDefinitions.push(this.generateRelationDefinition(model, rel));
      }

      code += relationDefinitions.join(",\n");
      code += "\n}));\n\n";
    }

    return code;
  }

  /**
   * Generate relation definition
   */
  private generateRelationDefinition(
    model: ModelDefinition,
    rel: RelationshipDefinition,
  ): string {
    switch (rel.type) {
      case "oneToMany":
        return `  ${rel.name}: many(${rel.target.toLowerCase()}Table)`;
      case "manyToOne":
        return `  ${rel.name}: one(${rel.target.toLowerCase()}Table, {
    fields: [${model.name.toLowerCase()}Table.${rel.foreignKey}],
    references: [${rel.target.toLowerCase()}Table.id]
  })`;
      case "oneToOne":
        // Check if the foreign key is on this model's table
        const hasFK = model.fields.some((f) => f.name === rel.foreignKey);
        if (hasFK) {
          // Foreign key is on this table - we own the relationship
          return `  ${rel.name}: one(${rel.target.toLowerCase()}Table, {
    fields: [${model.name.toLowerCase()}Table.${rel.foreignKey}],
    references: [${rel.target.toLowerCase()}Table.id]
  })`;
        } else {
          // Foreign key is on the target table - inverse relationship
          // For inverse oneToOne, we don't specify fields/references in Drizzle
          return `  ${rel.name}: one(${rel.target.toLowerCase()}Table)`;
        }
      case "manyToMany":
        // Many-to-many relationships are handled through a junction table
        return `  ${rel.name}: many(${rel.target.toLowerCase()}Table)`;
      default:
        return "";
    }
  }

  /**
   * Generate type exports
   */
  private generateTypeExports(model: ModelDefinition): string {
    let code = `// Type exports\n`;
    code +=
      `export type ${model.name} = typeof ${model.name.toLowerCase()}Table.$inferSelect;\n`;
    code +=
      `export type New${model.name} = typeof ${model.name.toLowerCase()}Table.$inferInsert;`;

    return code;
  }

  /**
   * Generate index file
   */
  private generateIndexFile(): string {
    let code = "// Export all schemas and relations\n";

    for (const model of this.models) {
      code += `export * from './${model.name.toLowerCase()}.schema.ts';\n`;
    }

    code += `export * from './relations.ts';\n`;

    return code;
  }

  /**
   * Check if model has PostGIS fields
   */
  private hasPostGISFields(model: ModelDefinition): boolean {
    const postgisTypes = [
      "point",
      "linestring",
      "polygon",
      "multipoint",
      "multilinestring",
      "multipolygon",
      "geometry",
      "geography",
    ];

    return model.fields.some((f) => postgisTypes.includes(f.type));
  }

  /**
   * Convert string to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
      .replace(/^_/, "");
  }
}
