import asyncio
import asyncpg
import sys

DB_HOST = "db.wgduotmkaiigxacrcfor.supabase.co"
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "uJdUcyIxbykQ8LPe"
DB_PORT = 5432

CREATE_LICENSES_TABLE = """
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    code TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

async def main():
    print(f"Connecting to Postgres at {DB_HOST}:{DB_PORT}...")
    try:
        conn = await asyncpg.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS,
            database=DB_NAME,
            ssl="require",
            timeout=15
        )
        print("Connected successfully!")

        with open("supabase_cloud_schema.sql", "r", encoding="utf-8") as f:
            sql_schema = f.read()

        with open("supabase_rls_hardening.sql", "r", encoding="utf-8") as f:
            sql_rls = f.read()

        print("Executing canonical cloud schema...")
        await conn.execute(sql_schema)
        print("Canonical cloud schema executed!")

        print("Ensuring licenses table exists...")
        await conn.execute(CREATE_LICENSES_TABLE)
        print("Licenses table verified!")

        print("Executing RLS hardening schema...")
        await conn.execute(sql_rls)
        print("RLS hardening schema executed!")

        # Verify tables created
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
        table_names = [r["table_name"] for r in tables]
        print("Public tables in DB:", table_names)

        await conn.close()
        print("All done successfully!")
    except Exception as e:
        print("Error connecting/executing:", e)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
