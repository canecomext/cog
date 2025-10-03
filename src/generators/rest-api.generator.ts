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

    // Generate individual REST endpoints
    for (const model of this.models) {
      const restAPI = this.generateModelRestAPI(model);
      files.set(`rest/${model.name.toLowerCase()}.rest.ts`, restAPI);
    }

    // Generate middleware
    files.set('rest/middleware.ts', this.generateMiddleware());

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
import { ${modelNameLower}Domain } from '../domain/${modelNameLower}.domain.ts';
import { withTransaction } from '../db/database.ts'; // Only used for write operations
import type { Env } from './types.ts';

export const ${modelNameLower}Routes = new Hono<Env>();

/**
 * GET /${modelNamePlural}
 * List all ${modelNamePlural} with pagination
 */
${modelNameLower}Routes.get('/', async (c) => {
  const { limit = '10', offset = '0', orderBy, orderDirection = 'asc' } = c.req.query();
  
  // No transaction needed for read operations
  const result = await ${modelNameLower}Domain.findMany(
    undefined, // No transaction
    undefined, // No filter
    {
      limit: parseInt(limit),
      offset: parseInt(offset),
      orderBy,
      orderDirection: orderDirection as 'asc' | 'desc'
    },
    {
      // requestId: c.get('requestId'),
      // userId: c.get('userId')
    }
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
    {
      // requestId: c.get('requestId'),
      // userId: c.get('userId')
    }
  );

  if (!result) {
    return c.json({ error: '${modelName} not found' }, 404);
  }

  return c.json(result);
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
      {
        // requestId: c.get('requestId'),
        // userId: c.get('userId')
      }
    );
  });

  return c.json(result, 201);
});

/**
 * PUT /${modelNamePlural}/:id
 * Update a ${modelName}
 */
${modelNameLower}Routes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const result = await withTransaction(async (tx) => {
      return await ${modelNameLower}Domain.update(
        id,
        body,
        tx,
        {
          // requestId: c.get('requestId'),
          // userId: c.get('userId')
        }
      );
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return c.json({ error: '${modelName} not found' }, 404);
    }
    throw error;
  }
});

/**
 * PATCH /${modelNamePlural}/:id
 * Partially update a ${modelName}
 */
${modelNameLower}Routes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const result = await withTransaction(async (tx) => {
      return await ${modelNameLower}Domain.update(
        id,
        body,
        tx,
        {
          // requestId: c.get('requestId'),
          // userId: c.get('userId')
        }
      );
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return c.json({ error: '${modelName} not found' }, 404);
    }
    throw error;
  }
});

/**
 * DELETE /${modelNamePlural}/:id
 * Delete a ${modelName}
 */
${modelNameLower}Routes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    await withTransaction(async (tx) => {
      return await ${modelNameLower}Domain.delete(
        id,
        tx,
        {
          // requestId: c.get('requestId'),
          // userId: c.get('userId')
        }
      );
    });

    return c.json({ message: '${modelName} deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return c.json({ error: '${modelName} not found' }, 404);
    }
    throw error;
  }
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
 */
export type Env = {
  Variables: {
    requestId?: string;
    userId?: string;
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
  
  const result = await ${modelNameLower}Domain.get${this.capitalize(relName)}(id, null);
  
  return c.json(result);
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
  
  return c.json(result);
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
  
  return c.json({ message: '${RelName} added successfully' }, 201);
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
  
  return c.json({ message: '${RelName} updated successfully' });
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
  
  return c.json({ message: '${SingularRel} added successfully' }, 201);
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
  
  return c.json({ message: '${SingularRel} removed successfully' });
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
  
  return c.json({ message: '${RelName} removed successfully' });
});`);
      }
    }

    return endpoints.join('\n');
  }

  /**
   * Generate middleware file
   */
  private generateMiddleware(): string {
    return `import { MiddlewareHandler } from '@hono/hono';
import type { Env } from './types.ts';

/**
 * Request ID middleware
 */
export const requestIdMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
};

/**
 * Error handling middleware
 */
export const errorMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  try {
    await next();
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof Error) {
      return c.json(
        { 
          error: error.message,
          requestId: c.get('requestId')
        },
        500
      );
    }
    
    return c.json(
      { 
        error: 'Internal server error',
        requestId: c.get('requestId')
      },
      500
    );
  }
};

/**
 * CORS middleware
 */
export const corsMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
  
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  
  await next();
};
`;
  }

  /**
   * Generate REST index file
   */
  private generateRestIndex(): string {
    let code = `import { Hono } from '@hono/hono';
import { requestIdMiddleware, errorMiddleware, corsMiddleware } from './middleware.ts';
import type { Env } from './types.ts';
`;

    // Import all route files
    for (const model of this.models) {
      code += `import { ${model.name.toLowerCase()}Routes } from './${model.name.toLowerCase()}.rest.ts';\n`;
    }

    code += `

/**
 * Register built-in global middlewares
 * This should be called before any custom middleware or route registration
 */
export function registerGlobalMiddlewares(app: Hono<Env>) {
  // Apply global middleware in the correct order
  app.use('*', corsMiddleware);
  app.use('*', requestIdMiddleware);
  app.use('*', errorMiddleware);
}

/**
 * Register all REST routes
 * Note: Global middlewares should be registered before calling this function
 */
export function registerRestRoutes(app: Hono<Env>) {
  // Register model routes
`;

    for (const model of this.models) {
      const plural = model.plural?.toLowerCase() || this.pluralize(model.name.toLowerCase());
      code += `  app.route('/api/${plural}', ${model.name.toLowerCase()}Routes);\n`;
    }

    code += `
  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // API documentation endpoint
  app.get('/api', (c) => {
    return c.json({
      version: '1.0.0',
      endpoints: [
${
      this.models.map((m) => {
        const plural = m.plural?.toLowerCase() || this.pluralize(m.name.toLowerCase());
        return `        '${plural}'`;
      }).join(',\n')
    }
      ]
    });
  });
}

// Export all routes for individual use
`;

    for (const model of this.models) {
      code += `export { ${model.name.toLowerCase()}Routes } from './${model.name.toLowerCase()}.rest.ts';\n`;
    }

    code += `\n// Re-export shared types\n`;
    code += `export type { Env } from './types.ts';\n`;

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
    return this.models.find(m => m.name === name);
  }
}
