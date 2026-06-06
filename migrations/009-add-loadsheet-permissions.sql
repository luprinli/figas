-- Add loadsheet permissions to the PBAC catalog
-- These were referenced in route files but never added to the seed.

INSERT INTO permissions (slug, name, description, resource, action)
VALUES
    ('loadsheet:view', 'View Loadsheets', 'Can view flight loadsheets', 'loadsheet', 'view'),
    ('loadsheet:edit', 'Edit Loadsheets', 'Can create and modify flight loadsheets', 'loadsheet', 'edit')
ON CONFLICT (slug) DO NOTHING;

-- Assign to the operations role (which already has all flight management permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'operations'
  AND p.slug IN ('loadsheet:view', 'loadsheet:edit')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Assign to the admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
  AND p.slug IN ('loadsheet:view', 'loadsheet:edit')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
