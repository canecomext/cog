#!/usr/bin/env -S deno run --allow-all

/**
 * Backend Test Runner
 * 
 * This script demonstrates the usage of the generated backend code with real database operations.
 * It creates a test scenario with all entities, relationships, and hooks.
 * 
 * Prerequisites:
 * 1. Run generate.ts first to generate the backend code
 * 2. Configure .env with your database connection
 * 3. Ensure PostgreSQL with PostGIS extension is running
 * 
 * Usage: deno run --allow-all run-backend.ts
 */

import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";
import { Hono } from "https://deno.land/x/hono@v3.11.7/mod.ts";
import { drizzle } from "npm:drizzle-orm/postgres-js";
import postgres from "npm:postgres";
import { migrate } from "npm:drizzle-orm/postgres-js/migrator";

// Load generated code (these imports assume the code has been generated)
import * as schemas from "./generated/db/schema.ts";
import { createUserAPI } from "./generated/domain/user.ts";
import { createPostAPI } from "./generated/domain/post.ts";
import { createCommentAPI } from "./generated/domain/comment.ts";
import { createCategoryAPI } from "./generated/domain/category.ts";
import { createTagAPI } from "./generated/domain/tag.ts";
import { createLocationAPI } from "./generated/domain/location.ts";
import { createRoleAPI } from "./generated/domain/role.ts";
import { createUserProfileAPI } from "./generated/domain/userprofile.ts";
import { userRouter } from "./generated/rest/user.ts";
import { postRouter } from "./generated/rest/post.ts";
import { commentRouter } from "./generated/rest/comment.ts";
import { categoryRouter } from "./generated/rest/category.ts";
import { tagRouter } from "./generated/rest/tag.ts";
import { locationRouter } from "./generated/rest/location.ts";
import { roleRouter } from "./generated/rest/role.ts";
import { userProfileRouter } from "./generated/rest/userprofile.ts";

// Load environment variables
await load({ export: true });

// Database connection with SSL support
function createDatabaseConnection() {
  const connectionOptions: any = {};
  
  if (Deno.env.get("DATABASE_URL")) {
    connectionOptions.connectionString = Deno.env.get("DATABASE_URL");
  } else {
    connectionOptions.host = Deno.env.get("DB_HOST") || "localhost";
    connectionOptions.port = parseInt(Deno.env.get("DB_PORT") || "5432");
    connectionOptions.database = Deno.env.get("DB_NAME") || "example_db";
    connectionOptions.username = Deno.env.get("DB_USER") || "postgres";
    connectionOptions.password = Deno.env.get("DB_PASSWORD") || "";
  }
  
  // SSL configuration
  const sslMode = Deno.env.get("DB_SSL_MODE");
  if (sslMode && sslMode !== "disable") {
    connectionOptions.ssl = {};
    
    if (Deno.env.get("DB_SSL_CERT")) {
      connectionOptions.ssl.cert = Deno.readTextFileSync(Deno.env.get("DB_SSL_CERT")!);
    }
    if (Deno.env.get("DB_SSL_KEY")) {
      connectionOptions.ssl.key = Deno.readTextFileSync(Deno.env.get("DB_SSL_KEY")!);
    }
    if (Deno.env.get("DB_SSL_CA")) {
      connectionOptions.ssl.ca = Deno.readTextFileSync(Deno.env.get("DB_SSL_CA")!);
    }
    
    connectionOptions.ssl.rejectUnauthorized = sslMode === "verify-full";
  }
  
  return postgres(connectionOptions);
}

// Initialize database
const sql = createDatabaseConnection();
const db = drizzle(sql, { schema: schemas });

// Run migrations
console.log("🔄 Running database migrations...");
await migrate(db, { migrationsFolder: "./generated/db/migrations" });
console.log("✅ Migrations completed\n");

// Initialize domain APIs with hooks
console.log("🎯 Setting up domain APIs with hooks...\n");

// Track hook executions for demonstration
const hookLog: string[] = [];

