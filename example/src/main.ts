import { type Context, Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { Scalar } from '@scalar/hono-api-reference';
import { load } from '@std/dotenv';
import { join } from '@std/path';
import { crypto } from '@std/crypto';
import { type DbTransaction, extractRoutes, FilterOptions, initializeGenerated } from '../generated/index.ts';
import type { DomainHookContext, DomainPostHookResult, DomainPreHookResult } from '../generated/domain/hooks.types.ts';
import type { Employee, NewEmployee } from '../generated/schema/index.ts';
import { generatedOpenAPISpec } from '../generated/rest/openapi.ts';
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
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPreHookResult<NewEmployee, ExampleEnv['Variables']>> => {
        console.log('Employee.preCreate');
        return Promise.resolve({ data: input, context });
      },

      postCreate: (
        _input: NewEmployee,
        result: Employee,
        _rawInput: unknown,
        _tx: DbTransaction,
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPostHookResult<Employee, ExampleEnv['Variables']>> => {
        console.log('Employee.postCreate');
        return Promise.resolve({ data: result, context });
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
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPreHookResult<Partial<NewEmployee>, ExampleEnv['Variables']>> => {
        console.log('Employee.preUpdate');
        return Promise.resolve({ data: input, context });
      },

      postUpdate: (
        _id: string,
        _input: Partial<NewEmployee>,
        result: Employee,
        _rawInput: unknown,
        _tx: DbTransaction,
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPostHookResult<Employee, ExampleEnv['Variables']>> => {
        console.log('Employee.postUpdate');
        return Promise.resolve({ data: result, context });
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
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPreHookResult<{ id: string }, ExampleEnv['Variables']>> => {
        console.log('Employee.preDelete');
        return Promise.resolve({ data: { id: _id }, context });
      },

      postDelete: (
        _id: string,
        result: Employee,
        _tx: DbTransaction,
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPostHookResult<Employee, ExampleEnv['Variables']>> => {
        console.log('Employee.postDelete');
        return Promise.resolve({ data: result, context });
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
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPreHookResult<{ id: string }, ExampleEnv['Variables']>> => {
        console.log('Employee.preFindById');
        return Promise.resolve({ data: { id: _id }, context });
      },

      postFindById: (
        _id: string,
        result: Employee | null,
        _tx: DbTransaction,
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPostHookResult<Employee | null, ExampleEnv['Variables']>> => {
        console.log('Employee.postFindById');
        return Promise.resolve({ data: result, context });
      },

      preFindMany: (
        _tx: DbTransaction,
        filter?: FilterOptions,
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPreHookResult<FilterOptions, ExampleEnv['Variables']>> => {
        console.log('Employee.preFindMany');
        return Promise.resolve({ data: filter || {}, context });
      },

      postFindMany: (
        _filter: FilterOptions | undefined,
        results: Employee[],
        _tx: DbTransaction,
        context?: DomainHookContext<ExampleEnv['Variables']>,
      ): Promise<DomainPostHookResult<Employee[], ExampleEnv['Variables']>> => {
        console.log('Employee.postFindMany');
        return Promise.resolve({ data: results, context });
      },

      // JUNCTION HOOKS - Full signatures for many-to-many relationships
      skillListJunctionHooks: {
        preAddJunction: (
          ids: Record<string, string>,
          _rawInput: unknown,
          _tx: DbTransaction,
          context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<DomainPreHookResult<{ ids: Record<string, string> }, ExampleEnv['Variables']>> => {
          console.log('Employee.skillList.preAddJunction');
          return Promise.resolve({ data: { ids }, context });
        },

        postAddJunction: (
          _ids: Record<string, string>,
          _rawInput: unknown,
          _tx: DbTransaction,
          context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<DomainPostHookResult<undefined, ExampleEnv['Variables']>> => {
          console.log('Employee.skillList.postAddJunction');
          return Promise.resolve({ data: undefined, context });
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
          context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<DomainPreHookResult<{ ids: Record<string, string> }, ExampleEnv['Variables']>> => {
          console.log('Employee.skillList.preRemoveJunction');
          return Promise.resolve({ data: { ids }, context });
        },

        postRemoveJunction: (
          _ids: Record<string, string>,
          _rawInput: unknown,
          _tx: DbTransaction,
          context?: DomainHookContext<ExampleEnv['Variables']>,
        ): Promise<DomainPostHookResult<undefined, ExampleEnv['Variables']>> => {
          console.log('Employee.skillList.postRemoveJunction');
          return Promise.resolve({ data: undefined, context });
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

// Documentation endpoints
app.get('/docs/openapi.json', (c) => c.json(generatedOpenAPISpec));
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
