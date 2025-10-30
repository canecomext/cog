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

    return `import { Hono } from 'jsr:@hono/hono';
import { HTTPException } from 'jsr:@hono/hono/http-exception';
import { ${modelNameLower}Domain } from '../domain/${modelNameLower}.domain.ts';
import { withTransaction } from '../db/database.ts'; // Only used for write operations
import type { DefaultEnv } from './types.ts';

// Routes use DefaultEnv but can be type-cast when registering
export const ${modelNameLower}Routes = new Hono<DefaultEnv>();

/**
 * GET /${modelNamePlural}
 * List all ${modelNamePlural} with pagination
 */
${modelNameLower}Routes.get('/', async (c) => {
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
    c.var // Pass all context variables to hooks
  );

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
${modelNameLower}Routes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const include = c.req.query('include')?.split(',');

  // No transaction needed for read operations
  const result = await ${modelNameLower}Domain.findById(
    id,
    undefined, // No transaction
    { include },
    c.var // Pass all context variables to hooks
  );

  if (!result) {
    throw new HTTPException(404, { message: '${modelName} not found' });
  }

  return c.json({ data: result });
});

/**
 * POST /${modelNamePlural}
 * Create a new ${modelName}
 */
${modelNameLower}Routes.post('/', async (c) => {
  const body = await c.req.json();
  
  const result = await withTransaction(async (tx) => {
    return await ${modelNameLower}Domain.create(
      body,
      tx,
      c.var // Pass all context variables to hooks
    );
  });

  return c.json({ data: result }, 201);
});

/**
 * PUT /${modelNamePlural}/:id
 * Update a ${modelName}
 */
${modelNameLower}Routes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const result = await withTransaction(async (tx) => {
    return await ${modelNameLower}Domain.update(
      id,
      body,
      tx,
      c.var // Pass all context variables to hooks
    );
  });

  return c.json({ data: result });
});

/**
 * PATCH /${modelNamePlural}/:id
 * Partially update a ${modelName}
 */
${modelNameLower}Routes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const result = await withTransaction(async (tx) => {
    return await ${modelNameLower}Domain.update(
      id,
      body,
      tx,
      c.var // Pass all context variables to hooks
    );
  });

  return c.json({ data: result });
});

/**
 * DELETE /${modelNamePlural}/:id
 * Delete a ${modelName}
 */
${modelNameLower}Routes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const result = await withTransaction(async (tx) => {
    return await ${modelNameLower}Domain.delete(
      id,
      tx,
      c.var // Pass all context variables to hooks
    );
  });

  return c.json({ data: result });
});

${this.generateRelationshipEndpoints(model)}
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
   * Generate relationship endpoints
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
    let code = `import { Hono } from 'jsr:@hono/hono';
`;

    // Import all route files
    for (const model of this.models) {
      code += `import { ${model.name.toLowerCase()}Routes } from './${model.name.toLowerCase()}.rest.ts';\n`;
    }

    if (this.docsEnabled) {
      code += `
