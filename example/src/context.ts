/**
 * User-defined ExampleEnv type for Hono
 *
 * This file demonstrates how to define your own Env type
 * that extends the generated backend with custom context variables.
 *
 * Note: Renamed to ExampleEnv to avoid naming clash with Hono's Env type
 */

/**
 * Define your application's environment type
 * Add any custom variables you need in your middleware and routes
 */
export type ExampleEnv = {
  Variables: {
    someString?: string;
    someDeepStructure?: {
      someOtherString: Date;
    };
  };
};
