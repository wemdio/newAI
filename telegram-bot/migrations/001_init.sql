PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL UNIQUE,
    username TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    full_title TEXT NOT NULL,
    emoji TEXT NOT NULL,
    monthly_leads INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_category_state (
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    free_leads_total INTEGER NOT NULL,
    free_leads_used INTEGER NOT NULL DEFAULT 0,
    free_started INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, category_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    grant_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, category_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leads (
    lead_id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    contact TEXT,
    source TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sent_leads (
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    lead_id INTEGER NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (user_id, lead_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS category_state (
    category_id INTEGER PRIMARY KEY,
    last_lead_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    lead_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, category_id, lead_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leads_category_id_lead_id ON leads(category_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_sent_leads_user_category ON sent_leads(user_id, category_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_user_category_state_category ON user_category_state(category_id);
CREATE INDEX IF NOT EXISTS idx_pending_leads_user_category ON pending_leads(user_id, category_id, id);
