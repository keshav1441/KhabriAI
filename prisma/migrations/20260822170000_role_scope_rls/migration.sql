-- Role-based scope. An officer is either HQ (statewide) or SHO (bound to one
-- district). Enforcement is Postgres row-level security keyed by a transaction
-- setting (app.district_id) that lib/db.ts withScope() applies; when the setting
-- is absent (scripts, migrations, HQ users) the policies allow everything.
ALTER TABLE "KhabriUser" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'HQ';
ALTER TABLE "KhabriUser" ADD COLUMN "districtId" INTEGER;

CREATE OR REPLACE FUNCTION app_scope_district() RETURNS integer
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.district_id', true), '')::integer $$;

ALTER TABLE "CaseMaster" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaseMaster" FORCE ROW LEVEL SECURITY;
CREATE POLICY case_scope ON "CaseMaster"
  USING (app_scope_district() IS NULL
         OR "PoliceStationID" IN (SELECT "UnitID" FROM "Unit" WHERE "DistrictID" = app_scope_district()));

-- Child tables follow their case: visible only if the case is visible.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Accused','Victim','ComplainantDetails','ArrestSurrender','ChargesheetDetails','ActSectionAssociation'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY case_scope ON %I USING (app_scope_district() IS NULL OR EXISTS (SELECT 1 FROM "CaseMaster" cm WHERE cm."CaseMasterID" = %I."CaseMasterID"))', t, t);
  END LOOP;
END $$;
