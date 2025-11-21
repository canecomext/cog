import { load } from '@std/dotenv';
import { join } from '@std/path';
import { initializeDatabase } from './generated/db/initialize-database.ts';

const env = await load();

console.log(`DB_URL: ${env.DB_URL}`);
console.log(`DB_SSL_CA_FILE: ${env.DB_SSL_CA_FILE}`);

initializeDatabase({
  connectionString: env.DB_URL,
  ssl: {
    ca: Deno.readTextFileSync(join(Deno.cwd(), env.DB_SSL_CA_FILE)),
  },
});
