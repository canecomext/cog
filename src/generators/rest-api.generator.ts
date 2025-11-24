import { ModelDefinition } from '../types/model.types.ts';

/**
 * Generates REST API endpoints for Hono
 */
export class RestAPIGenerator {
  private models: ModelDefinition[];

  constructor(models: ModelDefinition[]) {
    this.models = models;
  }

  /**
   * Generate REST API files
   */
  generateRestAPIs(): Map<string, string> {
    const files = new Map<string, string>();

    // Generate shared types
    files.set('rest/types.ts', this.generateSharedTypes());

    // Generate shared helper functions
    files.set('rest/helpers.ts', this.generateRestHelpers());

    // Generate individual REST endpoints
    for (const model of this.models) {
      const restAPI = this.generateModelRestAPI(model);
      files.set(`rest/${model.name.toLowerCase()}.rest.ts`, restAPI);
    }

    // Generate REST registration file
    files.set('rest/index.ts', this.generateRestIndex());

    return files;
  }

  /**
   * Generate REST API for a model
   */
  private generateModelRestAPI(model: ModelDefinition): string {
    const modelName = model.name;
    const modelNameLower = model.name.toLowerCase();

    return `import { Hono, type Context } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { NotFoundException, DomainException } from '../domain/exceptions.ts';
import { ${modelNameLower}Domain } from '../domain/${modelNameLower}.domain.ts';
import { withTransaction } from '../db/database.ts'; // Only used for write operations
import { ${modelName}, New${modelName} } from '../schema/${modelNameLower}.schema.ts';
import type { DefaultEnv } from './types.ts';
import { convertBigIntToNumber, handleDomainException } from './helpers.ts';

/**
 * ${modelName} REST Routes
 * Handles HTTP endpoints (thin routing layer)
 */
class ${modelName}RestRoutes<RestEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  public routes: Hono<{ Variables: RestEnvVars }>;

  constructor() {
    this.routes = new Hono<{ Variables: RestEnvVars }>();
    this.registerRoutes();
  }

  private registerRoutes() {
${
      model.endpoints?.readMany !== false
        ? `    /**
     * GET /${modelNameLower}
     * List all ${modelNameLower} with pagination
     */
    this.routes.get('/', async (c) => {
      try {
        const context = c.var as RestEnvVars;
        const { limit = '10', offset = '0', orderBy, orderDirection = 'asc', include } = c.req.query();

        // Parse include parameter
        const includeArray = include ? include.split(',') : undefined;

        // No transaction needed for read operations
        const result = await ${modelNameLower}Domain.findMany(
          undefined, // No transaction
          includeArray ? { include: includeArray } : undefined, // Filter with include
          {
            limit: parseInt(limit),
            offset: parseInt(offset),
            orderBy,
            orderDirection: orderDirection as 'asc' | 'desc'
          },
          context // Pass all context variables to domain hooks
        );

        return c.json({
          data: convertBigIntToNumber(result.data),
          pagination: {
            total: result.total,
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        });
      } catch (error) {
        handleDomainException(error);
      }
    });
`
        : ''
    }
${
      model.endpoints?.readOne !== false
        ? `    /**
     * GET /${modelNameLower}/:id
     * Get a single ${modelName} by ID
     */
    this.routes.get('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const context = c.var as RestEnvVars;
        const include = c.req.query('include')?.split(',');

        // No transaction needed for read operations
        const result = await ${modelNameLower}Domain.findById(
          id,
          undefined, // No transaction
          { include },
          context // Pass all context variables to domain hooks
        );

        if (!result) {
          throw new HTTPException(404, { message: '${modelName} not found' });
        }

        return c.json({ data: convertBigIntToNumber(result) });
      } catch (error) {
        handleDomainException(error);
      }
    });
`
        : ''
    }
${
      model.endpoints?.create !== false
        ? `    /**
     * POST /${modelNameLower}
     * Create a new ${modelName}
     */
    this.routes.post('/', async (c) => {
      try {
        const body = await c.req.json();
        const context = c.var as RestEnvVars;

        const result = await withTransaction(async (tx) => {
          return await ${modelNameLower}Domain.create(
            body,
            tx,
            context // Pass all context variables to domain hooks
          );
        });

        return c.json({ data: convertBigIntToNumber(result) }, 201);
      } catch (error) {
        handleDomainException(error);
      }
    });
`
        : ''
    }
${
      model.endpoints?.update !== false
        ? `    /**
     * PUT /${modelNameLower}/:id
     * Update a ${modelName}
     */
    this.routes.put('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const context = c.var as RestEnvVars;

        const result = await withTransaction(async (tx) => {
          return await ${modelNameLower}Domain.update(
            id,
            body,
            tx,
            context // Pass all context variables to domain hooks
          );
        });

        return c.json({ data: convertBigIntToNumber(result) });
      } catch (error) {
        handleDomainException(error);
      }
    });
