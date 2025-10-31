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
    const modelNamePlural = model.plural?.toLowerCase() || this.pluralize(modelNameLower);

    return `import { Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { ${modelNameLower}Domain } from '../domain/${modelNameLower}.domain.ts';
import { withTransaction } from '../db/database.ts'; // Only used for write operations
import { RestHooks } from './hooks.types.ts';
import { ${modelName}, New${modelName} } from '../schema/${modelNameLower}.schema.ts';
import type { DefaultEnv } from './types.ts';

/**
 * ${modelName} REST Routes
 * Handles HTTP endpoints with optional pre/post hooks at the REST layer
 */
class ${modelName}RestRoutes<RestEnvVars extends Record<string, any> = Record<string, any>> {
  public routes: Hono<{ Variables: RestEnvVars }>;
  private hooks: RestHooks<${modelName}, New${modelName}, Partial<New${modelName}>, RestEnvVars>;

  constructor(hooks?: RestHooks<${modelName}, New${modelName}, Partial<New${modelName}>, RestEnvVars>) {
    this.routes = new Hono<{ Variables: RestEnvVars }>();
    this.hooks = hooks || {};
    this.registerRoutes();
  }

  private registerRoutes() {
    /**
     * GET /${modelNamePlural}
     * List all ${modelNamePlural} with pagination
     */
    this.routes.get('/', async (c) => {
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preFindMany) {
        const preResult = await this.hooks.preFindMany(c as any, context);
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
        const postResult = await this.hooks.postFindMany(result, c as any, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({
        data: result.data,
        pagination: {
          total: result.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    });

    /**
     * GET /${modelNamePlural}/:id
     * Get a single ${modelName} by ID
     */
    this.routes.get('/:id', async (c) => {
      let id = c.req.param('id');
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preFindById) {
        const preResult = await this.hooks.preFindById(id, c as any, context);
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
        const postResult = await this.hooks.postFindById(id, result, c as any, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: result });
    });

    /**
     * POST /${modelNamePlural}
     * Create a new ${modelName}
     */
    this.routes.post('/', async (c) => {
      let body = await c.req.json();
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preCreate) {
        const preResult = await this.hooks.preCreate(body, c as any, context);
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
        const postResult = await this.hooks.postCreate(body, result, c as any, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: result }, 201);
    });

    /**
     * PUT /${modelNamePlural}/:id
     * Update a ${modelName}
     */
    this.routes.put('/:id', async (c) => {
      let id = c.req.param('id');
      let body = await c.req.json();
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preUpdate) {
        const preResult = await this.hooks.preUpdate(id, body, c as any, context);
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
        const postResult = await this.hooks.postUpdate(id, body, result, c as any, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: result });
    });

    /**
     * PATCH /${modelNamePlural}/:id
     * Partially update a ${modelName}
     */
    this.routes.patch('/:id', async (c) => {
      let id = c.req.param('id');
      let body = await c.req.json();
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preUpdate) {
        const preResult = await this.hooks.preUpdate(id, body, c as any, context);
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
        const postResult = await this.hooks.postUpdate(id, body, result, c as any, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: result });
    });

    /**
     * DELETE /${modelNamePlural}/:id
     * Delete a ${modelName}
     */
    this.routes.delete('/:id', async (c) => {
      let id = c.req.param('id');
      let context = c.var as RestEnvVars;

      // Pre-hook (REST layer)
      if (this.hooks.preDelete) {
        const preResult = await this.hooks.preDelete(id, c as any, context);
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
        const postResult = await this.hooks.postDelete(id, result, c as any, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return c.json({ data: result });
    });

${this.generateRelationshipEndpointsWithHooks(model)}
  }
}

// Export singleton instance (will be re-initialized with hooks if provided)
export let ${modelNameLower}Routes = new ${modelName}RestRoutes().routes;

// Export function to initialize with hooks
export function initialize${modelName}RestRoutes<RestEnvVars extends Record<string, any> = Record<string, any>>(
  hooks?: RestHooks<${modelName}, New${modelName}, Partial<New${modelName}>, RestEnvVars>
) {
  const instance = new ${modelName}RestRoutes(hooks);
  ${modelNameLower}Routes = instance.routes as any;
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
export type RestHookContext<RestEnvVars extends Record<string, any> = Record<string, any>> = RestEnvVars;

export interface RestPreHookResult<T, RestEnvVars extends Record<string, any> = Record<string, any>> {
  data: T;
  context?: RestHookContext<RestEnvVars>;
}

export interface RestPostHookResult<T, RestEnvVars extends Record<string, any> = Record<string, any>> {
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
export interface RestHooks<T, CreateInput, UpdateInput, RestEnvVars extends Record<string, any> = Record<string, any>> {
  // Pre-operation hooks (before domain operation, no transaction)
  preCreate?: (input: CreateInput, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<CreateInput, RestEnvVars>>;
  preUpdate?: (id: string, input: UpdateInput, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<UpdateInput, RestEnvVars>>;
  preDelete?: (id: string, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<{ id: string }, RestEnvVars>>;
  preFindById?: (id: string, c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<{ id: string }, RestEnvVars>>;
  preFindMany?: (c: Context<{ Variables: RestEnvVars }>, context?: RestHookContext<RestEnvVars>) => Promise<RestPreHookResult<Record<string, any>, RestEnvVars>>;

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
    [key: string]: any;
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
    const modelNamePlural = model.plural?.toLowerCase() || this.pluralize(modelNameLower);

    for (const rel of model.relationships) {
      if (rel.type === 'oneToMany') {
        // Relationship names are typically already plural (e.g., "posts", "comments")
        const relName = rel.name;
        endpoints.push(`
    /**
     * GET /${modelNamePlural}/:id/${relName}
     * Get ${relName} for a ${model.name}
     */
    this.routes.get('/:id/${relName}', async (c) => {
      const id = c.req.param('id');

      const result = await ${modelNameLower}Domain.get${this.capitalize(relName)}(id);

      return c.json({ data: result });
    });`);
      } else if (rel.type === 'manyToMany' && rel.through) {
        const relName = rel.name;
        const RelName = this.capitalize(relName);
        const targetNameLower = rel.target.toLowerCase();
        const targetPlural = this.findModelByName(rel.target)?.plural?.toLowerCase() || this.pluralize(targetNameLower);
        const singularRel = this.singularize(relName);
        const SingularRel = this.capitalize(singularRel);

        endpoints.push(`
    /**
     * GET /${modelNamePlural}/:id/${relName}
     * Get ${relName} for a ${model.name}
     */
    this.routes.get('/:id/${relName}', async (c) => {
      const id = c.req.param('id');

      const result = await ${modelNameLower}Domain.get${RelName}(id);

      return c.json({ data: result });
    });

    /**
     * POST /${modelNamePlural}/:id/${relName}
     * Add ${relName} to a ${model.name}
     */
    this.routes.post('/:id/${relName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const ${targetNameLower}Ids = body.${targetNameLower}Ids || body.ids || [];

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.add${RelName}(id, ${targetNameLower}Ids, tx);
      });

      return c.json({ data: { message: '${RelName} added successfully' } }, 201);
    });

    /**
     * PUT /${modelNamePlural}/:id/${relName}
     * Replace all ${relName} for a ${model.name}
     */
    this.routes.put('/:id/${relName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const ${targetNameLower}Ids = body.${targetNameLower}Ids || body.ids || [];

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.set${RelName}(id, ${targetNameLower}Ids, tx);
      });

      return c.json({ data: { message: '${RelName} updated successfully' } });
    });

    /**
     * POST /${modelNamePlural}/:id/${relName}/:${singularRel}Id
     * Add a specific ${singularRel} to a ${model.name}
     */
    this.routes.post('/:id/${relName}/:${singularRel}Id', async (c) => {
      const id = c.req.param('id');
      const ${singularRel}Id = c.req.param('${singularRel}Id');

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.add${SingularRel}(id, ${singularRel}Id, tx);
      });

      return c.json({ data: { message: '${SingularRel} added successfully' } }, 201);
    });

    /**
     * DELETE /${modelNamePlural}/:id/${relName}/:${singularRel}Id
     * Remove a specific ${singularRel} from a ${model.name}
     */
    this.routes.delete('/:id/${relName}/:${singularRel}Id', async (c) => {
      const id = c.req.param('id');
      const ${singularRel}Id = c.req.param('${singularRel}Id');

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.remove${SingularRel}(id, ${singularRel}Id, tx);
      });

      return c.json({ data: { message: '${SingularRel} removed successfully' } });
    });

    /**
     * DELETE /${modelNamePlural}/:id/${relName}
     * Remove multiple ${relName} from a ${model.name}
     */
    this.routes.delete('/:id/${relName}', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const ${targetNameLower}Ids = body.${targetNameLower}Ids || body.ids || [];

      await withTransaction(async (tx) => {
        await ${modelNameLower}Domain.remove${RelName}(id, ${targetNameLower}Ids, tx);
      });

      return c.json({ data: { message: '${RelName} removed successfully' } });
    });`);
      }
    }

    return endpoints.join('\n');
  }

  /**
   * Generate relationship endpoints (legacy, kept for reference)
   */
  private generateRelationshipEndpoints(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '';
    }

    const endpoints: string[] = [];
    const modelNameLower = model.name.toLowerCase();
    const modelNamePlural = model.plural?.toLowerCase() || this.pluralize(modelNameLower);

    for (const rel of model.relationships) {
      if (rel.type === 'oneToMany') {
        // Relationship names are typically already plural (e.g., "posts", "comments")
        const relName = rel.name;
        endpoints.push(`
