import { ModelDefinition, ValidationError, FieldDefinition, RelationshipDefinition } from '../types/model.types.ts';

/**
 * Parser for reading and validating model definitions from JSON files
 */
export class ModelParser {
  private models: Map<string, ModelDefinition> = new Map();
  private errors: ValidationError[] = [];

  /**
   * Parse models from a directory containing JSON files
   */
  async parseModelsFromDirectory(dirPath: string): Promise<{ models: ModelDefinition[]; errors: ValidationError[] }> {
    this.models.clear();
    this.errors = [];

    try {
      // Read all JSON files from the directory
      for await (const entry of Deno.readDir(dirPath)) {
        if (entry.isFile && entry.name.endsWith('.json')) {
          const filePath = `${dirPath}/${entry.name}`;
          await this.parseModelFile(filePath);
        }
      }

      // Validate relationships after all models are loaded
      this.validateRelationships();
      
      return {
        models: Array.from(this.models.values()),
        errors: this.errors
      };
    } catch (error) {
      this.errors.push({
        message: `Failed to parse models directory: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
      return {
        models: [],
        errors: this.errors
      };
    }
  }

  /**
   * Parse a single model file
   */
  private async parseModelFile(filePath: string): Promise<void> {
    try {
      const content = await Deno.readTextFile(filePath);
      const modelData = JSON.parse(content);
      
      const model = this.validateAndTransformModel(modelData, filePath);
      if (model) {
        if (this.models.has(model.name)) {
          this.errors.push({
            model: model.name,
            message: `Duplicate model name: ${model.name}`,
            severity: 'error'
          });
        } else {
          this.models.set(model.name, model);
        }
      }
    } catch (error) {
      this.errors.push({
        message: `Failed to parse file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }
  }

  /**
   * Validate and transform raw model data
   */
  private validateAndTransformModel(data: any, filePath: string): ModelDefinition | null {
    // Validate required fields
    if (!data.name || typeof data.name !== 'string') {
      this.errors.push({
        message: `Model in ${filePath} is missing a valid 'name' field`,
        severity: 'error'
      });
      return null;
    }

    if (!data.tableName || typeof data.tableName !== 'string') {
      this.errors.push({
        model: data.name,
        message: `Model '${data.name}' is missing a valid 'tableName' field`,
        severity: 'error'
      });
      return null;
    }

    if (!Array.isArray(data.fields) || data.fields.length === 0) {
      this.errors.push({
        model: data.name,
        message: `Model '${data.name}' must have at least one field`,
        severity: 'error'
      });
      return null;
    }

    // Validate fields
    const fields = this.validateFields(data.fields, data.name);
    if (!fields) return null;

    // Ensure there's at least one primary key
    const hasPrimaryKey = fields.some(f => f.primaryKey);
    if (!hasPrimaryKey) {
      this.errors.push({
        model: data.name,
        message: `Model '${data.name}' must have at least one primary key field`,
        severity: 'error'
      });
      return null;
    }

    // Build the model
    const model: ModelDefinition = {
      name: data.name,
      tableName: data.tableName,
      plural: data.plural, // Add support for custom plural
      fields,
      schema: data.schema,
      relationships: data.relationships || [],
      indexes: data.indexes || [],
      timestamps: data.timestamps,
      softDelete: data.softDelete,
      description: data.description,
      hooks: data.hooks
    };

    return model;
  }

  /**
   * Validate fields array
   */
  private validateFields(fields: any[], modelName: string): FieldDefinition[] | null {
    const validatedFields: FieldDefinition[] = [];
    const fieldNames = new Set<string>();

    for (const field of fields) {
      // Check for duplicate field names
      if (fieldNames.has(field.name)) {
        this.errors.push({
          model: modelName,
          field: field.name,
          message: `Duplicate field name: ${field.name}`,
          severity: 'error'
        });
        return null;
      }
      fieldNames.add(field.name);

      // Validate field structure
      if (!field.name || typeof field.name !== 'string') {
        this.errors.push({
          model: modelName,
          message: `Field is missing a valid 'name'`,
          severity: 'error'
        });
        return null;
      }

      if (!field.type || typeof field.type !== 'string') {
        this.errors.push({
          model: modelName,
          field: field.name,
          message: `Field '${field.name}' is missing a valid 'type'`,
          severity: 'error'
        });
        return null;
      }

      // Validate data type
      if (!this.isValidDataType(field.type)) {
        this.errors.push({
          model: modelName,
          field: field.name,
          message: `Field '${field.name}' has invalid type: ${field.type}`,
          severity: 'error'
        });
        return null;
      }

      // Validate type-specific constraints
      if (field.type === 'string' && field.maxLength && (typeof field.maxLength !== 'number' || field.maxLength <= 0)) {
        this.errors.push({
          model: modelName,
          field: field.name,
          message: `Field '${field.name}' has invalid maxLength: ${field.maxLength}`,
          severity: 'warning'
        });
      }

      if (field.type === 'decimal') {
        if (field.precision && (typeof field.precision !== 'number' || field.precision <= 0)) {
          this.errors.push({
            model: modelName,
            field: field.name,
            message: `Field '${field.name}' has invalid precision: ${field.precision}`,
            severity: 'warning'
          });
        }
        if (field.scale && (typeof field.scale !== 'number' || field.scale < 0)) {
          this.errors.push({
            model: modelName,
            field: field.name,
            message: `Field '${field.name}' has invalid scale: ${field.scale}`,
            severity: 'warning'
          });
        }
      }

      // Validate PostGIS fields
      if (this.isPostGISType(field.type)) {
        if (field.srid && (typeof field.srid !== 'number')) {
          this.errors.push({
            model: modelName,
            field: field.name,
            message: `Field '${field.name}' has invalid SRID: ${field.srid}`,
            severity: 'warning'
          });
        }
      }

      validatedFields.push(field);
    }

    return validatedFields;
  }

  /**
   * Validate relationships after all models are loaded
   */
  private validateRelationships(): void {
    for (const [modelName, model] of this.models) {
      if (!model.relationships) continue;

      for (const rel of model.relationships) {
        // Check if target model exists
        if (!this.models.has(rel.target)) {
          // Check for self-referential relationship
          if (rel.target !== modelName) {
            this.errors.push({
              model: modelName,
              relationship: rel.name,
              message: `Relationship '${rel.name}' references non-existent model: ${rel.target}`,
              severity: 'error'
            });
          }
        }

        // Validate relationship type specifics
        if (rel.type === 'manyToMany' && !rel.through) {
          this.errors.push({
            model: modelName,
            relationship: rel.name,
            message: `Many-to-many relationship '${rel.name}' requires a 'through' table`,
            severity: 'error'
          });
        }

        // Validate foreign key references
        if (rel.foreignKey) {
          const hasField = model.fields.some(f => f.name === rel.foreignKey);
          if (!hasField && rel.type === 'manyToOne') {
            this.errors.push({
              model: modelName,
              relationship: rel.name,
              message: `Foreign key field '${rel.foreignKey}' not found in model`,
              severity: 'warning'
            });
          }
        }
      }
    }
  }

  /**
   * Check if a type is valid
   */
  private isValidDataType(type: string): boolean {
    const validTypes = [
      'text', 'string', 'integer', 'bigint', 'decimal', 'boolean', 'date', 'uuid', 'json', 'jsonb',
      'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometry', 'geography'
    ];
    return validTypes.includes(type);
  }

  /**
   * Check if a type is PostGIS type
   */
  private isPostGISType(type: string): boolean {
    const postgisTypes = [
      'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometry', 'geography'
    ];
    return postgisTypes.includes(type);
  }
}