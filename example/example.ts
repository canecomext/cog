import { type Context, type ErrorHandler, Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import {
  type DbTransaction,
  DomainHookContext,
  extractRoutes,
  initializeGenerated,
  RestHookContext,
  userDomain,
  withTransaction,
} from './generated/index.ts';
import { sql } from 'drizzle-orm';
import { crypto } from '@std/crypto';
import { load } from '@std/dotenv';
import { join } from '@std/path';
import { generatedOpenAPISpec } from './generated/rest/openapi.ts';
import { Scalar } from '@scalar/hono-api-reference';
import type { Env } from './example-context.ts';

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
      // Register domain hooks (run within database transaction)
      domainHooks: {
        user: {
          // Pre-create hook: Validate email format
          async preCreate(input: any, tx: DbTransaction, context?: DomainHookContext) {
            // throw new HTTPException(401, { message: 'Not authorized' });
            return { data: input, context };
          },

          // Post-create hook: Enrich response with computed field
          async postCreate(input: any, result: any, tx: DbTransaction, context?: DomainHookContext) {
            return {
              data: {
                ...result,
              },
              context,
            };
          },

          // After-create hook: Log creation (async)
          async afterCreate(result: any, context?: DomainHookContext) {
            console.log(
              `User created: ${result.id} at ${new Date().toISOString()}`,
            );
          },
        },
      },
      // Register REST hooks (run at HTTP layer, no transaction)
      restHooks: {
        user: {
          // Pre-create hook: Log HTTP request details
          async preCreate(input: any, c: any, context?: RestHookContext) {
            console.log('HTTP Request:', {
              method: c.req.method,
              path: c.req.path,
              userAgent: c.req.header('user-agent'),
              ip: c.req.header('x-forwarded-for') || 'unknown',
            });
            return { data: input, context };
          },

          // Post-create hook: Add custom response headers
          async postCreate(input: any, result: any, c: any, context?: RestHookContext) {
            c.header('X-Resource-Id', result.id);
            c.header('X-Created-At', new Date().toISOString());

            // Remove sensitive fields from response
            const { passwordHash, ...safeResult } = result;

            return { data: safeResult, context };
          },

          // Pre-findMany hook: Simple authorization check
          async preFindMany(c: any, context?: RestHookContext) {
            // Example: Check for authorization header
            const auth = c.req.header('authorization');
            if (!auth && c.req.query('requireAuth') === 'true') {
              throw new HTTPException(401, { message: 'Authorization required' });
            }

            return { data: {}, context };
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

    // Expose OpenAPI spec at custom URL
    app.get('/api/openapi.json', (c) => c.json(generatedOpenAPISpec));

    // Expose interactive docs with Scalar
    app.get('/api/docs', Scalar({ url: '/api/openapi.json' }) as any);

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

        // Extract all registered routes
        const routes = extractRoutes(app);
        console.table(routes);
      },
    }, app.fetch);
  } catch (error) {
    console.error('Failed to start server:', error);
    Deno.exit(1);
  }
}

// Start the server
startServer();
