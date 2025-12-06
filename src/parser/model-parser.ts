import {
  ModelDefinition,
  ValidationError,
  FieldDefinition,
  EnumDefinition,
  ExposedType,
} from '../types/model.types.ts';

/**
 * Parser for reading and validating model definitions from JSON files
 */
export class ModelParser {
  private models: Map<string, ModelDefinition> = new Map();
  private errors: ValidationError[] = [];

  /**
   * Parse models from a directory containing JSON files
   */
  async parseModelsFromDirectory(dirPath: string): Promise<{
    models: ModelDefinition[];
    errors: ValidationError[]
  }> {
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
  private validateAndTransformModel(data: unknown, filePath: string): ModelDefinition | null {
    // Type guard for object
    if (typeof data !== 'object' || data === null) {
      this.errors.push({
        message: `Model in ${filePath} is not a valid object`,
        severity: 'error'
      });
      return null;
    }

    // Cast to a record for validation
    const modelData = data as Record<string, unknown>;

    // Validate required fields
    if (!modelData.name || typeof modelData.name !== 'string') {
      this.errors.push({
        message: `Model in ${filePath} is missing a valid 'name' field`,
        severity: 'error'
      });
      return null;
    }

    if (!modelData.tableName || typeof modelData.tableName !== 'string') {
      this.errors.push({
        model: modelData.name,
        message: `Model '${modelData.name}' is missing a valid 'tableName' field`,
        severity: 'error'
      });
      return null;
    }

    if (!Array.isArray(modelData.fields) || modelData.fields.length === 0) {
      this.errors.push({
        model: modelData.name,
        message: `Model '${modelData.name}' must have at least one field`,
        severity: 'error'
      });
      return null;
    }

    // Validate fields
    const fields = this.validateFields(modelData.fields, modelData.name);
    if (!fields) return null;

    // Ensure there's at least one primary key
    const hasPrimaryKey = fields.some(f => f.primaryKey);
    if (!hasPrimaryKey) {
      this.errors.push({
        model: modelData.name,
        message: `Model '${modelData.name}' must have at least one primary key field`,
        severity: 'error'
      });
      return null;
    }

    // Validate enums if present
    let enums: EnumDefinition[] | undefined;
    if (modelData.enums) {
      enums = this.validateEnums(modelData.enums, modelData.name) ?? undefined;
      if (!enums) return null;
    }

    // Validate check constraints if present
    if (modelData.check) {
      const checkValid = this.validateCheckConstraints(modelData.check, modelData.name, fields);
      if (!checkValid) return null;
    }

    // Build the model
    const model: ModelDefinition = {
      name: modelData.name,
      tableName: modelData.tableName,
      fields,
      enums,
      schema: modelData.schema as string | undefined,
      relationships: (modelData.relationships || []) as ModelDefinition['relationships'],
      indexes: (modelData.indexes || []) as ModelDefinition['indexes'],
      check: modelData.check as ModelDefinition['check'],
      timestamps: modelData.timestamps as boolean | undefined,
      description: modelData.description as string | undefined,
      hooks: modelData.hooks as ModelDefinition['hooks'],
      endpoints: modelData.endpoints as ModelDefinition['endpoints']
    };

    return model;
  }

  /**
   * Validate fields array
   */
  private validateFields(fields: unknown[], modelName: string): FieldDefinition[] | null {
    const validatedFields: FieldDefinition[] = [];
    const fieldNames = new Set<string>();

    for (const fieldData of fields) {
      // Type guard for object
      if (typeof fieldData !== 'object' || fieldData === null) {
        this.errors.push({
          model: modelName,
          message: `Field is not a valid object`,
          severity: 'error'
        });
        return null;
      }

      const field = fieldData as Record<string, unknown>;

      // Check for duplicate field names
      if (typeof field.name === 'string' && fieldNames.has(field.name)) {
        this.errors.push({
          model: modelName,
          field: field.name,
          message: `Duplicate field name: ${field.name}`,
          severity: 'error'
        });
        return null;
      }
      if (typeof field.name === 'string') {
        fieldNames.add(field.name);
      }

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

      // Validate enum fields
      if (field.type === 'enum') {
        if (!field.enumName && !field.enumValues) {
          this.errors.push({
            model: modelName,
            field: field.name,
            message: `Enum field '${field.name}' must have either 'enumName' or 'enumValues'`,
            severity: 'error'
          });
          return null;
        }
        if (field.enumName && field.enumValues) {
          this.errors.push({
            model: modelName,
            field: field.name,
            message: `Enum field '${field.name}' cannot have both 'enumName' and 'enumValues'`,
            severity: 'error'
          });
          return null;
        }
        if (field.enumValues) {
          if (!Array.isArray(field.enumValues) || field.enumValues.length === 0) {
            this.errors.push({
              model: modelName,
              field: field.name,
              message: `Enum field '${field.name}' must have at least one value`,
              severity: 'error'
            });
            return null;
          }
          // Check for duplicate values
          const uniqueValues = new Set(field.enumValues);
          if (uniqueValues.size !== field.enumValues.length) {
            this.errors.push({
              model: modelName,
              field: field.name,
              message: `Enum field '${field.name}' has duplicate values`,
              severity: 'error'
            });
            return null;
          }
        }
      }

      // Validate exposed field (boolean or ExposedConfig object)
      if (field.exposed !== undefined) {
        if (!this.validateExposedField(field.exposed, modelName, field.name as string)) {
          return null;
        }
      }

      validatedFields.push(field as unknown as FieldDefinition);
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
   * Validate enum definitions
   */
  private validateEnums(enums: unknown, modelName: string): EnumDefinition[] | null {
    if (!Array.isArray(enums)) {
      this.errors.push({
        model: modelName,
        message: `Enums must be an array`,
        severity: 'error'
      });
      return null;
    }

    const validatedEnums: EnumDefinition[] = [];
    const enumNames = new Set<string>();

    for (const enumData of enums) {
      // Type guard for object
      if (typeof enumData !== 'object' || enumData === null) {
        this.errors.push({
          model: modelName,
          message: `Enum definition is not a valid object`,
          severity: 'error'
        });
        return null;
      }

      const enumDef = enumData as Record<string, unknown>;

      if (!enumDef.name || typeof enumDef.name !== 'string') {
        this.errors.push({
          model: modelName,
          message: `Enum definition is missing a valid 'name'`,
          severity: 'error'
        });
        return null;
      }

      // Check for duplicate enum names
      if (enumNames.has(enumDef.name)) {
        this.errors.push({
          model: modelName,
          message: `Duplicate enum name: ${enumDef.name}`,
          severity: 'error'
        });
        return null;
      }
      enumNames.add(enumDef.name);

      if (!Array.isArray(enumDef.values) || enumDef.values.length === 0) {
        this.errors.push({
          model: modelName,
          message: `Enum '${enumDef.name}' must have at least one value`,
          severity: 'error'
        });
        return null;
      }

      // Check that all values are non-empty strings
      for (const value of enumDef.values) {
        if (typeof value !== 'string' || value.trim() === '') {
          this.errors.push({
            model: modelName,
            message: `Enum '${enumDef.name}' has invalid value: ${value}`,
            severity: 'error'
          });
          return null;
        }
      }

      // Check for duplicate values
      const uniqueValues = new Set(enumDef.values);
      if (uniqueValues.size !== enumDef.values.length) {
        this.errors.push({
          model: modelName,
          message: `Enum '${enumDef.name}' has duplicate values`,
          severity: 'error'
        });
        return null;
      }

      validatedEnums.push(enumDef as unknown as EnumDefinition);
    }

    return validatedEnums;
  }

  /**
   * Check if a type is valid
   */
  private isValidDataType(type: string): boolean {
    const validTypes = [
      'text', 'string', 'integer', 'bigint', 'decimal', 'boolean', 'date', 'uuid', 'json', 'jsonb', 'enum',
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

  /**
   * Validate check constraints
   */
  private validateCheckConstraints(
    checkConstraints: unknown,
    modelName: string,
    fields: FieldDefinition[]
  ): boolean {
    if (typeof checkConstraints !== 'object' || checkConstraints === null) {
      this.errors.push({
        model: modelName,
        message: `Check constraints must be an object`,
        severity: 'error'
      });
      return false;
    }

    const constraints = checkConstraints as Record<string, unknown>;

    // Validate numNotNulls check constraints
    if (constraints.numNotNulls) {
      const constraintDefs = constraints.numNotNulls;

      if (!Array.isArray(constraintDefs)) {
        this.errors.push({
          model: modelName,
          message: `Check constraint 'numNotNulls' must be an array`,
          severity: 'error'
        });
        return false;
      }

      for (const constraintDef of constraintDefs) {
        // Validate structure
        if (typeof constraintDef !== 'object' || constraintDef === null) {
          this.errors.push({
            model: modelName,
            message: `Check constraint 'numNotNulls' must contain objects with 'fields' and 'num' properties`,
            severity: 'error'
          });
          return false;
        }

        // Validate fields property
        if (!Array.isArray(constraintDef.fields) || constraintDef.fields.length === 0) {
          this.errors.push({
            model: modelName,
            message: `Check constraint 'numNotNulls' must have non-empty 'fields' array`,
            severity: 'error'
          });
          return false;
        }

        // Validate num property
        if (typeof constraintDef.num !== 'number' || !Number.isInteger(constraintDef.num) || constraintDef.num < 1) {
          this.errors.push({
            model: modelName,
            message: `Check constraint 'numNotNulls' must have 'num' as a positive integer`,
            severity: 'error'
          });
          return false;
        }

        // Validate num is reasonable (between 1 and field count)
        if (constraintDef.num > constraintDef.fields.length) {
          this.errors.push({
            model: modelName,
            message: `Check constraint 'numNotNulls' 'num' (${constraintDef.num}) cannot exceed field count (${constraintDef.fields.length})`,
            severity: 'error'
          });
          return false;
        }

        // Validate that all field names are strings
        for (const fieldName of constraintDef.fields) {
          if (typeof fieldName !== 'string' || fieldName.trim() === '') {
            this.errors.push({
              model: modelName,
              message: `Check constraint 'numNotNulls' must contain valid field name strings`,
              severity: 'error'
            });
            return false;
          }
        }

        // Validate that all referenced fields exist in the model
        const modelFieldNames = new Set(fields.map(f => f.name));
        for (const fieldName of constraintDef.fields) {
          if (!modelFieldNames.has(fieldName)) {
            this.errors.push({
              model: modelName,
              message: `Check constraint 'numNotNulls' references non-existent field: ${fieldName}`,
              severity: 'error'
            });
            return false;
          }
        }

        // Check for duplicate field names within same constraint
        const uniqueFields = new Set(constraintDef.fields);
        if (uniqueFields.size !== constraintDef.fields.length) {
          this.errors.push({
            model: modelName,
            message: `Check constraint 'numNotNulls' has duplicate field names`,
            severity: 'error'
          });
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate exposed field configuration
   * Only accepts string enum values: "default", "hidden", "create"
   */
  private validateExposedField(
    exposed: unknown,
    modelName: string,
    fieldName: string
  ): boolean {
    const validValues: ExposedType[] = ['default', 'hidden', 'create'];

    if (typeof exposed !== 'string') {
      this.errors.push({
        model: modelName,
        field: fieldName,
        message: `Field '${fieldName}' has invalid 'exposed' value: must be one of "default", "hidden", or "create"`,
        severity: 'error'
      });
      return false;
    }

    if (!validValues.includes(exposed as ExposedType)) {
      this.errors.push({
        model: modelName,
        field: fieldName,
        message: `Field '${fieldName}' has invalid 'exposed' value: "${exposed}". Must be one of "default", "hidden", or "create"`,
        severity: 'error'
      });
      return false;
    }

    return true;
  }
}
