-- Track concurrent edits to unpublished BOM versions.
BEGIN;
ALTER TABLE alsvid_v2.bom_versions ADD COLUMN draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision > 0);
COMMIT;
