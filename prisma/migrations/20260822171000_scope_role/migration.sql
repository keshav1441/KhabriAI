-- The database owner bypasses RLS (rolbypassrls), so scoped transactions switch
-- to this non-owner role with SET LOCAL ROLE before querying (lib/db.ts).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khabri_scoped') THEN
    CREATE ROLE khabri_scoped NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO khabri_scoped;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO khabri_scoped;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO khabri_scoped;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO khabri_scoped;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO khabri_scoped;
GRANT khabri_scoped TO CURRENT_USER;
