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

export interface HookContext {
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
  preCreate?: (input: CreateInput, tx: DbTransaction, context?: HookContext) => Promise<PreHookResult<CreateInput>>;
  preUpdate?: (id: string, input: UpdateInput, tx: DbTransaction, context?: HookContext) => Promise<PreHookResult<UpdateInput>>;
  preDelete?: (id: string, tx: DbTransaction, context?: HookContext) => Promise<PreHookResult<{ id: string }>>;
  preFindById?: (id: string, tx?: DbTransaction, context?: HookContext) => Promise<PreHookResult<{ id: string }>>;
  preFindMany?: (tx?: DbTransaction, filter?: FilterOptions, context?: HookContext) => Promise<PreHookResult<FilterOptions>>;

  // Post-operation hooks (within transaction)
  postCreate?: (input: CreateInput, result: T, tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T>>;
  postUpdate?: (id: string, input: UpdateInput, result: T, tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T>>;
  postDelete?: (id: string, result: T, tx: DbTransaction, context?: HookContext) => Promise<PostHookResult<T>>;
  postFindById?: (id: string, result: T | null, tx?: DbTransaction, context?: HookContext) => Promise<PostHookResult<T | null>>;
  postFindMany?: (filter: FilterOptions | undefined, results: T[], tx?: DbTransaction, context?: HookContext) => Promise<PostHookResult<T[]>>;

  // After-operation hooks (outside transaction, async)
  afterCreate?: (result: T, context?: HookContext) => Promise<void>;
  afterUpdate?: (result: T, context?: HookContext) => Promise<void>;
  afterDelete?: (result: T, context?: HookContext) => Promise<void>;
  afterFindById?: (result: T | null, context?: HookContext) => Promise<void>;
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
      'id';

    // Check if we need additional imports for manyToMany relationships
    const hasManyToMany = model.relationships?.some((rel) => rel.type === 'manyToMany');
    const drizzleImports = hasManyToMany
      ? "import { eq, desc, asc, sql, and, inArray } from 'drizzle-orm';"
      : "import { eq, desc, asc, sql } from 'drizzle-orm';";

    return `${drizzleImports}
import { withoutTransaction, type DbTransaction } from '../db/database.ts';
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
  async create(input: New${modelName}, tx: DbTransaction, context?: HookContext): Promise<${modelName}> {
    // Pre-create hook (within transaction)
    let processedInput = input;
    if (this.hooks.preCreate) {
      const preResult = await this.hooks.preCreate(input, tx, context);
      processedInput = preResult.data;
      context = { ...context, ...preResult.context };
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
      context = { ...context, ...postResult.context };
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
  async findById(id: string, tx?: DbTransaction, options?: FilterOptions, context?: HookContext): Promise<${modelName} | null> {
    // Use provided transaction or get database instance
    const db = tx || withoutTransaction();

    // Pre-find hook
    if (this.hooks.preFindById) {
      const preResult = await this.hooks.preFindById(id, tx, context);
      id = preResult.data.id;
      context = { ...context, ...preResult.context };
    }

    // Build query
    const query = db
      .select()
      .from(${modelNameLower}Table)
      .where(eq(${modelNameLower}Table.${primaryKeyField}, id));

    // Add relationships if requested
    ${this.generateRelationshipIncludes(model)}

    const result = await query;
    const found = result[0] || null;

    // Post-find hook
    let finalResult: ${modelName} | null = found;
    if (this.hooks.postFindById && found !== null) {
      const postResult = await this.hooks.postFindById(id, found, tx, context);
      if (postResult.data !== null) {
        finalResult = postResult.data;
      }
      context = { ...context, ...postResult.context };
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
    context?: HookContext,
  ): Promise<{ data: ${modelName}[]; total: number }> {
    // Use provided transaction or get database instance
    const db = tx || withoutTransaction();

    // Pre-find hook
    if (this.hooks.preFindMany) {
      const preResult = await this.hooks.preFindMany(tx, filter, context);
      filter = preResult.data as FilterOptions;
      context = { ...context, ...preResult.context };
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
          context = { ...context, ...postResult.context };
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
  async update(id: string, input: Partial<New${modelName}>, tx: DbTransaction, context?: HookContext): Promise<${modelName}> {
    // Pre-update hook
    let processedInput = input;
    if (this.hooks.preUpdate) {
      const preResult = await this.hooks.preUpdate(id, input, tx, context);
      processedInput = preResult.data;
      context = { ...context, ...preResult.context };
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
      throw new Error(\`${modelName} with id \${id} not found\`);
    }

    // Post-update hook
    let result = updated;
    if (this.hooks.postUpdate) {
      const postResult = await this.hooks.postUpdate(id, processedInput, updated, tx, context);
      result = postResult.data;
      context = { ...context, ...postResult.context };
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
  async delete(id: string, tx: DbTransaction, context?: HookContext): Promise<${modelName}> {
    // Pre-delete hook
    if (this.hooks.preDelete) {
      const preResult = await this.hooks.preDelete(id, tx, context);
      id = preResult.data.id;
      context = { ...context, ...preResult.context };
    }

    // Perform delete
    ${model.softDelete ? this.generateSoftDelete(model, 'tx') : this.generateHardDelete(model, 'tx')}

    if (!deleted) {
      throw new Error(\`${modelName} with id \${id} not found\`);
    }

    // Post-delete hook
    let result = deleted;
    if (this.hooks.postDelete) {
      const postResult = await this.hooks.postDelete(id, deleted, tx, context);
      result = postResult.data;
      context = { ...context, ...postResult.context };
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

// Export singleton instance
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

    return `
      if (options?.include) {
        // Handle relationship includes
        ${
      model.relationships.map((rel) => `
        if (options.include.includes('${rel.name}')) {
          // Include ${rel.name} relationship
          // This would require proper join logic based on relationship type
        }`).join('\n')
    }
      }`;
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