// User API with hooks
const userAPI = createUserAPI(db);

userAPI.hooks.pre.create = async (data, trx) => {
  hookLog.push(`[PRE-CREATE] User: ${data.email}`);
  console.log(`  ↪ Pre-hook: Validating user email: ${data.email}`);
  // Validate email format
  if (!data.email?.includes("@")) {
    throw new Error("Invalid email format");
  }
  return data;
};

userAPI.hooks.post.create = async (result, data, trx) => {
  hookLog.push(`[POST-CREATE] User ID: ${result.id}`);
  console.log(`  ↪ Post-hook: User created with ID: ${result.id}`);
  return result;
};

userAPI.hooks.after.create = async (result) => {
  hookLog.push(`[AFTER-CREATE] User ID: ${result.id} (async)`);
  console.log(`  ↪ After-hook: Sending welcome email to ${result.email} (async)`);
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 100));
};

// Post API with transaction demonstration
const postAPI = createPostAPI(db);

postAPI.hooks.pre.create = async (data, trx) => {
  hookLog.push(`[PRE-CREATE] Post: ${data.title}`);
  console.log(`  ↪ Pre-hook: Validating post title length`);
  if (data.title && data.title.length > 100) {
    throw new Error("Title too long");
  }
  return data;
};

postAPI.hooks.post.create = async (result, data, trx) => {
  hookLog.push(`[POST-CREATE] Post ID: ${result.id}`);
  console.log(`  ↪ Post-hook: Post created, updating user post count in transaction`);
  // This runs in the same transaction
  return result;
};

// Category API
const categoryAPI = createCategoryAPI(db);

categoryAPI.hooks.pre.create = async (data, trx) => {
  console.log(`  ↪ Pre-hook: Ensuring category name is unique`);
  return data;
};

// Initialize other APIs
const commentAPI = createCommentAPI(db);
const tagAPI = createTagAPI(db);
const locationAPI = createLocationAPI(db);
const roleAPI = createRoleAPI(db);
const userProfileAPI = createUserProfileAPI(db);

// Create Hono app with REST endpoints
const app = new Hono();

// Mount REST routers
app.route("/api/users", userRouter({ api: userAPI }));
app.route("/api/posts", postRouter({ api: postAPI }));
app.route("/api/comments", commentRouter({ api: commentAPI }));
app.route("/api/categories", categoryRouter({ api: categoryAPI }));
app.route("/api/tags", tagRouter({ api: tagAPI }));
app.route("/api/locations", locationRouter({ api: locationAPI }));
app.route("/api/roles", roleRouter({ api: roleAPI }));
app.route("/api/profiles", userProfileRouter({ api: userProfileAPI }));

// Test scenario
console.log("🧪 Running test scenario...\n");
console.log("=" . repeat(60));
console.log("DEMONSTRATION: Complete Backend with Transactions & Hooks");
console.log("=" . repeat(60) + "\n");