/**
 * GET /${modelNamePlural}/:id/${relName}
 * Get ${relName} for a ${model.name}
 */
${modelNameLower}Routes.get('/:id/${relName}', async (c) => {
  const id = c.req.param('id');
  
  const result = await ${modelNameLower}Domain.get${this.capitalize(relName)}(id);
  
  return c.json({ data: result });
});`);
      } else if (rel.type === 'manyToMany' && rel.through) {
        const relName = rel.name;
        const RelName = this.capitalize(relName);
        const targetNameLower = rel.target.toLowerCase();
        const targetPlural = this.findModelByName(rel.target)?.plural?.toLowerCase() || this.pluralize(targetNameLower);
        const singularRel = this.singularize(relName);
        const SingularRel = this.capitalize(singularRel);

        endpoints.push(`
/**
 * GET /${modelNamePlural}/:id/${relName}
 * Get ${relName} for a ${model.name}
 */
${modelNameLower}Routes.get('/:id/${relName}', async (c) => {
  const id = c.req.param('id');
  
  const result = await ${modelNameLower}Domain.get${RelName}(id);
  
  return c.json({ data: result });
});

/**
 * POST /${modelNamePlural}/:id/${relName}
 * Add ${relName} to a ${model.name}
 */
${modelNameLower}Routes.post('/:id/${relName}', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const ${targetNameLower}Ids = body.${targetNameLower}Ids || body.ids || [];
  
  await withTransaction(async (tx) => {
    await ${modelNameLower}Domain.add${RelName}(id, ${targetNameLower}Ids, tx);
  });
  
  return c.json({ data: { message: '${RelName} added successfully' } }, 201);
});

