ALTER TABLE leadbot.users
    ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES leadbot.users(id);
