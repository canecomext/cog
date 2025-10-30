import { ModelDefinition } from '../types/model.types.ts';

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
    return `import { SQL } from 'drizzle-orm';
import { type DbTransaction } from '../db/database.ts';

/**
 * Domain hook context that receives all variables from the Hono context.
 * The generic DomainEnvVars type will contain all custom variables defined
 * in your application's Env type.
 *
 * Example:
 * If your Env type has Variables: { requestId?: string; userId?: string; tenantId?: string }
 * Then in hooks you can access: context.requestId, context.userId, context.tenantId
 */
export type DomainHookContext<DomainEnvVars extends Record<string, any> = Record<string, any>> = DomainEnvVars;

export interface DomainPreHookResult<T, DomainEnvVars extends Record<string, any> = Record<string, any>> {
  data: T;
  context?: DomainHookContext<DomainEnvVars>;
}

export interface DomainPostHookResult<T, DomainEnvVars extends Record<string, any> = Record<string, any>> {
  data: T;
  context?: DomainHookContext<DomainEnvVars>;
}

export interface FilterOptions {
  where?: SQL;
  include?: string[];
}

/**
 * Domain layer hooks with input validation.
 *
 * These hooks run at the domain layer within database transactions.
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
 * The generic DomainEnvVars type allows you to specify your Env Variables type for type-safe
 * access to context variables in hooks.
 */
export interface DomainHooks<T, CreateInput, UpdateInput, DomainEnvVars extends Record<string, any> = Record<string, any>> {
  // Pre-operation hooks (within transaction)
  // Note: Input is already validated before this hook is called
  // Note: Output will be validated before the main operation
  // Note: context contains all variables from your Env type
  preCreate?: (input: CreateInput, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPreHookResult<CreateInput, DomainEnvVars>>;
  preUpdate?: (id: string, input: UpdateInput, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPreHookResult<UpdateInput, DomainEnvVars>>;
  preDelete?: (id: string, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPreHookResult<{ id: string }, DomainEnvVars>>;
  preFindById?: (id: string, tx?: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPreHookResult<{ id: string }, DomainEnvVars>>;
  preFindMany?: (tx?: DbTransaction, filter?: FilterOptions, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPreHookResult<FilterOptions, DomainEnvVars>>;

  // Post-operation hooks (within transaction)
  postCreate?: (input: CreateInput, result: T, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPostHookResult<T, DomainEnvVars>>;
  postUpdate?: (id: string, input: UpdateInput, result: T, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPostHookResult<T, DomainEnvVars>>;
  postDelete?: (id: string, result: T, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPostHookResult<T, DomainEnvVars>>;
  postFindById?: (id: string, result: T | null, tx?: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPostHookResult<T | null, DomainEnvVars>>;
  postFindMany?: (filter: FilterOptions | undefined, results: T[], tx?: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<DomainPostHookResult<T[], DomainEnvVars>>;

  // After-operation hooks (outside transaction, async)
  afterCreate?: (result: T, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
  afterUpdate?: (result: T, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
  afterDelete?: (result: T, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
  afterFindById?: (result: T | null, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
  afterFindMany?: (results: T[], context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
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
    drizzleImports += " } from 'drizzle-orm';";

    return `${drizzleImports}
import { HTTPException } from '@hono/hono/http-exception';
import { withoutTransaction, withTransaction, type DbTransaction } from '../db/database.ts';
import { ${modelNameLower}Table, type ${modelName}, type New${modelName}, ${this.hasEmbeddableRelations(model) ? `type New${modelName}WithRelations, ` : ''}${modelNameLower}InsertSchema, ${modelNameLower}UpdateSchema } from '../schema/${modelNameLower}.schema.ts';
${this.generateRelationImports(model)}
import { DomainHooks, DomainHookContext, PaginationOptions, FilterOptions } from './hooks.types.ts';

export class ${modelName}Domain<DomainEnvVars extends Record<string, any> = Record<string, any>> {
  private hooks: DomainHooks<${modelName}, New${modelName}, Partial<New${modelName}>, DomainEnvVars>;

  constructor(hooks?: DomainHooks<${modelName}, New${modelName}, Partial<New${modelName}>, DomainEnvVars>) {
    this.hooks = hooks || {};
  }

