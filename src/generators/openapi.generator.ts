import { DataType, FieldDefinition, ModelDefinition, RelationshipDefinition } from '../types/model.types.ts';

/**
 * Generates OpenAPI 3.1.0 specification from model definitions
 */
export class OpenAPIGenerator {
  private models: ModelDefinition[];

  constructor(models: ModelDefinition[]) {
    this.models = models;
  }

  /**
   * Generate OpenAPI specification files
   */
  generateOpenAPI(): Map<string, string> {
    const files = new Map<string, string>();

    // Generate the main OpenAPI spec file
    files.set('rest/openapi.ts', this.generateOpenAPISpec());

    return files;
  }

  /**
   * Generate OpenAPI specification as TypeScript module
   */
  private generateOpenAPISpec(): string {
    // Pre-serialize the spec template (without basePath, which is runtime-determined)
    const specTemplate = this.buildOpenAPISpecTemplate();

    return `/**
 * OpenAPI 3.1.0 Specification for generated API
 *
 * This file contains the runtime OpenAPI specification builder for all generated CRUD endpoints.
 * The specification is generated at runtime with the provided basePath.
 */

import type { OpenAPIV3_1 as OpenAPI } from 'openapi-types';
import { DomainException } from '../domain/exceptions.ts';

/**
 * Build OpenAPI specification with the given basePath
 *
 * @param basePath - The API base path (e.g., '/api', '/api/v1')
 * @returns Complete OpenAPI specification for the generated API
 * @throws {DomainException} If basePath is not provided
 */
export function buildOpenAPISpec(basePath: string): OpenAPI.Document {
  if (!basePath) {
    throw new DomainException('basePath is required to build OpenAPI specification');
  }

  const spec: Record<string, unknown> = ${JSON.stringify(specTemplate, null, 2)};

  // Set the basePath in servers
  spec.servers = [
    {
      url: basePath,
      description: 'API base path',
    },
  ];

  return spec as OpenAPI.Document;
}

/**
 * Merge custom OpenAPI specification with generated spec
 *
 * @param basePath - The API base path (e.g., '/api', '/api/v1')
 * @param customSpec - Your custom OpenAPI specification
 * @returns Complete OpenAPI specification including both generated and custom endpoints
 */
export function mergeOpenAPISpec(basePath: string, customSpec: Partial<OpenAPI.Document>): OpenAPI.Document {
  const generatedSpec = buildOpenAPISpec(basePath);

  return {
    ...generatedSpec,
    info: {
      ...generatedSpec.info,
      ...customSpec.info,
    },
    servers: [
      ...(generatedSpec.servers || []),
      ...(customSpec.servers || []),
    ],
    paths: {
      ...generatedSpec.paths,
      ...customSpec.paths,
    },
    components: {
      schemas: {
        ...generatedSpec.components?.schemas,
        ...customSpec.components?.schemas,
      },
      responses: {
        ...generatedSpec.components?.responses,
        ...customSpec.components?.responses,
      },
      parameters: {
        ...generatedSpec.components?.parameters,
        ...customSpec.components?.parameters,
      },
      requestBodies: {
        ...generatedSpec.components?.requestBodies,
        ...customSpec.components?.requestBodies,
      },
      securitySchemes: {
        ...generatedSpec.components?.securitySchemes,
        ...customSpec.components?.securitySchemes,
      },
    },
    tags: [
      ...(generatedSpec.tags || []),
      ...(customSpec.tags || []),
    ],
    security: customSpec.security || generatedSpec.security,
  };
}

/**
 * Get OpenAPI specification as JSON string
 *
 * @param basePath - The API base path (e.g., '/api', '/api/v1')
 * @param customSpec - Optional custom OpenAPI specification to merge
 * @returns JSON string of the OpenAPI specification
 */
export function getOpenAPIJSON(basePath: string, customSpec?: Partial<OpenAPI.Document>): string {
  const spec = customSpec ? mergeOpenAPISpec(basePath, customSpec) : buildOpenAPISpec(basePath);
  return JSON.stringify(spec, null, 2);
}
`;
  }

