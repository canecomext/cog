import { Hono } from '@hono/hono';
import { type DbTransaction, initializeGenerated } from './generated/index.ts';
import { load } from '@std/dotenv';

// Define the environment type for the Hono app
type Env = {
  Variables: {
    requestId?: string;
    userId?: string;
    transaction?: DbTransaction;
    middlewareOrder: string[];
  };
};

// Create Hono app instance with the correct environment type
const app = new Hono<Env>();

const env = await load();

// Initialize the backend with middleware tracking
async function testMiddlewareOrder() {
  try {
    console.log('🧪 Testing middleware order...\n');
    
    // Initialize generated backend code
    const { db } = await initializeGenerated({
      // Database configuration
      database: {
        connectionString: env.DB_URL,
        ssl: {
          ca: env.DB_SSL_CERT_FILE,
        },
      },
      // Pass the Hono app instance
      app,
      // Register custom global middlewares
      // These will be registered after built-in middlewares but before routes
      middlewareSetup: async (database) => {
        console.log('✅ Custom middleware setup callback called');
        console.log('   Database instance available:', database !== undefined);
        
        // Custom middleware 1: Track middleware execution order
        app.use('*', async (c, next) => {
          const order = c.get('middlewareOrder') || [];
          order.push('custom-middleware-1');
          c.set('middlewareOrder', order);
          await next();
        });
        
        // Custom middleware 2: Authentication
        app.use('*', async (c, next) => {
          const order = c.get('middlewareOrder') || [];
          order.push('custom-middleware-2-auth');
          c.set('middlewareOrder', order);
          c.set('userId', 'test-user');
          await next();
        });
      },
    });

    // Add a test route to verify middleware order
    app.get('/test-order', (c) => {
      const order = c.get('middlewareOrder') || [];
      order.push('route-handler');
      
      return c.json({
        message: 'Middleware order test',
        executionOrder: order,
        headers: {
          'x-request-id': c.req.header('x-request-id'),
          'access-control-allow-origin': c.req.header('access-control-allow-origin'),
        },
        variables: {
          requestId: c.get('requestId'),
          userId: c.get('userId'),
        }
      });
    });

    console.log('\n📍 Test endpoint registered at: /test-order');
    console.log('✅ Middleware setup complete!\n');
    
    console.log('Expected middleware execution order:');
    console.log('  1. CORS middleware (built-in)');
    console.log('  2. Request ID middleware (built-in)');
    console.log('  3. Error middleware (built-in)');
    console.log('  4. Custom middleware 1 (user-defined)');
    console.log('  5. Custom middleware 2 - Auth (user-defined)');
    console.log('  6. Route handler\n');
    
    console.log('To test, run: curl http://localhost:8000/test-order');
    
    // Start the server
    const port = 8000;
    console.log(`\n🚀 Server running at http://localhost:${port}`);
    
    Deno.serve({ port }, app.fetch);
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
}

// Run the test
testMiddlewareOrder();