import { ModelDefinition } from '../types/model.types.ts';

/**
 * Generates REST API endpoints for Hono
 */
export class RestAPIGenerator {
  private models: ModelDefinition[];
  private docsEnabled: boolean;

  constructor(
    models: ModelDefinition[],
    options: { docsEnabled?: boolean } = {},
  ) {
    this.models = models;
    this.docsEnabled = options.docsEnabled !== false;
  }

  /**
   * Generate REST API files
   */
  generateRestAPIs(): Map<string, string> {
    const files = new Map<string, string>();

    // Generate shared types
    files.set('rest/types.ts', this.generateSharedTypes());

    // Generate REST hooks types
    files.set('rest/hooks.types.ts', this.generateRestHooksTypes());

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
import { ${modelNameLower}Domain } from '../domain/${modelNameLower}.domain.ts';
import { withTransaction } from '../db/database.ts'; // Only used for write operations
import { RestHooks } from './hooks.types.ts';
import { ${modelName}, New${modelName} } from '../schema/${modelNameLower}.schema.ts';
import type { DefaultEnv } from './types.ts';

/**
 * Converts BigInt values to numbers for JSON serialization
 * Dates are stored as EPOCH milliseconds (bigint) and need conversion for JSON
 */
function convertBigIntToNumber<T>(obj: T): T {
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
 * ${modelName} REST Routes
 * Handles HTTP endpoints with optional pre/post hooks at the REST layer
 */
class ${modelName}RestRoutes<RestEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  public routes: Hono<{ Variables: RestEnvVars }>;
  private hooks: RestHooks<${modelName}, New${modelName}, Partial<New${modelName}>, RestEnvVars>;

  constructor(hooks?: RestHooks<${modelName}, New${modelName}, Partial<New${modelName}>, RestEnvVars>) {
    this.routes = new Hono<{ Variables: RestEnvVars }>();
    this.hooks = hooks || {};
    this.registerRoutes();
  }

  private registerRoutes() {
    /**
     * GET /${modelNameLower}
     * List all ${modelNameLower} with pagination
     */
    this.routes.get('/', async (c) => {
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preFindMany) {
        const preResult = await this.hooks.preFindMany(c as unknown as Context<{ Variables: RestEnvVars }>, context);
        context = { ...context, ...preResult.context };
      }

      const { limit = '10', offset = '0', orderBy, orderDirection = 'asc', include } = c.req.query();

      // Parse include parameter
      const includeArray = include ? include.split(',') : undefined;

      // No transaction needed for read operations
      let result = await ${modelNameLower}Domain.findMany(
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

      // Post-hook (REST layer)
      if (this.hooks.postFindMany) {
        const postResult = await this.hooks.postFindMany(result, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({
        data: convertBigIntToNumber(result.data),
        pagination: {
          total: result.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    });

    /**
     * GET /${modelNameLower}/:id
     * Get a single ${modelName} by ID
     */
    this.routes.get('/:id', async (c) => {
      let id = c.req.param('id');
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preFindById) {
        const preResult = await this.hooks.preFindById(id, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        id = preResult.data.id;
        context = { ...context, ...preResult.context };
      }

      const include = c.req.query('include')?.split(',');

      // No transaction needed for read operations
      let result = await ${modelNameLower}Domain.findById(
        id,
        undefined, // No transaction
        { include },
        context // Pass all context variables to domain hooks
      );

      if (!result) {
        throw new HTTPException(404, { message: '${modelName} not found' });
      }

      // Post-hook (REST layer)
      if (this.hooks.postFindById) {
        const postResult = await this.hooks.postFindById(id, result, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: convertBigIntToNumber(result) });
    });

    /**
     * POST /${modelNameLower}
     * Create a new ${modelName}
     */
    this.routes.post('/', async (c) => {
      let body = await c.req.json();
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preCreate) {
        const preResult = await this.hooks.preCreate(body, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        body = preResult.data;
        context = { ...context, ...preResult.context };
      }

      let result = await withTransaction(async (tx) => {
        return await ${modelNameLower}Domain.create(
          body,
          tx,
          context // Pass all context variables to domain hooks
        );
      });

      // Post-hook (REST layer)
      if (this.hooks.postCreate) {
        const postResult = await this.hooks.postCreate(body, result, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: convertBigIntToNumber(result) }, 201);
    });

    /**
     * PUT /${modelNameLower}/:id
     * Update a ${modelName}
     */
    this.routes.put('/:id', async (c) => {
      const id = c.req.param('id');
      let body = await c.req.json();
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preUpdate) {
        const preResult = await this.hooks.preUpdate(id, body, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        body = preResult.data;
        context = { ...context, ...preResult.context };
      }

      let result = await withTransaction(async (tx) => {
        return await ${modelNameLower}Domain.update(
          id,
          body,
          tx,
          context // Pass all context variables to domain hooks
        );
      });

      // Post-hook (REST layer)
      if (this.hooks.postUpdate) {
        const postResult = await this.hooks.postUpdate(id, body, result, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: convertBigIntToNumber(result) });
    });

    /**
     * DELETE /${modelNameLower}/:id
     * Delete a ${modelName}
     */
    this.routes.delete('/:id', async (c) => {
      let id = c.req.param('id');
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preDelete) {
        const preResult = await this.hooks.preDelete(id, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        id = preResult.data.id;
        context = { ...context, ...preResult.context };
      }

      let result = await withTransaction(async (tx) => {
        return await ${modelNameLower}Domain.delete(
          id,
          tx,
          context // Pass all context variables to domain hooks
        );
      });

      // Post-hook (REST layer)
      if (this.hooks.postDelete) {
        const postResult = await this.hooks.postDelete(id, result, c as unknown as Context<{ Variables: RestEnvVars }>, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: convertBigIntToNumber(result) });
    });

${this.generateRelationshipEndpointsWithHooks(model)}
  }
}

// Export singleton instance (will be re-initialized with hooks if provided)
export let ${modelNameLower}Routes = new ${modelName}RestRoutes().routes;

// Export function to initialize with hooks
export function initialize${modelName}RestRoutes<RestEnvVars extends Record<string, unknown> = Record<string, unknown>>(
  hooks?: RestHooks<${modelName}, New${modelName}, Partial<New${modelName}>, RestEnvVars>
) {
  const instance = new ${modelName}RestRoutes(hooks);
  ${modelNameLower}Routes = instance.routes as unknown as Hono<{ Variables: Record<string, unknown> }>;
  return instance.routes;
}
`;
  }

  /**
   * Generate REST hooks types file
   */
  private generateRestHooksTypes(): string {
    return `import { Context } from '@hono/hono';

/**
 * REST hook context that receives all variables from the Hono context.
 * The generic RestEnvVars type will contain all custom variables defined
 * in your application's Env type.
 */
export type RestHookContext<RestEnvVars extends Record<string, unknown> = Record<string, unknown>> = RestEnvVars;

export interface RestPreHookResult<T, RestEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  data: T;
  context?: RestHookContext<RestEnvVars>;
}

export interface RestPostHookResult<T, RestEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  data: T;
  context?: RestHookContext<RestEnvVars>;
}

/**
 * REST layer hooks that run before/after domain operations.
 *
 * These hooks run at the REST layer, OUTSIDE of database transactions.
 * They have access to the full Hono context (request, response, etc).
 *
 * Use these hooks for:
 * - Request/response transformation at the HTTP layer
 * - HTTP-specific validation or authorization
 * - Logging HTTP requests/responses
 * - Response formatting
 * - HTTP header manipulation
 *
 * Note: These hooks do NOT receive database transactions.
 * For database operations, use domain hooks instead.
 */
export interface RestHooks<T, CreateInput, UpdateInput, RestEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  // Pre-operation hooks (before domain operation, no transaction)
  preCreate?: (input: CreateInput, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<CreateInput, RestEnvVars>>;
  preUpdate?: (id: string, input: UpdateInput, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<UpdateInput, RestEnvVars>>;
  preDelete?: (id: string, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<{ id: string }, RestEnvVars>>;
  preFindById?: (id: string, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<{ id: string }, RestEnvVars>>;
  preFindMany?: (c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<Record<string, unknown>, RestEnvVars>>;

  // Post-operation hooks (after domain operation, no transaction)
  postCreate?: (input: CreateInput, result: T, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPostHookResult<T, RestEnvVars>>;
  postUpdate?: (id: string, input: UpdateInput, result: T, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPostHookResult<T, RestEnvVars>>;
  postDelete?: (id: string, result: T, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPostHookResult<T, RestEnvVars>>;
  postFindById?: (id: string, result: T | null, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPostHookResult<T | null, RestEnvVars>>;
  postFindMany?: (results: { data: T[]; total: number }, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPostHookResult<{ data: T[]; total: number }, RestEnvVars>>;
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
   * Generate relationship endpoints with hooks support
   */
  private generateRelationshipEndpointsWithHooks(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '';
    }

    const endpoints: string[] = [];
    const modelNameLower = model.name.toLowerCase();

    for (const rel of model.relationships) {
      if (rel.type === 'oneToMany') {
        // Use "List" suffix for collection endpoints
        const targetName = rel.target;
        const targetNameLower = targetName.toLowerCase();
        endpoints.push(`
    /**
     * GET /${modelNameLower}/:id/${targetNameLower}List
     * Get ${targetName} list for a ${model.name}
     */
    this.routes.get('/:id/${targetNameLower}List', async (c) => {
      const id = c.req.param('id');

      const result = await ${modelNameLower}Domain.get${targetName}List(id);

      return c.json({ data: convertBigIntToNumber(result) });
    });`);
      } else if (rel.type === 'manyToMany' && rel.through) {
        const relName = rel.name;
        const RelName = this.capitalize(relName);
        const targetNameLower = rel.target.toLowerCase();
        const targetName = rel.target;

        // Derive singular form by removing "List" suffix if present
        const singularRelName = relName.endsWith('List') ? relName.slice(0, -4) : relName;
        const SingularRelName = this.capitalize(singularRelName);

        endpoints.push(`
    /**
     * GET /${modelNameLower}/:id/${relName}
     * Get ${relName} for a ${model.name}
     */
    this.routes.get('/:id/${relName}', async (c) => {
      const id = c.req.param('id');

      const result = await ${modelNameLower}Domain.get${RelName}(id);

      return c.json({ data: convertBigIntToNumber(result) });
    });

    /**
     * POST /${modelNameLower}/:id/${relName}
     * Add multiple ${relName} to a ${model.name}
     */
    this.routes.post('/:id/${relName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const ids = body.ids || [];

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.add${RelName}(id, ids, tx);
      });

      return c.json({ data: { message: '${relName} added successfully' } }, 201);
    });

    /**
     * PUT /${modelNameLower}/:id/${relName}
     * Replace all ${relName} for a ${model.name}
     */
    this.routes.put('/:id/${relName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const ids = body.ids || [];

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.set${RelName}(id, ids, tx);
      });

      return c.json({ data: { message: '${relName} updated successfully' } });
    });

    /**
     * POST /${modelNameLower}/:id/${singularRelName}
     * Add a specific ${singularRelName} to a ${model.name}
     */
    this.routes.post('/:id/${singularRelName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const relatedId = body.id;

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.add${SingularRelName}(id, relatedId, tx);
      });

      return c.json({ data: { message: '${singularRelName} added successfully' } }, 201);
    });

    /**
     * DELETE /${modelNameLower}/:id/${singularRelName}
     * Remove a specific ${singularRelName} from a ${model.name}
     */
    this.routes.delete('/:id/${singularRelName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const relatedId = body.id;

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.remove${SingularRelName}(id, relatedId, tx);
      });

      return c.json({ data: { message: '${singularRelName} removed successfully' } });
    });

    /**
     * DELETE /${modelNameLower}/:id/${relName}
     * Remove multiple ${relName} from a ${model.name}
     */
    this.routes.delete('/:id/${relName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const ids = body.ids || [];

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.remove${RelName}(id, ids, tx);
      });

      return c.json({ data: { message: '${relName} removed successfully' } });
    });`);
      }
    }

    return endpoints.join('\n');
  }

  /**
   * Generate REST index file
   */
  private generateRestIndex(): string {
    let code = `import { Hono } from '@hono/hono';
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
export function registerRestRoutes(app: Hono, basePath?: string) {
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
export function extractRoutes(app: Hono): ExtractedRoute[] {
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
    code += `export type { RestHooks, RestHookContext } from './hooks.types.ts';\n`;

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
