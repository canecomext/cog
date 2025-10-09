/**
 * User-defined Env type for Hono
 *
 * This file demonstrates how to define your own Env type
 * that extends the generated backend with custom context variables.
 */

/**
 * Define your application's environment type
 * Add any custom variables you need in your middleware and routes
 */
export type Env = {
  Variables: {
    someString?: string;
    someDeepStructure?: {
      someOtherString: Date;
    };
  };
};
