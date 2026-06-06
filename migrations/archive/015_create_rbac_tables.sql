-- Migration 015: Create PBAC tables
-- Creates roles, permissions, role_permissions, user_roles, and audit_log tables
-- Column names match prisma/schema.prisma and app/utils/permissions.server.ts

BEGIN;

-- 1. roles table
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

-- 2. permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(resource, action)
);

-- 3. role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- 4. user_roles junction table (replaces the single role column on users)
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

-- 5. audit_log table (matches prisma/schema.prisma audit_log model)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_roles_hierarchy ON roles(hierarchy_level);

-- Seed default roles (matching existing UserRole enum)
INSERT INTO roles (slug, name, description, hierarchy_level, is_system) VALUES
    ('admin', 'Admin', 'Full system access with all permissions', 100, true),
    ('operations', 'Operations', 'Flight operations and scheduling management', 80, true),
    ('finance', 'Finance', 'Financial management including invoices and payments', 70, true),
    ('checkin', 'Check-in', 'Check-in counter operations', 60, true),
    ('pilot', 'Pilot', 'Flight crew with access to flight manifests and schedules', 50, true),
    ('engineer', 'Engineer', 'Aircraft maintenance and airframe hour tracking', 40, true),
    ('passenger', 'Passenger', 'Self-service booking and itinerary access', 10, true)
ON CONFLICT (slug) DO NOTHING;

-- Seed permissions
INSERT INTO permissions (resource, action, description) VALUES
    -- Bookings
    ('bookings', 'create', 'Create new bookings'),
    ('bookings', 'read', 'View booking details'),
    ('bookings', 'update', 'Modify existing bookings'),
    ('bookings', 'cancel', 'Cancel bookings'),
    ('bookings', 'list', 'List/search bookings'),
    ('bookings', 'assign-seats', 'Assign seats to passengers'),
    ('bookings', 'manage-passengers', 'Add/remove passengers'),
    ('bookings', 'manage-freight', 'Manage freight on bookings'),
    -- Flights
    ('flights', 'create', 'Create new flights'),
    ('flights', 'read', 'View flight details'),
    ('flights', 'update', 'Modify flight details'),
    ('flights', 'cancel', 'Cancel flights'),
    ('flights', 'list', 'List/search flights'),
    ('flights', 'update-status', 'Update flight status (board/depart/arrive)'),
    ('flights', 'manage-manifest', 'Manage flight manifests'),
    -- Schedules
    ('schedules', 'create', 'Create schedules'),
    ('schedules', 'read', 'View schedule details'),
    ('schedules', 'update', 'Modify schedules'),
    ('schedules', 'approve', 'Approve schedules'),
    ('schedules', 'publish', 'Publish schedules'),
    ('schedules', 'revise', 'Revise schedules'),
    ('schedules', 'cancel', 'Cancel schedules'),
    ('schedules', 'assign-pilot', 'Assign pilots to schedule flights'),
    ('schedules', 'generate-loadsheets', 'Generate loadsheets'),
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

-- Assign permissions to roles based on hierarchy
-- ADMIN gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- OPERATIONS permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'operations'
AND p.resource IN ('bookings', 'flights', 'schedules', 'checkin')
AND p.action NOT IN ('collect-payment')
ON CONFLICT DO NOTHING;

-- FINANCE permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'finance'
AND (
    (p.resource = 'bookings' AND p.action IN ('read', 'list'))
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
    (p.resource = 'bookings' AND p.action IN ('read', 'list'))
    OR (p.resource = 'checkin')
    OR (p.resource = 'flights' AND p.action IN ('read', 'list'))
)
ON CONFLICT DO NOTHING;

-- PILOT permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'pilot'
AND (
    (p.resource = 'flights' AND p.action IN ('read', 'list', 'manage-manifest'))
    OR (p.resource = 'schedules' AND p.action IN ('read'))
    OR (p.resource = 'bookings' AND p.action IN ('read', 'list'))
)
ON CONFLICT DO NOTHING;

-- ENGINEER permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'engineer'
AND (
    (p.resource = 'maintenance')
    OR (p.resource = 'flights' AND p.action IN ('read', 'list'))
)
ON CONFLICT DO NOTHING;

-- PASSENGER permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'passenger'
AND (
    (p.resource = 'bookings' AND p.action IN ('read', 'list', 'cancel'))
    OR (p.resource = 'flights' AND p.action IN ('read'))
)
ON CONFLICT DO NOTHING;

COMMIT;