try {
  // Clean up existing data
  console.log("🧹 Cleaning up existing data...\n");
  await db.delete(schemas.comments).execute();
  await db.delete(schemas.post_tags).execute();
  await db.delete(schemas.posts).execute();
  await db.delete(schemas.tags).execute();
  await db.delete(schemas.categories).execute();
  await db.delete(schemas.userprofiles).execute();
  await db.delete(schemas.user_roles).execute();
  await db.delete(schemas.users).execute();
  await db.delete(schemas.roles).execute();
  await db.delete(schemas.locations).execute();
  
  // 1. Create roles
  console.log("1️⃣ Creating Roles");
  console.log("-" . repeat(40));
  const adminRole = await roleAPI.create({
    name: "admin",
    permissions: ["read", "write", "delete", "manage_users"]
  });
  
  const userRole = await roleAPI.create({
    name: "user",
    permissions: ["read", "write"]
  });
  console.log(`✅ Created roles: ${adminRole.name}, ${userRole.name}\n`);
  
  // 2. Create users with hooks demonstration
  console.log("2️⃣ Creating Users (with hooks)");
  console.log("-" . repeat(40));
  const alice = await userAPI.create({
    email: "alice@example.com",
    name: "Alice Johnson",
    age: 28,
    isActive: true,
    metadata: { interests: ["coding", "hiking"] },
    preferences: { theme: "dark", notifications: true },
    tags: ["developer", "team-lead"]
  });
  
  const bob = await userAPI.create({
    email: "bob@example.com",
    name: "Bob Smith",
    age: 32,
    isActive: true
  });
  console.log(`✅ Created users: ${alice.name}, ${bob.name}\n`);
  
  // 3. Assign roles (many-to-many relationship)
  console.log("3️⃣ Assigning Roles to Users");
  console.log("-" . repeat(40));
  await db.insert(schemas.user_roles).values([
    { userId: alice.id, roleId: adminRole.id },
    { userId: bob.id, roleId: userRole.id }
  ]).execute();
  console.log(`✅ Assigned admin role to Alice, user role to Bob\n`);
  
  // 4. Create user profiles (one-to-one relationship)
  console.log("4️⃣ Creating User Profiles");
  console.log("-" . repeat(40));
  const aliceProfile = await userProfileAPI.create({
    userId: alice.id,
    bio: "Full-stack developer with a passion for clean code",
    avatarUrl: "https://example.com/alice.jpg",
    socialLinks: {
      github: "https://github.com/alice",
      linkedin: "https://linkedin.com/in/alice"
    }
  });
  console.log(`✅ Created profile for ${alice.name}\n`);
  
  // 5. Create categories
  console.log("5️⃣ Creating Categories");
  console.log("-" . repeat(40));
  const techCategory = await categoryAPI.create({
    name: "Technology",
    description: "Tech-related posts"
  });
  
  const travelCategory = await categoryAPI.create({
    name: "Travel",
    description: "Travel experiences and tips"
  });
  console.log(`✅ Created categories: ${techCategory.name}, ${travelCategory.name}\n`);
  
  // 6. Create posts with foreign key relationship
  console.log("6️⃣ Creating Posts (demonstrating transactions)");
  console.log("-" . repeat(40));
  const post1 = await postAPI.create({
    title: "Understanding Database Transactions",
    content: "Transactions ensure data consistency...",
    published: true,
    authorId: alice.id,
    categoryId: techCategory.id,
    viewCount: BigInt(0)
  });
  
  const post2 = await postAPI.create({
    title: "My Trip to Japan",
    content: "An amazing cultural experience...",
    published: true,
    authorId: bob.id,
    categoryId: travelCategory.id,
    viewCount: BigInt(0)
  });
  console.log(`✅ Created posts by ${alice.name} and ${bob.name}\n`);
  
  // 7. Create tags and associate with posts (many-to-many)
  console.log("7️⃣ Creating Tags and Associations");
  console.log("-" . repeat(40));
  const dbTag = await tagAPI.create({ name: "database" });
  const sqlTag = await tagAPI.create({ name: "sql" });
  const japanTag = await tagAPI.create({ name: "japan" });
  const cultureTag = await tagAPI.create({ name: "culture" });
  
  await db.insert(schemas.post_tags).values([
    { postId: post1.id, tagId: dbTag.id },
    { postId: post1.id, tagId: sqlTag.id },
    { postId: post2.id, tagId: japanTag.id },
    { postId: post2.id, tagId: cultureTag.id }
  ]).execute();
  console.log(`✅ Associated tags with posts\n`);
  
  // 8. Create comments (nested relationships)
  console.log("8️⃣ Creating Comments");
  console.log("-" . repeat(40));
  const comment1 = await commentAPI.create({
    content: "Great explanation of transactions!",
    postId: post1.id,
    userId: bob.id
  });
  
  const comment2 = await commentAPI.create({
    content: "I'd love to visit Japan too!",
    postId: post2.id,
    userId: alice.id
  });
  console.log(`✅ Created comments on posts\n`);
  
  // 9. Create locations with PostGIS spatial data
  console.log("9️⃣ Creating Locations (PostGIS spatial data)");
  console.log("-" . repeat(40));
  const tokyo = await locationAPI.create({
    name: "Tokyo",
    point: { type: "Point", coordinates: [139.6503, 35.6762] },
    polygon: {
      type: "Polygon",
      coordinates: [[
        [139.5, 35.5],
        [139.8, 35.5],
        [139.8, 35.8],
        [139.5, 35.8],
        [139.5, 35.5]
      ]]
    },
    properties: { country: "Japan", population: 13960000 }
  });
  
  const sf = await locationAPI.create({
    name: "San Francisco",
    point: { type: "Point", coordinates: [-122.4194, 37.7749] },
    properties: { country: "USA", population: 873965 }
  });
  console.log(`✅ Created locations: ${tokyo.name}, ${sf.name}\n`);
  
  // 10. Demonstrate querying with relationships
  console.log("🔍 Demonstrating Queries");
  console.log("-" . repeat(40));
  
  // Get user with posts
  const userWithPosts = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, alice.id),
    with: {
      posts: true,
      userprofile: true
    }
  });
  console.log(`✅ Found ${userWithPosts?.name} with ${userWithPosts?.posts.length} posts\n`);
  
  // 11. Demonstrate transaction rollback
  console.log("🔄 Demonstrating Transaction Rollback");
  console.log("-" . repeat(40));
  try {
    await db.transaction(async (trx) => {
      console.log("  Starting transaction...");
      await trx.insert(schemas.categories).values({
        name: "Test Category",
        description: "This will be rolled back"
      });
      console.log("  Inserted test category");
      throw new Error("Simulated error to trigger rollback");
    });
  } catch (error) {
    console.log(`  ✅ Transaction rolled back as expected: ${error.message}\n`);
  }
  
  // 12. Show hook execution log
  console.log("📝 Hook Execution Log");
  console.log("-" . repeat(40));
  hookLog.forEach(log => console.log(`  ${log}`));
  console.log();
  
  // Summary
  console.log("=" . repeat(60));
  console.log("✅ TEST SCENARIO COMPLETED SUCCESSFULLY");
  console.log("=" . repeat(60));
  console.log("\n📊 Database State Summary:");
  console.log(`  - Users: ${await db.select().from(schemas.users).then(r => r.length)}`);
  console.log(`  - Posts: ${await db.select().from(schemas.posts).then(r => r.length)}`);
  console.log(`  - Comments: ${await db.select().from(schemas.comments).then(r => r.length)}`);
  console.log(`  - Categories: ${await db.select().from(schemas.categories).then(r => r.length)}`);
  console.log(`  - Tags: ${await db.select().from(schemas.tags).then(r => r.length)}`);
  console.log(`  - Locations: ${await db.select().from(schemas.locations).then(r => r.length)}`);
  console.log(`  - Roles: ${await db.select().from(schemas.roles).then(r => r.length)}`);
  
  // Start the server
  console.log("\n🚀 Starting HTTP server...");
  console.log(`📡 Server running at http://localhost:${Deno.env.get("PORT") || 8000}`);
  console.log("\n📌 Available endpoints:");
  console.log("  GET    /api/users");
  console.log("  POST   /api/users");
  console.log("  GET    /api/users/:id");
  console.log("  PUT    /api/users/:id");
  console.log("  DELETE /api/users/:id");
  console.log("  ... (similar for posts, comments, categories, tags, locations, roles, profiles)");
  console.log("\nPress Ctrl+C to stop the server\n");
  
  // Serve the application
  Deno.serve({ port: parseInt(Deno.env.get("PORT") || "8000") }, app.fetch);
  
} catch (error) {
  console.error("\n❌ Test scenario failed:", error);
  await sql.end();
  Deno.exit(1);
}