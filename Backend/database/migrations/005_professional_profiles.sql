
-- =====================================
-- SKILVIA PROFESSIONAL PROFILES
-- Migration: 005
-- =====================================

CREATE TABLE IF NOT EXISTS professional_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE,

    business_name VARCHAR(150),

    professional_title VARCHAR(120),

    bio TEXT,

    years_of_experience INTEGER NOT NULL DEFAULT 0,

    profile_photo_url TEXT,

    cover_photo_url TEXT,

    country VARCHAR(100) NOT NULL DEFAULT 'Nigeria',

    state VARCHAR(100),

    city VARCHAR(100),

    service_area TEXT,

    latitude NUMERIC(10, 7),

    longitude NUMERIC(10, 7),

    availability_status VARCHAR(20)
        NOT NULL DEFAULT 'available',

    profile_status VARCHAR(20)
        NOT NULL DEFAULT 'draft',

    average_rating NUMERIC(3, 2)
        NOT NULL DEFAULT 0,

    total_reviews INTEGER
        NOT NULL DEFAULT 0,

    completed_jobs INTEGER
        NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT professional_profiles_user_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT professional_experience_check
        CHECK (years_of_experience >= 0),

    CONSTRAINT professional_availability_check
        CHECK (
            availability_status IN (
                'available',
                'busy',
                'unavailable'
            )
        ),

    CONSTRAINT professional_profile_status_check
        CHECK (
            profile_status IN (
                'draft',
                'published',
                'suspended'
            )
        ),

    CONSTRAINT professional_rating_check
        CHECK (
            average_rating >= 0
            AND average_rating <= 5
        ),

    CONSTRAINT professional_reviews_check
        CHECK (total_reviews >= 0),

    CONSTRAINT professional_jobs_check
        CHECK (completed_jobs >= 0),

    CONSTRAINT professional_latitude_check
        CHECK (
            latitude IS NULL
            OR latitude BETWEEN -90 AND 90
        ),

    CONSTRAINT professional_longitude_check
        CHECK (
            longitude IS NULL
            OR longitude BETWEEN -180 AND 180
        )
);

-- =====================================
-- PROFESSIONAL PROFILE INDEXES
-- =====================================

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_status
ON professional_profiles(profile_status);

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_availability
ON professional_profiles(availability_status);

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_location
ON professional_profiles(state, city);

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_rating
ON professional_profiles(average_rating DESC);

CREATE INDEX IF NOT EXISTS
idx_professional_profiles_experience
ON professional_profiles(years_of_experience DESC);

-- =====================================
-- AUTOMATIC UPDATED_AT TIMESTAMP
-- =====================================

DROP TRIGGER IF EXISTS
trigger_professional_profiles_updated_at
ON professional_profiles;

CREATE TRIGGER
trigger_professional_profiles_updated_at
BEFORE UPDATE ON professional_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================
-- MIGRATION COMPLETE
-- =====================================
