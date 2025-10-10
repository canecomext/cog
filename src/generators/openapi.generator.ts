import { DataType, FieldDefinition, ModelDefinition } from '../types/model.types.ts';

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

    // Generate OpenAPI JSON (for static serving)
    files.set('rest/openapi.json', this.generateOpenAPIJSON());

    return files;
  }

  /**
   * Generate OpenAPI specification as TypeScript module
   */
  private generateOpenAPISpec(): string {
    return `/**
 * OpenAPI 3.1.0 Specification for generated API
 * 
 * This file contains the base OpenAPI specification for all generated CRUD endpoints.
 * It can be merged with custom OpenAPI specs for your application-specific endpoints.
 */

import type { OpenAPIV3_1 as OpenAPI } from 'npm:openapi-types@^12.1.3';

/**
 * Base OpenAPI specification for generated CRUD endpoints
 */
export const generatedOpenAPISpec: OpenAPI.Document = ${JSON.stringify(this.buildOpenAPISpec(), null, 2)};

/**
 * Merge custom OpenAPI specification with generated spec
 * 
 * @param customSpec - Your custom OpenAPI specification
 * @returns Complete OpenAPI specification including both generated and custom endpoints
 */
export function mergeOpenAPISpec(customSpec: Partial<OpenAPI.Document>): OpenAPI.Document {
  return {
    ...generatedOpenAPISpec,
    info: {
      ...generatedOpenAPISpec.info,
      ...customSpec.info,
    },
    servers: [
      ...(generatedOpenAPISpec.servers || []),
      ...(customSpec.servers || []),
    ],
    paths: {
      ...generatedOpenAPISpec.paths,
      ...customSpec.paths,
    },
    components: {
      schemas: {
        ...generatedOpenAPISpec.components?.schemas,
        ...customSpec.components?.schemas,
      },
      responses: {
        ...generatedOpenAPISpec.components?.responses,
        ...customSpec.components?.responses,
      },
      parameters: {
        ...generatedOpenAPISpec.components?.parameters,
        ...customSpec.components?.parameters,
      },
      requestBodies: {
        ...generatedOpenAPISpec.components?.requestBodies,
        ...customSpec.components?.requestBodies,
      },
      securitySchemes: {
        ...generatedOpenAPISpec.components?.securitySchemes,
        ...customSpec.components?.securitySchemes,
      },
    },
    tags: [
      ...(generatedOpenAPISpec.tags || []),
      ...(customSpec.tags || []),
    ],
    security: customSpec.security || generatedOpenAPISpec.security,
  };
}

/**
 * Get OpenAPI specification as JSON string
 */
export function getOpenAPIJSON(customSpec?: Partial<OpenAPI.Document>): string {
  const spec = customSpec ? mergeOpenAPISpec(customSpec) : generatedOpenAPISpec;
  return JSON.stringify(spec, null, 2);
}
`;
  }

  /**
   * Generate static OpenAPI JSON file
   */
  private generateOpenAPIJSON(): string {
    return JSON.stringify(this.buildOpenAPISpec(), null, 2);
  }

  /**
   * Build the complete OpenAPI specification object
   */
  private buildOpenAPISpec(): any {
    const spec: any = {
      openapi: '3.1.0',
      info: {
        title: 'Generated CRUD API',
        version: '1.0.0',
        description: 'Auto-generated REST API for CRUD operations. This specification can be extended with custom endpoints.',
      },
      servers: [
        {
          url: '/api',
          description: 'API base path',
        },
      ],
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
      const modelNamePlural = model.plural?.toLowerCase() || this.pluralize(modelNameLower);

      // Add tag for this model
      spec.tags.push({
        name: model.name,
        description: model.description || `${model.name} operations`,
      });

      // Generate schemas
      spec.components.schemas[model.name] = this.generateModelSchema(model, false);
      spec.components.schemas[`${model.name}Input`] = this.generateModelSchema(model, true);
      spec.components.schemas[`${model.name}Update`] = this.generateModelSchema(model, true, true);

      // Generate CRUD paths
      spec.paths[`/${modelNamePlural}`] = this.generateListAndCreatePaths(model);
      spec.paths[`/${modelNamePlural}/{id}`] = this.generateDetailPaths(model);

      // Generate relationship paths
      if (model.relationships) {
        for (const rel of model.relationships) {
          if (rel.type === 'oneToMany') {
            spec.paths[`/${modelNamePlural}/{id}/${rel.name}`] = this.generateOneToManyRelationshipPath(model, rel);
          } else if (rel.type === 'manyToMany') {
            spec.paths[`/${modelNamePlural}/{id}/${rel.name}`] = this.generateManyToManyRelationshipPaths(model, rel);
            
            const singularRel = this.singularize(rel.name);
            spec.paths[`/${modelNamePlural}/{id}/${rel.name}/{${singularRel}Id}`] = 
              this.generateManyToManyDetailPaths(model, rel);
          }
        }
      }
    }

    // Add common responses
    spec.components.responses = {
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
    spec.components.parameters = {
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
  private generateModelSchema(model: ModelDefinition, isInput: boolean = false, isUpdate: boolean = false): any {
    const schema: any = {
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

      schema.properties[field.name] = this.generateFieldSchema(field);

      // Add to required array if field is required and not an update schema
      if (!isUpdate && (field.required || field.primaryKey) && !field.defaultValue) {
        schema.required.push(field.name);
      }
    }

    // Add timestamp fields if enabled (not in input schemas)
    if (!isInput && model.timestamps) {
      schema.properties.createdAt = {
        type: 'string',
        format: 'date-time',
        description: 'Creation timestamp',
      };
      schema.properties.updatedAt = {
        type: 'string',
        format: 'date-time',
        description: 'Last update timestamp',
      };
      schema.required.push('createdAt', 'updatedAt');
    }

    // Add soft delete field if enabled (not in input schemas)
    if (!isInput && model.softDelete) {
      schema.properties.deletedAt = {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'Deletion timestamp (null if not deleted)',
      };
    }

    // Remove required array if empty or if update schema
    if (schema.required.length === 0 || isUpdate) {
      delete schema.required;
    }

    return schema;
  }

  /**
   * Generate schema for a field
   */
  private generateFieldSchema(field: FieldDefinition): any {
    const schema: any = this.getBaseTypeSchema(field.type);

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
        schema.description = `${schema.description || ''} (precision: ${field.precision}${field.scale ? `, scale: ${field.scale}` : ''})`.trim();
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
   * Get base OpenAPI schema type for a data type
   */
  private getBaseTypeSchema(type: DataType): any {
    const typeMap: Record<string, any> = {
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
  private generateListAndCreatePaths(model: ModelDefinition): any {
    const modelNamePlural = model.plural?.toLowerCase() || this.pluralize(model.name.toLowerCase());

    return {
      get: {
        tags: [model.name],
        summary: `List ${modelNamePlural}`,
        description: `Retrieve a paginated list of ${modelNamePlural}`,
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
      },
      post: {
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
      },
    };
  }

  /**
   * Generate paths for get, update, and delete operations
   */
  private generateDetailPaths(model: ModelDefinition): any {
    return {
      get: {
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
      },
      put: {
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
      },
      patch: {
        tags: [model.name],
        summary: `Partially update ${model.name}`,
        description: `Partially update an existing ${model.name}`,
        operationId: `patch${model.name}`,
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
      },
      delete: {
        tags: [model.name],
        summary: `Delete ${model.name}`,
        description: `Delete a ${model.name}${model.softDelete ? ' (soft delete)' : ''}`,
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
      },
    };
  }

  /**
   * Generate path for one-to-many relationship
   */
  private generateOneToManyRelationshipPath(model: ModelDefinition, rel: any): any {
    const modelNamePlural = model.plural?.toLowerCase() || this.pluralize(model.name.toLowerCase());

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
  private generateManyToManyRelationshipPaths(model: ModelDefinition, rel: any): any {
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
  private generateManyToManyDetailPaths(model: ModelDefinition, rel: any): any {
    const singularRel = this.singularize(rel.name);

    return {
      post: {
        tags: [model.name],
        summary: `Add a ${singularRel} to ${model.name}`,
        description: `Add a specific ${singularRel} to a ${model.name}`,
        operationId: `add${model.name}${this.capitalize(singularRel)}`,
        parameters: [
          { $ref: '#/components/parameters/IdParameter' },
          {
            name: `${singularRel}Id`,
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
        summary: `Remove a ${singularRel} from ${model.name}`,
        description: `Remove a specific ${singularRel} from a ${model.name}`,
        operationId: `remove${model.name}${this.capitalize(singularRel)}`,
        parameters: [
          { $ref: '#/components/parameters/IdParameter' },
          {
            name: `${singularRel}Id`,
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
   * Simple pluralization
   */
  private pluralize(word: string): string {
    if (
      word.endsWith('ies') || word.endsWith('ses') || word.endsWith('xes') ||
      word.endsWith('ches') || word.endsWith('shes')
    ) {
      return word;
    }
    if (word.endsWith('s') && !word.endsWith('ss')) {
      return word;
    }
    if (word.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].some((ending) => word.endsWith(ending))) {
      return word.slice(0, -1) + 'ies';
    }
    if (
      word.endsWith('ss') || word.endsWith('x') ||
      word.endsWith('ch') || word.endsWith('sh')
    ) {
      return word + 'es';
    }
    return word + 's';
  }

  /**
   * Simple singularization
   */
  private singularize(word: string): string {
    if (word.endsWith('ies')) {
      return word.slice(0, -3) + 'y';
    }
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('ches') || word.endsWith('shes')) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s') && !word.endsWith('ss')) {
      return word.slice(0, -1);
    }
    return word;
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
