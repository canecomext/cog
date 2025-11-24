import { FieldDefinition, ModelDefinition } from '../types/model.types.ts';

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
export type DomainHookContext<DomainEnvVars extends Record<string, unknown> = Record<string, unknown>> = DomainEnvVars;

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
 *
 * Hooks return the data directly (not wrapped in an object).
 * Context is passed as a parameter for read access.
 */
export interface DomainHooks<T, CreateInput, UpdateInput, DomainEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  // Pre-operation hooks (within transaction)
  // Note: Input is already validated before this hook is called
  // Note: Output will be validated before the main operation
  // Note: context contains all variables from your Env type
  // Note: rawInput contains the original unvalidated request body (use with caution)
  preCreate?: (input: CreateInput, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<CreateInput>;
  preUpdate?: (id: string, input: UpdateInput, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<UpdateInput>;
  preDelete?: (id: string, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<{ id: string }>;
  preFindById?: (id: string, tx?: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<{ id: string }>;
  preFindMany?: (tx?: DbTransaction, filter?: FilterOptions, context?: DomainHookContext<DomainEnvVars>) => Promise<FilterOptions>;

  // Post-operation hooks (within transaction)
  postCreate?: (input: CreateInput, result: T, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<T>;
  postUpdate?: (id: string, input: UpdateInput, result: T, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<T>;
  postDelete?: (id: string, result: T, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<T>;
  postFindById?: (id: string, result: T | null, tx?: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<T | null>;
  postFindMany?: (filter: FilterOptions | undefined, results: T[], tx?: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<T[]>;

  // After-operation hooks (outside transaction, async)
  afterCreate?: (result: T, rawInput: unknown, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
  afterUpdate?: (result: T, rawInput: unknown, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
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

/**
 * Junction table hooks for many-to-many relationship operations.
 * These hooks run at the domain layer within database transactions.
 * For batch operations (addMultiple, removeMultiple), the singular hooks are called for each item.
 *
 * The hook functions receive an object with field names matching the junction table's foreign keys.
 * For example, for a user_roles table with user_id and role_id fields:
 * preAddJunction({ user_id: '123', role_id: '456' }, tx, context)
 *
 * The generic DomainEnvVars type allows you to specify your Env Variables type for type-safe
 * access to context variables in hooks.
 *
 * Hooks return the data directly (not wrapped in an object).
 * Context is passed as a parameter for read access.
 */
export interface JunctionTableHooks<DomainEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  // Pre-operation hooks (within transaction)
  // Note: rawInput contains the original unvalidated request body (e.g., { ids: [...], metadata: {...} })
  preAddJunction?: (ids: Record<string, string>, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<{ ids: Record<string, string> }>;
  preRemoveJunction?: (ids: Record<string, string>, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<{ ids: Record<string, string> }>;

  // Post-operation hooks (within transaction)
  postAddJunction?: (ids: Record<string, string>, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
  postRemoveJunction?: (ids: Record<string, string>, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;

  // After-operation hooks (outside transaction, async)
  afterAddJunction?: (ids: Record<string, string>, rawInput: unknown, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
  afterRemoveJunction?: (ids: Record<string, string>, rawInput: unknown, context?: DomainHookContext<DomainEnvVars>) => Promise<void>;
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
    // We need AnyColumn for orderBy type casting
    let drizzleImports = 'import { eq, desc, asc, sql, type AnyColumn';
    if (hasManyToMany) {
      drizzleImports += ', and, inArray';
    } else if (hasRelationships) {
      drizzleImports += ', inArray';
    }
    drizzleImports += " } from 'drizzle-orm';";

    return `${drizzleImports}
import { NotFoundException } from './exceptions.ts';
import { withoutTransaction, type DbTransaction } from '../db/database.ts';
import { ${modelNameLower}Table, type ${modelName}, type New${modelName}, ${modelNameLower}InsertSchema, ${modelNameLower}UpdateSchema } from '../schema/${modelNameLower}.schema.ts';
${this.generateRelationImports(model)}
${this.generateJunctionTableImports(model)}
import { DomainHooks, JunctionTableHooks, DomainHookContext, PaginationOptions, FilterOptions } from './hooks.types.ts';

export class ${modelName}Domain<DomainEnvVars extends Record<string, unknown> = Record<string, unknown>> {
  private hooks: DomainHooks<${modelName}, New${modelName}, Partial<New${modelName}>, DomainEnvVars>;
  ${this.generateJunctionHooksFields(model)}

  constructor(
    hooks?: DomainHooks<${modelName}, New${modelName}, Partial<New${modelName}>, DomainEnvVars>,
    ${this.generateJunctionHooksParams(model)}
  ) {
    this.hooks = hooks || {};
    ${this.generateJunctionHooksAssignments(model)}
  }

  /**
   * Create a new ${modelName}
   */
  async create(input: New${modelName}, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<${modelName}> {
    // Validate input before pre-hook
    const validatedInput = ${modelNameLower}InsertSchema.parse(input) as New${modelName};

    // Pre-create hook (within transaction)
    let processedInput = validatedInput;
    if (this.hooks.preCreate) {
      processedInput = await this.hooks.preCreate(validatedInput, input, tx, context);
      // Validate pre-hook output to ensure it didn't emit malformed data
      processedInput = ${modelNameLower}InsertSchema.parse(processedInput) as New${modelName};
    }

    // Strip protected timestamp fields (createdAt, updatedAt) - database defaults will apply
    // Allow custom id field if provided (useful for migrations, testing, data imports)
    const { createdAt: _, updatedAt: __, ...safeInput } = processedInput as unknown as Record<string, unknown>;

    // Perform create operation
    const [created] = await tx
      .insert(${modelNameLower}Table)
      .values(safeInput as New${modelName})
      .returning();

    // Post-create hook (within transaction)
    let result = created;
    if (this.hooks.postCreate) {
      result = await this.hooks.postCreate(processedInput, created, input, tx, context);
    }

    // After-create hook (outside transaction, after post-hook)
    if (this.hooks.afterCreate) {
      // Schedule asynchronously to not block the response
      setTimeout(() => {
        this.hooks.afterCreate!(result, input, context).catch(console.error);
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
      id = preResult.id;
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
      finalResult = await this.hooks.postFindById(id, found, tx, context);
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
      filter = await this.hooks.preFindMany(tx, filter, context);
    }

    // Build query with chaining to avoid type issues
    let baseQuery = db.select().from(${modelNameLower}Table);

    // Apply filters
    if (filter?.where) {
      baseQuery = baseQuery.where(filter.where) as unknown as typeof baseQuery;
    }

    // Apply pagination
    if (pagination) {
      if (pagination.orderBy) {
        const orderFn = pagination.orderDirection === 'desc' ? desc : asc;
        // Type-safe column access
        const column = ${modelNameLower}Table[pagination.orderBy as keyof typeof ${modelNameLower}Table] as AnyColumn;
        if (column) {
          baseQuery = baseQuery.orderBy(orderFn(column)) as unknown as typeof baseQuery;
        }
      }
      if (pagination.limit) {
        baseQuery = baseQuery.limit(pagination.limit) as unknown as typeof baseQuery;
      }
      if (pagination.offset) {
        baseQuery = baseQuery.offset(pagination.offset) as unknown as typeof baseQuery;
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
      ? await this.hooks.postFindMany(filter, results, tx, context)
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
    const validatedInput = ${modelNameLower}UpdateSchema.parse(input) as Partial<New${modelName}>;

    // Pre-update hook
    let processedInput = validatedInput;
    if (this.hooks.preUpdate) {
      processedInput = await this.hooks.preUpdate(id, validatedInput, input, tx, context);
      // Validate pre-hook output to ensure it didn't emit malformed data
      processedInput = ${modelNameLower}UpdateSchema.parse(processedInput) as Partial<New${modelName}>;
    }

    // Strip protected fields (id, createdAt, updatedAt) to prevent modification
    // These fields are managed by the domain layer and cannot be overridden
    const { id: _, createdAt: __, updatedAt: ___, ...safeInput } = processedInput as unknown as Record<string, unknown>;

    // Perform update
    const [updated] = await tx
      .update(${modelNameLower}Table)
      .set({
        ...safeInput,
        ${model.timestamps ? 'updatedAt: Date.now(),' : ''}
      })
      .where(eq(${modelNameLower}Table.${primaryKeyField}, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(\`${modelName} with id \${id} not found\`);
    }

    // Post-update hook
    let result = updated;
    if (this.hooks.postUpdate) {
      result = await this.hooks.postUpdate(id, processedInput, updated, input, tx, context);
    }

    // After-update hook (outside transaction, after post-hook)
    if (this.hooks.afterUpdate) {
      setTimeout(() => {
        this.hooks.afterUpdate!(result, input, context).catch(console.error);
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
      id = preResult.id;
    }

    // Perform delete
    ${this.generateHardDelete(model, 'tx')}

    if (!deleted) {
      throw new NotFoundException(\`${modelName} with id \${id} not found\`);
    }

    // Post-delete hook
    let result = deleted;
    if (this.hooks.postDelete) {
      result = await this.hooks.postDelete(id, deleted, tx, context);
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

// Export singleton instance (uses default Record<string, unknown> for EnvVars)
export const ${modelNameLower}Domain = new ${modelName}Domain();
`;
  }

  /**
   * Generate junction table imports for many-to-many relationships
   */
  private generateJunctionTableImports(model: ModelDefinition): string {
    if (!model.relationships || model.relationships.length === 0) {
      return '';
    }

    const imports: string[] = [];
    const addedImports = new Set<string>();

    for (const rel of model.relationships) {
      // Add junction table insert type imports for manyToMany relationships
      if (rel.type === 'manyToMany' && rel.through && !addedImports.has(rel.through)) {
        const junctionTableName = rel.through.toLowerCase();
        // Type name matches schema export: User_spaces (capitalize first part only)
        const parts = rel.through.split('_');
        const junctionTypeName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + '_' + parts.slice(1).join('_');
        imports.push(
          `import { type New${junctionTypeName} } from '../schema/${junctionTableName}.schema.ts';`,
        );
        addedImports.add(rel.through);
      }
    }

    return imports.length > 0 ? imports.join('\n') : '';
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
        code += `            (found as unknown as Record<string, unknown>).${rel.name} = ${rel.name}[0] || null;\n`;
        code += `          } else {\n`;
        code += `            (found as unknown as Record<string, unknown>).${rel.name} = null;\n`;
        code += `          }\n`;
      } else if (rel.type === 'oneToMany') {
        // For oneToMany, fetch the array of related entities
        const foreignKey = rel.foreignKey || model.name.toLowerCase() + 'Id';
        code += `          // Load ${rel.name} (oneToMany)\n`;
        code += `          const ${rel.name} = await db\n`;
        code += `            .select()\n`;
        code += `            .from(${rel.target.toLowerCase()}Table)\n`;
        code += `            .where(eq(${rel.target.toLowerCase()}Table.${foreignKey}, id));\n`;
        code += `          (found as unknown as Record<string, unknown>).${rel.name} = ${rel.name};\n`;
      } else if (rel.type === 'manyToMany' && rel.through) {
        // For manyToMany, fetch through junction table
        const junctionTable = rel.through.toLowerCase();
        const sourceFK = rel.foreignKey || this.toSnakeCase(model.name) + '_id';
        const targetFK = rel.targetForeignKey || this.toSnakeCase(rel.target) + '_id';
        code += `          // Load ${rel.name} (manyToMany)\n`;
        code += `          const ${rel.name}Result = await db\n`;
        code += `            .select()\n`;
        code += `            .from(${junctionTable}Table)\n`;
        code +=
          `            .innerJoin(${rel.target.toLowerCase()}Table, eq(${junctionTable}Table.${targetFK}, ${rel.target.toLowerCase()}Table.id))\n`;
        code += `            .where(eq(${junctionTable}Table.${sourceFK}, id));\n`;
        code +=
          `          (found as unknown as Record<string, unknown>).${rel.name} = ${rel.name}Result.map(r => r.${rel.target.toLowerCase()});\n`;
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
          code += `            (found as unknown as Record<string, unknown>).${rel.name} = ${rel.name}[0] || null;\n`;
          code += `          } else {\n`;
          code += `            (found as unknown as Record<string, unknown>).${rel.name} = null;\n`;
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
          code += `          (found as unknown as Record<string, unknown>).${rel.name} = ${rel.name}[0] || null;\n`;
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
        code +=
          `        const ${rel.name}Ids = [...new Set(results.map(r => r.${foreignKey}).filter(id => id !== null && id !== undefined))];\n`;
        code += `        if (${rel.name}Ids.length > 0) {\n`;
        code += `          const ${rel.name}Map = new Map();\n`;
        code += `          const ${rel.name}Data = await db\n`;
        code += `            .select()\n`;
        code += `            .from(${rel.target.toLowerCase()}Table)\n`;
        code += `            .where(inArray(${rel.target.toLowerCase()}Table.id, ${rel.name}Ids));\n`;
        code += `          ${rel.name}Data.forEach(item => ${rel.name}Map.set(item.id, item));\n`;
        code += `          results.forEach(result => {\n`;
        code +=
          `            (result as unknown as Record<string, unknown>).${rel.name} = result.${foreignKey} ? ${rel.name}Map.get(result.${foreignKey}) || null : null;\n`;
        code += `          });\n`;
        code += `        } else {\n`;
        code += `          results.forEach(result => {\n`;
        code += `            (result as unknown as Record<string, unknown>).${rel.name} = null;\n`;
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
        code += `        const ${rel.name}Map = new Map<string, unknown[]>();\n`;
        code += `        resultIds.forEach(id => ${rel.name}Map.set(id, []));\n`;
        code += `        ${rel.name}Data.forEach(item => {\n`;
        code += `          if (item.${foreignKey}) {\n`;
        code += `            const list = ${rel.name}Map.get(item.${foreignKey});\n`;
        code += `            if (list) list.push(item);\n`;
        code += `          }\n`;
        code += `        });\n`;
        code += `        results.forEach(result => {\n`;
        code +=
          `          (result as unknown as Record<string, unknown>).${rel.name} = ${rel.name}Map.get(result.id) || [];\n`;
        code += `        });\n`;
      } else if (rel.type === 'manyToMany' && rel.through) {
        // For manyToMany, batch fetch through junction table
        const junctionTable = rel.through.toLowerCase();
        const sourceFK = rel.foreignKey || this.toSnakeCase(model.name) + '_id';
        const targetFK = rel.targetForeignKey || this.toSnakeCase(rel.target) + '_id';
        code += `        // Load ${rel.name} (manyToMany) for all results\n`;
        code += `        const resultIds = results.map(r => r.id);\n`;
        code += `        const ${rel.name}Data = await db\n`;
        code += `          .select()\n`;
        code += `          .from(${junctionTable}Table)\n`;
        code +=
          `          .innerJoin(${rel.target.toLowerCase()}Table, eq(${junctionTable}Table.${targetFK}, ${rel.target.toLowerCase()}Table.id))\n`;
        code += `          .where(inArray(${junctionTable}Table.${sourceFK}, resultIds));\n`;
        code += `        const ${rel.name}Map = new Map<string, unknown[]>();\n`;
        code += `        resultIds.forEach(id => ${rel.name}Map.set(id, []));\n`;
        code += `        ${rel.name}Data.forEach(item => {\n`;
        code += `          if (item.${junctionTable}.${sourceFK}) {\n`;
        code += `            const list = ${rel.name}Map.get(item.${junctionTable}.${sourceFK});\n`;
        code += `            if (list) list.push(item.${rel.target.toLowerCase()});\n`;
        code += `          }\n`;
        code += `        });\n`;
        code += `        results.forEach(result => {\n`;
        code +=
          `          (result as unknown as Record<string, unknown>).${rel.name} = ${rel.name}Map.get(result.id) || [];\n`;
        code += `        });\n`;
      } else if (rel.type === 'oneToOne') {
        // For oneToOne, batch fetch related entities
        const hasFK = model.fields.some((f) => f.name === rel.foreignKey);
        if (hasFK) {
          // Foreign key is on this model
          const foreignKey = rel.foreignKey!;
          code += `        // Load ${rel.name} (oneToOne - owned) for all results\n`;
          code +=
            `        const ${rel.name}Ids = [...new Set(results.map(r => r.${foreignKey}).filter(id => id !== null && id !== undefined))];\n`;
          code += `        if (${rel.name}Ids.length > 0) {\n`;
          code += `          const ${rel.name}Map = new Map();\n`;
          code += `          const ${rel.name}Data = await db\n`;
          code += `            .select()\n`;
          code += `            .from(${rel.target.toLowerCase()}Table)\n`;
          code += `            .where(inArray(${rel.target.toLowerCase()}Table.id, ${rel.name}Ids));\n`;
          code += `          ${rel.name}Data.forEach(item => ${rel.name}Map.set(item.id, item));\n`;
          code += `          results.forEach(result => {\n`;
          code +=
            `            (result as unknown as Record<string, unknown>).${rel.name} = result.${foreignKey} ? ${rel.name}Map.get(result.${foreignKey}) || null : null;\n`;
          code += `          });\n`;
          code += `        } else {\n`;
          code += `          results.forEach(result => {\n`;
          code += `            (result as unknown as Record<string, unknown>).${rel.name} = null;\n`;
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
          code +=
            `            (result as unknown as Record<string, unknown>).${rel.name} = ${rel.name}Map.get(result.id) || null;\n`;
          code += `        });\n`;
        }
      }

      code += `      }\n`;
    }

    code += '    }\n';

    return code;
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
      if (rel.type === 'manyToMany' && rel.through) {
        // Generate manyToMany methods
        const targetName = rel.target;
        const targetNameLower = targetName.toLowerCase();
        const relName = rel.name;
        const RelName = this.capitalize(relName);
        const junctionTable = rel.through.toLowerCase();
        const sourceFK = rel.foreignKey || this.toSnakeCase(model.name) + '_id';
        const targetFK = rel.targetForeignKey || this.toSnakeCase(targetName) + '_id';
        const _sourcePK = model.fields.find((f) => f.primaryKey)?.name || 'id';

        // Derive singular form by removing "List" suffix if present
        const singularRelName = relName.endsWith('List') ? relName.slice(0, -4) : relName;
        const SingularRelName = this.capitalize(singularRelName);

        methods.push(`
  /**
   * Get ${relName} for ${model.name}
   */
  async get${RelName}(id: string, tx?: DbTransaction): Promise<Array<${targetName}>> {
    const db = tx || withoutTransaction();

    const result = await db
      .select()
      .from(${junctionTable}Table)
      .innerJoin(${targetNameLower}Table, eq(${junctionTable}Table.${targetFK}, ${targetNameLower}Table.id))
      .where(eq(${junctionTable}Table.${sourceFK}, id));

    return result.map(r => r.${targetNameLower});
  }

  /**
   * Add ${singularRelName} to ${model.name}
   */
  async add${SingularRelName}(id: string, ${targetNameLower}Id: string, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<void> {
    // Pre-add hook
    let ids = { ${this.toCamelCase(sourceFK)}: id, ${this.toCamelCase(targetFK)}: ${targetNameLower}Id };
    if (this.${relName}JunctionHooks.preAddJunction) {
      const preResult = await this.${relName}JunctionHooks.preAddJunction(ids, rawInput, tx, context);
      ids = preResult.ids as typeof ids;
    }

    // Perform add operation
    await tx.insert(${junctionTable}Table).values({
      ${sourceFK}: ids.${this.toCamelCase(sourceFK)},
      ${targetFK}: ids.${this.toCamelCase(targetFK)}
    } as New${
          (() => {
            const parts = rel.through.split('_');
            return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + '_' + parts.slice(1).join('_');
          })()
        });

    // Post-add hook
    if (this.${relName}JunctionHooks.postAddJunction) {
      await this.${relName}JunctionHooks.postAddJunction(ids, rawInput, tx, context);
    }

    // After-add hook (outside transaction, async)
    if (this.${relName}JunctionHooks.afterAddJunction) {
      setTimeout(() => {
        this.${relName}JunctionHooks.afterAddJunction!(ids, rawInput, context).catch(console.error);
      }, 0);
    }
  }

  /**
   * Add multiple ${relName} to ${model.name}
   */
  async add${RelName}(id: string, ${targetNameLower}Ids: string[], rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<void> {
    if (${targetNameLower}Ids.length === 0) return;

    // Call singular add method for each item to trigger hooks
    for (const ${targetNameLower}Id of ${targetNameLower}Ids) {
      await this.add${SingularRelName}(id, ${targetNameLower}Id, rawInput, tx, context);
    }
  }

  /**
   * Remove ${singularRelName} from ${model.name}
   */
  async remove${SingularRelName}(id: string, ${targetNameLower}Id: string, rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<void> {
    // Pre-remove hook
    let ids = { ${this.toCamelCase(sourceFK)}: id, ${this.toCamelCase(targetFK)}: ${targetNameLower}Id };
    if (this.${relName}JunctionHooks.preRemoveJunction) {
      const preResult = await this.${relName}JunctionHooks.preRemoveJunction(ids, rawInput, tx, context);
      ids = preResult.ids as typeof ids;
    }

    // Perform remove operation
    await tx.delete(${junctionTable}Table)
      .where(
        and(
          eq(${junctionTable}Table.${sourceFK}, ids.${this.toCamelCase(sourceFK)}),
          eq(${junctionTable}Table.${targetFK}, ids.${this.toCamelCase(targetFK)})
        )
      );

    // Post-remove hook
    if (this.${relName}JunctionHooks.postRemoveJunction) {
      await this.${relName}JunctionHooks.postRemoveJunction(ids, rawInput, tx, context);
    }

    // After-remove hook (outside transaction, async)
    if (this.${relName}JunctionHooks.afterRemoveJunction) {
      setTimeout(() => {
        this.${relName}JunctionHooks.afterRemoveJunction!(ids, rawInput, context).catch(console.error);
      }, 0);
    }
  }

  /**
   * Remove multiple ${relName} from ${model.name}
   */
  async remove${RelName}(id: string, ${targetNameLower}Ids: string[], rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<void> {
    if (${targetNameLower}Ids.length === 0) return;

    // Call singular remove method for each item to trigger hooks
    for (const ${targetNameLower}Id of ${targetNameLower}Ids) {
      await this.remove${SingularRelName}(id, ${targetNameLower}Id, rawInput, tx, context);
    }
  }

  /**
   * Set ${relName} for ${model.name} (replace all)
   */
  async set${RelName}(id: string, ${targetNameLower}Ids: string[], rawInput: unknown, tx: DbTransaction, context?: DomainHookContext<DomainEnvVars>): Promise<void> {
    // Delete all existing relationships
    await tx.delete(${junctionTable}Table)
      .where(eq(${junctionTable}Table.${sourceFK}, id));

    // Add new relationships (hooks will be called for each item)
    if (${targetNameLower}Ids.length > 0) {
      await this.add${RelName}(id, ${targetNameLower}Ids, rawInput, tx, context);
    }
  }

  /**
   * Check if ${model.name} has a specific ${singularRelName}
   */
  async has${SingularRelName}(id: string, ${targetNameLower}Id: string, tx?: DbTransaction): Promise<boolean> {
    const db = tx || withoutTransaction();

    const result = await db
      .select({ count: sql<number>\`count(*)\` })
      .from(${junctionTable}Table)
      .where(
        and(
          eq(${junctionTable}Table.${sourceFK}, id),
          eq(${junctionTable}Table.${targetFK}, ${targetNameLower}Id)
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
   * Convert snake_case to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Get TypeScript type for a field
   */
  private getTypeScriptType(fieldType: string, field?: FieldDefinition): string {
    // If it's an enum field with values, generate union type
    if (fieldType === 'enum' && field) {
      if (field.enumValues && field.enumValues.length > 0) {
        return field.enumValues.map((v) => `"${v}"`).join(' | ');
      }
    }

    const typeMap: Record<string, string> = {
      'text': 'string',
      'string': 'string',
      'integer': 'number',
      'bigint': 'number',
      'decimal': 'number',
      'boolean': 'boolean',
      'date': 'number',
      'uuid': 'string',
      'json': 'unknown',
      'jsonb': 'unknown',
      'enum': 'string',
      // PostGIS types
      'point': 'unknown',
      'linestring': 'unknown',
      'polygon': 'unknown',
      'multipoint': 'unknown',
      'multilinestring': 'unknown',
      'multipolygon': 'unknown',
      'geometry': 'unknown',
      'geography': 'unknown',
    };
    return typeMap[fieldType] || 'unknown';
  }

  /**
   * Generate junction hooks fields for domain class
   */
  private generateJunctionHooksFields(model: ModelDefinition): string {
    const manyToManyRels = model.relationships?.filter((rel) => rel.type === 'manyToMany') || [];
    if (manyToManyRels.length === 0) return '';

    const fields = manyToManyRels.map((rel) => {
      const relName = rel.name;
      return `private ${relName}JunctionHooks: JunctionTableHooks<DomainEnvVars>;`;
    });

    return fields.join('\n  ');
  }

  /**
   * Generate junction hooks constructor parameters
   */
  private generateJunctionHooksParams(model: ModelDefinition): string {
    const manyToManyRels = model.relationships?.filter((rel) => rel.type === 'manyToMany') || [];
    if (manyToManyRels.length === 0) return '';

    const params = manyToManyRels.map((rel) => {
      const relName = rel.name;
      return `${relName}JunctionHooks?: JunctionTableHooks<DomainEnvVars>`;
    });

    return params.join(',\n    ');
  }

  /**
   * Generate junction hooks assignments in constructor
   */
  private generateJunctionHooksAssignments(model: ModelDefinition): string {
    const manyToManyRels = model.relationships?.filter((rel) => rel.type === 'manyToMany') || [];
    if (manyToManyRels.length === 0) return '';

    const assignments = manyToManyRels.map((rel) => {
      const relName = rel.name;
      return `this.${relName}JunctionHooks = ${relName}JunctionHooks || {};`;
    });

    return assignments.join('\n    ');
  }
}
