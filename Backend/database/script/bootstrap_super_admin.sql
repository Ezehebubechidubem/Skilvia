
BEGIN;

DO $$
DECLARE
  admin_email TEXT := LOWER('REPLACE_WITH_YOUR_ADMIN_EMAIL');
  target_admin_id UUID;
  existing_super_admin UUID;
BEGIN

  -- ===============================================
  -- 1. CHECK THAT THE EMAIL WAS CONFIGURED
  -- ===============================================

  IF admin_email = 'replace_with_your_admin_email' THEN
    RAISE EXCEPTION
      'Replace the placeholder with your registered administrator email.';
  END IF;


  -- ===============================================
  -- 2. FIND THE EXISTING ADMINISTRATOR
  -- ===============================================

  SELECT id
  INTO target_admin_id
  FROM users
  WHERE LOWER(email) = admin_email
    AND role = 'admin'
    AND account_status = 'active'
  FOR UPDATE;

  IF target_admin_id IS NULL THEN
    RAISE EXCEPTION
      'No active administrator account was found for the supplied email.';
  END IF;


  -- ===============================================
  -- 3. CHECK EXISTING SUPER ADMIN
  -- ===============================================

  SELECT id
  INTO existing_super_admin
  FROM users
  WHERE role = 'admin'
    AND admin_type = 'super_admin'
  LIMIT 1;

  IF existing_super_admin IS NOT NULL
     AND existing_super_admin <> target_admin_id THEN

    RAISE EXCEPTION
      'A different super administrator already exists. Bootstrap cancelled.';

  END IF;


  -- ===============================================
  -- 4. PROMOTE THE SELECTED ADMINISTRATOR
  -- ===============================================

  UPDATE users
  SET
    admin_type = 'super_admin',
    updated_at = NOW()
  WHERE id = target_admin_id
    AND role = 'admin';

  RAISE NOTICE
    'Super administrator successfully established. User ID: %',
    target_admin_id;

END $$;

COMMIT;