  /**
   * Build the OpenAPI specification template (without basePath)
   */
  private buildOpenAPISpecTemplate(): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      openapi: '3.1.0',
      info: {
        title: 'Generated CRUD API',
        version: '1.0.0',
        description:
          'Auto-generated REST API for CRUD operations. This specification can be extended with custom endpoints.',
      },
      paths: {},
      components: {
        schemas: {},
        parameters: {},
        responses: {},
      },
      tags: [],
    };

    // Generate schemas for each model
    for (const model of this.models) {
      const modelNameLower = model.name.toLowerCase();

      // Add tag for this model
      (spec.tags as unknown[]).push({
        name: model.name,
        description: model.description || `${model.name} operations`,
      });

      // Generate schemas
      (spec.components as Record<string, Record<string, unknown>>).schemas[model.name] = this.generateModelSchema(
        model,
        false,
      );
      (spec.components as Record<string, Record<string, unknown>>).schemas[`${model.name}Input`] = this
        .generateModelSchema(model, true);
      (spec.components as Record<string, Record<string, unknown>>).schemas[`${model.name}Update`] = this
        .generateModelSchema(model, true, true);

      // Generate CRUD paths (using singular model names)
      const listAndCreatePaths = this.generateListAndCreatePaths(model);
      if (Object.keys(listAndCreatePaths).length > 0) {
        (spec.paths as Record<string, unknown>)[`/${modelNameLower}`] = listAndCreatePaths;
      }

      const detailPaths = this.generateDetailPaths(model);
      if (Object.keys(detailPaths).length > 0) {
        (spec.paths as Record<string, unknown>)[`/${modelNameLower}/{id}`] = detailPaths;
      }

      // Generate relationship paths
      if (model.relationships) {
        for (const rel of model.relationships) {
          if (rel.type === 'oneToMany') {
            const targetName = rel.target;
            (spec.paths as Record<string, unknown>)[`/${modelNameLower}/{id}/${targetName.toLowerCase()}List`] = this
              .generateOneToManyRelationshipPath(model, rel);
          } else if (rel.type === 'manyToMany') {
            const targetName = rel.target;
            const targetNameLower = targetName.toLowerCase();
            (spec.paths as Record<string, unknown>)[`/${modelNameLower}/{id}/${targetNameLower}List`] = this
              .generateManyToManyRelationshipPaths(model, rel);

            (spec.paths as Record<string, unknown>)[
              `/${modelNameLower}/{id}/${targetNameLower}List/{${targetNameLower}Id}`
            ] = this.generateManyToManyDetailPaths(model, rel);
          }
        }
      }
    }

    // Add common responses
    (spec.components as Record<string, unknown>).responses = {
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
              },
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      path: { type: 'array', items: { type: 'string' } },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    };

    // Add common parameters
    (spec.components as Record<string, unknown>).parameters = {
      IdParameter: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Resource ID',
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      LimitParameter: {
        name: 'limit',
        in: 'query',
        description: 'Maximum number of items to return',
        schema: {
          type: 'integer',
          default: 10,
          minimum: 1,
          maximum: 100,
        },
      },
      OffsetParameter: {
        name: 'offset',
        in: 'query',
        description: 'Number of items to skip',
        schema: {
          type: 'integer',
          default: 0,
          minimum: 0,
        },
      },
      OrderByParameter: {
        name: 'orderBy',
        in: 'query',
        description: 'Field to order by',
        schema: {
          type: 'string',
        },
      },
      OrderDirectionParameter: {
        name: 'orderDirection',
        in: 'query',
        description: 'Order direction',
        schema: {
          type: 'string',
          enum: ['asc', 'desc'],
          default: 'asc',
        },
      },
    };

    return spec;
  }

  /**
   * Generate schema for a model
   */
  private generateModelSchema(
    model: ModelDefinition,
    isInput: boolean = false,
    isUpdate: boolean = false,
  ): Record<string, unknown> {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Add description if available
    if (model.description) {
      schema.description = model.description;
    }

    // Generate properties from fields
    for (const field of model.fields) {
      // Skip generated fields in input schemas
      if (isInput && field.primaryKey && field.defaultValue) {
        continue;
      }

      (schema.properties as Record<string, unknown>)[field.name] = this.generateFieldSchema(field, model);

      // Add to required array if field is required and not an update schema
      if (!isUpdate && (field.required || field.primaryKey) && !field.defaultValue) {
        (schema.required as string[]).push(field.name);
      }
    }

    // Add timestamp fields if enabled (not in input schemas)
    if (!isInput && model.timestamps) {
      (schema.properties as Record<string, unknown>).createdAt = {
        type: 'string',
        format: 'date-time',
        description: 'Creation timestamp',
      };
      (schema.properties as Record<string, unknown>).updatedAt = {
        type: 'string',
        format: 'date-time',
        description: 'Last update timestamp',
      };
      (schema.required as string[]).push('createdAt', 'updatedAt');
    }

    // Remove required array if empty or if update schema
    if ((schema.required as string[]).length === 0 || isUpdate) {
      delete schema.required;
    }

    return schema;
  }

  /**
   * Generate schema for a field
   */
  private generateFieldSchema(field: FieldDefinition, model?: ModelDefinition): Record<string, unknown> {
    // Handle enum fields specially
    if (field.type === 'enum') {
      return this.generateEnumFieldSchema(field, model);
    }

    const schema: Record<string, unknown> = this.getBaseTypeSchema(field.type);

    // Add description if available
    if (field.name) {
      // Generate description from field name if not provided
      const description = field.name.replace(/([A-Z])/g, ' $1').trim();
      schema.description = description.charAt(0).toUpperCase() + description.slice(1);
    }

    // Add format
    if (field.type === 'date') {
      schema.format = 'date-time';
    } else if (field.type === 'uuid') {
      schema.format = 'uuid';
    } else if (field.type === 'string' && field.name?.toLowerCase().includes('email')) {
      schema.format = 'email';
    }

    // Add constraints
    if (field.type === 'string' && field.maxLength) {
      schema.maxLength = field.maxLength;
    }

    if (field.type === 'decimal') {
      if (field.precision) {
        schema.description = `${schema.description || ''} (precision: ${field.precision}${
          field.scale ? `, scale: ${field.scale}` : ''
        })`.trim();
      }
    }

    // Handle arrays
    if (field.array) {
      return {
        type: 'array',
        items: schema,
        description: `Array of ${schema.description || field.type}`,
      };
    }

    // Add nullable if not required (OpenAPI 3.1.0 uses type arrays for nullable)
    if (!field.required && !field.primaryKey) {
      // Convert type to array format: ["string", "null"]
      const currentType = schema.type;
      schema.type = [currentType, 'null'];
    }

    // Add default value if specified
    if (field.defaultValue !== undefined && typeof field.defaultValue !== 'string') {
      schema.default = field.defaultValue;
    }

    return schema;
  }

  /**
   * Generate schema for enum field
   */
  private generateEnumFieldSchema(field: FieldDefinition, model?: ModelDefinition): Record<string, unknown> {
    let enumValues: string[] = [];
    let enumDef: { name: string; values: string[]; useBitwise?: boolean } | undefined = undefined;

    // Get enum values
    if (field.enumName && model) {
      enumDef = model.enums?.find((e) => e.name === field.enumName);
      if (enumDef) {
        enumValues = enumDef.values;
      }
    } else if (field.enumValues) {
      enumValues = field.enumValues;
    }

    // Check if using bitwise storage
    if (enumDef?.useBitwise) {
      // For bitwise enums, use integer in OpenAPI
      const schema: Record<string, unknown> = {
        type: 'integer',
        description: `Bitwise flags for ${field.name}. Values: ${enumValues.join(', ')}`,
      };

      if (!field.required && !field.primaryKey) {
        schema.type = ['integer', 'null'];
      }

      return schema;
    }

    // Standard enum field
    const schema: Record<string, unknown> = {
      type: 'string',
      enum: enumValues,
    };

    // Add description
    if (field.name) {
      const description = field.name.replace(/([A-Z])/g, ' $1').trim();
      schema.description = `${description.charAt(0).toUpperCase() + description.slice(1)}. Allowed values: ${
        enumValues.join(', ')
      }`;
    }

    // Handle arrays
    if (field.array) {
      return {
        type: 'array',
        items: {
          type: 'string',
          enum: enumValues,
        },
        description: `Array of enum values. Allowed values: ${enumValues.join(', ')}`,
      };
    }

    // Add nullable if not required
    if (!field.required && !field.primaryKey) {
      schema.type = ['string', 'null'];
    }

    return schema;
  }

  /**
   * Get base OpenAPI schema type for a data type
   */
  private getBaseTypeSchema(type: DataType): Record<string, unknown> {
    const typeMap: Record<string, Record<string, unknown>> = {
      text: { type: 'string' },
      string: { type: 'string' },
      integer: { type: 'integer', format: 'int32' },
      bigint: { type: 'integer', format: 'int64' },
      decimal: { type: 'number', format: 'double' },
      boolean: { type: 'boolean' },
      date: { type: 'string', format: 'date-time' },
      uuid: { type: 'string', format: 'uuid' },
      json: { type: 'object' },
      jsonb: { type: 'object' },
      enum: { type: 'string' }, // Will be overridden by generateEnumFieldSchema
      // PostGIS types - represented as objects or strings
      point: { type: 'object', description: 'GeoJSON Point' },
      linestring: { type: 'object', description: 'GeoJSON LineString' },
      polygon: { type: 'object', description: 'GeoJSON Polygon' },
      multipoint: { type: 'object', description: 'GeoJSON MultiPoint' },
      multilinestring: { type: 'object', description: 'GeoJSON MultiLineString' },
      multipolygon: { type: 'object', description: 'GeoJSON MultiPolygon' },
      geometry: { type: 'object', description: 'GeoJSON Geometry' },
      geography: { type: 'object', description: 'GeoJSON Geography' },
    };

    return typeMap[type] || { type: 'string' };
  }

  /**
   * Generate paths for list and create operations
   */
  private generateListAndCreatePaths(model: ModelDefinition): Record<string, unknown> {
    const paths: Record<string, unknown> = {};

    // Only add GET if readMany is not explicitly disabled
    if (model.endpoints?.readMany !== false) {
      paths.get = {
        tags: [model.name],
        summary: `List ${model.name} records`,
        description: `Retrieve a paginated list of ${model.name} records`,
        operationId: `list${model.name}`,
        parameters: [
          { $ref: '#/components/parameters/LimitParameter' },
          { $ref: '#/components/parameters/OffsetParameter' },
          { $ref: '#/components/parameters/OrderByParameter' },
          { $ref: '#/components/parameters/OrderDirectionParameter' },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: `#/components/schemas/${model.name}` },
                    },
                    pagination: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      };
    }

    // Only add POST if create is not explicitly disabled
    if (model.endpoints?.create !== false) {
      paths.post = {
        tags: [model.name],
        summary: `Create a ${model.name}`,
        description: `Create a new ${model.name}`,
        operationId: `create${model.name}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${model.name}Input` },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created successfully',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${model.name}` },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      };
    }

    return paths;
  }

  /**
   * Generate paths for get, update, and delete operations
   */
  private generateDetailPaths(model: ModelDefinition): Record<string, unknown> {
    const paths: Record<string, unknown> = {};

    // Only add GET if readOne is not explicitly disabled
    if (model.endpoints?.readOne !== false) {
      paths.get = {
        tags: [model.name],
        summary: `Get ${model.name} by ID`,
        description: `Retrieve a single ${model.name} by its ID`,
        operationId: `get${model.name}ById`,
        parameters: [
          { $ref: '#/components/parameters/IdParameter' },
          {
            name: 'include',
            in: 'query',
            description: 'Comma-separated list of relationships to include',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${model.name}` },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      };
    }

    // Only add PUT if update is not explicitly disabled
    if (model.endpoints?.update !== false) {
      paths.put = {
        tags: [model.name],
        summary: `Update ${model.name}`,
        description: `Update an existing ${model.name}`,
        operationId: `update${model.name}`,
        parameters: [{ $ref: '#/components/parameters/IdParameter' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${model.name}Update` },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated successfully',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${model.name}` },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      };
    }

    // Only add DELETE if delete is not explicitly disabled
    if (model.endpoints?.delete !== false) {
      paths.delete = {
        tags: [model.name],
        summary: `Delete ${model.name}`,
        description: `Delete a ${model.name}`,
        operationId: `delete${model.name}`,
        parameters: [{ $ref: '#/components/parameters/IdParameter' }],
        responses: {
          '200': {
            description: 'Deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      };
    }

    return paths;
  }

  /**
   * Generate path for one-to-many relationship
   */
  private generateOneToManyRelationshipPath(
    model: ModelDefinition,
    rel: RelationshipDefinition,
  ): Record<string, unknown> {
    const targetName = rel.target;

    return {
      get: {
        tags: [model.name],
        summary: `Get ${targetName} list for ${model.name}`,
        description: `Retrieve all ${targetName} records associated with a ${model.name}`,
        operationId: `get${model.name}${targetName}List`,
        parameters: [{ $ref: '#/components/parameters/IdParameter' }],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { type: 'object' },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
    };
  }

  /**
   * Generate paths for many-to-many relationship collection operations
   */
  private generateManyToManyRelationshipPaths(
    model: ModelDefinition,
    rel: RelationshipDefinition,
  ): Record<string, unknown> {
    const junctionItemSchema = {
      type: 'string',
      format: 'uuid',
      description: 'ID of the related resource',
    };

    return {
      get: {
        tags: [model.name],
        summary: `Get ${rel.name} for ${model.name}`,
        description: `Retrieve all ${rel.name} associated with a ${model.name}`,
        operationId: `get${model.name}${this.capitalize(rel.name)}`,
        parameters: [{ $ref: '#/components/parameters/IdParameter' }],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: `#/components/schemas/${rel.target}` },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
      post: {
        tags: [model.name],
        summary: `Add ${rel.name} to ${model.name}`,
        description: `Add multiple ${rel.name} to a ${model.name}`,
        operationId: `add${model.name}${this.capitalize(rel.name)}`,
        parameters: [{ $ref: '#/components/parameters/IdParameter' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  [rel.name]: {
                    type: 'array',
                    items: junctionItemSchema,
                    description: `Array of ${rel.name} IDs`,
                  },
                },
                required: [rel.name],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Added successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
      put: {
        tags: [model.name],
        summary: `Replace ${rel.name} for ${model.name}`,
        description: `Replace all ${rel.name} for a ${model.name}`,
        operationId: `set${model.name}${this.capitalize(rel.name)}`,
        parameters: [{ $ref: '#/components/parameters/IdParameter' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  [rel.name]: {
                    type: 'array',
                    items: junctionItemSchema,
                    description: `Array of ${rel.name} IDs`,
                  },
                },
                required: [rel.name],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
      delete: {
        tags: [model.name],
        summary: `Remove ${rel.name} from ${model.name}`,
        description: `Remove multiple ${rel.name} from a ${model.name}`,
        operationId: `remove${model.name}${this.capitalize(rel.name)}`,
        parameters: [{ $ref: '#/components/parameters/IdParameter' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ids: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Removed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
    };
  }

  /**
   * Generate paths for many-to-many individual item operations
   */
  private generateManyToManyDetailPaths(model: ModelDefinition, rel: RelationshipDefinition): Record<string, unknown> {
    const targetName = rel.target;
    const targetNameLower = targetName.toLowerCase();

    return {
      post: {
        tags: [model.name],
        summary: `Add a ${targetName} to ${model.name}`,
        description: `Add a specific ${targetName} to a ${model.name}`,
        operationId: `add${model.name}${targetName}`,
        parameters: [
          { $ref: '#/components/parameters/IdParameter' },
          {
            name: `${targetNameLower}Id`,
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '201': {
            description: 'Added successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
      delete: {
        tags: [model.name],
        summary: `Remove a ${targetName} from ${model.name}`,
        description: `Remove a specific ${targetName} from a ${model.name}`,
        operationId: `remove${model.name}${targetName}`,
        parameters: [
          { $ref: '#/components/parameters/IdParameter' },
          {
            name: `${targetNameLower}Id`,
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Removed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
    };
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get OpenAPI type information for a field type
   */
  private getOpenAPIType(fieldType: string): { type: string; format?: string } {
    const typeMap: Record<string, { type: string; format?: string }> = {
      'text': { type: 'string' },
      'string': { type: 'string' },
      'integer': { type: 'integer', format: 'int32' },
      'bigint': { type: 'integer', format: 'int64' },
      'decimal': { type: 'number', format: 'double' },
      'boolean': { type: 'boolean' },
      'date': { type: 'string', format: 'date-time' },
      'uuid': { type: 'string', format: 'uuid' },
      'json': { type: 'object' },
      'jsonb': { type: 'object' },
      'enum': { type: 'string' },
    };
    return typeMap[fieldType] || { type: 'string' };
  }
}
