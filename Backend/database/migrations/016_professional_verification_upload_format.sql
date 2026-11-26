
BEGIN;

ALTER TABLE professional_verification_upload_sessions
ADD COLUMN file_format TEXT;

ALTER TABLE professional_verification_upload_sessions
ADD CONSTRAINT professional_verification_upload_sessions_file_format_check
CHECK (
  file_format IS NULL
  OR file_format IN (
    'jpg',
    'jpeg',
    'png',
    'webp',
    'pdf'
  )
);

ALTER TABLE professional_verification_upload_sessions
ADD CONSTRAINT professional_verification_upload_sessions_resource_format_check
CHECK (
  file_format IS NULL
  OR (
    file_format = 'pdf'
    AND resource_type = 'raw'
  )
  OR (
    file_format IN ('jpg', 'jpeg', 'png', 'webp')
    AND resource_type = 'image'
  )
);

-- Invalidate outstanding sessions created before this change.
-- Their original requests were designed for direct Cloudinary uploads.
UPDATE professional_verification_upload_sessions
SET expires_at = NOW()
WHERE consumed_at IS NULL;

COMMIT;
