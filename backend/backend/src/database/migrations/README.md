# Database Migrations

This directory contains SQL migration files for the Telegram Lead Scanner database schema.

## Tables Created

### 1. user_config
Stores user configurations for the lead detection system.

**Fields:**
- `id` - Primary key
- `user_id` - UUID reference to user (unique)
- `openrouter_api_key` - Encrypted API key for OpenRouter
- `lead_prompt` - User-defined lead criteria
- `telegram_channel_id` - Target Telegram channel
- `telegram_min_confidence` - Min confidence to post lead to Telegram (0-100)
- `is_active` - Whether detection is active
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### 2. detected_leads
Stores leads found by AI analysis.

**Fields:**
- `id` - Primary key
- `message_id` - Reference to messages table
- `user_id` - User who owns this lead
- `confidence_score` - AI confidence (0-100)
- `reasoning` - AI explanation
- `matched_criteria` - JSON array of matched criteria
- `posted_to_telegram` - Posted status
- `is_contacted` - Contact status
- `notes` - User notes
- `detected_at` - Detection timestamp

### 3. api_usage
Tracks OpenRouter API usage and costs.

**Fields:**
- `id` - Primary key
- `user_id` - User who made the call
- `cost` - Cost in USD
- `input_tokens` - Input token count
- `output_tokens` - Output token count
- `model_used` - AI model name
- `timestamp` - Usage timestamp

### 4. processing_logs
Logs hourly job executions.

**Fields:**
- `id` - Primary key
- `user_id` - User whose job ran
- `messages_fetched` - Total messages fetched
- `messages_analyzed` - Messages analyzed
- `messages_skipped` - Messages skipped
- `leads_found` - Leads detected
- `processing_duration_ms` - Processing time
- `errors` - Error messages array
- `timestamp` - Execution timestamp

## Running Migrations

### Via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run each migration file in order:
   - `001_create_user_config.sql`
   - `002_create_detected_leads.sql`
   - `003_create_api_usage.sql`
   - `004_create_processing_logs.sql`

### Via Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Via psql

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[password]@[host]:[port]/postgres"

# Run each migration
\i 001_create_user_config.sql
\i 002_create_detected_leads.sql
\i 003_create_api_usage.sql
\i 004_create_processing_logs.sql
```

## Verification

After running migrations, verify tables were created:

```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_config', 'detected_leads', 'api_usage', 'processing_logs');

-- Check user_config structure
\d user_config

-- Check detected_leads structure
\d detected_leads

-- Check api_usage structure
\d api_usage

-- Check processing_logs structure
\d processing_logs
```

## Row Level Security (RLS)

Consider adding RLS policies for security:

```sql
-- Enable RLS on all tables
ALTER TABLE user_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;

-- Example policy for user_config (users can only see their own config)
CREATE POLICY "Users can view their own config"
  ON user_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
  ON user_config FOR UPDATE
  USING (auth.uid() = user_id);

-- Similar policies for other tables...
```

## Notes

- All timestamps use `TIMESTAMPTZ` for proper timezone handling
- Foreign keys are set with `ON DELETE CASCADE` where appropriate
- Indexes are created for common query patterns
- Check constraints ensure data integrity
- Comments are added for documentation