/**
 * PUT /${modelNamePlural}/:id/${relName}
 * Replace all ${relName} for a ${model.name}
 */
${modelNameLower}Routes.put('/:id/${relName}', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const ${targetNameLower}Ids = body.${targetNameLower}Ids || body.ids || [];
  
  await withTransaction(async (tx) => {
    await ${modelNameLower}Domain.set${RelName}(id, ${targetNameLower}Ids, tx);
  });
  
  return c.json({ data: { message: '${RelName} updated successfully' } });
});

/**
 * POST /${modelNamePlural}/:id/${relName}/:${singularRel}Id
 * Add a specific ${singularRel} to a ${model.name}
 */
${modelNameLower}Routes.post('/:id/${relName}/:${singularRel}Id', async (c) => {
  const id = c.req.param('id');
  const ${singularRel}Id = c.req.param('${singularRel}Id');
  
  await withTransaction(async (tx) => {
    await ${modelNameLower}Domain.add${SingularRel}(id, ${singularRel}Id, tx);
  });
  
  return c.json({ data: { message: '${SingularRel} added successfully' } }, 201);
});

/**
 * DELETE /${modelNamePlural}/:id/${relName}/:${singularRel}Id
 * Remove a specific ${singularRel} from a ${model.name}
 */
${modelNameLower}Routes.delete('/:id/${relName}/:${singularRel}Id', async (c) => {
  const id = c.req.param('id');
  const ${singularRel}Id = c.req.param('${singularRel}Id');
  
  await withTransaction(async (tx) => {
    await ${modelNameLower}Domain.remove${SingularRel}(id, ${singularRel}Id, tx);
  });
  
  return c.json({ data: { message: '${SingularRel} removed successfully' } });
});

