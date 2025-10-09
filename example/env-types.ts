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
    // Standard fields you might use
    requestId?: string;
    userId?: string;
    
    // Custom fields for your application
    tenantId?: string;
    userRole?: string;
    authToken?: string;
    
    // Add any other context variables your app needs
    sessionData?: {
      expiresAt: Date;
      permissions: string[];
    };
  };
};
