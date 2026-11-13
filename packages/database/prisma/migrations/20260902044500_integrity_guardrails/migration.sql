-- ---------------------------------------------------------------------------
-- Integrity guardrails that the Prisma schema language cannot express.
--
-- 1. Platform staff (organization_id IS NULL) must still have unique emails.
--    The composite unique index in the schema does not cover them because
--    Postgres treats every NULL as distinct.
-- 2. Audit trails are append-only at the database level, not merely by
--    convention, so a bug or a compromised application account cannot rewrite
--    compliance history.
-- 3. Trigram indexes back the global search endpoints.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Platform-staff email uniqueness ---------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "users_platform_email_key"
  ON "users" ("emailNormalized")
  WHERE "organizationId" IS NULL;

-- 2. Append-only audit trails ----------------------------------------------
CREATE OR REPLACE FUNCTION olbos_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_append_only ON "audit_logs";
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION olbos_reject_mutation();

DROP TRIGGER IF EXISTS grade_audits_append_only ON "grade_audits";
CREATE TRIGGER grade_audits_append_only
  BEFORE UPDATE OR DELETE ON "grade_audits"
  FOR EACH ROW EXECUTE FUNCTION olbos_reject_mutation();

-- The triggers are left at their default (ORIGIN) enable state. The
-- application role cannot bypass them; a privileged maintenance role can, by
-- running an erasure or tenant-purge transaction with
-- `SET LOCAL session_replication_role = 'replica'`. That keeps lawful data
-- deletion possible while leaving ordinary application code unable to rewrite
-- an audit trail.

-- 3. Search indexes ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx"
  ON "users" USING gin (("firstName" || ' ' || "lastName") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "employees_name_trgm_idx"
  ON "employees" USING gin (("firstName" || ' ' || "lastName") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "courses_title_trgm_idx"
  ON "courses" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "training_records_course_title_trgm_idx"
  ON "training_records" USING gin ("courseTitle" gin_trgm_ops);
