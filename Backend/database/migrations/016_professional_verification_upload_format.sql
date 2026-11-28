BEGIN;

-- =====================================================
-- SKILVIA
-- MIGRATION 016
-- PROFESSIONAL VERIFICATION UPLOAD FILE FORMAT
-- =====================================================

ALTER TABLE professional_verification_upload_sessions
ADD COLUMN file_format TEXT;


-- =====================================================
-- ALLOWED FILE FORMATS
-- =====================================================

ALTER TABLE professional_verification_upload_sessions
ADD CONSTRAINT professional_verification_upload_sessions_file_format_check
CHECK (
    file_format IS NULL
    OR file_format IN (
        'jpg',
        'jpeg',
        'png',
        'webp',
        'pdf'
    )
);


-- =====================================================
-- FILE FORMAT AND CLOUDINARY RESOURCE TYPE VALIDATION
-- =====================================================

ALTER TABLE professional_verification_upload_sessions
ADD CONSTRAINT professional_verification_upload_sessions_resource_format_check
CHECK (
    file_format IS NULL
    OR (
        file_format = 'pdf'
        AND cloudinary_resource_type = 'raw'
    )
    OR (
        file_format IN ('jpg', 'jpeg', 'png', 'webp')
        AND cloudinary_resource_type = 'image'
    )
);


-- =====================================================
-- INVALIDATE OUTSTANDING UPLOAD SESSIONS
-- =====================================================

-- Existing unconsumed sessions were created before this
-- file-format validation was introduced.
UPDATE professional_verification_upload_sessions
SET expires_at = NOW()
WHERE consumed_at IS NULL;


-- =====================================================
-- COMPLETE
-- =====================================================

COMMIT;