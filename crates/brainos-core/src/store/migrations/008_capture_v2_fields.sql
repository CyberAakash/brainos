-- Migration 008: Capture System v2 fields
-- Adds capture_mode (session|range|post-hoc), updated date, and session_ref

ALTER TABLE captures ADD COLUMN capture_mode TEXT;
ALTER TABLE captures ADD COLUMN updated TEXT;
ALTER TABLE captures ADD COLUMN session_ref TEXT;
