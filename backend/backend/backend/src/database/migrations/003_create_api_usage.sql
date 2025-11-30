-- Create api_usage table
-- Tracks OpenRouter API usage and costs

CREATE TABLE IF NOT EXISTS api_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  cost DECIMAL(10, 6) NOT NULL CHECK (cost >= 0),
  input_tokens INT NOT NULL CHECK (input_tokens >= 0),
  output_tokens INT NOT NULL CHECK (output_tokens >= 0),
  model_used TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for usage queries
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_time ON api_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_time ON api_usage(user_id, timestamp DESC);

-- Create index for monthly usage calculations
CREATE INDEX IF NOT EXISTS idx_api_usage_month ON api_usage(user_id, date_trunc('month', timestamp));

-- Add comments for documentation
COMMENT ON TABLE api_usage IS 'OpenRouter API usage tracking for cost management';
COMMENT ON COLUMN api_usage.user_id IS 'User who made the API call';
COMMENT ON COLUMN api_usage.cost IS 'Cost in USD for this API call';
COMMENT ON COLUMN api_usage.input_tokens IS 'Number of input tokens used';
COMMENT ON COLUMN api_usage.output_tokens IS 'Number of output tokens generated';
COMMENT ON COLUMN api_usage.model_used IS 'AI model used (e.g., google/gemini-2.0-flash-001)';

