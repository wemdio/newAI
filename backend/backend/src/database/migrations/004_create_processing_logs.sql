-- Create processing_logs table
-- Logs hourly job executions for monitoring

CREATE TABLE IF NOT EXISTS processing_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  messages_fetched INT NOT NULL CHECK (messages_fetched >= 0),
  messages_analyzed INT NOT NULL CHECK (messages_analyzed >= 0),
  messages_skipped INT NOT NULL CHECK (messages_skipped >= 0),
  leads_found INT NOT NULL CHECK (leads_found >= 0),
  processing_duration_ms INT NOT NULL CHECK (processing_duration_ms >= 0),
  errors TEXT[],
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for monitoring queries
CREATE INDEX IF NOT EXISTS idx_processing_logs_user ON processing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_time ON processing_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_processing_logs_user_time ON processing_logs(user_id, timestamp DESC);

-- Create index for error monitoring
CREATE INDEX IF NOT EXISTS idx_processing_logs_errors ON processing_logs(user_id) WHERE errors IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE processing_logs IS 'Hourly job execution logs for monitoring and debugging';
COMMENT ON COLUMN processing_logs.user_id IS 'User whose job was executed';
COMMENT ON COLUMN processing_logs.messages_fetched IS 'Total messages fetched from database';
COMMENT ON COLUMN processing_logs.messages_analyzed IS 'Messages sent to AI for analysis';
COMMENT ON COLUMN processing_logs.messages_skipped IS 'Messages skipped (pre-filtered or budget limit)';
COMMENT ON COLUMN processing_logs.leads_found IS 'Number of leads detected in this run';
COMMENT ON COLUMN processing_logs.processing_duration_ms IS 'Total processing time in milliseconds';
COMMENT ON COLUMN processing_logs.errors IS 'Array of error messages if any occurred';