import { generatedOpenAPISpec } from './openapi.ts';
import { Scalar } from 'npm:@scalar/hono-api-reference';`;
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

${this.generateEndpointListingUtilities()}

// Export all routes for individual use
`;

    for (const model of this.models) {
      code += `export { ${model.name.toLowerCase()}Routes } from './${model.name.toLowerCase()}.rest.ts';\n`;
    }

    code += `\n// Re-export shared types\n`;
    code += `export type { DefaultEnv } from './types.ts';\n`;

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

  /**
   * Generate endpoint listing utility functions
   */
  private generateEndpointListingUtilities(): string {
    return `
/**
 * Route information interface
 */
export interface RouteInfo {
  method: string;
  path: string;
  handler?: string;
}

/**
 * Extract all registered routes from a Hono app instance
 * This function analyzes Hono's internal router structure to list all endpoints
 * 
 * @param app - The Hono app instance to analyze
 * @returns Array of route information with HTTP methods and paths
 */
export function listRegisteredEndpoints(app: Hono<any>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  try {
    // Access Hono's internal router
    // Note: This accesses private/internal properties and may break with Hono updates
    const router = (app as any).router;
    
    if (!router) {
      console.warn('Unable to access Hono router internals');
      return routes;
    }

    // Different strategies based on Hono's internal structure
    // Strategy 1: Try to access routes directly
    if (router.routes) {
      // Hono v3.x structure
      for (const [method, methodRoutes] of Object.entries(router.routes as Record<string, any[]>)) {
        if (Array.isArray(methodRoutes)) {
          for (const route of methodRoutes) {
            routes.push({
              method: method.toUpperCase(),
              path: route.path || route.regexp?.source || 'unknown',
              handler: route.handler?.name || 'anonymous'
            });
          }
        }
      }
    }
    
    // Strategy 2: Try the _router property (some Hono versions)
    if (!routes.length && (app as any)._router) {
      const _router = (app as any)._router;
      if (_router.stack) {
        // Express-like structure
        for (const layer of _router.stack) {
          if (layer.route) {
            const methods = Object.keys(layer.route.methods || {}).filter(m => layer.route.methods[m]);
            for (const method of methods) {
              routes.push({
                method: method.toUpperCase(),
                path: layer.route.path,
                handler: layer.handle?.name || 'anonymous'
              });
            }
          }
        }
      }
    }
    
    // Strategy 3: Analyze the routes property on the app itself
    if (!routes.length && (app as any).routes) {
      const appRoutes = (app as any).routes;
      if (Array.isArray(appRoutes)) {
        for (const route of appRoutes) {
          if (route.method && route.path) {
            routes.push({
              method: route.method.toUpperCase(),
              path: route.path,
              handler: route.handler?.name || 'anonymous'
            });
          }
        }
      } else if (typeof appRoutes === 'object') {
        // Routes organized by method
        for (const [method, paths] of Object.entries(appRoutes)) {
          if (Array.isArray(paths)) {
            for (const pathInfo of paths) {
              const path = typeof pathInfo === 'string' ? pathInfo : pathInfo.path;
              routes.push({
                method: method.toUpperCase(),
                path: path || 'unknown',
                handler: 'anonymous'
              });
            }
          }
        }
      }
    }

    // Strategy 4: Use Hono's built-in route inspection (if available)
    if (!routes.length && typeof (app as any).showRoutes === 'function') {
      // Some Hono versions have a showRoutes method
      const routeInfo = (app as any).showRoutes();
      if (typeof routeInfo === 'string') {
        // Parse string output
        const lines = routeInfo.split('\\n');
        for (const line of lines) {
          const match = line.match(/^\\s*(\\w+)\\s+(.+)/);
          if (match) {
            routes.push({
              method: match[1].toUpperCase(),
              path: match[2].trim()
            });
          }
        }
      }
    }

    // If we still have no routes, try to extract from known endpoints
    if (!routes.length) {
      // Fallback: return predefined routes based on generated structure
      ${this.generateFallbackRoutes()}
    }

    // Sort routes for consistent output
    routes.sort((a, b) => {
      if (a.path === b.path) {
        return a.method.localeCompare(b.method);
      }
      return a.path.localeCompare(b.path);
    });

  } catch (error) {
    console.error('Error extracting routes from Hono app:', error);
  }
  
  return routes;
}

/**
 * Format routes as a string table for console output
 * 
 * @param routes - Array of route information
 * @returns Formatted string table
 */
export function formatRoutesTable(routes: RouteInfo[]): string {
  if (!routes.length) {
    return 'No routes found';
  }

  // Calculate column widths
  const methodWidth = Math.max(8, ...routes.map(r => r.method.length));
  const pathWidth = Math.max(20, ...routes.map(r => r.path.length));
  
  // Create header
  const header = \`┌─\${'─'.repeat(methodWidth)}─┬─\${'─'.repeat(pathWidth)}─┐\`;
  const headerRow = \`│ \${'METHOD'.padEnd(methodWidth)} │ \${'PATH'.padEnd(pathWidth)} │\`;
  const separator = \`├─\${'─'.repeat(methodWidth)}─┼─\${'─'.repeat(pathWidth)}─┤\`;
  const footer = \`└─\${'─'.repeat(methodWidth)}─┴─\${'─'.repeat(pathWidth)}─┘\`;
  
  // Create rows
  const rows = routes.map(route => 
    \`│ \${route.method.padEnd(methodWidth)} │ \${route.path.padEnd(pathWidth)} │\`
  );
  
  // Combine all parts
  return [
    header,
    headerRow,
    separator,
    ...rows,
    footer
  ].join('\\n');
}

/**
 * Print all registered endpoints to console
 * Convenience function that combines listing and formatting
 * 
 * @param app - The Hono app instance to analyze
 */
export function printRegisteredEndpoints(app: Hono<any>): void {
  const routes = listRegisteredEndpoints(app);
  const table = formatRoutesTable(routes);
  
  console.log('\\n=== Registered REST Endpoints ===\\n');
  console.log(table);
  console.log(\`\\nTotal endpoints: \${routes.length}\`);
  
  // Group by method
  const byMethod = routes.reduce((acc, route) => {
    acc[route.method] = (acc[route.method] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('\\nEndpoints by method:');
  for (const [method, count] of Object.entries(byMethod)) {
    console.log(\`  \${method}: \${count}\`);
  }
}`;
  }

  /**
   * Generate fallback routes for endpoint listing
   */
  private generateFallbackRoutes(): string {
    const routes: string[] = [];

    // Add health and API endpoints
    routes.push(`routes.push({ method: 'GET', path: '/health' });`);
    routes.push(`routes.push({ method: 'GET', path: '/api' });`);

    // Add CRUD endpoints for each model
    for (const model of this.models) {
      const plural = model.plural?.toLowerCase() || this.pluralize(model.name.toLowerCase());
      const basePath = `/api/${plural}`;

      // Basic CRUD endpoints
      routes.push(`routes.push({ method: 'GET', path: '${basePath}' });`);
      routes.push(`routes.push({ method: 'GET', path: '${basePath}/:id' });`);
      routes.push(`routes.push({ method: 'POST', path: '${basePath}' });`);
      routes.push(`routes.push({ method: 'PUT', path: '${basePath}/:id' });`);
      routes.push(`routes.push({ method: 'PATCH', path: '${basePath}/:id' });`);
      routes.push(`routes.push({ method: 'DELETE', path: '${basePath}/:id' });`);

      // Relationship endpoints
      if (model.relationships) {
        for (const rel of model.relationships) {
          if (rel.type === 'oneToMany') {
            routes.push(`routes.push({ method: 'GET', path: '${basePath}/:id/${rel.name}' });`);
          } else if (rel.type === 'manyToMany' && rel.through) {
            const singularRel = this.singularize(rel.name);
            routes.push(`routes.push({ method: 'GET', path: '${basePath}/:id/${rel.name}' });`);
            routes.push(`routes.push({ method: 'POST', path: '${basePath}/:id/${rel.name}' });`);
            routes.push(`routes.push({ method: 'PUT', path: '${basePath}/:id/${rel.name}' });`);
            routes.push(`routes.push({ method: 'POST', path: '${basePath}/:id/${rel.name}/:${singularRel}Id' });`);
            routes.push(`routes.push({ method: 'DELETE', path: '${basePath}/:id/${rel.name}/:${singularRel}Id' });`);
            routes.push(`routes.push({ method: 'DELETE', path: '${basePath}/:id/${rel.name}' });`);
          }
        }
      }
    }

    return routes.join('\n      ');
  }
}
