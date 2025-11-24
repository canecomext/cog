import { type Context, Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { Scalar } from '@scalar/hono-api-reference';
import { load } from '@std/dotenv';
import { join } from '@std/path';
import { crypto } from '@std/crypto';
import { type DbTransaction, extractRoutes, FilterOptions, initializeGenerated } from '../generated/index.ts';
import type { DomainHookContext } from '../generated/domain/hooks.types.ts';
import type { Employee, NewEmployee } from '../generated/schema/index.ts';
import { buildOpenAPISpec } from '../generated/rest/openapi.ts';
import type { ExampleEnv } from './context.ts';

const app = new Hono<ExampleEnv>();
const env = await load();

// Middleware: Set custom Env context variables
app.use('*', async (c, next) => {
  c.set('someString', crypto.randomUUID());
  c.set('someDeepStructure', { someOtherString: new Date() });
  await next();
});

// Initialize generated code with full hook signature demonstrations
await initializeGenerated({
  database: {
    connectionString: env.DB_URL,
    ssl: {
      ca: Deno.readTextFileSync(join(Deno.cwd(), env.DB_SSL_CA_FILE)),
    },
  },
  app,
  api: {
    basePath: '/api',
  },

  // DOMAIN HOOKS - Run within database transaction
  domainHooks: {
    employee: {
      // CREATE hooks with full signatures
      preCreate: (
        input: NewEmployee,
        _rawInput: unknown,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<NewEmployee> => {
        console.log('Employee.preCreate');
        return Promise.resolve(input);
      },

      postCreate: (
        _input: NewEmployee,
        result: Employee,
        _rawInput: unknown,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<Employee> => {
        console.log('Employee.postCreate');
        return Promise.resolve(result);
      },

      afterCreate: (
        _result: Employee,
        _rawInput: unknown,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<void> => {
        console.log('Employee.afterCreate - async side effect');
        return Promise.resolve();
      },

      // UPDATE hooks with full signatures
      preUpdate: (
        _id: string,
        input: Partial<NewEmployee>,
        _rawInput: unknown,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<Partial<NewEmployee>> => {
        console.log('Employee.preUpdate');
        return Promise.resolve(input);
      },

      postUpdate: (
        _id: string,
        _input: Partial<NewEmployee>,
        result: Employee,
        _rawInput: unknown,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<Employee> => {
        console.log('Employee.postUpdate');
        return Promise.resolve(result);
      },

      afterUpdate: (
        _result: Employee,
        _rawInput: unknown,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<void> => {
        console.log('Employee.afterUpdate - async side effect');
        return Promise.resolve();
      },

      // DELETE hooks with full signatures
      preDelete: (
        _id: string,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<{ id: string }> => {
        console.log('Employee.preDelete');
        return Promise.resolve({ id: _id });
      },

      postDelete: (
        _id: string,
        result: Employee,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<Employee> => {
        console.log('Employee.postDelete');
        return Promise.resolve(result);
      },

      afterDelete: (
        _result: Employee,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<void> => {
        console.log('Employee.afterDelete - async side effect');
        return Promise.resolve();
      },

      // FIND hooks with full signatures
      preFindById: (
        _id: string,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<{ id: string }> => {
        console.log('Employee.preFindById');
        return Promise.resolve({ id: _id });
      },

      postFindById: (
        _id: string,
        result: Employee | null,
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<Employee | null> => {
        console.log('Employee.postFindById');
        return Promise.resolve(result);
      },

      preFindMany: (
        _tx: DbTransaction,
        filter?: FilterOptions,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<FilterOptions> => {
        console.log('Employee.preFindMany');
        return Promise.resolve(filter || {});
      },

      postFindMany: (
        _filter: FilterOptions | undefined,
        results: Employee[],
        _tx: DbTransaction,
        _context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<Employee[]> => {
        console.log('Employee.postFindMany');
        return Promise.resolve(results);
      },

      // JUNCTION HOOKS - Full signatures for many-to-many relationships
      skillListJunctionHooks: {
        preAddJunction: (
          ids: Record<string, string>,
          _rawInput: unknown,
          _tx: DbTransaction,
          _context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<{ ids: Record<string, string> }> => {
          console.log('Employee.skillList.preAddJunction');
          return Promise.resolve({ ids });
        },

        postAddJunction: (
          _ids: Record<string, string>,
          _rawInput: unknown,
          _tx: DbTransaction,
          _context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<void> => {
          console.log('Employee.skillList.postAddJunction');
          return Promise.resolve();
        },

        afterAddJunction: (
          _ids: Record<string, string>,
          _rawInput: unknown,
          _context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<void> => {
          console.log('Employee.skillList.afterAddJunction - async side effect');
          return Promise.resolve();
        },

        preRemoveJunction: (
          ids: Record<string, string>,
          _rawInput: unknown,
          _tx: DbTransaction,
          _context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<{ ids: Record<string, string> }> => {
          console.log('Employee.skillList.preRemoveJunction');
          return Promise.resolve({ ids });
        },

        postRemoveJunction: (
          _ids: Record<string, string>,
          _rawInput: unknown,
          _tx: DbTransaction,
          _context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<void> => {
          console.log('Employee.skillList.postRemoveJunction');
          return Promise.resolve();
        },

        afterRemoveJunction: (
          _ids: Record<string, string>,
          _rawInput: unknown,
          _context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<void> => {
          console.log('Employee.skillList.afterRemoveJunction - async side effect');
          return Promise.resolve();
        },
      },
    },
  },
});

// Build OpenAPI specification with basePath
const openAPISpec = buildOpenAPISpec('/api');

// Documentation endpoints
app.get('/docs/openapi.json', (c) => c.json(openAPISpec));
app.get('/docs/reference', Scalar({ url: '/docs/openapi.json' }) as unknown as (c: Context<ExampleEnv>) => Response);

// Error handling
app.onError((err: Error, c: Context<ExampleEnv>) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Start server
Deno.serve(
  {
    port: 3000,
    onListen(addr) {
      console.log(`\nServer started at ${addr.hostname}:${addr.port}`);
      console.log(`\nDocumentation:`);
      console.log(`  OpenAPI Spec: http://localhost:3000/docs/openapi.json`);
      console.log(`  Interactive Docs: http://localhost:3000/docs/reference\n`);

      const routes = extractRoutes(app);
      console.table(routes);
    },
  },
  app.fetch,
);
