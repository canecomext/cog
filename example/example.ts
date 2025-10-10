import { type Context, type ErrorHandler, Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import {
  type DbTransaction,
  HookContext,
  initializeGenerated,
  userDomain,
  withTransaction,
} from './generated/index.ts';
import { sql } from 'drizzle-orm';
import { crypto } from '@std/crypto';
import { load } from '@std/dotenv';
import { join } from '@std/path';
import type { Env } from './example-context.ts';
import { printRegisteredEndpoints } from './generated/rest/index.ts';
import { Scalar } from '@scalar/hono-api-reference';
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';

const app = new Hono<Env>();

const env = await load();

const onUnhandledError = (err: Error, c: Context<Env>) => {
  console.error('Unhandled error:', err);
  return c.json({
    error: 'Internal server error',
  }, 500);
};

async function startServer() {
  app.use('*', async (c, next) => {
    const someString = crypto.randomUUID();
    c.set('someString', someString);
    await next();
  });

  try {
    // Initialize generated backend code
    await initializeGenerated({
      // Database configuration, adjust to your environment
      database: {
        connectionString: env.DB_URL,
        ssl: {
          ca: Deno.readTextFileSync(join(Deno.cwd(), env.DB_SSL_CA_FILE)),
        },
      },
      // Pass the Hono app instance
      app,
      // Register hooks
      hooks: {
        user: {
          // Pre-create hook: Validate email format
          async preCreate(input: any, tx: DbTransaction, context?: HookContext) {
            // throw new HTTPException(401, { message: 'Not authorized' });
            return { data: input, context };
          },

          // Post-create hook: Enrich response with computed field
          async postCreate(input: any, result: any, tx: DbTransaction, context?: HookContext) {
            return {
              data: {
                ...result,
              },
              context,
            };
          },

          // After-create hook: Log creation (async)
          async afterCreate(result: any, context?: HookContext) {
            console.log(
              `User created: ${result.id} at ${new Date().toISOString()}`,
            );
          },
        },
      },
    });

    // Add custom domain logic example
    app.get('/api/users/search', async (c) => {
      const { email } = c.req.query();

      try {
        const result = await withTransaction(async (tx) => {
          return await userDomain.findMany(tx, {
            where: sql`email ILIKE ${`%${email}%`}`,
          });
        });

        return c.json(result);
      } catch (error) {
        console.error('Search failed:', error);
        return c.json({ error: 'Failed to search users' }, 500);
      }
    });

    app.get(
      '/reference',
      Scalar({
        url: '/openapi.json',
        theme: 'purple', // Try: 'alternate', 'default', 'moon', 'purple', 'solarized'
      }) as any,
    );

    app.get('/openapi.json', (c) => {
      return c.json(generatedOpenAPISpec);
    });

    // =============================================================================
    // Landing page with links to all documentation
    // =============================================================================
    app.get('/', (c) => {
      return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>API Documentation</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #333; }
          .card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            background: #f9f9f9;
          }
          a {
            color: #6366f1;
            text-decoration: none;
            font-weight: 500;
          }
          a:hover { text-decoration: underline; }
          .theme-selector {
            margin: 10px 0;
            padding: 10px;
            background: #fff;
            border-radius: 4px;
          }
          code {
            background: #e5e7eb;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <h1>🚀 API Documentation</h1>
        <p>Welcome to your API documentation powered by Scalar!</p>
        
        <div class="card">
          <h2>📚 Generated CRUD API</h2>
          <p>Auto-generated REST API for all your models with CRUD operations.</p>
          <a href="/reference" target="_blank">→ View Documentation</a>
          <br><br>
          <small>OpenAPI Spec: <a href="/openapi.json" target="_blank">/openapi.json</a></small>
        </div>
        
        <!--
        <div class="card">
          <h2>🎯 Complete API (Generated + Custom)</h2>
          <p>Includes generated CRUD endpoints plus custom authentication and analytics endpoints.</p>
          <a href="/docs/reference" target="_blank">→ View Documentation</a>
          <br><br>
          <small>OpenAPI Spec: <a href="/docs/openapi.json" target="_blank">/docs/openapi.json</a></small>
        </div>
        -->
        
        <!--
        <div class="card">
          <h2>🎨 Try Different Themes</h2>
          <div class="theme-selector">
            <p>Available themes:</p>
            <a href="/reference/custom?theme=purple">Purple (default)</a> •
            <a href="/reference/custom?theme=alternate">Alternate</a> •
            <a href="/reference/custom?theme=default">Default</a> •
            <a href="/reference/custom?theme=moon">Moon</a> •
            <a href="/reference/custom?theme=solarized">Solarized</a>
          </div>
        </div>
        -->
        
        <div class="card">
          <h2>💡 Quick Tips</h2>
          <ul>
            <li>All endpoints support <code>Bearer</code> authentication</li>
            <li>Use the "Try it" button in Scalar to test endpoints</li>
            <li>Filter by tags to see specific endpoint groups</li>
            <li>Download OpenAPI spec to generate client SDKs</li>
          </ul>
        </div>
      </body>
    </html>
  `);
    });

    printRegisteredEndpoints(app);

    app.onError((err: Error, c: Context<Env>) => {
      // Handle HTTPException
      if (err instanceof HTTPException) {
        return c.json({
          error: err.message,
        }, err.status);
      }

      // Handle Zod validation errors
      if (err.name === 'ZodError') {
        try {
          const zodErrors = JSON.parse(err.message);
          const formattedErrors = zodErrors.reduce((acc: string[], curr: any) => {
            return [...acc, ...curr.path.map((p: string | number) => `${p}: ${curr.message}`)];
          }, []);

          return c.json({
            error: formattedErrors,
          }, 400);
        } catch {
          // If JSON parse fails, return raw message
          onUnhandledError(err, c);
        }
      }

      // Handle Drizzle database errors
      if (err.constructor.name === 'DrizzleQueryError' || err.name === 'DrizzleError') {
        // Extract the underlying PostgreSQL error
        const pgError = (err as any).cause;

        if (pgError && pgError.code) {
          // Map PostgreSQL error codes to user-friendly messages
          switch (pgError.code) {
            case '23505': {
              // unique_violation
              // Extract field name from constraint
              const constraintMatch = pgError.constraint_name?.match(/_([^_]+)_unique$/);
              const field = constraintMatch ? constraintMatch[1].replace(/_/g, ' ') : 'value';
              return c.json({
                error: [
                  `${field}: Already in use`,
                ],
              }, 409);
            }

            case '23503': // foreign_key_violation
              return c.json({
                error: [
                  'The referenced resource does not exist',
                ],
              }, 400);

            case '23502': {
              // not_null_violation
              const columnMatch = pgError.message?.match(/column "([^"]+)"/);
              const column = columnMatch ? columnMatch[1].replace(/_/g, ' ') : 'field';
              return c.json({
                error: [
                  `${column}: Required field is missing`,
                ],
              }, 400);
            }

            case '23514': // check_violation
              return c.json({
                error: 'Invalid data provided',
              }, 400);

            case '22P02': // invalid_text_representation
              return c.json({
                error: 'Invalid data format',
              }, 400);

            default:
              console.error('Database error:', {
                code: pgError.code,
                message: pgError.message,
                detail: pgError.detail,
                constraint: pgError.constraint_name,
              });
              return c.json({
                error: 'Unable to process request',
              }, 500);
          }
        }

        // DrizzleQueryError without underlying PostgreSQL error
        console.error('Drizzle error without cause:', err);
        return onUnhandledError(err, c);
      }

      // Handle all other errors
      return onUnhandledError(err, c);
    });

    Deno.serve({
      port: 3000,
      onListen(addr) {
        console.log(`\nServer started at ${addr.hostname}:${addr.port}`);
      },
    }, app.fetch);
  } catch (error) {
    console.error('Failed to start server:', error);
    Deno.exit(1);
  }
}

// Start the server
startServer();
