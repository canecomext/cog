import { ModelDefinition } from "../types/model.types.ts";

/**
 * Generates domain API layer with CRUD operations and hooks
 */
export class DomainAPIGenerator {
  private models: ModelDefinition[];

  constructor(models: ModelDefinition[]) {
    this.models = models;
  }

  /**
   * Generate domain API files
   */
  generateDomainAPIs(): Map<string, string> {
    const files = new Map<string, string>();

    // Generate hooks types
    files.set("domain/hooks.types.ts", this.generateHooksTypes());

    // Generate individual domain APIs
    for (const model of this.models) {
      const domainAPI = this.generateModelDomainAPI(model);
      files.set(`domain/${model.name.toLowerCase()}.domain.ts`, domainAPI);
    }

    // Generate index file
    files.set("domain/index.ts", this.generateDomainIndex());

    return files;
  }

  /**
   * Generate hooks types
   */
  private generateHooksTypes(): string {
    return `import { SQL } from 'drizzle-orm';
import { type DbTransaction } from '../db/database.ts';

export interface HookContext {
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface PreHookResult<T> {
  data: T;
  context?: HookContext;
}

export interface PostHookResult<T> {
  data: T;
  context?: HookContext;
}

export interface FilterOptions {
  where?: SQL;
  include?: string[];
}

export interface CRUDHooks<T, CreateInput, UpdateInput> {
  // Pre-operation hooks (within transaction)
  preCreate?: (input: CreateInput, context?: HookContext) => Promise<PreHookResult<CreateInput>>;
  preUpdate?: (id: string, input: UpdateInput, context?: HookContext) => Promise<PreHookResult<UpdateInput>>;
  preDelete?: (id: string, context?: HookContext) => Promise<PreHookResult<{ id: string }>>;
  preFindOne?: (id: string, context?: HookContext) => Promise<PreHookResult<{ id: string }>>;
  preFindMany?: (filter?: FilterOptions, context?: HookContext) => Promise<PreHookResult<FilterOptions>>;

  // Post-operation hooks (within transaction)
  postCreate?: (input: CreateInput, result: T, tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T>>;
  postUpdate?: (id: string, input: UpdateInput, result: T, tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T>>;
  postDelete?: (id: string, result: T, tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T>>;
  postFindOne?: (id: string, result: T | null, tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T | null>>;
  postFindMany?: (filter: FilterOptions | undefined, results: T[], tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T[]>>;

  // After-operation hooks (outside transaction, async)
  afterCreate?: (result: T, context?: HookContext) => Promise<void>;
  afterUpdate?: (result: T, context?: HookContext) => Promise<void>;
  afterDelete?: (result: T, context?: HookContext) => Promise<void>;
  afterFindOne?: (result: T | null, context?: HookContext) => Promise<void>;
  afterFindMany?: (results: T[], context?: HookContext) => Promise<void>;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}
`;
  }

