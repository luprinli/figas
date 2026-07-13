-- ============================================================================
-- FIGAS Airline Booking System – PBAC (Permission-Based Access Control)
-- Consolidated from migration: 015
--
-- This file contains all RBAC/PBAC tables: roles, permissions,
-- role_permissions, user_roles, and audit_log, plus seed data.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. roles – Role definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    hierarchy_level INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_hierarchy ON roles(hierarchy_level);

-- ============================================================================
-- 2. permissions – Permission definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(resource, action)
);

-- ============================================================================
-- 3. role_permissions – Role-permission junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ============================================================================
-- 4. user_roles – User-role junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- ============================================================================
-- 5. audit_log – Audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================================
-- Seed data: Default roles
-- ============================================================================
INSERT INTO roles (slug, name, description, hierarchy_level, is_system) VALUES
    ('admin', 'Admin', 'Full system access with all permissions', 100, true),
    ('operations', 'Operations', 'Flight operations and scheduling management', 80, true),
    ('finance', 'Finance', 'Financial management including invoices and payments', 70, true),
    ('checkin', 'Check-in', 'Check-in counter operations', 60, true),
    ('pilot', 'Pilot', 'Flight crew with access to flight manifests and schedules', 50, true),
    ('engineer', 'Engineer', 'Aircraft maintenance and airframe hour tracking', 40, true),
    ('passenger', 'Passenger', 'Self-service booking and itinerary access', 10, true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- Seed data: Permissions
-- ============================================================================
INSERT INTO permissions (resource, action, description) VALUES
    -- Bookings
    ('booking', 'create', 'Create new bookings'),
    ('booking', 'read', 'View booking details'),
    ('booking', 'update', 'Modify existing bookings'),
    ('booking', 'cancel', 'Cancel bookings'),
    ('booking', 'list', 'List/search bookings'),
    ('booking', 'assign-seats', 'Assign seats to passengers'),
    ('booking', 'manage-passengers', 'Add/remove passengers'),
    ('booking', 'manage-freight', 'Manage freight on bookings'),
    -- Flights
    ('flight', 'create', 'Create new flights'),
    ('flight', 'read', 'View flight details'),
    ('flight', 'update', 'Modify flight details'),
    ('flight', 'cancel', 'Cancel flights'),
    ('flight', 'list', 'List/search flights'),
    ('flight', 'update-status', 'Update flight status (board/depart/arrive)'),
    ('flight', 'manage-manifest', 'Manage flight manifests'),
    -- Schedules
    ('schedule', 'create', 'Create schedules'),
    ('schedule', 'read', 'View schedule details'),
    ('schedule', 'update', 'Modify schedules'),
    ('schedule', 'approve', 'Approve schedules'),
    ('schedule', 'publish', 'Publish schedules'),
    ('schedule', 'revise', 'Revise schedules'),
    ('schedule', 'cancel', 'Cancel schedules'),
    ('schedule', 'assign-pilot', 'Assign pilots to schedule flights'),
    ('schedule', 'generate-loadsheets', 'Generate loadsheets'),
    -- Loadsheets
    ('loadsheet', 'view', 'View flight loadsheets'),
    ('loadsheet', 'edit', 'Create and modify flight loadsheets'),
    -- Users
    ('users', 'create', 'Create user accounts'),
    ('users', 'read', 'View user details'),
    ('users', 'update', 'Modify user accounts'),
    ('users', 'deactivate', 'Deactivate/reactivate users'),
    ('users', 'list', 'List/search users'),
    -- Roles & Permissions
    ('roles', 'create', 'Create custom roles'),
    ('roles', 'read', 'View role details'),
    ('roles', 'update', 'Modify role definitions'),
    ('roles', 'delete', 'Delete custom roles'),
    ('roles', 'assign', 'Assign roles to users'),
    ('roles', 'manage-permissions', 'Manage role-permission assignments'),
    -- Finance
    ('finance', 'read', 'View financial data'),
    ('finance', 'create-invoice', 'Generate invoices'),
    ('finance', 'record-payment', 'Record payments'),
    ('finance', 'process-refund', 'Process refunds'),
    ('finance', 'manage-overdue', 'Manage overdue status'),
    ('finance', 'export', 'Export financial reports'),
    ('finance', 'reconcile', 'Reconcile transactions'),
    -- Settings
    ('settings', 'read', 'View system settings'),
    ('settings', 'update', 'Modify system settings'),
    -- Reports
    ('reports', 'read', 'View reports'),
    ('reports', 'export', 'Export reports'),
    -- Audit
    ('audit', 'read', 'View audit log'),
    ('audit', 'export', 'Export audit log'),
    -- Check-in
    ('checkin', 'process', 'Process passenger check-in'),
    ('checkin', 'collect-payment', 'Collect on-departure payments'),
    ('checkin', 'view-history', 'View check-in history'),
    -- Maintenance
    ('maintenance', 'read', 'View maintenance records'),
    ('maintenance', 'update', 'Update maintenance records'),
    ('maintenance', 'track-hours', 'Track airframe hours'),
    -- Organizations
    ('organizations', 'create', 'Create organizations'),
    ('organizations', 'read', 'View organization details'),
    ('organizations', 'update', 'Modify organizations'),
    ('organizations', 'list', 'List/search organizations')
ON CONFLICT (resource, action) DO NOTHING;

-- ============================================================================
-- Seed data: Role-permission assignments
-- ============================================================================

-- ADMIN gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- OPERATIONS permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'operations'
AND p.resource IN ('booking', 'flight', 'schedule', 'checkin', 'loadsheet')
AND p.action NOT IN ('collect-payment')
ON CONFLICT DO NOTHING;

-- FINANCE permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'finance'
AND (
    (p.resource = 'booking' AND p.action IN ('read', 'list'))
    OR p.resource = 'finance'
    OR (p.resource = 'reports' AND p.action IN ('read', 'export'))
    OR (p.resource = 'audit' AND p.action = 'read')
)
ON CONFLICT DO NOTHING;

-- CHECKIN permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'checkin'
AND (
    (p.resource = 'booking' AND p.action IN ('read', 'list'))
    OR (p.resource = 'checkin')
    OR (p.resource = 'flight' AND p.action IN ('read', 'list'))
)
ON CONFLICT DO NOTHING;

-- PILOT permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'pilot'
AND (
    (p.resource = 'flight' AND p.action IN ('read', 'list', 'manage-manifest'))
    OR (p.resource = 'schedule' AND p.action IN ('read'))
    OR (p.resource = 'booking' AND p.action IN ('read', 'list'))
)
ON CONFLICT DO NOTHING;

-- ENGINEER permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'engineer'
AND (
    (p.resource = 'maintenance')
    OR (p.resource = 'flight' AND p.action IN ('read', 'list'))
)
ON CONFLICT DO NOTHING;

-- PASSENGER permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'passenger'
AND (
    (p.resource = 'booking' AND p.action IN ('read', 'list', 'cancel'))
    OR (p.resource = 'flight' AND p.action IN ('read'))
)
ON CONFLICT DO NOTHING;

COMMIT;
