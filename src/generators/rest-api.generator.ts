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

    // Generate individual REST APIs
    for (const model of this.models) {
      const restAPI = this.generateModelRestAPI(model);
      files.set(`api/${model.name.toLowerCase()}.api.ts`, restAPI);
    }

    // Generate middleware
    files.set('api/middleware.ts', this.generateMiddleware());

    // Generate API registration file
    files.set('api/index.ts', this.generateAPIIndex());

    return files;
  }

  /**
   * Generate REST API for a model
   */
  private generateModelRestAPI(model: ModelDefinition): string {
    const modelName = model.name;
    const modelNameLower = model.name.toLowerCase();
    const modelNamePlural = this.pluralize(modelNameLower);

    return `import { Hono } from '@hono/hono';
import { ${modelName}Domain } from '../domain/${modelNameLower}.domain';
import { transactionMiddleware } from './middleware';

export const ${modelNameLower}Routes = new Hono();

/**
 * GET /${modelNamePlural}
 * List all ${modelNamePlural} with pagination
 */
${modelNameLower}Routes.get('/', async (c) => {
  const { limit = '10', offset = '0', orderBy, orderDirection = 'asc' } = c.req.query();
  
  const result = await ${modelNameLower}Domain.findMany(
    undefined,
    {
      limit: parseInt(limit),
      offset: parseInt(offset),
      orderBy,
      orderDirection: orderDirection as 'asc' | 'desc'
    },
    {
      requestId: c.get('requestId'),
      userId: c.get('userId')
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

  const result = await ${modelNameLower}Domain.findById(
    id,
    { include },
    {
      requestId: c.get('requestId'),
      userId: c.get('userId')
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
${modelNameLower}Routes.post('/', transactionMiddleware, async (c) => {
  const body = await c.req.json();
  
  const result = await ${modelNameLower}Domain.create(
    body,
    {
      requestId: c.get('requestId'),
      userId: c.get('userId')
    },
    c.get('transaction')
  );

  return c.json(result, 201);
});

/**
 * PUT /${modelNamePlural}/:id
 * Update a ${modelName}
 */
${modelNameLower}Routes.put('/:id', transactionMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const result = await ${modelNameLower}Domain.update(
      id,
      body,
      {
        requestId: c.get('requestId'),
        userId: c.get('userId')
      },
      c.get('transaction')
    );

    return c.json(result);
  } catch (error) {
    if (error.message.includes('not found')) {
      return c.json({ error: '${modelName} not found' }, 404);
    }
    throw error;
  }
});

/**
 * PATCH /${modelNamePlural}/:id
 * Partially update a ${modelName}
 */
${modelNameLower}Routes.patch('/:id', transactionMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const result = await ${modelNameLower}Domain.update(
      id,
      body,
      {
        requestId: c.get('requestId'),
        userId: c.get('userId')
      },
      c.get('transaction')
    );

    return c.json(result);
  } catch (error) {
    if (error.message.includes('not found')) {
      return c.json({ error: '${modelName} not found' }, 404);
    }
    throw error;
  }
});

/**
 * DELETE /${modelNamePlural}/:id
 * Delete a ${modelName}
 */
${modelNameLower}Routes.delete('/:id', transactionMiddleware, async (c) => {
  const id = c.req.param('id');

  try {
    await ${modelNameLower}Domain.delete(
      id,
      {
        requestId: c.get('requestId'),
        userId: c.get('userId')
      },
      c.get('transaction')
    );

    return c.json({ message: '${modelName} deleted successfully' });
  } catch (error) {
    if (error.message.includes('not found')) {
      return c.json({ error: '${modelName} not found' }, 404);
    }
    throw error;
  }
});

${this.generateRelationshipEndpoints(model)}
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
    const modelNamePlural = this.pluralize(modelNameLower);

    for (const rel of model.relationships) {
      if (rel.type === 'oneToMany') {
        const relNamePlural = this.pluralize(rel.name);
        endpoints.push(`
/**
 * GET /${modelNamePlural}/:id/${relNamePlural}
 * Get ${rel.name} for a ${model.name}
 */
${modelNameLower}Routes.get('/:id/${relNamePlural}', async (c) => {
  const id = c.req.param('id');
  
  const result = await ${modelNameLower}Domain.get${this.capitalize(rel.name)}(id);
  
  return c.json(result);
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
import { getDatabase } from '../db/database';

/**
 * Transaction middleware for operations that modify data
 */
export const transactionMiddleware: MiddlewareHandler = async (c, next) => {
  const db = getDatabase();
  
  try {
    // Create transaction and store it in context
    await db.transaction(async (tx) => {
      c.set('transaction', tx);
      await next();
    });
  } catch (error) {
    // Transaction will be rolled back automatically on error
    throw error;
  }
};

/**
 * Request ID middleware
 */
export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
};

/**
 * Error handling middleware
 */
export const errorMiddleware: MiddlewareHandler = async (c, next) => {
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
export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
  
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
};
`;
  }

  /**
   * Generate API index file
   */
  private generateAPIIndex(): string {
    let code = `import { Hono } from '@hono/hono';
import { requestIdMiddleware, errorMiddleware, corsMiddleware } from './middleware';
`;

    // Import all route files
    for (const model of this.models) {
      code += `import { ${model.name.toLowerCase()}Routes } from './${model.name.toLowerCase()}.api';\n`;
    }

    code += `
/**
 * Register all API routes
 */
export function registerAPIRoutes(app: Hono) {
  // Apply global middleware
  app.use('*', corsMiddleware);
  app.use('*', requestIdMiddleware);
  app.use('*', errorMiddleware);

  // Register model routes
`;

    for (const model of this.models) {
      const plural = this.pluralize(model.name.toLowerCase());
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
${this.models.map(m => {
  const plural = this.pluralize(m.name.toLowerCase());
  return `        '${plural}'`;
}).join(',\n')}
      ]
    });
  });
}

// Export all routes for individual use
`;

    for (const model of this.models) {
      code += `export { ${model.name.toLowerCase()}Routes } from './${model.name.toLowerCase()}.api';\n`;
    }

    return code;
  }

  /**
   * Simple pluralization
   */
  private pluralize(word: string): string {
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    }
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch')) {
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
}