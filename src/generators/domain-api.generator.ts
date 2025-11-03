import { ModelDefinition, JunctionTableConfig } from '../types/model.types.ts';

/**
 * Generates domain API layer with CRUD operations and hooks
 */
export class DomainAPIGenerator {
  private models: ModelDefinition[];
  private junctionConfigs: Map<string, JunctionTableConfig>;

  constructor(models: ModelDefinition[], junctionConfigs?: Map<string, JunctionTableConfig>) {
    this.models = models;
    this.junctionConfigs = junctionConfigs || new Map();
  }

  /**
   * Generate domain API files
   */
  generateDomainAPIs(): Map<string, string> {
    const files = new Map<string, string>();

    // Generate hooks types
    files.set('domain/hooks.types.ts', this.generateHooksTypes());

    // Generate individual domain APIs
    for (const model of this.models) {
      const domainAPI = this.generateModelDomainAPI(model);
      files.set(`domain/${model.name.toLowerCase()}.domain.ts`, domainAPI);
    }

    // Generate index file
    files.set('domain/index.ts', this.generateDomainIndex());

    return files;
  }

  /**
   * Generate hooks types
   */
  private generateHooksTypes(): string {
    return `import { SQL } from 'npm:drizzle-orm';
import { type DbTransaction } from '../db/database.ts';

/**
 * Hook context that receives all variables from the Hono context.
 * The generic EnvVars type will contain all custom variables defined 
 * in your application's Env type.
 * 
 * Example:
 * If your Env type has Variables: { requestId?: string; userId?: string; tenantId?: string }
 * Then in hooks you can access: context.requestId, context.userId, context.tenantId
 */
export type HookContext<EnvVars extends Record<string, any> = Record<string, any>> = EnvVars;

export interface PreHookResult<T, EnvVars extends Record<string, any> = Record<string, any>> {
  data: T;
  context?: HookContext<EnvVars>;
}

export interface PostHookResult<T, EnvVars extends Record<string, any> = Record<string, any>> {
  data: T;
  context?: HookContext<EnvVars>;
}

export interface FilterOptions {
  where?: SQL;
  include?: string[];
}

/**
 * CRUD hooks with input validation.
 * 
 * Input Validation Flow:
 * 1. Input is validated with Zod schema BEFORE pre-hook is called
 * 2. Pre-hook receives validated input and can modify it
 * 3. Pre-hook output is validated with Zod schema BEFORE main operation
 * 4. This ensures pre-hooks cannot emit malformed data to operations
 * 
 * All validation uses Zod schemas generated from Drizzle table definitions.
 * Validation errors will throw ZodError with detailed error information.
 * 
 * The generic EnvVars type allows you to specify your Env Variables type for type-safe
 * access to context variables in hooks.
 */
export interface CRUDHooks<T, CreateInput, UpdateInput, EnvVars extends Record<string, any> = Record<string, any>> {
  // Pre-operation hooks (within transaction)
  // Note: Input is already validated before this hook is called
  // Note: Output will be validated before the main operation
  // Note: context contains all variables from your Env type
  preCreate?: (input: CreateInput, tx: DbTransaction, context?: HookContext<EnvVars>) => Promise<PreHookResult<CreateInput, EnvVars>>;
  preUpdate?: (id: string, input: UpdateInput, tx: DbTransaction, context?: HookContext<EnvVars>) => Promise<PreHookResult<UpdateInput, EnvVars>>;
  preDelete?: (id: string, tx: DbTransaction, context?: HookContext<EnvVars>) => Promise<PreHookResult<{ id: string }, EnvVars>>;
  preFindById?: (id: string, tx?: DbTransaction, context?: HookContext<EnvVars>) => Promise<PreHookResult<{ id: string }, EnvVars>>;
  preFindMany?: (tx?: DbTransaction, filter?: FilterOptions, context?: HookContext<EnvVars>) => Promise<PreHookResult<FilterOptions, EnvVars>>;

  // Post-operation hooks (within transaction)
  postCreate?: (input: CreateInput, result: T, tx: DbTransaction, context?: HookContext<EnvVars>) => Promise<PostHookResult<T, EnvVars>>;
  postUpdate?: (id: string, input: UpdateInput, result: T, tx: DbTransaction, context?: HookContext<EnvVars>) => Promise<PostHookResult<T, EnvVars>>;
  postDelete?: (id: string, result: T, tx: DbTransaction, context?: HookContext<EnvVars>) => Promise<PostHookResult<T, EnvVars>>;
  postFindById?: (id: string, result: T | null, tx?: DbTransaction, context?: HookContext<EnvVars>) => Promise<PostHookResult<T | null, EnvVars>>;
  postFindMany?: (filter: FilterOptions | undefined, results: T[], tx?: DbTransaction, context?: HookContext<EnvVars>) => Promise<PostHookResult<T[], EnvVars>>;

  // After-operation hooks (outside transaction, async)
  afterCreate?: (result: T, context?: HookContext<EnvVars>) => Promise<void>;
  afterUpdate?: (result: T, context?: HookContext<EnvVars>) => Promise<void>;
  afterDelete?: (result: T, context?: HookContext<EnvVars>) => Promise<void>;
  afterFindById?: (result: T | null, context?: HookContext<EnvVars>) => Promise<void>;
  afterFindMany?: (results: T[], context?: HookContext<EnvVars>) => Promise<void>;
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
      'id';

    // Check if we need additional imports for relationships
    const hasRelationships = model.relationships && model.relationships.length > 0;
    const hasManyToMany = model.relationships?.some((rel) => rel.type === 'manyToMany');
    
    // We need inArray for batch fetching in findMany when there are relationships
    let drizzleImports = "import { eq, desc, asc, sql";
    if (hasManyToMany) {
      drizzleImports += ", and, inArray";
    } else if (hasRelationships) {
      drizzleImports += ", inArray";
    }
    drizzleImports += " } from 'npm:drizzle-orm';";

    return `${drizzleImports}
import { HTTPException } from 'jsr:@hono/hono/http-exception';
import { withoutTransaction, type DbTransaction } from '../db/database.ts';
import { ${modelNameLower}Table, type ${modelName}, type New${modelName}, ${modelNameLower}InsertSchema, ${modelNameLower}UpdateSchema } from '../schema/${modelNameLower}.schema.ts';
${this.generateRelationImports(model)}
import { CRUDHooks, HookContext, PaginationOptions, FilterOptions } from './hooks.types.ts';

export class ${modelName}Domain<EnvVars extends Record<string, any> = Record<string, any>> {
  private hooks: CRUDHooks<${modelName}, New${modelName}, Partial<New${modelName}>, EnvVars>;

  constructor(hooks?: CRUDHooks<${modelName}, New${modelName}, Partial<New${modelName}>, EnvVars>) {
    this.hooks = hooks || {};
  }

  /**
   * Create a new ${modelName}
   */
  async create(input: New${modelName}, tx: DbTransaction, context?: HookContext<EnvVars>): Promise<${modelName}> {
    // Validate input before pre-hook
    const validatedInput = ${modelNameLower}InsertSchema.parse(input);

    // Pre-create hook (within transaction)
    let processedInput = validatedInput;
    if (this.hooks.preCreate) {
      const preResult = await this.hooks.preCreate(validatedInput, tx, context);
      // Validate pre-hook output to ensure it didn't emit malformed data
      processedInput = ${modelNameLower}InsertSchema.parse(preResult.data);
      context = { ...context, ...preResult.context } as HookContext<EnvVars>;
    }

    // Perform create operation
    const [created] = await tx
      .insert(${modelNameLower}Table)
      .values(processedInput)
      .returning();

    // Post-create hook (within transaction)
    let result = created;
    if (this.hooks.postCreate) {
      const postResult = await this.hooks.postCreate(processedInput, created, tx, context);
      result = postResult.data;
      context = { ...context, ...postResult.context } as HookContext<EnvVars>;
    }

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
  async findById(id: string, tx?: DbTransaction, options?: FilterOptions, context?: HookContext<EnvVars>): Promise<${modelName} | null> {
    // Use provided transaction or get database instance
    const db = tx || withoutTransaction();

    // Pre-find hook
    if (this.hooks.preFindById) {
      const preResult = await this.hooks.preFindById(id, tx, context);
      id = preResult.data.id;
      context = { ...context, ...preResult.context } as HookContext<EnvVars>;
    }

    // Build query
    const query = db
      .select()
      .from(${modelNameLower}Table)
      .where(eq(${modelNameLower}Table.${primaryKeyField}, id));

    const result = await query;
    const found = result[0] || null;

    // Add relationships if requested
    ${this.generateRelationshipIncludes(model)}

    // Post-find hook
    let finalResult: ${modelName} | null = found;
    if (this.hooks.postFindById && found !== null) {
      const postResult = await this.hooks.postFindById(id, found, tx, context);
      if (postResult.data !== null) {
        finalResult = postResult.data;
      }
      context = { ...context, ...postResult.context } as HookContext<EnvVars>;
    }

    // After-find hook (outside transaction, after post-hook)
    if (this.hooks.afterFindById) {
      setTimeout(() => {
        this.hooks.afterFindById!(finalResult, context).catch(console.error);
      }, 0);
    }

    return finalResult;
  }

  /**
   * Find all ${modelName}s with pagination and filtering
   */
  async findMany(
    tx?: DbTransaction,
    filter?: FilterOptions,
    pagination?: PaginationOptions,
    context?: HookContext<EnvVars>,
  ): Promise<{ data: ${modelName}[]; total: number }> {
    // Use provided transaction or get database instance
    const db = tx || withoutTransaction();

    // Pre-find hook
    if (this.hooks.preFindMany) {
      const preResult = await this.hooks.preFindMany(tx, filter, context);
      filter = preResult.data as FilterOptions;
      context = { ...context, ...preResult.context } as HookContext<EnvVars>;
    }

    // Build query with chaining to avoid type issues
    let baseQuery = db.select().from(${modelNameLower}Table);
    
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

    ${this.generateRelationshipIncludesForMany(model)}

    // Get total count
    const countQueryBase = db
      .select({ count: sql<number>\`count(*)\` })
      .from(${modelNameLower}Table);
    
    const countQuery = filter?.where 
      ? countQueryBase.where(filter.where)
      : countQueryBase;

    const [{ count }] = await countQuery;

    // Post-find hook
    const finalResults = this.hooks.postFindMany
      ? await (async () => {
          const postResult = await this.hooks.postFindMany!(filter, results, tx, context);
          context = { ...context, ...postResult.context } as HookContext<EnvVars>;
          return postResult.data;
        })()
      : results;

    // After-find hook (outside transaction, after post-hook)
    if (this.hooks.afterFindMany) {
      setTimeout(() => {
        this.hooks.afterFindMany!(finalResults, context).catch(console.error);
      }, 0);
    }

    return {
      data: finalResults,
      total: Number(count)
    };
  }

  /**
   * Update ${modelName}
   */
  async update(id: string, input: Partial<New${modelName}>, tx: DbTransaction, context?: HookContext<EnvVars>): Promise<${modelName}> {
    // Validate input before pre-hook (partial update)
    const validatedInput = ${modelNameLower}UpdateSchema.parse(input);

    // Pre-update hook
    let processedInput = validatedInput;
    if (this.hooks.preUpdate) {
      const preResult = await this.hooks.preUpdate(id, validatedInput, tx, context);
      // Validate pre-hook output to ensure it didn't emit malformed data
      processedInput = ${modelNameLower}UpdateSchema.parse(preResult.data);
      context = { ...context, ...preResult.context } as HookContext<EnvVars>;
    }

    // Perform update
    const [updated] = await tx
      .update(${modelNameLower}Table)
      .set({
        ...processedInput,
        ${model.timestamps ? 'updatedAt: new Date(),' : ''}
      })
      .where(eq(${modelNameLower}Table.${primaryKeyField}, id))
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: \`${modelName} with id \${id} not found\` });
    }

    // Post-update hook
    let result = updated;
    if (this.hooks.postUpdate) {
      const postResult = await this.hooks.postUpdate(id, processedInput, updated, tx, context);
      result = postResult.data;
      context = { ...context, ...postResult.context } as HookContext<EnvVars>;
    }

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
  async delete(id: string, tx: DbTransaction, context?: HookContext<EnvVars>): Promise<${modelName}> {
    // Pre-delete hook
    if (this.hooks.preDelete) {
      const preResult = await this.hooks.preDelete(id, tx, context);
      id = preResult.data.id;
      context = { ...context, ...preResult.context } as HookContext<EnvVars>;
    }

    // Perform delete
    ${model.softDelete ? this.generateSoftDelete(model, 'tx') : this.generateHardDelete(model, 'tx')}

    if (!deleted) {
      throw new HTTPException(404, { message: \`${modelName} with id \${id} not found\` });
    }

    // Post-delete hook
    let result = deleted;
    if (this.hooks.postDelete) {
      const postResult = await this.hooks.postDelete(id, deleted, tx, context);
      result = postResult.data;
      context = { ...context, ...postResult.context } as HookContext<EnvVars>;
    }

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

// Export singleton instance (uses default Record<string, any> for EnvVars)
export const ${modelNameLower}Domain = new ${modelName}Domain();
`;
  }

  /**
   * Generate relation imports
   */
  private generateRelationImports(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '';
    }

    const imports: string[] = [];
    const addedImports = new Set<string>();

    for (const rel of model.relationships) {
      if (rel.target !== model.name && !addedImports.has(rel.target)) {
        imports.push(
          `import { ${rel.target.toLowerCase()}Table, type ${rel.target} } from '../schema/${rel.target.toLowerCase()}.schema.ts';`,
        );
        addedImports.add(rel.target);
      }

      // Add junction table imports for manyToMany relationships
      if (rel.type === 'manyToMany' && rel.through && !addedImports.has(rel.through)) {
        imports.push(
          `import { ${rel.through.toLowerCase()}Table } from '../schema/${rel.through.toLowerCase()}.schema.ts';`,
        );
        addedImports.add(rel.through);
      }
    }

    return imports.join('\n');
  }

  /**
   * Generate relationship includes
   */
  private generateRelationshipIncludes(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '// No relationships to include';
    }

    // Generate the include logic for relationships
    let code = '\n    // Handle relationship includes\n';
    code += '    if (options?.include && options.include.length > 0 && found) {\n';
    
    for (const rel of model.relationships) {
      code += `        if (options.include.includes('${rel.name}')) {\n`;
      
      if (rel.type === 'manyToOne') {
        // For manyToOne, fetch the single related entity
        const foreignKey = rel.foreignKey || rel.target.toLowerCase() + 'Id';
        code += `          // Load ${rel.name} (manyToOne)\n`;
        code += `          if (found.${foreignKey}) {\n`;
        code += `            const ${rel.name} = await db\n`;
        code += `              .select()\n`;
        code += `              .from(${rel.target.toLowerCase()}Table)\n`;
        code += `              .where(eq(${rel.target.toLowerCase()}Table.id, found.${foreignKey}))\n`;
        code += `              .limit(1);\n`;
        code += `            (found as any).${rel.name} = ${rel.name}[0] || null;\n`;
        code += `          } else {\n`;
        code += `            (found as any).${rel.name} = null;\n`;
        code += `          }\n`;
      } else if (rel.type === 'oneToMany') {
        // For oneToMany, fetch the array of related entities
        const foreignKey = rel.foreignKey || model.name.toLowerCase() + 'Id';
        code += `          // Load ${rel.name} (oneToMany)\n`;
        code += `          const ${rel.name} = await db\n`;
        code += `            .select()\n`;
        code += `            .from(${rel.target.toLowerCase()}Table)\n`;
        code += `            .where(eq(${rel.target.toLowerCase()}Table.${foreignKey}, id));\n`;
        code += `          (found as any).${rel.name} = ${rel.name};\n`;
      } else if (rel.type === 'manyToMany' && rel.through) {
        // For manyToMany, fetch through junction table
        const junctionTable = rel.through.toLowerCase();
        const sourceFK = rel.foreignKey || this.toSnakeCase(model.name) + '_id';
        const targetFK = rel.targetForeignKey || this.toSnakeCase(rel.target) + '_id';
        code += `          // Load ${rel.name} (manyToMany)\n`;
        code += `          const ${rel.name}Result = await db\n`;
        code += `            .select({ ${rel.target.toLowerCase()}: ${rel.target.toLowerCase()}Table })\n`;
        code += `            .from(${junctionTable}Table)\n`;
        code += `            .innerJoin(${rel.target.toLowerCase()}Table, eq(${junctionTable}Table.${targetFK}, ${rel.target.toLowerCase()}Table.id))\n`;
        code += `            .where(eq(${junctionTable}Table.${sourceFK}, id));\n`;
        code += `          (found as any).${rel.name} = ${rel.name}Result.map(r => r.${rel.target.toLowerCase()});\n`;
      } else if (rel.type === 'oneToOne') {
        // For oneToOne, check if foreign key is on this model
        const hasFK = model.fields.some((f) => f.name === rel.foreignKey);
        if (hasFK) {
          // Foreign key is on this model, fetch the related entity
          const foreignKey = rel.foreignKey!;
          code += `          // Load ${rel.name} (oneToOne - owned)\n`;
          code += `          if (found.${foreignKey}) {\n`;
          code += `            const ${rel.name} = await db\n`;
          code += `              .select()\n`;
          code += `              .from(${rel.target.toLowerCase()}Table)\n`;
          code += `              .where(eq(${rel.target.toLowerCase()}Table.id, found.${foreignKey}))\n`;
          code += `              .limit(1);\n`;
          code += `            (found as any).${rel.name} = ${rel.name}[0] || null;\n`;
          code += `          } else {\n`;
          code += `            (found as any).${rel.name} = null;\n`;
          code += `          }\n`;
        } else {
          // Foreign key is on the target model, fetch the related entity
          const foreignKey = rel.foreignKey || model.name.toLowerCase() + 'Id';
          code += `          // Load ${rel.name} (oneToOne - inverse)\n`;
          code += `          const ${rel.name} = await db\n`;
          code += `            .select()\n`;
          code += `            .from(${rel.target.toLowerCase()}Table)\n`;
          code += `            .where(eq(${rel.target.toLowerCase()}Table.${foreignKey}, id))\n`;
          code += `            .limit(1);\n`;
          code += `          (found as any).${rel.name} = ${rel.name}[0] || null;\n`;
        }
      }
      
      code += `        }\n`;
    }
    
    code += '    }';
    
    return code;
  }

  /**
   * Generate relationship includes for findMany
   */
  private generateRelationshipIncludesForMany(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '// No relationships to include';
    }

    // Generate the include logic for relationships in findMany
    let code = '// Handle relationship includes for multiple results\n';
    code += '    if (filter?.include && filter.include.length > 0 && results.length > 0) {\n';
    
    for (const rel of model.relationships) {
      code += `      if (filter.include.includes('${rel.name}')) {\n`;
      
      if (rel.type === 'manyToOne') {
        // For manyToOne, batch fetch related entities
        const foreignKey = rel.foreignKey || rel.target.toLowerCase() + 'Id';
        code += `        // Load ${rel.name} (manyToOne) for all results\n`;
        code += `        const ${rel.name}Ids = [...new Set(results.map(r => r.${foreignKey}).filter(id => id !== null && id !== undefined))];\n`;
        code += `        if (${rel.name}Ids.length > 0) {\n`;
        code += `          const ${rel.name}Map = new Map();\n`;
        code += `          const ${rel.name}Data = await db\n`;
        code += `            .select()\n`;
        code += `            .from(${rel.target.toLowerCase()}Table)\n`;
        code += `            .where(inArray(${rel.target.toLowerCase()}Table.id, ${rel.name}Ids));\n`;
        code += `          ${rel.name}Data.forEach(item => ${rel.name}Map.set(item.id, item));\n`;
        code += `          results.forEach(result => {\n`;
        code += `            (result as any).${rel.name} = result.${foreignKey} ? ${rel.name}Map.get(result.${foreignKey}) || null : null;\n`;
        code += `          });\n`;
        code += `        } else {\n`;
        code += `          results.forEach(result => {\n`;
        code += `            (result as any).${rel.name} = null;\n`;
        code += `          });\n`;
        code += `        }\n`;
      } else if (rel.type === 'oneToMany') {
        // For oneToMany, batch fetch all related entities
        const foreignKey = rel.foreignKey || model.name.toLowerCase() + 'Id';
        code += `        // Load ${rel.name} (oneToMany) for all results\n`;
        code += `        const resultIds = results.map(r => r.id);\n`;
        code += `        const ${rel.name}Data = await db\n`;
        code += `          .select()\n`;
        code += `          .from(${rel.target.toLowerCase()}Table)\n`;
        code += `          .where(inArray(${rel.target.toLowerCase()}Table.${foreignKey}, resultIds));\n`;
        code += `        const ${rel.name}Map = new Map<string, any[]>();\n`;
        code += `        resultIds.forEach(id => ${rel.name}Map.set(id, []));\n`;
        code += `        ${rel.name}Data.forEach(item => {\n`;
        code += `          if (item.${foreignKey}) {\n`;
        code += `            const list = ${rel.name}Map.get(item.${foreignKey});\n`;
        code += `            if (list) list.push(item);\n`;
        code += `          }\n`;
        code += `        });\n`;
        code += `        results.forEach(result => {\n`;
        code += `          (result as any).${rel.name} = ${rel.name}Map.get(result.id) || [];\n`;
        code += `        });\n`;
      } else if (rel.type === 'manyToMany' && rel.through) {
        // For manyToMany, batch fetch through junction table
        const junctionTable = rel.through.toLowerCase();
        const sourceFK = rel.foreignKey || this.toSnakeCase(model.name) + '_id';
        const targetFK = rel.targetForeignKey || this.toSnakeCase(rel.target) + '_id';
        code += `        // Load ${rel.name} (manyToMany) for all results\n`;
        code += `        const resultIds = results.map(r => r.id);\n`;
        code += `        const ${rel.name}Data = await db\n`;
        code += `          .select({ \n`;
        code += `            ${sourceFK}: ${junctionTable}Table.${sourceFK},\n`;
        code += `            ${rel.target.toLowerCase()}: ${rel.target.toLowerCase()}Table \n`;
        code += `          })\n`;
        code += `          .from(${junctionTable}Table)\n`;
        code += `          .innerJoin(${rel.target.toLowerCase()}Table, eq(${junctionTable}Table.${targetFK}, ${rel.target.toLowerCase()}Table.id))\n`;
        code += `          .where(inArray(${junctionTable}Table.${sourceFK}, resultIds));\n`;
        code += `        const ${rel.name}Map = new Map<string, any[]>();\n`;
        code += `        resultIds.forEach(id => ${rel.name}Map.set(id, []));\n`;
        code += `        ${rel.name}Data.forEach(item => {\n`;
        code += `          if (item.${sourceFK}) {\n`;
        code += `            const list = ${rel.name}Map.get(item.${sourceFK});\n`;
        code += `            if (list) list.push(item.${rel.target.toLowerCase()});\n`;
        code += `          }\n`;
        code += `        });\n`;
        code += `        results.forEach(result => {\n`;
        code += `          (result as any).${rel.name} = ${rel.name}Map.get(result.id) || [];\n`;
        code += `        });\n`;
      } else if (rel.type === 'oneToOne') {
        // For oneToOne, batch fetch related entities
        const hasFK = model.fields.some((f) => f.name === rel.foreignKey);
        if (hasFK) {
          // Foreign key is on this model
          const foreignKey = rel.foreignKey!;
          code += `        // Load ${rel.name} (oneToOne - owned) for all results\n`;
          code += `        const ${rel.name}Ids = [...new Set(results.map(r => r.${foreignKey}).filter(id => id !== null && id !== undefined))];\n`;
          code += `        if (${rel.name}Ids.length > 0) {\n`;
          code += `          const ${rel.name}Map = new Map();\n`;
          code += `          const ${rel.name}Data = await db\n`;
          code += `            .select()\n`;
          code += `            .from(${rel.target.toLowerCase()}Table)\n`;
          code += `            .where(inArray(${rel.target.toLowerCase()}Table.id, ${rel.name}Ids));\n`;
          code += `          ${rel.name}Data.forEach(item => ${rel.name}Map.set(item.id, item));\n`;
          code += `          results.forEach(result => {\n`;
          code += `            (result as any).${rel.name} = result.${foreignKey} ? ${rel.name}Map.get(result.${foreignKey}) || null : null;\n`;
          code += `          });\n`;
          code += `        } else {\n`;
          code += `          results.forEach(result => {\n`;
          code += `            (result as any).${rel.name} = null;\n`;
          code += `          });\n`;
          code += `        }\n`;
        } else {
          // Foreign key is on the target model
          const foreignKey = rel.foreignKey || model.name.toLowerCase() + 'Id';
          code += `        // Load ${rel.name} (oneToOne - inverse) for all results\n`;
          code += `        const resultIds = results.map(r => r.id);\n`;
          code += `        const ${rel.name}Data = await db\n`;
          code += `            .select()\n`;
          code += `            .from(${rel.target.toLowerCase()}Table)\n`;
          code += `            .where(inArray(${rel.target.toLowerCase()}Table.${foreignKey}, resultIds));\n`;
          code += `        const ${rel.name}Map = new Map();\n`;
          code += `        ${rel.name}Data.forEach(item => {\n`;
          code += `          ${rel.name}Map.set(item.${foreignKey}, item);\n`;
          code += `        });\n`;
          code += `        results.forEach(result => {\n`;
          code += `            (result as any).${rel.name} = ${rel.name}Map.get(result.id) || null;\n`;
          code += `        });\n`;
        }
      }
      
      code += `      }\n`;
    }
    
    code += '    }\n';
    
    return code;
  }

  /**
   * Generate soft delete logic
   */
  private generateSoftDelete(
    model: ModelDefinition,
    txVar: string = 'tx',
  ): string {
    return `const [deleted] = await ${txVar}
        .update(${model.name.toLowerCase()}Table)
        .set({ 
          deletedAt: new Date(),
          ${model.timestamps ? 'updatedAt: new Date()' : ''}
        })
        .where(eq(${model.name.toLowerCase()}Table.${model.fields.find((f) => f.primaryKey)?.name || 'id'}, id))
        .returning();`;
  }

  /**
   * Generate hard delete logic
   */
  private generateHardDelete(
    model: ModelDefinition,
    txVar: string = 'tx',
  ): string {
    return `const [deleted] = await ${txVar}
        .delete(${model.name.toLowerCase()}Table)
        .where(eq(${model.name.toLowerCase()}Table.${model.fields.find((f) => f.primaryKey)?.name || 'id'}, id))
        .returning();`;
  }

  /**
   * Generate relationship methods
   */
  private generateRelationshipMethods(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '';
    }

    const methods: string[] = [];

    for (const rel of model.relationships) {
      if (rel.type === 'oneToMany') {
        methods.push(`
  /**
   * Get ${rel.name} for ${model.name}
   */
  async get${this.capitalize(rel.name)}(id: string, tx?: DbTransaction): Promise<unknown[]> {
    // Use provided transaction or get database instance
    const db = tx || withoutTransaction();
    
    return await db
      .select()
      .from(${rel.target.toLowerCase()}Table)
      .where(eq(${rel.target.toLowerCase()}Table.${rel.foreignKey || model.name.toLowerCase() + 'Id'}, id));
  }`);
      } else if (rel.type === 'manyToMany' && rel.through) {
        // Generate manyToMany methods
        const targetName = rel.target;
        const targetNameLower = targetName.toLowerCase();
        const relName = rel.name;
        const RelName = this.capitalize(relName);
        const junctionTable = rel.through.toLowerCase();
        const sourceFK = rel.foreignKey || this.toSnakeCase(model.name) + '_id';
        const targetFK = rel.targetForeignKey || this.toSnakeCase(targetName) + '_id';
        const sourcePK = model.fields.find((f) => f.primaryKey)?.name || 'id';
        
        // Check if junction table has custom fields
        const junctionConfig = this.junctionConfigs.get(rel.through);
        const hasExtraFields = junctionConfig?.fields && junctionConfig.fields.length > 0;
        
        // Generate type for extra fields if they exist
        let extraFieldsType = '';
        let extraFieldsParam = '';
        let extraFieldsOptionalParam = '';
        if (hasExtraFields && junctionConfig?.fields) {
          // Create type for extra fields
          const requiredFields = junctionConfig.fields.filter(f => f.required && !f.defaultValue);
          const optionalFields = junctionConfig.fields.filter(f => !f.required || f.defaultValue);
          
          // Build type definition
          let typeFields: string[] = [];
          for (const field of junctionConfig.fields) {
            const tsType = this.getTypeScriptType(field.type);
            const optional = !field.required || field.defaultValue ? '?' : '';
            typeFields.push(`${field.name}${optional}: ${tsType}`);
          }
          
          if (typeFields.length > 0) {
            extraFieldsType = `{ ${typeFields.join('; ')} }`;
            extraFieldsParam = `, extraFields?: ${extraFieldsType}`;
            extraFieldsOptionalParam = `, extraFields?: ${extraFieldsType}`;
          }
        }

        // Generate junction fields type if they exist
        let junctionFieldsType = '';
        let junctionFieldsExtraction = '';
        if (hasExtraFields && junctionConfig?.fields) {
          const fieldTypes = junctionConfig.fields.map(f => {
            const tsType = this.getTypeScriptType(f.type);
            const optional = !f.required || f.defaultValue ? '?' : '';
            return `${f.name}${optional}: ${tsType}`;
          });
          junctionFieldsType = ` & { ${fieldTypes.join('; ')} }`;
          
          // Generate code to extract only the custom junction fields
          const fieldExtractions = junctionConfig.fields.map(f => 
            `      ${f.name}: r.${junctionTable}.${f.name}`
          ).join(',\n');
          junctionFieldsExtraction = `,\n${fieldExtractions}`;
        }

        methods.push(`
  /**
   * Get ${relName} for ${model.name}${hasExtraFields ? ' with junction data' : ''}
   */
  async get${RelName}(id: string, tx?: DbTransaction): Promise<Array<${targetName}${junctionFieldsType}>> {
    const db = tx || withoutTransaction();
    
    const result = await db
      .select()
      .from(${junctionTable}Table)
      .innerJoin(${targetNameLower}Table, eq(${junctionTable}Table.${targetFK}, ${targetNameLower}Table.id))
      .where(eq(${junctionTable}Table.${sourceFK}, id));
    
    return result.map(r => ({
      ...r.${targetNameLower}${junctionFieldsExtraction}
    }));
  }

  /**
   * Add ${this.singularize(relName)} to ${model.name}
   */
  async add${this.singularize(RelName)}(id: string, ${
          this.singularize(targetNameLower)
        }Id: string, tx: DbTransaction${extraFieldsOptionalParam ? `, extraFields?: ${extraFieldsType}` : ''}): Promise<void> {
    await tx.insert(${junctionTable}Table).values({
      ${sourceFK}: id,
      ${targetFK}: ${this.singularize(targetNameLower)}Id${
      hasExtraFields ? `,
      ...extraFields` : ''}
    });
  }

  /**
   * Add multiple ${relName} to ${model.name}
   */
  async add${RelName}(id: string, ${targetNameLower}Data: ${hasExtraFields 
    ? `Array<{ id: string${extraFieldsOptionalParam ? `; extraFields?: ${extraFieldsType}` : ''} }>`
    : 'string[]'}, tx: DbTransaction): Promise<void> {
    if (${hasExtraFields ? `${targetNameLower}Data` : `${targetNameLower}Data`}.length === 0) return;
    
    const values = ${hasExtraFields 
      ? `${targetNameLower}Data.map(item => ({
      ${sourceFK}: id,
      ${targetFK}: item.id,
      ...item.extraFields
    }))`
      : `${targetNameLower}Data.map(${this.singularize(targetNameLower)}Id => ({
      ${sourceFK}: id,
      ${targetFK}: ${this.singularize(targetNameLower)}Id
    }))`};
    
    await tx.insert(${junctionTable}Table).values(values);
  }${
  hasExtraFields ? `

  /**
   * Update junction data for ${this.singularize(relName)} in ${model.name}
   */
  async update${this.singularize(RelName)}JunctionData(id: string, ${
          this.singularize(targetNameLower)
        }Id: string, extraFields: Partial<${extraFieldsType}>, tx: DbTransaction): Promise<void> {
    await tx.update(${junctionTable}Table)
      .set(extraFields)
      .where(
        and(
          eq(${junctionTable}Table.${sourceFK}, id),
          eq(${junctionTable}Table.${targetFK}, ${this.singularize(targetNameLower)}Id)
        )
      );
  }` : ''}

  /**
   * Remove ${this.singularize(relName)} from ${model.name}
   */
  async remove${this.singularize(RelName)}(id: string, ${
          this.singularize(targetNameLower)
        }Id: string, tx: DbTransaction): Promise<void> {
    await tx.delete(${junctionTable}Table)
      .where(
        and(
          eq(${junctionTable}Table.${sourceFK}, id),
          eq(${junctionTable}Table.${targetFK}, ${this.singularize(targetNameLower)}Id)
        )
      );
  }

  /**
   * Remove multiple ${relName} from ${model.name}
   */
  async remove${RelName}(id: string, ${targetNameLower}Ids: string[], tx: DbTransaction): Promise<void> {
    if (${targetNameLower}Ids.length === 0) return;
    
    await tx.delete(${junctionTable}Table)
      .where(
        and(
          eq(${junctionTable}Table.${sourceFK}, id),
          inArray(${junctionTable}Table.${targetFK}, ${targetNameLower}Ids)
        )
      );
  }

  /**
   * Set ${relName} for ${model.name} (replace all)
   */
  async set${RelName}(id: string, ${targetNameLower}Data: ${hasExtraFields 
    ? `Array<{ id: string${extraFieldsOptionalParam ? `; extraFields?: ${extraFieldsType}` : ''} }>`
    : 'string[]'}, tx: DbTransaction): Promise<void> {
    // Delete all existing relationships
    await tx.delete(${junctionTable}Table)
      .where(eq(${junctionTable}Table.${sourceFK}, id));
    
    // Add new relationships
    if (${targetNameLower}Data.length > 0) {
      await this.add${RelName}(id, ${targetNameLower}Data, tx);
    }
  }

  /**
   * Check if ${model.name} has a specific ${this.singularize(relName)}
   */
  async has${this.singularize(RelName)}(id: string, ${
          this.singularize(targetNameLower)
        }Id: string, tx?: DbTransaction): Promise<boolean> {
    const db = tx || withoutTransaction();
    
    const result = await db
      .select({ count: sql<number>\`count(*)\` })
      .from(${junctionTable}Table)
      .where(
        and(
          eq(${junctionTable}Table.${sourceFK}, id),
          eq(${junctionTable}Table.${targetFK}, ${this.singularize(targetNameLower)}Id)
        )
      );
    
    return result[0].count > 0;
  }`);
      }
    }

    return methods.join('\n');
  }

  /**
   * Generate domain index file
   */
  private generateDomainIndex(): string {
    let code = '// Export all domain APIs\n';

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

  /**
   * Convert to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
      .replace(/^_/, '');
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
   * Get TypeScript type for a field type
   */
  private getTypeScriptType(fieldType: string): string {
    const typeMap: Record<string, string> = {
      'text': 'string',
      'string': 'string',
      'integer': 'number',
      'bigint': 'number',
      'decimal': 'number',
      'boolean': 'boolean',
      'date': 'Date',
      'uuid': 'string',
      'json': 'any',
      'jsonb': 'any',
      'enum': 'string',
      // PostGIS types
      'point': 'any',
      'linestring': 'any',
      'polygon': 'any',
      'multipoint': 'any',
      'multilinestring': 'any',
      'multipolygon': 'any',
      'geometry': 'any',
      'geography': 'any',
    };
    return typeMap[fieldType] || 'any';
  }
}
