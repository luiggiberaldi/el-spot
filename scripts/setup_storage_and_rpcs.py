import asyncio
import asyncpg
import sys

DB_HOST = "db.wgduotmkaiigxacrcfor.supabase.co"
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "uJdUcyIxbykQ8LPe"
DB_PORT = 5432

SQL_SETUP = """
-- 1. Storage bucket product-images & policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access product-images" ON storage.objects;
CREATE POLICY "Public Access product-images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Insert product-images" ON storage.objects;
CREATE POLICY "Public Insert product-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Update product-images" ON storage.objects;
CREATE POLICY "Public Update product-images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Delete product-images" ON storage.objects;
CREATE POLICY "Public Delete product-images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images');

-- 2. Add product_id and type to licenses table
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS product_id TEXT DEFAULT 'el-spot';
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'permanent';

-- 3. Create device_pairings table
CREATE TABLE IF NOT EXISTS public.device_pairings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_device_id TEXT NOT NULL,
    secondary_device_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.device_pairings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public pairings read" ON public.device_pairings;
CREATE POLICY "Public pairings read" ON public.device_pairings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public pairings insert" ON public.device_pairings;
CREATE POLICY "Public pairings insert" ON public.device_pairings FOR INSERT WITH CHECK (true);

-- 4. Create RPC Functions
CREATE OR REPLACE FUNCTION public.auto_register_device(
    p_device_id text,
    p_product_id text DEFAULT 'el-spot',
    p_client_name text DEFAULT ''
) RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.heartbeat_device(
    p_device_id text,
    p_product_id text DEFAULT 'el-spot',
    p_client_name text DEFAULT ''
) RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_license_status(
    p_device_id text,
    p_product_id text DEFAULT 'el-spot'
) RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('is_active', true, 'type', 'permanent');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
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
        print("Executing setup SQL for storage, RPCs, and licenses columns...")
        await conn.execute(SQL_SETUP)
        print("Setup SQL executed successfully!")
        await conn.close()
    except Exception as e:
        print("Error executing setup:", e)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