`
        : ''
    }
${
      model.endpoints?.delete !== false
        ? `    /**
     * DELETE /${modelNameLower}/:id
     * Delete a ${modelName}
     */
    this.routes.delete('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const context = c.var as RestEnvVars;

        const result = await withTransaction(async (tx) => {
          return await ${modelNameLower}Domain.delete(
            id,
            tx,
            context // Pass all context variables to domain hooks
          );
        });

        return c.json({ data: convertBigIntToNumber(result) });
      } catch (error) {
        handleDomainException(error);
      }
    });
`
        : ''
    }
${this.generateRelationshipEndpointsWithHooks(model)}
  }
}

// Export singleton instance
export let ${modelNameLower}Routes = new ${modelName}RestRoutes().routes;

// Export function to initialize routes
export function initialize${modelName}RestRoutes<RestEnvVars extends Record<string, unknown> = Record<string, unknown>>() {
  const instance = new ${modelName}RestRoutes();
  ${modelNameLower}Routes = instance.routes as unknown as Hono<{ Variables: Record<string, unknown> }>;
  return instance.routes;
}
`;
  }

  /**
   * Generate shared types file
   */
  private generateSharedTypes(): string {
    return `/**
 * Shared types for REST API
 *
 * Note: The Env type should be defined in your application code.
 * This allows you to customize the Variables available in your Hono context.
 *
 * Example:
 * export type Env = {
 *   Variables: {
 *     requestId?: string;
 *     userId?: string;
 *     // Add your custom variables here
 *   }
 * }
 */

// Default minimal Env type for generated routes
// You should override this in your application
export type DefaultEnv = {
  Variables: {
    [key: string]: unknown;
  }
}
`;
  }

  /**
   * Generate shared helper functions for REST API
   */
  private generateRestHelpers(): string {
    return `import { HTTPException } from '@hono/hono/http-exception';
import { NotFoundException, DomainException } from '../domain/exceptions.ts';

/**
 * Converts BigInt values to numbers for JSON serialization
 * Dates are stored as EPOCH milliseconds (bigint) and need conversion for JSON
 */
export function convertBigIntToNumber<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') {
    return Number(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertBigIntToNumber(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigIntToNumber(value);
    }
    return converted as T;
  }

  return obj;
}

/**
 * Converts domain exceptions to HTTP exceptions
 * Handles centralized error conversion from domain layer
 */
export function handleDomainException(error: unknown): never {
  if (error instanceof NotFoundException) {
    throw new HTTPException(404, { message: error.message });
  }
  if (error instanceof DomainException) {
    throw new HTTPException(500, { message: error.message });
  }
  throw error; // Re-throw unknown errors
}
`;
  }

  /**
   * Generate many-to-many relationship endpoints
   */
  private generateRelationshipEndpointsWithHooks(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '';
    }

    const endpoints: string[] = [];
    const modelNameLower = model.name.toLowerCase();

    for (const rel of model.relationships) {
      if (rel.type === 'manyToMany' && rel.through) {
        const relName = rel.name;
        const RelName = this.capitalize(relName);
        const targetNameLower = rel.target.toLowerCase();
        const targetName = rel.target;

        // Derive singular form by removing "List" suffix if present
        const singularRelName = relName.endsWith('List') ? relName.slice(0, -4) : relName;
        const SingularRelName = this.capitalize(singularRelName);

        // GET relationship list
        if (rel.endpoints?.get !== false) {
          endpoints.push(`
    /**
     * GET /${modelNameLower}/:id/${relName}
     * Get ${relName} for a ${model.name}
     */
    this.routes.get('/:id/${relName}', async (c) => {
      try {
        const id = c.req.param('id');

        const result = await ${modelNameLower}Domain.get${RelName}(id);

        return c.json({ data: convertBigIntToNumber(result) });
      } catch (error) {
        handleDomainException(error);
      }
    });`);
        }

        // POST bulk add
        if (rel.endpoints?.add !== false) {
          endpoints.push(`
    /**
     * POST /${modelNameLower}/:id/${relName}
     * Add multiple ${relName} to a ${model.name}
     */
    this.routes.post('/:id/${relName}', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const ids = body.ids || [];

        await withTransaction(async (tx) => {
          await ${modelNameLower}Domain.add${RelName}(id, ids, body, tx);
        });

        return c.json({ data: { message: '${relName} added successfully' } }, 201);
      } catch (error) {
        handleDomainException(error);
      }
    });`);

          // POST single add
          endpoints.push(`
    /**
     * POST /${modelNameLower}/:id/${singularRelName}
     * Add a specific ${singularRelName} to a ${model.name}
     */
    this.routes.post('/:id/${singularRelName}', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const relatedId = body.id;

        await withTransaction(async (tx) => {
          await ${modelNameLower}Domain.add${SingularRelName}(id, relatedId, body, tx);
        });

        return c.json({ data: { message: '${singularRelName} added successfully' } }, 201);
      } catch (error) {
        handleDomainException(error);
      }
    });`);
        }

        // PUT replace all
        if (rel.endpoints?.replace !== false) {
          endpoints.push(`
    /**
     * PUT /${modelNameLower}/:id/${relName}
     * Replace all ${relName} for a ${model.name}
     */
    this.routes.put('/:id/${relName}', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const ids = body.ids || [];

        await withTransaction(async (tx) => {
          await ${modelNameLower}Domain.set${RelName}(id, ids, body, tx);
        });

        return c.json({ data: { message: '${relName} updated successfully' } });
      } catch (error) {
        handleDomainException(error);
      }
    });`);
        }

        // DELETE remove
        if (rel.endpoints?.remove !== false) {
          endpoints.push(`
    /**
     * DELETE /${modelNameLower}/:id/${singularRelName}
     * Remove a specific ${singularRelName} from a ${model.name}
     */
    this.routes.delete('/:id/${singularRelName}', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const relatedId = body.id;

        await withTransaction(async (tx) => {
          await ${modelNameLower}Domain.remove${SingularRelName}(id, relatedId, body, tx);
        });

        return c.json({ data: { message: '${singularRelName} removed successfully' } });
      } catch (error) {
        handleDomainException(error);
      }
    });`);

          // DELETE bulk remove
          endpoints.push(`
    /**
     * DELETE /${modelNameLower}/:id/${relName}
     * Remove multiple ${relName} from a ${model.name}
     */
    this.routes.delete('/:id/${relName}', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const ids = body.ids || [];

        await withTransaction(async (tx) => {
          await ${modelNameLower}Domain.remove${RelName}(id, ids, body, tx);
        });

        return c.json({ data: { message: '${relName} removed successfully' } });
      } catch (error) {
        handleDomainException(error);
      }
    });`);
        }
      }
    }

    return endpoints.join('\n');
  }

  /**
   * Generate REST index file
   */
  private generateRestIndex(): string {
    let code = `import { Hono, type Env } from '@hono/hono';
`;

    // Import all route files
    for (const model of this.models) {
      code += `import { ${model.name.toLowerCase()}Routes } from './${model.name.toLowerCase()}.rest.ts';\n`;
    }

    code += `

/**
 * Register all REST routes
 * Note: Global middlewares should be registered before calling this function
 * @param app - The Hono app instance
 * @param basePath - Optional base path prefix for API routes (defaults to '/api')
 */
export function registerRestRoutes<E extends Env = Env>(app: Hono<E>, basePath?: string) {
  const apiPrefix = basePath || '/api';
  
  // Register model routes
`;

    for (const model of this.models) {
      const modelNameLower = model.name.toLowerCase();
      code += `  app.route(\`\${apiPrefix}/${modelNameLower}\`, ${modelNameLower}Routes);\n`;
    }

    code += `
  // API documentation endpoint
  app.get(\`\${apiPrefix}\`, (c) => {
    return c.json({
      version: '1.0.0',
      basePath: apiPrefix,
      endpoints: [
${
      this.models.map((m) => {
        const modelNameLower = m.name.toLowerCase();
        return `        '${modelNameLower}'`;
      }).join(',\n')
    }
      ]
    });
  });
}

/**
 * Extracted route information
 */
export interface ExtractedRoute {
  method: string;  // HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)
  path: string;    // Full route path including basePath
}

/**
 * Extract all registered HTTP routes from a Hono app instance
 *
 * This utility inspects Hono's internal route registry to return a clean list
 * of all registered HTTP endpoints. Middleware routes (method: 'ALL' with wildcards)
 * are automatically filtered out.
 *
 * @param app - The Hono app instance to inspect
 * @returns Array of route objects with method and path
 *
 * @example
 * \`\`\`typescript
 * import { extractRoutes } from './generated/rest/index.ts';
 *
 * const app = new Hono();
 * // ... register routes via initializeGenerated()
 *
 * const routes = extractRoutes(app);
 * console.log(routes);
 * // [
 * //   { method: 'GET', path: '/api/users' },
 * //   { method: 'POST', path: '/api/users' },
 * //   { method: 'GET', path: '/api/users/:id' },
 * //   ...
 * // ]
 * \`\`\`
 */
export function extractRoutes<E extends Env = Env>(app: Hono<E>): ExtractedRoute[] {
  return app.routes
    .filter(route => {
      // Filter out middleware routes (method: 'ALL' with wildcards like /* or /api/*)
      const isMiddleware = route.method === 'ALL' && route.path.includes('*');
      return !isMiddleware;
    })
    .map(route => {
      // Hono sometimes includes the full path in 'path' property
      // Check if path already contains basePath to avoid duplication
      let fullPath = route.path;

      if (route.basePath && route.basePath !== '/') {
        // If path already starts with basePath, use it as-is
        if (!route.path.startsWith(route.basePath)) {
          // Otherwise, concatenate basePath + path
          fullPath = \`\${route.basePath}\${route.path}\`;
        }
      }

      return {
        method: route.method,
        path: fullPath
      };
    })
    .sort((a, b) => {
      // Sort by path first, then by method
      const pathCompare = a.path.localeCompare(b.path);
      return pathCompare !== 0 ? pathCompare : a.method.localeCompare(b.method);
    });
}

// Export all routes for individual use
`;

    for (const model of this.models) {
      code +=
        `export { ${model.name.toLowerCase()}Routes, initialize${model.name}RestRoutes } from './${model.name.toLowerCase()}.rest.ts';\n`;
    }

    code += `\n// Re-export shared types\n`;
    code += `export type { DefaultEnv } from './types.ts';\n`;

    return code;
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Find model by name
   */
  private findModelByName(name: string): ModelDefinition | undefined {
    return this.models.find((m) => m.name === name);
  }
}
