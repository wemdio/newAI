from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Iterable, Optional

import aiosqlite

from .constants import CATEGORIES, Category
from .utils import iso_now

_UNSET = object()


class Database:
    def __init__(self, path: str) -> None:
        self.path = path
        self.conn: Optional[aiosqlite.Connection] = None
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        self.conn = await aiosqlite.connect(self.path)
        self.conn.row_factory = aiosqlite.Row

    async def close(self) -> None:
        if self.conn:
            await self.conn.close()

    async def init_db(self) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        migrations_dir = Path(__file__).resolve().parent.parent / "migrations"
        migration_files = sorted(migrations_dir.glob("*.sql"))
        async with self._lock:
            await self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    filename TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            await self.conn.commit()
            for sql_path in migration_files:
                cursor = await self.conn.execute(
                    "SELECT 1 FROM schema_migrations WHERE filename = ?",
                    (sql_path.name,),
                )
                row = await cursor.fetchone()
                if row:
                    continue
                sql = sql_path.read_text(encoding="utf-8")
                await self.conn.executescript(sql)
                await self.conn.execute(
                    "INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)",
                    (sql_path.name, iso_now()),
                )
                await self.conn.commit()
        await self.upsert_categories(CATEGORIES)

    async def upsert_categories(self, categories: Iterable[Category]) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            for category in categories:
                await self.conn.execute(
                    """
                    INSERT INTO categories (id, code, title, full_title, emoji, monthly_leads)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        code=excluded.code,
                        title=excluded.title,
                        full_title=excluded.full_title,
                        emoji=excluded.emoji,
                        monthly_leads=excluded.monthly_leads
                    """,
                    (
                        category.id,
                        category.code,
                        category.title,
                        category.full_title,
                        category.emoji,
                        category.monthly_leads,
                    ),
                )
            await self.conn.commit()

    async def ensure_user(self, telegram_id: int, username: Optional[str]) -> int:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            await self.conn.execute(
                """
                INSERT INTO users (telegram_id, username, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username
                """,
                (telegram_id, username, iso_now()),
            )
            await self.conn.commit()
            cursor = await self.conn.execute(
                "SELECT id FROM users WHERE telegram_id = ?", (telegram_id,)
            )
            row = await cursor.fetchone()
        return int(row[0])

    async def get_user_by_telegram_id(self, telegram_id: int) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
            )
            return await cursor.fetchone()

    async def get_user_by_id(self, user_id: int) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            )
            return await cursor.fetchone()

    async def ensure_user_category_state(
        self, user_id: int, category_id: int, free_total: int
    ) -> aiosqlite.Row:
        if not self.conn:
            raise RuntimeError("Database not connected")
        now = iso_now()
        async with self._lock:
            await self.conn.execute(
                """
                INSERT INTO user_category_state
                    (user_id, category_id, free_leads_total, free_leads_used, free_started, created_at, updated_at)
                VALUES (?, ?, ?, 0, 0, ?, ?)
                ON CONFLICT(user_id, category_id) DO NOTHING
                """,
                (user_id, category_id, free_total, now, now),
            )
            await self.conn.commit()
            cursor = await self.conn.execute(
                "SELECT * FROM user_category_state WHERE user_id = ? AND category_id = ?",
                (user_id, category_id),
            )
            return await cursor.fetchone()

    async def set_free_started(self, user_id: int, category_id: int, value: int = 1) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            await self.conn.execute(
                """
                UPDATE user_category_state
                SET free_started = ?, updated_at = ?
                WHERE user_id = ? AND category_id = ?
                """,
                (value, iso_now(), user_id, category_id),
            )
            await self.conn.commit()

    async def increment_free_leads_used(self, user_id: int, category_id: int, delta: int = 1) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            await self.conn.execute(
                """
                UPDATE user_category_state
                SET free_leads_used = free_leads_used + ?, updated_at = ?
                WHERE user_id = ? AND category_id = ?
                """,
                (delta, iso_now(), user_id, category_id),
            )
            await self.conn.commit()

    async def get_user_category_state(self, user_id: int, category_id: int) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT * FROM user_category_state WHERE user_id = ? AND category_id = ?",
                (user_id, category_id),
            )
            return await cursor.fetchone()

    async def list_user_category_state_ids(self, user_id: int) -> list[int]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT category_id FROM user_category_state WHERE user_id = ?",
                (user_id,),
            )
            rows = await cursor.fetchall()
        return [int(row[0]) for row in rows]

    async def upsert_subscription(
        self,
        user_id: int,
        category_id: int,
        status: str,
        start_date: str,
        end_date: str,
        grant_type: str,
    ) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        now = iso_now()
        async with self._lock:
            await self.conn.execute(
                """
                INSERT INTO subscriptions
                    (user_id, category_id, status, start_date, end_date, grant_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, category_id) DO UPDATE SET
                    status=excluded.status,
                    start_date=excluded.start_date,
                    end_date=excluded.end_date,
                    grant_type=excluded.grant_type,
                    updated_at=excluded.updated_at
                """,
                (user_id, category_id, status, start_date, end_date, grant_type, now, now),
            )
            await self.conn.commit()

    async def get_subscription(self, user_id: int, category_id: int) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT * FROM subscriptions WHERE user_id = ? AND category_id = ?",
                (user_id, category_id),
            )
            return await cursor.fetchone()

    async def list_user_subscriptions(self, user_id: int) -> list[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT s.*, c.title, c.full_title, c.code
                FROM subscriptions s
                JOIN categories c ON c.id = s.category_id
                WHERE s.user_id = ?
                """,
                (user_id,),
            )
            rows = await cursor.fetchall()
        return list(rows)

    async def update_subscription_billing(
        self,
        user_id: int,
        category_id: int,
        auto_renew: Optional[int] = None,
        provider: Optional[str] = None,
        payment_method_id: Optional[str] = None,
        last_payment_id: Optional[str] = None,
        canceled_at: object = _UNSET,
    ) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        fields: list[str] = []
        values: list[object] = []
        if auto_renew is not None:
            fields.append("auto_renew = ?")
            values.append(auto_renew)
        if provider is not None:
            fields.append("provider = ?")
            values.append(provider)
        if payment_method_id is not None:
            fields.append("payment_method_id = ?")
            values.append(payment_method_id)
        if last_payment_id is not None:
            fields.append("last_payment_id = ?")
            values.append(last_payment_id)
        if canceled_at is not _UNSET:
            fields.append("canceled_at = ?")
            values.append(canceled_at)
        if not fields:
            return
        fields.append("updated_at = ?")
        values.append(iso_now())
        values.extend([user_id, category_id])
        sql = f"""
            UPDATE subscriptions
            SET {", ".join(fields)}
            WHERE user_id = ? AND category_id = ?
        """
        async with self._lock:
            await self.conn.execute(sql, tuple(values))
            await self.conn.commit()

    async def create_payment_record(
        self,
        user_id: int,
        category_id: int,
        provider: str,
        payment_id: str,
        status: str,
        amount_rub: int,
        currency: str,
        confirmation_url: Optional[str],
        idempotence_key: str,
        kind: str,
        lead_id: Optional[int] = None,
        payment_method_id: Optional[str] = None,
        cancellation_reason: Optional[str] = None,
    ) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        now = iso_now()
        async with self._lock:
            await self.conn.execute(
                """
                INSERT INTO payments
                    (user_id, category_id, provider, payment_id, status, amount_rub, currency,
                     confirmation_url, idempotence_key, kind, lead_id, payment_method_id,
                     cancellation_reason, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    category_id,
                    provider,
                    payment_id,
                    status,
                    amount_rub,
                    currency,
                    confirmation_url,
                    idempotence_key,
                    kind,
                    lead_id,
                    payment_method_id,
                    cancellation_reason,
                    now,
                    now,
                ),
            )
            await self.conn.commit()

    async def get_payment_record(self, payment_id: str) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT * FROM payments WHERE payment_id = ?",
                (payment_id,),
            )
            return await cursor.fetchone()

    async def update_payment_record(self, payment_id: str, **fields: object) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        if not fields:
            return
        columns: list[str] = []
        values: list[object] = []
        for key, value in fields.items():
            columns.append(f"{key} = ?")
            values.append(value)
        columns.append("updated_at = ?")
        values.append(iso_now())
        values.append(payment_id)
        sql = f"UPDATE payments SET {', '.join(columns)} WHERE payment_id = ?"
        async with self._lock:
            await self.conn.execute(sql, tuple(values))
            await self.conn.commit()

    async def mark_payment_applied(self, payment_id: str) -> bool:
        if not self.conn:
            raise RuntimeError("Database not connected")
        now = iso_now()
        async with self._lock:
            cursor = await self.conn.execute(
                """
                UPDATE payments
                SET applied_at = ?, updated_at = ?
                WHERE payment_id = ? AND applied_at IS NULL
                """,
                (now, now, payment_id),
            )
            await self.conn.commit()
            return cursor.rowcount > 0

    async def mark_payment_lead_delivered(self, payment_id: str) -> bool:
        if not self.conn:
            raise RuntimeError("Database not connected")
        now = iso_now()
        async with self._lock:
            cursor = await self.conn.execute(
                """
                UPDATE payments
                SET lead_delivered_at = ?, updated_at = ?
                WHERE payment_id = ? AND lead_delivered_at IS NULL
                """,
                (now, now, payment_id),
            )
            await self.conn.commit()
            return cursor.rowcount > 0

    async def list_pending_payments(self, limit: int = 200) -> list[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT * FROM payments
                WHERE status IN ('pending', 'waiting_for_capture')
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (limit,),
            )
            rows = await cursor.fetchall()
        return list(rows)

    async def get_latest_pending_payment(
        self,
        user_id: int,
        category_id: int,
        kind: Optional[str] = None,
        lead_id: Optional[int] = None,
    ) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        clauses = ["user_id = ?", "category_id = ?", "status IN ('pending', 'waiting_for_capture')"]
        values: list[object] = [user_id, category_id]
        if kind:
            clauses.append("kind = ?")
            values.append(kind)
        if lead_id is not None:
            clauses.append("lead_id = ?")
            values.append(lead_id)
        where_sql = " AND ".join(clauses)
        async with self._lock:
            cursor = await self.conn.execute(
                f"""
                SELECT * FROM payments
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT 1
                """,
                tuple(values),
            )
            return await cursor.fetchone()

    async def get_recent_pending_payment(
        self,
        user_id: int,
        category_id: int,
        kind: str,
        since_iso: str,
    ) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT * FROM payments
                WHERE user_id = ? AND category_id = ? AND kind = ?
                  AND status IN ('pending', 'waiting_for_capture')
                  AND created_at >= ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_id, category_id, kind, since_iso),
            )
            return await cursor.fetchone()

    async def list_subscriptions_for_renewal(self, before_iso: str) -> list[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT s.*, u.telegram_id
                FROM subscriptions s
                JOIN users u ON u.id = s.user_id
                WHERE s.status = 'active'
                  AND s.auto_renew = 1
                  AND s.payment_method_id IS NOT NULL
                  AND s.end_date <= ?
                """,
                (before_iso,),
            )
            rows = await cursor.fetchall()
        return list(rows)

    async def list_recipients_for_category(self, category_id: int) -> list[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT u.id AS user_id,
                       u.telegram_id,
                       u.username,
                       ucs.free_leads_total,
                       ucs.free_leads_used,
                       ucs.free_started,
                       s.status AS sub_status,
                       s.start_date AS sub_start_date,
                       s.end_date AS sub_end_date,
                       s.grant_type AS sub_grant_type
                FROM user_category_state ucs
                JOIN users u ON u.id = ucs.user_id
                LEFT JOIN subscriptions s
                       ON s.user_id = ucs.user_id AND s.category_id = ucs.category_id
                WHERE ucs.category_id = ?
                """,
                (category_id,),
            )
            rows = await cursor.fetchall()
        return list(rows)

    async def mark_sent_lead(self, user_id: int, category_id: int, lead_id: int) -> bool:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                INSERT OR IGNORE INTO sent_leads (user_id, category_id, lead_id, sent_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, category_id, lead_id, iso_now()),
            )
            await self.conn.commit()
            return cursor.rowcount > 0

    async def was_sent_lead(self, user_id: int, lead_id: int) -> bool:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT 1 FROM sent_leads WHERE user_id = ? AND lead_id = ?",
                (user_id, lead_id),
            )
            row = await cursor.fetchone()
            return row is not None

    async def get_max_sent_lead_id(self, user_id: int, category_id: int) -> int:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT MAX(lead_id) FROM sent_leads WHERE user_id = ? AND category_id = ?",
                (user_id, category_id),
            )
            row = await cursor.fetchone()
            return int(row[0] or 0)

    async def store_leads(self, leads: Iterable[dict]) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            await self.conn.executemany(
                """
                INSERT OR IGNORE INTO leads
                    (lead_id, category_id, text, contact, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        lead["lead_id"],
                        lead["category_id"],
                        lead["text"],
                        lead.get("contact"),
                        lead.get("source"),
                        lead["created_at"],
                    )
                    for lead in leads
                ],
            )
            await self.conn.commit()

    async def get_latest_leads(self, category_id: int, limit: int) -> list[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT * FROM leads
                WHERE category_id = ?
                ORDER BY lead_id DESC
                LIMIT ?
                """,
                (category_id, limit),
            )
            rows = await cursor.fetchall()
        return list(rows)

    async def get_leads_after(self, category_id: int, after_id: int) -> list[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT * FROM leads
                WHERE category_id = ? AND lead_id > ?
                ORDER BY lead_id ASC
                """,
                (category_id, after_id),
            )
            rows = await cursor.fetchall()
        return list(rows)

    async def get_lead_by_id(self, lead_id: int) -> Optional[aiosqlite.Row]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute("SELECT * FROM leads WHERE lead_id = ?", (lead_id,))
            return await cursor.fetchone()

    async def update_category_last_lead_id(self, category_id: int, last_lead_id: int) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            await self.conn.execute(
                """
                INSERT INTO category_state (category_id, last_lead_id, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(category_id) DO UPDATE SET
                    last_lead_id=excluded.last_lead_id,
                    updated_at=excluded.updated_at
                """,
                (category_id, last_lead_id, iso_now()),
            )
            await self.conn.commit()

    async def get_category_last_lead_id(self, category_id: int) -> int:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT last_lead_id FROM category_state WHERE category_id = ?",
                (category_id,),
            )
            row = await cursor.fetchone()
            return int(row[0]) if row else 0

    async def get_supabase_state(self) -> tuple[Optional[str], Optional[int]]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                "SELECT last_message_time, last_message_id FROM supabase_state WHERE id = 1"
            )
            row = await cursor.fetchone()
            if not row:
                return None, None
            return row["last_message_time"], row["last_message_id"]

    async def update_supabase_state(
        self, last_message_time: Optional[str], last_message_id: Optional[int]
    ) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            await self.conn.execute(
                """
                INSERT INTO supabase_state (id, last_message_time, last_message_id)
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    last_message_time=excluded.last_message_time,
                    last_message_id=excluded.last_message_id
                """,
                (last_message_time, last_message_id),
            )
            await self.conn.commit()

    async def clear_pending_leads(self, user_id: int, category_id: int) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            await self.conn.execute(
                "DELETE FROM pending_leads WHERE user_id = ? AND category_id = ?",
                (user_id, category_id),
            )
            await self.conn.commit()

    async def enqueue_pending_leads(
        self, user_id: int, category_id: int, lead_ids: list[int]
    ) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected")
        if not lead_ids:
            return
        async with self._lock:
            await self.conn.executemany(
                """
                INSERT OR IGNORE INTO pending_leads (user_id, category_id, lead_id, created_at)
                VALUES (?, ?, ?, ?)
                """,
                [(user_id, category_id, lead_id, iso_now()) for lead_id in lead_ids],
            )
            await self.conn.commit()

    async def pop_pending_lead(self, user_id: int, category_id: int) -> Optional[int]:
        if not self.conn:
            raise RuntimeError("Database not connected")
        async with self._lock:
            cursor = await self.conn.execute(
                """
                SELECT id, lead_id
                FROM pending_leads
                WHERE user_id = ? AND category_id = ?
                ORDER BY id ASC
                LIMIT 1
                """,
                (user_id, category_id),
            )
            row = await cursor.fetchone()
            if not row:
                return None
            pending_id = int(row["id"])
            lead_id = int(row["lead_id"])
            await self.conn.execute("DELETE FROM pending_leads WHERE id = ?", (pending_id,))
            await self.conn.commit()
            return lead_id
