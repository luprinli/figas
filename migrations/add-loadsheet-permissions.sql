-- Add loadsheet-specific permissions for PBAC authorization model.
-- loadsheet:view — view loadsheet data (all ops users)
-- loadsheet:edit — perform in-flight actions: enter ATD/ATA, toggle boarding, finalize

INSERT INTO permissions (resource, action, description)
VALUES
  ('loadsheet', 'view', 'View loadsheet data for flights'),
  ('loadsheet', 'edit', 'Perform in-flight actions on loadsheet: enter ATD/ATA, toggle boarding, finalize')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant loadsheet:view to all role slugs that have schedule:view or flight:view
-- Grant loadsheet:edit to role slugs that have schedule:edit
DO $$
DECLARE
  view_perm_id INT;
  edit_perm_id INT;
BEGIN
  SELECT id INTO view_perm_id FROM permissions WHERE resource = 'loadsheet' AND action = 'view';
  SELECT id INTO edit_perm_id FROM permissions WHERE resource = 'loadsheet' AND action = 'edit';

  -- Grant view to all existing roles
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, view_perm_id
  FROM roles r
  WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = view_perm_id
  );

  -- Grant edit to roles that already have schedule:edit
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rp.role_id, edit_perm_id
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  WHERE p.resource = 'schedule' AND p.action = 'edit'
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions ex
      WHERE ex.role_id = rp.role_id AND ex.permission_id = edit_perm_id
    );

END $$;
