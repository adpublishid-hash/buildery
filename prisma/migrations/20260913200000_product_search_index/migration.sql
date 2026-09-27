-- Trigram index for storefront product search.
--
-- The catalogue is searched with ILIKE '%term%', which Postgres can only answer
-- with a sequential scan over the workspace's products. pg_trgm turns that into
-- an index lookup.
--
-- Creating the extension needs privileges the application role may not have, so
-- a refusal is logged and skipped rather than failing the deploy: without the
-- index the search still works, only slower.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
    RAISE NOTICE 'pg_trgm unavailable; product search stays on a sequential scan';
    RETURN;
  END;

  CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
    ON "Product" USING GIN ("name" gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS "Product_description_trgm_idx"
    ON "Product" USING GIN ("description" gin_trgm_ops);
END $$;
