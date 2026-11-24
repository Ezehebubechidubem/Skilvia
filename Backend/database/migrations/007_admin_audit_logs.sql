
-- =====================================================
-- SKILVIA ADMIN AUDIT LOGS
-- Migration: 007_admin_audit_logs.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    actor_user_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    action VARCHAR(100) NOT NULL,

    entity_type VARCHAR(100) NOT NULL,

    entity_id VARCHAR(150),

    before_data JSONB,

    after_data JSONB,

    ip_address INET,

    user_agent VARCHAR(1000),

    request_id VARCHAR(150),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT admin_audit_action_check
        CHECK (char_length(trim(action)) >= 2),

    CONSTRAINT admin_audit_entity_type_check
        CHECK (char_length(trim(entity_type)) >= 2)
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor
ON admin_audit_logs (
    actor_user_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
ON admin_audit_logs (
    entity_type,
    entity_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_action
ON admin_audit_logs (
    action,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
ON admin_audit_logs (
    created_at DESC
);


-- =====================================================
-- PREVENT ORDINARY UPDATE AND DELETE OPERATIONS
-- =====================================================

CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Admin audit logs cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS
    trigger_prevent_admin_audit_update
ON admin_audit_logs;

CREATE TRIGGER trigger_prevent_admin_audit_update
BEFORE UPDATE ON admin_audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_admin_audit_log_mutation();


DROP TRIGGER IF EXISTS
    trigger_prevent_admin_audit_delete
ON admin_audit_logs;

CREATE TRIGGER trigger_prevent_admin_audit_delete
BEFORE DELETE ON admin_audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_admin_audit_log_mutation();
