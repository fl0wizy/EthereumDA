import { Pool } from "pg";

// Connection to the local eth-da-collector Postgres (database `eth_da`).
// Override with ETH_DA_DATABASE_URL in .env.local; defaults match the
// collector's own .env (postgresql://collector:collector@127.0.0.1:5432/eth_da).
const pool = new Pool({
  connectionString:
    process.env.ETH_DA_DATABASE_URL ||
    "postgresql://collector:collector@127.0.0.1:5432/eth_da",
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function ethDaQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

export default pool;
