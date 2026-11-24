BEGIN;

-- =====================================================
-- PROFESSIONAL VERIFICATION
-- MIGRATION: 012
-- =====================================================


-- =====================================================
-- ADD VERIFICATION STATUS TO PROFESSIONAL PROFILES
-- =====================================================

ALTER TABLE professional_profiles
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20)
NOT NULL DEFAULT 'not_submitted';

ALTER TABLE professional_profiles
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE professional_profiles
ADD CONSTRAINT professional_profiles_verification_status_check
CHECK (
  verification_status IN (
    'not_submitted',
    'pending',
    'approved',
    'rejected'
  )
);

CREATE INDEX IF NOT EXISTS
  professional_profiles_verification_status_idx
ON professional_profiles (
  verification_status
);


-- =====================================================
-- VERIFICATION APPLICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS professional_verification_applications (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  professional_profile_id UUID NOT NULL
    REFERENCES professional_profiles(id)
    ON DELETE RESTRICT,

  submitted_by UUID NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Professional's submitted identity details
  legal_full_name VARCHAR(150) NOT NULL,

  date_of_birth DATE,

  country VARCHAR(100) NOT NULL DEFAULT 'Nigeria',

  state VARCHAR(100),

  city VARCHAR(100),

  -- Review information
  reviewed_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  reviewed_at TIMESTAMPTZ,

  rejection_reason TEXT,

  admin_notes TEXT,

  -- Submission timestamps
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT professional_verification_status_check
  CHECK (
    status IN (
      'pending',
      'approved',
      'rejected',
      'changes_requested'
    )
  ),

  CONSTRAINT professional_verification_name_check
  CHECK (
    LENGTH(TRIM(legal_full_name)) >= 3
  ),

  CONSTRAINT professional_verification_review_check
  CHECK (
    (
      status = 'pending'
      AND reviewed_at IS NULL
    )
    OR
    (
      status <> 'pending'
      AND reviewed_at IS NOT NULL
    )
  )

);


-- =====================================================
-- VERIFICATION DOCUMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS professional_verification_documents (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  application_id UUID NOT NULL
    REFERENCES professional_verification_applications(id)
    ON DELETE RESTRICT,

  document_type VARCHAR(40) NOT NULL,

  -- Store Cloudinary identifiers, not public document URLs.
  cloudinary_public_id VARCHAR(255) NOT NULL,

  cloudinary_resource_type VARCHAR(30) NOT NULL DEFAULT 'image',

  file_format VARCHAR(20),

  file_size_bytes BIGINT NOT NULL,

  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT verification_document_type_check
  CHECK (
    document_type IN (
      'national_id',
      'drivers_license',
      'international_passport',
      'voters_card',
      'proof_of_address',
      'business_registration',
      'selfie'
    )
  ),

  CONSTRAINT verification_document_resource_type_check
  CHECK (
    cloudinary_resource_type IN (
      'image',
      'raw',
      'video'
    )
  ),

  CONSTRAINT verification_document_size_check
  CHECK (
    file_size_bytes > 0
    AND file_size_bytes <= 10485760
  )

);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS
  professional_verification_applications_profile_idx
ON professional_verification_applications (
  professional_profile_id,
  submitted_at DESC
);

CREATE INDEX IF NOT EXISTS
  professional_verification_applications_status_idx
ON professional_verification_applications (
  status,
  submitted_at DESC
);

CREATE INDEX IF NOT EXISTS
  professional_verification_applications_reviewer_idx
ON professional_verification_applications (
  reviewed_by,
  reviewed_at DESC
);

CREATE INDEX IF NOT EXISTS
  professional_verification_documents_application_idx
ON professional_verification_documents (
  application_id
);


-- =====================================================
-- PREVENT MULTIPLE PENDING APPLICATIONS
-- FOR THE SAME PROFESSIONAL
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  professional_one_pending_verification_idx
ON professional_verification_applications (
  professional_profile_id
)
WHERE status = 'pending';


-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION
  update_professional_verification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS
  professional_verification_updated_at_trigger
ON professional_verification_applications;


CREATE TRIGGER
  professional_verification_updated_at_trigger
BEFORE UPDATE ON professional_verification_applications
FOR EACH ROW
EXECUTE FUNCTION
  update_professional_verification_updated_at();


-- =====================================================
-- COMPLETE
-- =====================================================

COMMIT;