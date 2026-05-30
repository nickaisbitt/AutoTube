-- Migration 002: Add workspace support
-- Adds workspace columns to projects for multi-workspace organization.

ALTER TABLE projects ADD COLUMN workspace_id TEXT DEFAULT 'default';

ALTER TABLE projects ADD COLUMN workspace_name TEXT DEFAULT 'Default';

CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