  /**
   * Create a new ${modelName}
   */
  async create(input: New${modelName}, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<${modelName}> {
    // Validate input before pre-hook
    const validatedInput = ${modelNameLower}InsertSchema.parse(input);

    // Pre-create hook (within transaction)
    let processedInput = validatedInput;
    if (this.hooks.preCreate) {
      const preResult = await this.hooks.preCreate(validatedInput, tx, context);
      // Validate pre-hook output to ensure it didn't emit malformed data
      processedInput = ${modelNameLower}InsertSchema.parse(preResult.data);
      context = { ...context, ...preResult.context } as DomainHookContext<DomainEnvVars>;
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
      context = { ...context, ...postResult.context } as DomainHookContext<DomainEnvVars>;
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
  async findById(id: string, tx?: DbTransaction, options?: FilterOptions, context?: DomainHookContext<DomainEnvVars>): Promise<${modelName} | null> {
    // Use provided transaction or get database instance
    const db = tx || withoutTransaction();

    // Pre-find hook
    if (this.hooks.preFindById) {
      const preResult = await this.hooks.preFindById(id, tx, context);
      id = preResult.data.id;
      context = { ...context, ...preResult.context } as DomainHookContext<DomainEnvVars>;
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
      context = { ...context, ...postResult.context } as DomainHookContext<DomainEnvVars>;
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
    context?: DomainHookContext<DomainEnvVars>,
  ): Promise<{ data: ${modelName}[]; total: number }> {
    // Use provided transaction or get database instance
    const db = tx || withoutTransaction();

    // Pre-find hook
    if (this.hooks.preFindMany) {
      const preResult = await this.hooks.preFindMany(tx, filter, context);
      filter = preResult.data as FilterOptions;
      context = { ...context, ...preResult.context } as DomainHookContext<DomainEnvVars>;
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
          context = { ...context, ...postResult.context } as DomainHookContext<DomainEnvVars>;
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
  async update(id: string, input: Partial<New${modelName}>, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<${modelName}> {
    // Validate input before pre-hook (partial update)
    const validatedInput = ${modelNameLower}UpdateSchema.parse(input);

    // Pre-update hook
    let processedInput = validatedInput;
    if (this.hooks.preUpdate) {
      const preResult = await this.hooks.preUpdate(id, validatedInput, tx, context);
      // Validate pre-hook output to ensure it didn't emit malformed data
      processedInput = ${modelNameLower}UpdateSchema.parse(preResult.data);
      context = { ...context, ...preResult.context } as DomainHookContext<DomainEnvVars>;
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
      context = { ...context, ...postResult.context } as DomainHookContext<DomainEnvVars>;
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
  async delete(id: string, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<${modelName}> {
    // Pre-delete hook
    if (this.hooks.preDelete) {
      const preResult = await this.hooks.preDelete(id, tx, context);
      id = preResult.data.id;
      context = { ...context, ...preResult.context } as DomainHookContext<DomainEnvVars>;
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
      context = { ...context, ...postResult.context } as DomainHookContext<DomainEnvVars>;
    }

    // After-delete hook (outside transaction, after post-hook)
    if (this.hooks.afterDelete) {
      setTimeout(() => {
        this.hooks.afterDelete!(result, context).catch(console.error);
      }, 0);
    }

    return result;
  }

  ${this.generateCreateWithRelationsMethod(model)}

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
    const domainImports = new Set<string>();

    for (const rel of model.relationships) {
      if (rel.target !== model.name && !addedImports.has(rel.target)) {
        // For oneToOne and oneToMany, we need New* types for nested creates
        const needsNewType = rel.type === 'oneToOne' || rel.type === 'oneToMany';
        const typeImports = needsNewType
          ? `type ${rel.target}, type New${rel.target}`
          : `type ${rel.target}`;

        imports.push(
          `import { ${rel.target.toLowerCase()}Table, ${typeImports} } from '../schema/${rel.target.toLowerCase()}.schema.ts';`,
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

      // Add domain imports for createWithRelations (only for oneToOne and oneToMany, excluding self-references)
      if ((rel.type === 'oneToOne' || rel.type === 'oneToMany') &&
          rel.target !== model.name &&
          !domainImports.has(rel.target)) {
        imports.push(
          `import { ${rel.target.toLowerCase()}Domain } from './${rel.target.toLowerCase()}.domain.ts';`,
        );
        domainImports.add(rel.target);
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

        // Import junction table at the top of the file (this will be handled separately)

        methods.push(`
  /**
   * Get ${relName} for ${model.name}
   */
  async get${RelName}(id: string, tx?: DbTransaction): Promise<${targetName}[]> {
    const db = tx || withoutTransaction();
    
    const result = await db
      .select({ ${targetNameLower}: ${targetNameLower}Table })
      .from(${junctionTable}Table)
      .innerJoin(${targetNameLower}Table, eq(${junctionTable}Table.${targetFK}, ${targetNameLower}Table.id))
      .where(eq(${junctionTable}Table.${sourceFK}, id));
    
    return result.map(r => r.${targetNameLower});
  }

  /**
   * Add ${relName} to ${model.name}
   */
  async add${this.singularize(RelName)}(id: string, ${
          this.singularize(targetNameLower)
        }Id: string, tx: DbTransaction): Promise<void> {
    await tx.insert(${junctionTable}Table).values({
      ${sourceFK}: id,
      ${targetFK}: ${this.singularize(targetNameLower)}Id
    });
  }

  /**
   * Add multiple ${relName} to ${model.name}
   */
  async add${RelName}(id: string, ${targetNameLower}Ids: string[], tx: DbTransaction): Promise<void> {
    if (${targetNameLower}Ids.length === 0) return;
    
    const values = ${targetNameLower}Ids.map(${this.singularize(targetNameLower)}Id => ({
      ${sourceFK}: id,
      ${targetFK}: ${this.singularize(targetNameLower)}Id
    }));
    
    await tx.insert(${junctionTable}Table).values(values);
  }

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
  async set${RelName}(id: string, ${targetNameLower}Ids: string[], tx: DbTransaction): Promise<void> {
    // Delete all existing relationships
    await tx.delete(${junctionTable}Table)
      .where(eq(${junctionTable}Table.${sourceFK}, id));
    
    // Add new relationships
    if (${targetNameLower}Ids.length > 0) {
      await this.add${RelName}(id, ${targetNameLower}Ids, tx);
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
   * Generate createWithRelations method for nested creates
   * Only supports oneToOne and oneToMany (excludes manyToMany)
   */
  private generateCreateWithRelationsMethod(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '';
    }

    // Only include oneToOne and oneToMany (exclude manyToMany)
    const embeddableRelations = model.relationships.filter(rel =>
      rel.type === 'oneToOne' || rel.type === 'oneToMany'
    );

    if (embeddableRelations.length === 0) {
      return '';
    }

    const modelName = model.name;
    const modelNameLower = model.name.toLowerCase();
    const primaryKeyField = model.fields.find((f) => f.primaryKey)?.name || 'id';

    let code = '\n  /**\n';
    code += `   * Create ${modelName} with nested relations\n`;
    code += `   * Supports: ${embeddableRelations.map(r => r.name).join(', ')}\n`;
    code += `   * Note: Excludes manyToMany - use explicit add methods (e.g., addRoles()) after creation\n`;
    code += '   */\n';
    code += `  async createWithRelations(\n`;
    code += `    data: New${modelName}WithRelations,\n`;
    code += `    tx?: DbTransaction,\n`;
    code += `    context?: DomainHookContext<DomainEnvVars>\n`;
    code += `  ): Promise<${modelName}> {\n`;
    code += `    // If no transaction provided, create one and recursively call self\n`;
    code += `    if (!tx) {\n`;
    code += `      return await withTransaction(async (transaction) => {\n`;
    code += `        return this.createWithRelations(data, transaction, context);\n`;
    code += `      });\n`;
    code += `    }\n\n`;
    code += `    // Separate relation data from base data\n`;
    code += `    const { ${this.getRelationFieldNames(embeddableRelations).join(', ')}, ...baseData } = data;\n\n`;
    code += `    // 1. Create parent record using own domain create method\n`;
    code += `    const parent = await this.create(baseData as New${modelName}, tx, context);\n\n`;

    // Generate domain delegation calls for each relationship
    for (const rel of embeddableRelations) {
      const targetName = rel.target;
      const targetNameLower = targetName.toLowerCase();
      const isSelfReference = targetName === model.name;
      const targetDomain = isSelfReference ? 'this' : `${targetNameLower}Domain`;
      const relName = rel.name;
      const foreignKey = rel.foreignKey || model.name.toLowerCase() + 'Id';

      // Check if target model has nested relations (to determine which method to call)
      const targetModel = this.models.find(m => m.name === targetName);
      const hasNestedRelations = targetModel?.relationships?.some(r =>
        r.type === 'oneToOne' || r.type === 'oneToMany'
      );
      const createMethod = hasNestedRelations ? 'createWithRelations' : 'create';

      switch (rel.type) {
        case 'oneToOne':
          code += `    // Create ${relName} (oneToOne) via ${targetName} domain API\n`;
          code += `    if (${relName}) {\n`;
          code += `      await ${targetDomain}.${createMethod}(\n`;
          code += `        { ...${relName}, ${foreignKey}: parent.${primaryKeyField} } as any,\n`;
          code += `        tx,\n`;
          code += `        context\n`;
          code += `      );\n`;
          code += `    }\n\n`;
          break;

        case 'oneToMany':
          code += `    // Create ${relName} (oneToMany) via ${targetName} domain API\n`;
          code += `    if (${relName} && ${relName}.length > 0) {\n`;
          code += `      for (const item of ${relName}) {\n`;
          code += `        await ${targetDomain}.${createMethod}(\n`;
          code += `          { ...item, ${foreignKey}: parent.${primaryKeyField} } as any,\n`;
          code += `          tx,\n`;
          code += `          context\n`;
          code += `        );\n`;
          code += `      }\n`;
          code += `    }\n\n`;
          break;
      }
    }

    code += `    // Return with relations loaded\n`;
    code += `    return await this.findById(\n`;
    code += `      parent.${primaryKeyField},\n`;
    code += `      tx,\n`;
    code += `      { include: [${embeddableRelations.map(r => `'${r.name}'`).join(', ')}] },\n`;
    code += `      context\n`;
    code += `    ) as ${modelName};\n`;
    code += `  }\n`;

    return code;
  }

  /**
   * Get relation field names for destructuring
   */
  private getRelationFieldNames(relations: any[]): string[] {
    return relations.map(rel => rel.name);
  }

  /**
   * Check if model has embeddable relations (oneToOne or oneToMany)
   */
  private hasEmbeddableRelations(model: ModelDefinition): boolean {
    return !!model.relationships?.some(rel =>
      rel.type === 'oneToOne' || rel.type === 'oneToMany'
    );
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
}
