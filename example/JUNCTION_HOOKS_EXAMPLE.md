# Junction Table Hooks Example

This example demonstrates how to use junction table hooks for many-to-many relationships in COG.

## Location

See `example.ts` lines 76-139 for the implementation.

## Structure

Junction hooks are nested within `domainHooks`:

```typescript
await initializeGenerated({
  domainHooks: {
    user: {
      // Regular CRUD hooks...
      preCreate: async (input, tx, context) => { ... },
      
      // Junction table hooks
      junctionHooks: {
        roles: {  // The relationship name from the model definition
          preAddJunction: async (userId, roleId, junctionData, tx, context) => { ... },
          postAddJunction: async (userId, roleId, junctionData, tx, context) => { ... },
          afterAddJunction: async (userId, roleId, junctionData, context) => { ... },
        },
      },
    },
  },
});
```

## Hook Types

### preAddJunction
- **Runs**: Before adding a junction record (within transaction)
- **Use Cases**: 
  - Validate business rules (e.g., max roles per user)
  - Prevent duplicate assignments
  - Check permissions
  - Modify junction data before insertion
- **Can**: Throw exceptions to abort the operation
- **Must Return**: `{ data: { sourceId, targetId, junctionData }, context }`

### postAddJunction
- **Runs**: After adding junction record (within transaction)
- **Use Cases**:
  - Log successful operations
  - Update related records
  - Perform additional database operations
- **Must Return**: `{ data: undefined, context }`

### afterAddJunction
- **Runs**: After transaction commits (async, no transaction)
- **Use Cases**:
  - Send notifications
  - Update caches
  - Trigger webhooks
  - Log to external systems
- **Returns**: `Promise<void>`

## Example Output

When adding a role to a user, you'll see console output like:

```
[Junction Hook] Attempting to add role abc-123 to user xyz-789
[Junction Hook] Validation passed for user xyz-789 and role abc-123
[Junction Hook] Successfully added role abc-123 to user xyz-789
[Junction Hook - Async] Sending notification: Role abc-123 was assigned to user xyz-789
[Junction Hook - Async] Notification sent successfully
```

## Testing

To test the junction hooks:

1. Start the server: `deno run -A example/example.ts`
2. Create a user via POST `/api/users`
3. Create a role via POST `/api/roles`
4. Add the role to user: POST `/api/users/:userId/roles` with body `{ roleIds: ["role-id"] }`

The hooks will execute and log their activity to the console.

## Hook Execution Order

For batch operations like `addRoles([id1, id2, id3])`:

1. The singular hooks are called for **each** item
2. Each call goes through: pre → operation → post → after
3. All operations happen within the same transaction
4. After hooks run asynchronously after the transaction commits

Example:
```
Transaction Start
  → preAddJunction(user, role1)
  → INSERT role1
  → postAddJunction(user, role1)
  → preAddJunction(user, role2)
  → INSERT role2
  → postAddJunction(user, role2)
Transaction Commit
  → afterAddJunction(user, role1) [async]
  → afterAddJunction(user, role2) [async]
```
