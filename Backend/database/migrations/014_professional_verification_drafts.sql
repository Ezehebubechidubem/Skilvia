
BEGIN;

-- Replace the previous application status and review-state constraints.
-- This allows draft applications without weakening review requirements.
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
          AND (
              pg_get_constraintdef(oid) ILIKE '%status%'
              OR pg_get_constraintdef(oid) ILIKE '%reviewed_at%'
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE professional_verification_applications DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END;
$$;

-- Draft applications can be edited before submission.
-- Pending applications are locked for admin review.
ALTER TABLE professional_verification_applications
ADD CONSTRAINT professional_verification_applications_status_check
CHECK (
    status IN (
        'draft',
        'pending',
        'approved',
        'rejected',
        'changes_requested'
    )
);

-- Draft and pending applications must not have review timestamps.
-- Every reviewed application must have a review timestamp.
ALTER TABLE professional_verification_applications
ADD CONSTRAINT professional_verification_applications_review_state_check
CHECK (
    (
        status IN ('draft', 'pending')
        AND reviewed_at IS NULL
    )
    OR
    (
        status IN ('approved', 'rejected', 'changes_requested')
        AND reviewed_at IS NOT NULL
    )
);

-- Only one draft application per professional.
CREATE UNIQUE INDEX IF NOT EXISTS
    idx_professional_verification_one_draft_per_profile
ON professional_verification_applications (
    professional_profile_id
)
WHERE status = 'draft';

COMMENT ON CONSTRAINT
    professional_verification_applications_status_check
ON professional_verification_applications IS
'Permitted professional verification application states.';

COMMENT ON CONSTRAINT
    professional_verification_applications_review_state_check
ON professional_verification_applications IS
'Draft and pending applications are unreviewed; reviewed states require reviewed_at.';

COMMIT;
