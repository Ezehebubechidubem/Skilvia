
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM professional_verification_applications
    WHERE status = 'changes_requested'
  ) THEN
    RAISE EXCEPTION
      'Migration stopped: applications with changes_requested status exist. Review these records before applying this migration.';
  END IF;
END;
$$;

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT
      conname
    FROM pg_constraint
    WHERE conrelid =
      'professional_verification_applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE professional_verification_applications DROP CONSTRAINT %I',
      constraint_record.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE professional_verification_applications
ADD CONSTRAINT professional_verification_applications_status_check
CHECK (
  status IN (
    'draft',
    'pending',
    'approved',
    'rejected'
  )
);

ALTER TABLE professional_verification_applications
ADD CONSTRAINT professional_verification_applications_review_state_check
CHECK (
  (
    status IN ('draft', 'pending')
    AND reviewed_at IS NULL
  )
  OR
  (
    status IN ('approved', 'rejected')
    AND reviewed_at IS NOT NULL
  )
);

COMMIT;
