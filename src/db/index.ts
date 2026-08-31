import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// DO managed/dev Postgres presents a cert node-postgres can't verify;
// sslmode=no-verify keeps TLS on without verification (traffic stays on DO's
// private network). Local URLs carry no sslmode param, so this is a no-op in dev.
const connectionString = process.env.DATABASE_URL?.replace(
  "sslmode=require",
  "sslmode=no-verify",
);

// Reuse the pool across Next.js hot reloads in dev.
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export * from "./schema";
