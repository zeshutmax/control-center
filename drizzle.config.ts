import { defineConfig } from "drizzle-kit";

// DO managed/dev Postgres uses a cert node-postgres can't verify by default;
// no-verify keeps TLS on without verification (traffic stays on DO's private
// network). Local URLs have no sslmode param, so this is a no-op in dev.
const url = process.env.DATABASE_URL!.replace("sslmode=require", "sslmode=no-verify");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
