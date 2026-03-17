PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN provider TEXT;
ALTER TABLE subscriptions ADD COLUMN payment_method_id TEXT;
ALTER TABLE subscriptions ADD COLUMN last_payment_id TEXT;
ALTER TABLE subscriptions ADD COLUMN canceled_at TEXT;

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    payment_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    amount_rub INTEGER NOT NULL,
    currency TEXT NOT NULL,
    confirmation_url TEXT,
    idempotence_key TEXT,
    kind TEXT NOT NULL,
    lead_id INTEGER,
    payment_method_id TEXT,
    cancellation_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    paid_at TEXT,
    applied_at TEXT,
    lead_delivered_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_user_category_status
    ON payments(user_id, category_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_status_created
    ON payments(status, created_at);