  /**
   * Generate domain API for a model
   */
  private generateModelDomainAPI(model: ModelDefinition): string {
    const modelName = model.name;
    const modelNameLower = model.name.toLowerCase();
    const primaryKeyField = model.fields.find((f) => f.primaryKey)?.name ||
      "id";

    return `import { eq, desc, asc, sql } from 'drizzle-orm';
import { getDatabase, withTransaction, type DbTransaction } from '../db/database.ts';
import { ${modelNameLower}Table, type ${modelName}, type New${modelName} } from '../schema/${modelNameLower}.schema.ts';
${this.generateRelationImports(model)}
import { CRUDHooks, HookContext, PaginationOptions, FilterOptions } from './hooks.types.ts';

export class ${modelName}Domain {
  private hooks: CRUDHooks<${modelName}, New${modelName}, Partial<New${modelName}>>;

  constructor(hooks?: CRUDHooks<${modelName}, New${modelName}, Partial<New${modelName}>>) {
    this.hooks = hooks || {};
  }

  /**
   * Create a new ${modelName}
   */
  async create(input: New${modelName}, context?: HookContext, tx?: DbTransaction): Promise<${modelName}> {
    // If transaction is provided, use it; otherwise create one
    const executeInTransaction = async (transaction: DbTransaction) => {
      // Pre-create hook (within transaction)
      let processedInput = input;
      if (this.hooks.preCreate) {
        const preResult = await this.hooks.preCreate(input, context);
        processedInput = preResult.data;
        context = { ...context, ...preResult.context };
      }

      // Perform create operation
      const [created] = await transaction
        .insert(${modelNameLower}Table)
        .values(processedInput)
        .returning();

      // Post-create hook (within transaction)
      let result = created;
      if (this.hooks.postCreate) {
        const postResult = await this.hooks.postCreate(processedInput, created, transaction, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return result;
    };

    // Execute the transaction
    const result: ${modelName} = tx 
      ? await executeInTransaction(tx)
      : await withTransaction(executeInTransaction);

    // After-create hook (outside transaction, after post-hook)
    if (this.hooks.afterCreate) {
      // Schedule asynchronously to not block the response
      setTimeout(() => {
        this.hooks.afterCreate!(result, context).catch(console.error);
      }, 0);
    }

    return result;
  }

  /**
   * Find ${modelName} by ID
   */
  async findById(id: string, options?: FilterOptions, context?: HookContext, tx?: DbTransaction): Promise<${modelName} | null> {
    const executeInTransaction = async (transaction: DbTransaction) => {
      // Pre-find hook
      if (this.hooks.preFindOne) {
        const preResult = await this.hooks.preFindOne(id, context);
        id = preResult.data.id;
        context = { ...context, ...preResult.context };
      }

      // Build query
      const query = transaction
        .select()
        .from(${modelNameLower}Table)
        .where(eq(${modelNameLower}Table.${primaryKeyField}, id));

      // Add relationships if requested
      ${this.generateRelationshipIncludes(model)}

      const result = await query;
      const found = result[0] || null;

      // Post-find hook (within transaction)
      let finalResult: ${modelName} | null = found;
      if (this.hooks.postFindOne && found !== null) {
        const postResult = await this.hooks.postFindOne(id, found, transaction, context);
        if (postResult.data !== null) {
          finalResult = postResult.data;
        }
        context = { ...context, ...postResult.context };
      }

      return finalResult;
    };

    // Execute the transaction
    const result: ${modelName} | null = tx
      ? await executeInTransaction(tx)
      : await withTransaction(executeInTransaction);

    // After-find hook (outside transaction, after post-hook)
    if (this.hooks.afterFindOne) {
      setTimeout(() => {
        this.hooks.afterFindOne!(result, context).catch(console.error);
      }, 0);
    }

    return result;
  }

  /**
   * Find all ${modelName}s with pagination and filtering
   */
  async findMany(
    filter?: FilterOptions,
    pagination?: PaginationOptions,
    context?: HookContext,
    tx?: DbTransaction
  ): Promise<{ data: ${modelName}[]; total: number }> {
    const executeInTransaction = async (transaction: DbTransaction) => {
      // Pre-find hook
      if (this.hooks.preFindMany) {
        const preResult = await this.hooks.preFindMany(filter, context);
        filter = preResult.data as FilterOptions;
        context = { ...context, ...preResult.context };
      }

      // Build query with chaining to avoid type issues
      let baseQuery = transaction.select().from(${modelNameLower}Table);
      
      // Apply filters
      if (filter?.where) {
        baseQuery = baseQuery.where(filter.where) as any;
      }

      // Apply pagination
      if (pagination) {
        if (pagination.orderBy) {
          const orderFn = pagination.orderDirection === 'desc' ? desc : asc;
          // Type-safe column access
          const column = (${modelNameLower}Table as any)[pagination.orderBy];
          if (column) {
            baseQuery = baseQuery.orderBy(orderFn(column)) as any;
          }
        }
        if (pagination.limit) {
          baseQuery = baseQuery.limit(pagination.limit) as any;
        }
        if (pagination.offset) {
          baseQuery = baseQuery.offset(pagination.offset) as any;
        }
      }
      
      const query = baseQuery;

      // Execute query
      const results = await query;

      // Get total count
      const countQueryBase = transaction
        .select({ count: sql<number>\`count(*)\` })
        .from(${modelNameLower}Table);
      
      const countQuery = filter?.where 
        ? countQueryBase.where(filter.where)
        : countQueryBase;

      const [{ count }] = await countQuery;

      // Post-find hook
      const finalResults = this.hooks.postFindMany
        ? await (async () => {
            const postResult = await this.hooks.postFindMany!(filter, results, transaction, context);
            context = { ...context, ...postResult.context };
            return postResult.data;
          })()
        : results;

      return {
        data: finalResults,
        total: Number(count)
      };
    };

    // Execute the transaction
    const result: { data: ${modelName}[]; total: number } = tx
      ? await executeInTransaction(tx)
      : await withTransaction(executeInTransaction);

    // After-find hook (outside transaction, after post-hook)
    if (this.hooks.afterFindMany) {
      setTimeout(() => {
        this.hooks.afterFindMany!(result.data, context).catch(console.error);
      }, 0);
    }

    return result;
  }

  /**
   * Update ${modelName}
   */
  async update(id: string, input: Partial<New${modelName}>, context?: HookContext, tx?: DbTransaction): Promise<${modelName}> {
    const executeInTransaction = async (transaction: DbTransaction) => {
      // Pre-update hook
      let processedInput = input;
      if (this.hooks.preUpdate) {
        const preResult = await this.hooks.preUpdate(id, input, context);
        processedInput = preResult.data;
        context = { ...context, ...preResult.context };
      }

      // Perform update
      const [updated] = await transaction
        .update(${modelNameLower}Table)
        .set({
          ...processedInput,
          ${model.timestamps ? "updatedAt: new Date()," : ""}
        })
        .where(eq(${modelNameLower}Table.${primaryKeyField}, id))
        .returning();

      if (!updated) {
        throw new Error(\`${modelName} with id \${id} not found\`);
      }

      // Post-update hook
      let result = updated;
      if (this.hooks.postUpdate) {
        const postResult = await this.hooks.postUpdate(id, processedInput, updated, transaction, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return result;
    };

    // Execute the transaction
    const result: ${modelName} = tx
      ? await executeInTransaction(tx)
      : await withTransaction(executeInTransaction);

    // After-update hook (outside transaction, after post-hook)
    if (this.hooks.afterUpdate) {
      setTimeout(() => {
        this.hooks.afterUpdate!(result, context).catch(console.error);
      }, 0);
    }

    return result;
  }

  /**
   * Delete ${modelName}
   */
  async delete(id: string, context?: HookContext, tx?: DbTransaction): Promise<${modelName}> {
    const executeInTransaction = async (transaction: DbTransaction) => {
      // Pre-delete hook
      if (this.hooks.preDelete) {
        const preResult = await this.hooks.preDelete(id, context);
        id = preResult.data.id;
        context = { ...context, ...preResult.context };
      }

      // Perform delete
      ${
      model.softDelete
        ? this.generateSoftDelete(model, "transaction")
        : this.generateHardDelete(model, "transaction")
    }

      if (!deleted) {
        throw new Error(\`${modelName} with id \${id} not found\`);
      }

      // Post-delete hook
      let result = deleted;
      if (this.hooks.postDelete) {
        const postResult = await this.hooks.postDelete(id, deleted, transaction, context);
        result = postResult.data;
        context = { ...context, ...postResult.context };
      }

      return result;
    };

    // Execute the transaction
    const result: ${modelName} = tx
      ? await executeInTransaction(tx)
      : await withTransaction(executeInTransaction);

    // After-delete hook (outside transaction, after post-hook)
    if (this.hooks.afterDelete) {
      setTimeout(() => {
        this.hooks.afterDelete!(result, context).catch(console.error);
      }, 0);
    }

    return result;
  }

  ${this.generateRelationshipMethods(model)}
}

// Export singleton instance
export const ${modelNameLower}Domain = new ${modelName}Domain();
`;
  }

