
-- =====================================================
-- SKILVIA SERVICE CATEGORIES AND PROFESSIONAL SERVICES
-- Migration: 006_service_categories.sql
-- =====================================================


-- =====================================================
-- 1. SERVICE CATEGORIES
-- =====================================================

CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    parent_id UUID DEFAULT NULL,

    name VARCHAR(100) NOT NULL,

    slug VARCHAR(120) NOT NULL UNIQUE,

    description TEXT,

    icon VARCHAR(100),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT service_categories_parent_fkey
        FOREIGN KEY (parent_id)
        REFERENCES service_categories(id)
        ON DELETE RESTRICT,

    CONSTRAINT service_categories_name_check
        CHECK (char_length(trim(name)) >= 2),

    CONSTRAINT service_categories_slug_check
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

    CONSTRAINT service_categories_sort_order_check
        CHECK (sort_order >= 0)
);


-- =====================================================
-- 2. CATEGORY INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_service_categories_parent
ON service_categories(parent_id);

CREATE INDEX IF NOT EXISTS idx_service_categories_active
ON service_categories(is_active);

CREATE INDEX IF NOT EXISTS idx_service_categories_sort
ON service_categories(sort_order, name);


-- =====================================================
-- 3. PROFESSIONAL SERVICES
-- =====================================================

CREATE TABLE IF NOT EXISTS professional_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    professional_profile_id UUID NOT NULL,

    category_id UUID NOT NULL,

    service_title VARCHAR(150) NOT NULL,

    description TEXT,

    pricing_model VARCHAR(20) NOT NULL DEFAULT 'quote',

    base_price NUMERIC(14, 2),

    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT professional_services_profile_fkey
        FOREIGN KEY (professional_profile_id)
        REFERENCES professional_profiles(id)
        ON DELETE CASCADE,

    CONSTRAINT professional_services_category_fkey
        FOREIGN KEY (category_id)
        REFERENCES service_categories(id)
        ON DELETE RESTRICT,

    CONSTRAINT professional_services_title_check
        CHECK (char_length(trim(service_title)) >= 2),

    CONSTRAINT professional_services_pricing_check
        CHECK (
            pricing_model IN ('fixed', 'hourly', 'quote')
        ),

    CONSTRAINT professional_services_price_check
        CHECK (
            (
                pricing_model = 'quote'
                AND (base_price IS NULL OR base_price >= 0)
            )
            OR
            (
                pricing_model IN ('fixed', 'hourly')
                AND base_price > 0
            )
        ),

    CONSTRAINT professional_services_currency_check
        CHECK (currency ~ '^[A-Z]{3}$')
);


-- =====================================================
-- 4. PROFESSIONAL SERVICE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_professional_services_profile
ON professional_services(professional_profile_id);

CREATE INDEX IF NOT EXISTS idx_professional_services_category
ON professional_services(category_id);

CREATE INDEX IF NOT EXISTS idx_professional_services_active
ON professional_services(is_active);

CREATE INDEX IF NOT EXISTS idx_professional_services_category_active
ON professional_services(category_id, is_active);


-- Prevent duplicate service titles for the same
-- professional within the same category.

CREATE UNIQUE INDEX IF NOT EXISTS
idx_professional_services_unique_title
ON professional_services (
    professional_profile_id,
    category_id,
    LOWER(service_title)
);


-- =====================================================
-- 5. UPDATED_AT TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS
trigger_service_categories_updated_at
ON service_categories;

CREATE TRIGGER trigger_service_categories_updated_at
BEFORE UPDATE ON service_categories
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


DROP TRIGGER IF EXISTS
trigger_professional_services_updated_at
ON professional_services;

CREATE TRIGGER trigger_professional_services_updated_at
BEFORE UPDATE ON professional_services
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- 6. INITIAL SERVICE CATEGORIES
-- =====================================================

INSERT INTO service_categories (
    name,
    slug,
    description,
    icon,
    sort_order
)
VALUES
(
    'Electrical Services',
    'electrical-services',
    'Electrical installation, maintenance and repair services.',
    'zap',
    1
),
(
    'Plumbing',
    'plumbing',
    'Water systems, pipe installation and plumbing repairs.',
    'wrench',
    2
),
(
    'Carpentry',
    'carpentry',
    'Furniture making, woodwork and carpentry services.',
    'hammer',
    3
),
(
    'Painting',
    'painting',
    'Residential and commercial painting services.',
    'paintbrush',
    4
),
(
    'Cleaning Services',
    'cleaning-services',
    'Home, office and commercial cleaning services.',
    'sparkles',
    5
),
(
    'Building and Construction',
    'building-construction',
    'Building, renovation and general construction services.',
    'building',
    6
),
(
    'Air Conditioning and Refrigeration',
    'air-conditioning-refrigeration',
    'AC installation, servicing and refrigeration repairs.',
    'snowflake',
    7
),
(
    'Solar and Renewable Energy',
    'solar-renewable-energy',
    'Solar installation, inverter systems and renewable energy solutions.',
    'sun',
    8
),
(
    'CCTV and Security Systems',
    'cctv-security-systems',
    'CCTV installation, access control and security system services.',
    'shield-check',
    9
),
(
    'Automobile Services',
    'automobile-services',
    'Vehicle repairs, maintenance and mechanical services.',
    'car',
    10
),
(
    'Welding and Metal Fabrication',
    'welding-metal-fabrication',
    'Welding, metal fabrication and metalwork services.',
    'anvil',
    11
),
(
    'Interior Design',
    'interior-design',
    'Interior decoration, space planning and design services.',
    'sofa',
    12
),
(
    'Graphics and Digital Design',
    'graphics-digital-design',
    'Graphic design, branding and digital creative services.',
    'palette',
    13
),
(
    'Web and Software Development',
    'web-software-development',
    'Website development, software development and programming.',
    'code',
    14
),
(
    'Moving and Delivery Services',
    'moving-delivery-services',
    'Moving, transportation and delivery services.',
    'truck',
    15
),
(
    'Gardening and Landscaping',
    'gardening-landscaping',
    'Garden maintenance and outdoor landscaping services.',
    'trees',
    16
),
(
    'Laundry Services',
    'laundry-services',
    'Laundry, ironing and garment care services.',
    'shirt',
    17
),
(
    'General Repairs and Maintenance',
    'general-repairs-maintenance',
    'General household and commercial maintenance services.',
    'settings',
    18
)
ON CONFLICT (slug) DO NOTHING;


-- =====================================================
-- END OF MIGRATION 006
-- =====================================================
