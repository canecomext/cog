import { Hono } from "@hono/hono";
import {
  type DbTransaction,
  initializeGenerated,
  userDomain,
} from "./generated/index.ts";
import { sql } from "drizzle-orm";
import { crypto } from "@std/crypto";
import { load } from "@std/dotenv";

// Define the environment type for the Hono app
type Env = {
  Variables: {
    requestId?: string;
    userId?: string;
    transaction?: DbTransaction;
  };
};

// Create Hono app instance with the correct environment type
const app = new Hono<Env>();

// Initialize the backend
async function startServer() {
  await load();
  try {
    // Initialize generated backend code
    const { db } = await initializeGenerated({
      // Database configuration
      database: {
        connectionString: Deno.env.get("DB_URL"),
        ssl: {
          ca: Deno.env.get("DB_SSL_CERT_FILE"),
        },
      },
      // Pass the Hono app instance
      app,
      // Register hooks
      hooks: {
        user: {
          // Pre-create hook: Validate email format
          async preCreate(input: any, context?: any) {
            if (!input.email?.includes("@")) {
              throw new Error("Invalid email format");
            }
            return { data: input, context };
          },

          // Post-create hook: Enrich response with computed field
          async postCreate(input: any, result: any, tx: any, context?: any) {
            const enrichedResult = {
              ...result,
              displayName: `${result.fullName} (${result.email})`,
            };
            return { data: enrichedResult, context };
          },

          // After-create hook: Log creation (async)
          async afterCreate(result: any, context?: any) {
            console.log(
              `User created: ${result.id} at ${new Date().toISOString()}`,
            );
          },
        },
      },
    });

    // Request ID middleware - assigns a unique ID to each request
    app.use("*", async (c, next) => {
      const requestId = crypto.randomUUID();
      c.set("requestId", requestId);
      // Add request ID to response headers
      c.header("X-Request-ID", requestId);
      await next();
    });

    // Mock authentication middleware - in real apps, this would validate tokens/sessions
    app.use("*", async (c, next) => {
      // For demo purposes, we'll get userId from header or generate a demo one
      const userId = c.req.header("X-User-ID") ||
        "demo-user-" + crypto.randomUUID().slice(0, 8);
      c.set("userId", userId);
      await next();
    });

    // Add transaction middleware to automatically handle transactions
    app.use("*", async (c, next) => {
      await db.transaction(async (tx) => {
        // Store transaction in context
        c.set("transaction", tx);
        await next();
      });
    });

    // Add request timing middleware
    app.use("*", async (c, next) => {
      const start = Date.now();
      await next();
      const end = Date.now();
      console.log(`Request took ${end - start}ms`);
    });

    // Add custom routes
    app.get("/", (c) => c.json({ message: "Welcome to the example backend!" }));

    // Example endpoint demonstrating context usage
    app.post("/api/users/profile", async (c) => {
      const requestId = c.get("requestId");
      const userId = c.get("userId");

      if (!userId) {
        return c.json({ error: "User ID is required" }, 400);
      }

      try {
        // Example: Creating a user profile with context information
        const result = await userDomain.create({
          email: `${userId}@example.com`,
          username: userId,
          fullName: `Demo User ${userId?.split("-")[2] || ""}`,
          passwordHash: crypto.randomUUID(), // Just for demo purposes
        }, {
          requestId,
          userId,
        });

        // Log the operation with context information
        console.log(
          `[RequestID: ${requestId}] Profile created for user ${userId}`,
        );

        return c.json({
          message: "Profile created successfully",
          requestId,
          userId,
          profile: result,
        });
      } catch (error) {
        console.error(
          `[RequestID: ${requestId}] Error creating profile for ${userId}:`,
          error,
        );
        return c.json({
          error: "Failed to create profile",
          requestId,
          userId,
        }, 500);
      }
    });

    // Example endpoint demonstrating transaction usage with context
    app.patch("/api/users/profile/name", async (c) => {
      const requestId = c.get("requestId");
      const userId = c.get("userId");

      if (!userId) {
        return c.json({ error: "User ID is required" }, 400);
      }

      try {
        const { newName } = await c.req.json();
        if (!newName) {
          return c.json({ error: "newName is required" }, 400);
        }

        // Find user by username first
        const user = await userDomain.findMany({
          where: sql`username = ${userId}`,
        });

        if (!user.data.length) {
          return c.json({ error: "User not found" }, 404);
        }

        // Update user profile - transaction is automatically used from context
        const result = await userDomain.update(
          user.data[0].id,
          { fullName: newName },
          { requestId, userId },
        );

        console.log(
          `[RequestID: ${requestId}] Name updated for user ${userId}`,
        );

        return c.json({
          message: "Profile updated successfully",
          requestId,
          userId,
          profile: result,
        });
      } catch (error) {
        console.error(
          `[RequestID: ${requestId}] Error updating name for ${userId}:`,
          error,
        );
        return c.json({
          error: "Failed to update profile",
          requestId,
          userId,
        }, 500);
      }
    });

    // Add custom domain logic example
    app.get("/api/users/search", async (c) => {
      const { email } = c.req.query();

      try {
        // Use transaction from context
        const result = await userDomain.findMany({
          where: sql`email ILIKE ${`%${email}%`}`,
        });

        return c.json(result);
      } catch (error) {
        console.error("Search failed:", error);
        return c.json({ error: "Failed to search users" }, 500);
      }
    });

    // Start the server
    const port = 3000;
    console.log(`Server starting on http://localhost:${port}`);

    Deno.serve({ port: 3000 }, app.fetch);
  } catch (error) {
    console.error("Failed to start server:", error);
    Deno.exit(1);
  }
}

// Start the server
startServer();
