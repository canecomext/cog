/**
 * Scalar API Reference Demo
 * 
 * This example demonstrates how to serve beautiful API documentation
 * using Scalar with the generated OpenAPI specification.
 * 
 * Run: deno run -A scalar-demo.ts
 * Then visit: http://localhost:3000/reference
 */

import { Hono } from '@hono/hono';
import { apiReference } from '@scalar/hono-api-reference';
import { generatedOpenAPISpec, mergeOpenAPISpec } from './generated/rest/openapi.ts';

const app = new Hono();

// =============================================================================
// Example 1: Serve documentation for generated CRUD endpoints only
// =============================================================================
app.get('/reference', apiReference({
  url: '/openapi.json',
  theme: 'purple', // Try: 'alternate', 'default', 'moon', 'purple', 'solarized'
  pageTitle: 'Generated CRUD API - Reference',
}));

app.get('/openapi.json', (c) => {
  return c.json(generatedOpenAPISpec);
});

// =============================================================================
// Example 2: Extended documentation with custom endpoints
// =============================================================================

// Define custom endpoints spec
const customEndpointsSpec = {
  info: {
    title: 'Complete API Documentation',
    version: '1.0.0',
    description: 'Generated CRUD operations plus custom authentication and analytics endpoints',
    contact: {
      name: 'API Support',
      email: 'support@example.com',
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User Login',
        description: 'Authenticate a user with email and password',
        operationId: 'loginUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    example: 'user@example.com',
                  },
                  password: {
                    type: 'string',
                    format: 'password',
                    minLength: 8,
                    example: 'SecurePass123!',
                  },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: {
                      type: 'string',
                      description: 'JWT authentication token',
                      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                    },
                    refreshToken: {
                      type: 'string',
                      description: 'Token for refreshing access',
                    },
                    user: {
                      $ref: '#/components/schemas/User',
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Invalid email or password' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'User Logout',
        description: 'Invalidate the current user session',
        operationId: 'logoutUser',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Logout successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Successfully logged out' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Refresh Token',
        description: 'Get a new access token using a refresh token',
        operationId: 'refreshToken',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refreshToken: { type: 'string' },
                },
                required: ['refreshToken'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token refreshed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    expiresIn: { type: 'integer', description: 'Token lifetime in seconds' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid or expired refresh token',
          },
        },
      },
    },
    '/analytics/dashboard': {
      get: {
        tags: ['Analytics'],
        summary: 'Get Dashboard Stats',
        description: 'Retrieve dashboard statistics and metrics',
        operationId: 'getDashboardStats',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Dashboard statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalUsers: { type: 'integer', example: 1234 },
                    activeUsers: { type: 'integer', example: 567 },
                    totalPosts: { type: 'integer', example: 8901 },
                    recentActivity: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          action: { type: 'string' },
                          timestamp: { type: 'string', format: 'date-time' },
                          user: { $ref: '#/components/schemas/User' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token',
      },
    },
  },
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and session management',
    },
    {
      name: 'Analytics',
      description: 'Analytics and reporting endpoints',
    },
  ],
};

// Merge custom spec with generated spec
const completeSpec = mergeOpenAPISpec(customEndpointsSpec);

// Serve complete documentation
app.get('/docs/reference', apiReference({
  url: '/docs/openapi.json',
  theme: 'purple',
  pageTitle: 'Complete API Documentation',
}));

app.get('/docs/openapi.json', (c) => {
  return c.json(completeSpec);
});

// =============================================================================
// Example 3: Dynamic theme based on query parameter
// =============================================================================
app.get('/reference/custom', (c) => {
  const theme = c.req.query('theme') || 'purple';
  
  return apiReference({
    url: '/openapi.json',
    theme: theme as any,
    pageTitle: `API Reference - ${theme} theme`,
  })(c);
});

// =============================================================================
// Implement example custom endpoints
// =============================================================================

