import { type Context, Hono } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { Scalar } from '@scalar/hono-api-reference';
import { load } from '@std/dotenv';
import { join } from '@std/path';
import { crypto } from '@std/crypto';
import { type DbTransaction, extractRoutes, FilterOptions, initializeGenerated } from '../generated/index.ts';
import type { DomainHookContext, DomainPostHookResult, DomainPreHookResult } from '../generated/domain/hooks.types.ts';
import type { RestHookContext, RestPostHookResult, RestPreHookResult } from '../generated/rest/hooks.types.ts';
import type { Department, Employee, NewDepartment, NewEmployee } from '../generated/schema/index.ts';
import { generatedOpenAPISpec } from '../generated/rest/openapi.ts';
import type { Env } from './context.ts';

const app = new Hono<Env>();
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
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPreHookResult<NewEmployee, Env['Variables']>> => {
        console.log('Employee.preCreate');
        return Promise.resolve({ data: input, context });
      },

      postCreate: (
        _input: NewEmployee,
        result: Employee,
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPostHookResult<Employee, Env['Variables']>> => {
        console.log('Employee.postCreate');
        return Promise.resolve({ data: result, context });
      },

      afterCreate: (
        _result: Employee,
        _context?: DomainHookContext<Env['Variables']>,
      ): Promise<void> => {
        console.log('Employee.afterCreate - async side effect');
        return Promise.resolve();
      },

      // UPDATE hooks with full signatures
      preUpdate: (
        _id: string,
        input: Partial<NewEmployee>,
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPreHookResult<Partial<NewEmployee>, Env['Variables']>> => {
        console.log('Employee.preUpdate');
        return Promise.resolve({ data: input, context });
      },

      postUpdate: (
        _id: string,
        _input: Partial<NewEmployee>,
        result: Employee,
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPostHookResult<Employee, Env['Variables']>> => {
        console.log('Employee.postUpdate');
        return Promise.resolve({ data: result, context });
      },

      afterUpdate: (
        _result: Employee,
        _context?: DomainHookContext<Env['Variables']>,
      ): Promise<void> => {
        console.log('Employee.afterUpdate - async side effect');
        return Promise.resolve();
      },

      // DELETE hooks with full signatures
      preDelete: (
        _id: string,
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPreHookResult<{ id: string }, Env['Variables']>> => {
        console.log('Employee.preDelete');
        return Promise.resolve({ data: { id: _id }, context });
      },

      postDelete: (
        _id: string,
        result: Employee,
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPostHookResult<Employee, Env['Variables']>> => {
        console.log('Employee.postDelete');
        return Promise.resolve({ data: result, context });
      },

      afterDelete: (
        _result: Employee,
        _context?: DomainHookContext<Env['Variables']>,
      ): Promise<void> => {
        console.log('Employee.afterDelete - async side effect');
        return Promise.resolve();
      },

      // FIND hooks with full signatures
      preFindById: (
        _id: string,
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPreHookResult<{ id: string }, Env['Variables']>> => {
        console.log('Employee.preFindById');
        return Promise.resolve({ data: { id: _id }, context });
      },

      postFindById: (
        _id: string,
        result: Employee | null,
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPostHookResult<Employee | null, Env['Variables']>> => {
        console.log('Employee.postFindById');
        return Promise.resolve({ data: result, context });
      },

      preFindMany: (
        _tx: DbTransaction,
        filter?: FilterOptions,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPreHookResult<FilterOptions, Env['Variables']>> => {
        console.log('Employee.preFindMany');
        return Promise.resolve({ data: filter || {}, context });
      },

      postFindMany: (
        _filter: FilterOptions | undefined,
        results: Employee[],
        _tx: DbTransaction,
        context?: DomainHookContext<Env['Variables']>,
      ): Promise<DomainPostHookResult<Employee[], Env['Variables']>> => {
        console.log('Employee.postFindMany');
        return Promise.resolve({ data: results, context });
      },

      // JUNCTION HOOKS - Full signatures for many-to-many relationships
      skillListJunctionHooks: {
        preAddJunction: (
          ids: Record<string, string>,
          _tx: DbTransaction,
          context?: DomainHookContext<Env['Variables']>,
        ): Promise<DomainPreHookResult<{ ids: Record<string, string> }, Env['Variables']>> => {
          console.log('Employee.skillList.preAddJunction');
          return Promise.resolve({ data: { ids }, context });
        },

        postAddJunction: (
          _ids: Record<string, string>,
          _tx: DbTransaction,
          context?: DomainHookContext<Env['Variables']>,
        ): Promise<DomainPostHookResult<undefined, Env['Variables']>> => {
          console.log('Employee.skillList.postAddJunction');
          return Promise.resolve({ data: undefined, context });
        },

        afterAddJunction: (
          _ids: Record<string, string>,
          _context?: DomainHookContext<Env['Variables']>,
        ): Promise<void> => {
          console.log('Employee.skillList.afterAddJunction - async side effect');
          return Promise.resolve();
        },

        preRemoveJunction: (
          ids: Record<string, string>,
          _tx: DbTransaction,
          context?: DomainHookContext<Env['Variables']>,
        ): Promise<DomainPreHookResult<{ ids: Record<string, string> }, Env['Variables']>> => {
          console.log('Employee.skillList.preRemoveJunction');
          return Promise.resolve({ data: { ids }, context });
        },

        postRemoveJunction: (
          _ids: Record<string, string>,
          _tx: DbTransaction,
          context?: DomainHookContext<Env['Variables']>,
        ): Promise<DomainPostHookResult<undefined, Env['Variables']>> => {
          console.log('Employee.skillList.postRemoveJunction');
          return Promise.resolve({ data: undefined, context });
        },

        afterRemoveJunction: (
          _ids: Record<string, string>,
          _context?: DomainHookContext<Env['Variables']>,
        ): Promise<void> => {
          console.log('Employee.skillList.afterRemoveJunction - async side effect');
          return Promise.resolve();
        },
      },
    },
  },

  // REST HOOKS - Run at HTTP layer, NO transaction access
  restHooks: {
    department: {
      // CREATE hooks with full signatures
      preCreate: (
        input: NewDepartment,
        c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPreHookResult<NewDepartment, Env['Variables']>> => {
        console.log('Department.REST.preCreate - accessing Env:', c.get('someString'));
        return Promise.resolve({ data: input, context });
      },

      postCreate: (
        _input: NewDepartment,
        result: Department,
        c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPostHookResult<Department, Env['Variables']>> => {
        console.log('Department.REST.postCreate');
        c.header('X-Resource-Id', result.id);
        return Promise.resolve({ data: result, context });
      },

      // UPDATE hooks with full signatures
      preUpdate: (
        _id: string,
        input: Partial<NewDepartment>,
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPreHookResult<Partial<NewDepartment>, Env['Variables']>> => {
        console.log('Department.REST.preUpdate');
        return Promise.resolve({ data: input, context });
      },

      postUpdate: (
        _id: string,
        _input: Partial<NewDepartment>,
        result: Department,
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPostHookResult<Department, Env['Variables']>> => {
        console.log('Department.REST.postUpdate');
        return Promise.resolve({ data: result, context });
      },

      // DELETE hooks with full signatures
      preDelete: (
        _id: string,
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPreHookResult<{ id: string }, Env['Variables']>> => {
        console.log('Department.REST.preDelete');
        return Promise.resolve({ data: { id: _id }, context });
      },

      postDelete: (
        _id: string,
        result: Department,
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPostHookResult<Department, Env['Variables']>> => {
        console.log('Department.REST.postDelete');
        return Promise.resolve({ data: result, context });
      },

      // FIND hooks with full signatures
      preFindById: (
        _id: string,
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPreHookResult<{ id: string }, Env['Variables']>> => {
        console.log('Department.REST.preFindById');
        return Promise.resolve({ data: { id: _id }, context });
      },

      postFindById: (
        _id: string,
        result: Department | null,
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPostHookResult<Department | null, Env['Variables']>> => {
        console.log('Department.REST.postFindById');
        return Promise.resolve({ data: result, context });
      },

      preFindMany: (
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPreHookResult<Record<string, never>, Env['Variables']>> => {
        console.log('Department.REST.preFindMany');
        return Promise.resolve({ data: {}, context });
      },

      postFindMany: (
        results: { data: Department[]; total: number },
        _c: Context<Env>,
        context?: RestHookContext<Env['Variables']>,
      ): Promise<RestPostHookResult<{ data: Department[]; total: number }, Env['Variables']>> => {
        console.log('Department.REST.postFindMany');
        return Promise.resolve({ data: results, context });
      },
    },
  },
});

// Documentation endpoints
app.get('/docs/openapi.json', (c) => c.json(generatedOpenAPISpec));
app.get('/docs/reference', Scalar({ url: '/docs/openapi.json' }) as unknown as (c: Context<Env>) => Response);

// Error handling
app.onError((err: Error, c: Context<Env>) => {
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
