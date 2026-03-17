CREATE TABLE IF NOT EXISTS supabase_state (
    id INTEGER PRIMARY KEY,
    last_message_time TEXT,
    last_message_id INTEGER
);