  /**
   * Generate relation imports
   */
  private generateRelationImports(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return "";
    }

    const imports: string[] = [];
    for (const rel of model.relationships) {
      if (rel.target !== model.name) {
        imports.push(
          `import { ${rel.target.toLowerCase()}Table } from '../schema/${rel.target.toLowerCase()}.schema.ts';`,
        );
      }
    }

    return imports.join("\n");
  }

  /**
   * Generate relationship includes
   */
  private generateRelationshipIncludes(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return "// No relationships to include";
    }

    return `
      if (options?.include) {
        // Handle relationship includes
        ${
      model.relationships.map((rel) => `
        if (options.include.includes('${rel.name}')) {
          // Include ${rel.name} relationship
          // This would require proper join logic based on relationship type
        }`).join("\n")
    }
      }`;
  }

  /**
   * Generate soft delete logic
   */
  private generateSoftDelete(
    model: ModelDefinition,
    txVar: string = "tx",
  ): string {
    return `const [deleted] = await ${txVar}
        .update(${model.name.toLowerCase()}Table)
        .set({ 
          deletedAt: new Date(),
          ${model.timestamps ? "updatedAt: new Date()" : ""}
        })
        .where(eq(${model.name.toLowerCase()}Table.${
      model.fields.find((f) => f.primaryKey)?.name || "id"
    }, id))
        .returning();`;
  }

  /**
   * Generate hard delete logic
   */
  private generateHardDelete(
    model: ModelDefinition,
    txVar: string = "tx",
  ): string {
    return `const [deleted] = await ${txVar}
        .delete(${model.name.toLowerCase()}Table)
        .where(eq(${model.name.toLowerCase()}Table.${
      model.fields.find((f) => f.primaryKey)?.name || "id"
    }, id))
        .returning();`;
  }

  /**
   * Generate relationship methods
   */
  private generateRelationshipMethods(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return "";
    }

    const methods: string[] = [];

    for (const rel of model.relationships) {
      if (rel.type === "oneToMany") {
        methods.push(`
  /**
   * Get ${rel.name} for ${model.name}
   */
  async get${this.capitalize(rel.name)}(id: string): Promise<unknown[]> {
    const db = getDatabase();
    return await db
      .select()
      .from(${rel.target.toLowerCase()}Table)
      .where(eq(${rel.target.toLowerCase()}Table.${
          rel.foreignKey || model.name.toLowerCase() + "Id"
        }, id));
  }`);
      }
    }

    return methods.join("\n");
  }

  /**
   * Generate domain index file
   */
  private generateDomainIndex(): string {
    let code = "// Export all domain APIs\n";

    for (const model of this.models) {
      code += `export * from './${model.name.toLowerCase()}.domain.ts';\n`;
    }

    code += `export * from './hooks.types.ts';\n`;

    return code;
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
