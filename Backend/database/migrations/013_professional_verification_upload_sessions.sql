-- =====================================================
-- SKILVIA
-- MIGRATION 013
-- PROFESSIONAL VERIFICATION UPLOAD SESSIONS
-- =====================================================

CREATE TABLE professional_verification_upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    application_id UUID NOT NULL
        REFERENCES professional_verification_applications(id)
        ON DELETE RESTRICT,

    uploaded_by UUID NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    document_type VARCHAR(50) NOT NULL,

    token_hash CHAR(64) NOT NULL UNIQUE,

    cloudinary_public_id VARCHAR(500) NOT NULL UNIQUE,

    cloudinary_resource_type VARCHAR(20) NOT NULL
        DEFAULT 'image',

    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT professional_upload_session_document_type_check
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

    CONSTRAINT professional_upload_session_resource_type_check
        CHECK (
            cloudinary_resource_type IN (
                'image',
                'raw'
            )
        ),

    CONSTRAINT professional_upload_session_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT professional_upload_session_consumption_check
        CHECK (
            consumed_at IS NULL
            OR consumed_at >= created_at
        )
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX professional_upload_sessions_application_idx
ON professional_verification_upload_sessions(application_id);


CREATE INDEX professional_upload_sessions_user_idx
ON professional_verification_upload_sessions(uploaded_by);


CREATE INDEX professional_upload_sessions_expiry_idx
ON professional_verification_upload_sessions(expires_at);


CREATE INDEX professional_upload_sessions_active_idx
ON professional_verification_upload_sessions(expires_at)
WHERE consumed_at IS NULL;


-- =====================================================
-- DOCUMENTATION
-- =====================================================

COMMENT ON TABLE professional_verification_upload_sessions IS
'Tracks short-lived, single-use authorization sessions for professional verification document uploads.';


COMMENT ON COLUMN professional_verification_upload_sessions.token_hash IS
'SHA-256 hash of the one-time upload token. Plaintext tokens must never be stored.';


COMMENT ON COLUMN professional_verification_upload_sessions.cloudinary_public_id IS
'Backend-generated Cloudinary asset identifier for the authorized upload.';


COMMENT ON COLUMN professional_verification_upload_sessions.consumed_at IS
'Timestamp when the upload authorization was successfully consumed. NULL means unused.';