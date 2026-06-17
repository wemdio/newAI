-- 034_add_analysis_enabled_flag.sql
-- Global kill-switch for the realtime lead-analysis scanner.
-- Admins toggle this via POST /api/scanner/toggle. While the value is false,
-- realtimeScanner.processBatch skips ALL AI analysis (zero API cost) without
-- stopping the container, so it survives Timeweb pause glitches and restarts.
INSERT INTO public.system_config (key, value, updated_by, updated_at)
VALUES ('analysis_enabled', to_jsonb(TRUE), 'system', NOW())
ON CONFLICT (key) DO NOTHING;