/**
 * DELETE /${modelNamePlural}/:id/${relName}
 * Remove multiple ${relName} from a ${model.name}
 */
${modelNameLower}Routes.delete('/:id/${relName}', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const ${targetNameLower}Ids = body.${targetNameLower}Ids || body.ids || [];
  
  await withTransaction(async (tx) => {
    await ${modelNameLower}Domain.remove${RelName}(id, ${targetNameLower}Ids, tx);
  });
  
  return c.json({ data: { message: '${RelName} removed successfully' } });
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

    if (this.docsEnabled) {
      code += `
import { generatedOpenAPISpec } from './openapi.ts';
import { Scalar } from '@scalar/hono-api-reference';`;
    }

    code += `

/**
 * Register all REST routes
 * Note: Global middlewares should be registered before calling this function
 * @param app - The Hono app instance
 * @param basePath - Optional base path prefix for API routes (defaults to '/api')
 * @param docs - Optional documentation configuration
 */
export function registerRestRoutes(app: Hono<any>, basePath?: string, docs?: { enabled?: boolean; basePath?: string }) {
  const apiPrefix = basePath || '/api';
  const docsEnabled = docs?.enabled !== false; // Default to true if docs were generated
  const docsPrefix = docs?.basePath || '/docs';
  
  // Register model routes
`;

    for (const model of this.models) {
      const plural = model.plural?.toLowerCase() || this.pluralize(model.name.toLowerCase());
      code += `  app.route(\`\${apiPrefix}/${plural}\`, ${model.name.toLowerCase()}Routes);\n`;
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
        const plural = m.plural?.toLowerCase() || this.pluralize(m.name.toLowerCase());
        return `        '${plural}'`;
      }).join(',\n')
    }
      ]${this.docsEnabled ? `,
      documentation: {
        openapi: \`\${docsPrefix}/openapi.json\`,
        reference: \`\${docsPrefix}/reference\`
      }` : ''}
    });
  });
`;

    if (this.docsEnabled) {
      code += `
  // OpenAPI documentation endpoints (only registered if docsEnabled is true)
  if (docsEnabled) {
    app.get(\`\${docsPrefix}/openapi.json\`, (c) => {
      return c.json(generatedOpenAPISpec);
    });

    // Scalar API reference documentation
    app.get(\`\${docsPrefix}/reference\`, Scalar({
      url: \`\${docsPrefix}/openapi.json\`,
      theme: 'purple',
    }) as any);
  }
`;
    }

    code += `}

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
export function extractRoutes(app: Hono<any>): ExtractedRoute[] {
  return app.routes
    .filter(route => {
      // Filter out middleware routes (method: 'ALL' with wildcards like /* or /api/*)
      const isMiddleware = route.method === 'ALL' && route.path.includes('*');
      return !isMiddleware;
    })
    .map(route => ({
      method: route.method,
      // Construct full path from basePath + path
      path: route.basePath === '/' ? route.path : \`\${route.basePath}\${route.path}\`
    }))
    .sort((a, b) => {
      // Sort by path first, then by method
      const pathCompare = a.path.localeCompare(b.path);
      return pathCompare !== 0 ? pathCompare : a.method.localeCompare(b.method);
    });
}

// Export all routes for individual use
`;

    for (const model of this.models) {
      code += `export { ${model.name.toLowerCase()}Routes, initialize${model.name}RestRoutes } from './${model.name.toLowerCase()}.rest.ts';\n`;
    }

    code += `\n// Re-export shared types\n`;
    code += `export type { DefaultEnv } from './types.ts';\n`;
    code += `export type { RestHooks, RestHookContext } from './hooks.types.ts';\n`;

    return code;
  }

  /**
   * Simple pluralization
   */
  private pluralize(word: string): string {
    // Check if already plural (simple heuristic)
    if (
      word.endsWith('ies') || word.endsWith('ses') || word.endsWith('xes') ||
      word.endsWith('ches') || word.endsWith('shes')
    ) {
      return word;
    }
    // Check if word already ends with 's' but not 'ss' (likely already plural)
    if (word.endsWith('s') && !word.endsWith('ss')) {
      return word;
    }
    // Handle common patterns
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
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Simple singularization
   */
  private singularize(word: string): string {
    // Handle common patterns
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
   * Find model by name
   */
  private findModelByName(name: string): ModelDefinition | undefined {
    return this.models.find((m) => m.name === name);
  }
}