app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  
  // Mock authentication (replace with real logic)
  if (email && password) {
    return c.json({
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.token',
      refreshToken: 'refresh.token.example',
      user: {
        id: '1',
        email,
        username: email.split('@')[0],
        fullName: 'Example User',
      },
    });
  }
  
  return c.json({ error: 'Invalid email or password' }, 401);
});

app.post('/auth/logout', (c) => {
  return c.json({ message: 'Successfully logged out' });
});

app.post('/auth/refresh', async (c) => {
  const { refreshToken } = await c.req.json();
  
  if (refreshToken) {
    return c.json({
      token: 'new.jwt.token.example',
      expiresIn: 3600,
    });
  }
  
  return c.json({ error: 'Invalid refresh token' }, 401);
});

app.get('/analytics/dashboard', (c) => {
  return c.json({
    totalUsers: 1234,
    activeUsers: 567,
    totalPosts: 8901,
    recentActivity: [
      {
        action: 'User registered',
        timestamp: new Date().toISOString(),
        user: { id: '1', email: 'user@example.com' },
      },
    ],
  });
});

// =============================================================================
// Landing page with links to all documentation
// =============================================================================
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>API Documentation</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #333; }
          .card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            background: #f9f9f9;
          }
          a {
            color: #6366f1;
            text-decoration: none;
            font-weight: 500;
          }
          a:hover { text-decoration: underline; }
          .theme-selector {
            margin: 10px 0;
            padding: 10px;
            background: #fff;
            border-radius: 4px;
          }
          code {
            background: #e5e7eb;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <h1>🚀 API Documentation</h1>
        <p>Welcome to your API documentation powered by Scalar!</p>
        
        <div class="card">
          <h2>📚 Generated CRUD API</h2>
          <p>Auto-generated REST API for all your models with CRUD operations.</p>
          <a href="/reference" target="_blank">→ View Documentation</a>
          <br><br>
          <small>OpenAPI Spec: <a href="/openapi.json" target="_blank">/openapi.json</a></small>
        </div>
        
        <div class="card">
          <h2>🎯 Complete API (Generated + Custom)</h2>
          <p>Includes generated CRUD endpoints plus custom authentication and analytics endpoints.</p>
          <a href="/docs/reference" target="_blank">→ View Documentation</a>
          <br><br>
          <small>OpenAPI Spec: <a href="/docs/openapi.json" target="_blank">/docs/openapi.json</a></small>
        </div>
        
        <div class="card">
          <h2>🎨 Try Different Themes</h2>
          <div class="theme-selector">
            <p>Available themes:</p>
            <a href="/reference/custom?theme=purple">Purple (default)</a> •
            <a href="/reference/custom?theme=alternate">Alternate</a> •
            <a href="/reference/custom?theme=default">Default</a> •
            <a href="/reference/custom?theme=moon">Moon</a> •
            <a href="/reference/custom?theme=solarized">Solarized</a>
          </div>
        </div>
        
        <div class="card">
          <h2>💡 Quick Tips</h2>
          <ul>
            <li>All endpoints support <code>Bearer</code> authentication</li>
            <li>Use the "Try it" button in Scalar to test endpoints</li>
            <li>Filter by tags to see specific endpoint groups</li>
            <li>Download OpenAPI spec to generate client SDKs</li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// =============================================================================
// Start the server
// =============================================================================
const port = 3000;

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  🚀 Scalar API Reference Demo                  ║
╠════════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${port}                      ║
║                                                                ║
║  📚 Documentation:                                             ║
║    • Landing page:  http://localhost:${port}/                     ║
║    • Generated API: http://localhost:${port}/reference            ║
║    • Complete API:  http://localhost:${port}/docs/reference       ║
║                                                                ║
║  📄 OpenAPI Specs:                                             ║
║    • Generated:     http://localhost:${port}/openapi.json         ║
║    • Complete:      http://localhost:${port}/docs/openapi.json    ║
║                                                                ║
║  🎨 Themes:         http://localhost:${port}/reference/custom     ║
╚════════════════════════════════════════════════════════════════╝
`);

Deno.serve({ port }, app.fetch);
