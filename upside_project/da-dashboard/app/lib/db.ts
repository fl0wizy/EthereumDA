import { Pool } from "pg";

// TimescaleDB 연결 설정
// .env.local 에 아래 값을 넣으세요:
//   DATABASE_URL=postgresql://user:password@host:5432/dbname
// 또는 개별 변수로:
//   DB_HOST=<private IP or localhost via SSH tunnel>
//   DB_PORT=5432
//   DB_NAME=dabeat
//   DB_USER=worker
//   DB_PASSWORD=xxxxx

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: false }
    : {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5432"),
        database: process.env.DB_NAME || "dabeat",
        user: process.env.DB_USER || "worker",
        password: process.env.DB_PASSWORD || "",
        max: 10,
        idleTimeoutMillis: 30000,
      }
);

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export default pool;
