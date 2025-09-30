import { Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { type DbTransaction, HookContext, initializeGenerated, userDomain } from './generated/index.ts';
import { sql } from 'drizzle-orm';
import { crypto } from '@std/crypto';
import { load } from '@std/dotenv';
import type { Env } from './generated/rest/types.ts';
import { uuid } from 'drizzle-orm/pg-core';
// the above line is a demonstration of fileds definition that can be used in the context, eg:
// c.set('requestId', uuid.v4());
// const requestId = c.get('requestId');

// Create Hono app instance with the correct environment type
const app = new Hono<Env>();

const env = await load();

// Initialize the backend
async function startServer() {
  // demo
  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    // Add request ID to response headers
    c.header('X-Request-ID', requestId);
    await next();
  });

  // demo
  app.use('*', async (c, next) => {
    const userId = c.req.header('X-User-ID');
    c.set('userId', userId);
    await next();
  });

  // demo
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const end = Date.now();
    console.log(`Request took ${end - start}ms`);
  });

  try {
    // Initialize generated backend code
    const { db } = await initializeGenerated({
      // Database configuration
      database: {
        connectionString: env.DB_URL,
        ssl: {
          ca: env.DB_SSL_CERT_FILE,
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
            throw new HTTPException(403, { message: 'Forbidden' });
            /*
            return {
              data: {
                ...result,
              },
              context,
            };
            */
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

    // Add custom routes
    app.get('/', (c) => c.json({ message: 'Welcome to the example backend!' }));

    // Add custom domain logic example
    app.get('/api/users/search', async (c) => {
      const { email } = c.req.query();

      try {
        const result = db.transaction(async (tx) => {
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

    app.get('/xxx', async (c) => {
      const uuid = crypto.randomUUID();
      const uid = uuid.split('-')[1];

      const result = await db.transaction(async (tx) => {
        const data = {
          id: uuid,
          email: `${uid}@email.com`,
          username: uid,
          fullName: `Full Name ${uid}`,
          passwordHash: uid,
        };
        return await userDomain.create(data, tx);
      });

      return c.json(result);
    });

    // Start the server
    const port = 3000;
    console.log(`Server starting on http://localhost:${port}`);

    Deno.serve({ port: 3000 }, app.fetch);
  } catch (error) {
    console.error('Failed to start server:', error);
    Deno.exit(1);
  }
}

// Start the server
startServer();
