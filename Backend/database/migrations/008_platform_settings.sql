
-- =====================================================
-- SKILVIA PLATFORM SETTINGS
-- Migration: 008_platform_settings.sql
-- =====================================================


-- =====================================================
-- PLATFORM SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    setting_key VARCHAR(150) NOT NULL UNIQUE,

    category VARCHAR(100) NOT NULL,

    description VARCHAR(1000),

    is_public BOOLEAN NOT NULL DEFAULT FALSE,

    is_editable BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT platform_setting_key_check
        CHECK (
            setting_key ~ '^[a-z][a-z0-9_.]*$'
        ),

    CONSTRAINT platform_setting_category_check
        CHECK (
            char_length(trim(category)) >= 2
        )
);


-- =====================================================
-- PLATFORM SETTING VERSIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS platform_setting_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    setting_id UUID NOT NULL
        REFERENCES platform_settings(id)
        ON DELETE RESTRICT,

    setting_value JSONB NOT NULL,

    version_number INTEGER NOT NULL,

    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    effective_until TIMESTAMPTZ,

    created_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT platform_setting_version_positive
        CHECK (version_number >= 1),

    CONSTRAINT platform_setting_effective_dates_check
        CHECK (
            effective_until IS NULL
            OR effective_until > effective_from
        ),

    CONSTRAINT platform_setting_version_unique
        UNIQUE (setting_id, version_number)
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_platform_settings_category
ON platform_settings(category);

CREATE INDEX IF NOT EXISTS idx_platform_settings_public
ON platform_settings(is_public);

CREATE INDEX IF NOT EXISTS idx_platform_setting_versions_setting
ON platform_setting_versions(
    setting_id,
    effective_from DESC
);

CREATE INDEX IF NOT EXISTS idx_platform_setting_versions_effective
ON platform_setting_versions(
    setting_id,
    effective_from,
    effective_until
);

CREATE INDEX IF NOT EXISTS idx_platform_setting_versions_created
ON platform_setting_versions(created_at DESC);


-- =====================================================
-- PREVENT OVERLAPPING EFFECTIVE PERIODS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE platform_setting_versions
DROP CONSTRAINT IF EXISTS platform_setting_no_overlapping_periods;

ALTER TABLE platform_setting_versions
ADD CONSTRAINT platform_setting_no_overlapping_periods
EXCLUDE USING GIST (
    setting_id WITH =,
    tstzrange(
        effective_from,
        effective_until,
        '[)'
    ) WITH &&
);


-- =====================================================
-- UPDATED AT TRIGGER
-- =====================================================

DROP TRIGGER IF EXISTS
    trigger_platform_settings_updated_at
ON platform_settings;

CREATE TRIGGER trigger_platform_settings_updated_at
BEFORE UPDATE ON platform_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- INITIAL SETTING DEFINITIONS
-- No business prices are assumed or hardcoded.
-- Administrators configure the actual values later.
-- =====================================================

INSERT INTO platform_settings (
    setting_key,
    category,
    description,
    is_public
)
VALUES

-- PLATFORM IDENTITY

(
    'platform.name',
    'platform',
    'Public name of the platform.',
    TRUE
),

(
    'platform.logo',
    'platform',
    'Public platform logo reference.',
    TRUE
),

(
    'platform.support_email',
    'platform',
    'Official customer support email.',
    TRUE
),

(
    'platform.support_phone',
    'platform',
    'Official customer support phone number.',
    TRUE
),

-- BOOKING CONFIGURATION

(
    'booking.customer_fee',
    'booking',
    'Customer booking fee configuration.',
    FALSE
),

(
    'booking.cancellation_rules',
    'booking',
    'Rules governing booking cancellations.',
    TRUE
),

(
    'booking.confirmation_rules',
    'booking',
    'Rules governing booking confirmation.',
    FALSE
),

-- PROFESSIONAL COMMISSIONS

(
    'commission.professional',
    'commission',
    'Professional platform commission configuration.',
    FALSE
),

-- ADVERTISEMENTS

(
    'advertising.packages',
    'advertising',
    'Available advertisement packages and their prices.',
    TRUE
),

(
    'advertising.placements',
    'advertising',
    'Available advertisement placement configuration.',
    TRUE
),

-- FEATURED LISTINGS

(
    'featured_professional.pricing',
    'featured_professional',
    'Pricing for featured professional listings.',
    TRUE
),

-- SUBSCRIPTIONS

(
    'subscription.packages',
    'subscription',
    'Professional subscription packages and pricing.',
    TRUE
),

-- PROMOTIONS

(
    'promotion.coupons',
    'promotion',
    'Coupon and discount configuration.',
    FALSE
),

-- PLATFORM OPERATION

(
    'platform.maintenance',
    'platform',
    'Platform maintenance mode configuration.',
    TRUE
),

(
    'platform.announcements',
    'platform',
    'Public platform announcements.',
    TRUE
),

(
    'platform.homepage_content',
    'platform',
    'Homepage banners and promotional content.',
    TRUE
)

ON CONFLICT (setting_key) DO NOTHING;
