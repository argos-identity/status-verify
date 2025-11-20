-- Manual migration to rename tables from plural to singular
-- This preserves all existing data

-- Rename incidents table to incident
ALTER TABLE incidents RENAME TO incident;

-- Rename incident_updates table to incident_update
ALTER TABLE incident_updates RENAME TO incident_update;

-- Update foreign key constraint names for consistency
ALTER TABLE incident_update
  DROP CONSTRAINT incident_updates_incident_id_fkey,
  ADD CONSTRAINT incident_update_incident_id_fkey
    FOREIGN KEY (incident_id) REFERENCES incident(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE incident_update
  DROP CONSTRAINT incident_updates_user_id_fkey,
  ADD CONSTRAINT incident_update_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;