CREATE TABLE IF NOT EXISTS outreach_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- Can be null for system logs
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_logs_created_at ON outreach_logs(created_at DESC);



