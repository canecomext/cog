/**
 * Example demonstrating OpenAPI specification usage
 *
 * This example shows how to:
 * 1. Serve the generated OpenAPI spec
 * 2. Extend it with custom endpoints
 * 3. Integrate with Swagger UI
 */

import { Hono } from '@hono/hono';
import { generatedOpenAPISpec, mergeOpenAPISpec } from './generated/rest/openapi.ts';

const app = new Hono();

// Example 1: Serve generated OpenAPI spec as-is
app.get('/openapi.json', (c) => {
  return c.json(generatedOpenAPISpec);
});

// Example 2: Merge with custom endpoints
const customEndpointsSpec = {
  info: {
    title: 'My Complete API',
    version: '1.0.0',
    description: 'Generated CRUD operations plus custom authentication endpoints',
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login user',
        description: 'Authenticate user with email and password',
        operationId: 'loginUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
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
                    token: { type: 'string', description: 'JWT token' },
                    user: { $ref: '#/components/schemas/User' },
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
                    error: { type: 'string' },
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
        summary: 'Logout user',
        description: 'Invalidate user session',
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
                    message: { type: 'string' },
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
        summary: 'Refresh access token',
        description: 'Get a new access token using refresh token',
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
  },
  components: {
    schemas: {
      LoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
        required: ['email', 'password'],
      },
      TokenResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer', description: 'Token lifetime in seconds' },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  // Apply bearer auth to all endpoints by default
  security: [{ bearerAuth: [] }],
};

// Merge custom spec with generated spec
const completeSpec = mergeOpenAPISpec(customEndpointsSpec);

// Serve the complete spec
app.get('/api-docs/openapi.json', (c) => {
  return c.json(completeSpec);
});

// Serve basic API info
app.get('/api-docs', (c) => {
  return c.json({
    message: 'API Documentation',
    endpoints: {
      openapi: '/api-docs/openapi.json',
      swagger: '/api-docs/swagger',
    },
    info: completeSpec.info,
  });
});

// Example: Implement the actual auth endpoints
app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json();

  // TODO: Implement actual authentication logic
  // This is just an example

  return c.json({
    token: 'example-jwt-token',
    user: {
      id: '123',
      email,
      username: 'example-user',
    },
  });
});

app.post('/auth/logout', (c) => {
  // TODO: Implement logout logic
  return c.json({ message: 'Logged out successfully' });
});

app.post('/auth/refresh', async (c) => {
  const { refreshToken } = await c.req.json();

  // TODO: Implement token refresh logic

  return c.json({
    token: 'new-jwt-token',
  });
});

// Scalar API Reference - Beautiful API documentation
// Install: npm install @scalar/hono-api-reference
import { Scalar } from '@scalar/hono-api-reference';

// Serve Scalar API Reference
app.get(
  '/reference',
  Scalar({
    url: '/openapi.json',
    theme: 'purple', // Options: 'alternate', 'default', 'moon', 'purple', 'solarized'
    pageTitle: 'Generated CRUD API Documentation',
  }),
);

// Or with complete spec (generated + custom)
app.get(
  '/api-docs/reference',
  Scalar({
    url: '/api-docs/openapi.json',
    theme: 'purple',
    pageTitle: 'My Complete API Documentation',
  }),
);

console.log('OpenAPI example endpoints:');
console.log('  - OpenAPI spec: http://localhost:3000/openapi.json (generated only)');
console.log('  - Complete spec: http://localhost:3000/api-docs/openapi.json (generated + custom)');
console.log('  - API info: http://localhost:3000/api-docs');
console.log('  - Scalar docs: http://localhost:3000/reference (generated only)');
console.log('  - Scalar docs: http://localhost:3000/api-docs/reference (generated + custom)');

// Uncomment to run:
Deno.serve({ port: 3000 }, app.fetch);
