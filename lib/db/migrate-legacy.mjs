import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  const enumResult = await client.query(
    "select 1 from pg_type where typname = 'user_role' limit 1",
  );
  if (enumResult.rowCount) {
    // Add missing enum values — ignore if not owner (values may already exist)
    for (const val of ["manager", "cashier", "server"]) {
      try {
        await client.query(`alter type user_role add value if not exists '${val}'`);
      } catch { /* already exists or not owner — safe to skip */ }
    }
    try {
      await client.query("update app_users set role = 'cashier' where role::text = 'staff'");
    } catch { /* table may not exist yet */ }
  }
} finally {
  await client.end();
}