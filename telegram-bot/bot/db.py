from __future__ import annotations

import logging
import ssl
import uuid
from datetime import datetime, timedelta
from typing import Iterable, Optional, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg

from .constants import CATEGORIES, Category
from .promocodes import calculate_access_until
from .utils import iso_now, now_utc

_UNSET = object()
SCHEMA = "leadbot"
LOCK_TABLE = f"{SCHEMA}.singleton_lock"
LOCK_EXPIRY_SECONDS = 30
LOCK_REFRESH_SECONDS = 10
MISSING_SCHEMA_ERROR = (
    "Leadbot tables are missing in Supabase. Apply the leadbot Postgres migration before starting the bot."
)

log = logging.getLogger(__name__)


class Database:
    def __init__(self, dsn: str, ssl_insecure: bool = False) -> None:
        self.dsn = dsn
        self.ssl_insecure = ssl_insecure
        self.pool: Optional[asyncpg.Pool] = None
        self._lock_instance_id: str = uuid.uuid4().hex[:16]

    async def connect(self) -> None:
        if not self.dsn:
            raise RuntimeError("Supabase Postgres credentials are required for the lead bot")
        dsn, ssl_mode = self._normalize_dsn(self.dsn)
        connect_args = {
            "dsn": dsn,
            "min_size": 1,
            "max_size": 2,
            "command_timeout": 60,
            "statement_cache_size": 0,
            "init": self._init_connection,
        }
        if ssl_mode and ssl_mode != "disable":
            # Match libpq semantics more closely:
            # - require: encrypt, but do not verify certificate chain
            # - verify-ca / verify-full: verify certificates unless insecure override is set
            if self.ssl_insecure or ssl_mode == "require":
                connect_args["ssl"] = self._build_ssl_context()
            else:
                connect_args["ssl"] = True
        self.pool = await asyncpg.create_pool(**connect_args)

    async def try_acquire_singleton_lock(self) -> bool:
        """Claim a row-based lock so only one bot instance polls Telegram.

        Works through PgBouncer/Supavisor in any pooling mode.
        A new instance can take over only if the current holder hasn't
        refreshed within LOCK_EXPIRY_SECONDS.
        """
        pool = self._pool()
        try:
            row = await pool.fetchrow(
                f"""
                INSERT INTO {LOCK_TABLE} (id, instance_id, locked_at)
                VALUES (1, $1, NOW())
                ON CONFLICT (id) DO UPDATE
                    SET instance_id = EXCLUDED.instance_id,
                        locked_at   = NOW()
                    WHERE {LOCK_TABLE}.locked_at < NOW() - INTERVAL '{LOCK_EXPIRY_SECONDS} seconds'
                RETURNING id
                """,
                self._lock_instance_id,
            )
            if row:
                log.info("Singleton lock ACQUIRED (instance %s)", self._lock_instance_id)
                return True
            owner = await pool.fetchrow(f"SELECT instance_id FROM {LOCK_TABLE} WHERE id = 1")
            if owner and owner["instance_id"] == self._lock_instance_id:
                log.info("Singleton lock already held by this instance.")
                return True
            return False
        except Exception as exc:
            log.warning("Failed to acquire singleton lock: %s", exc)
            return False

    async def refresh_singleton_lock(self) -> bool:
        """Refresh the lock timestamp so other instances know we're alive."""
        pool = self._pool()
        try:
            row = await pool.fetchrow(
                f"""
                UPDATE {LOCK_TABLE}
                SET locked_at = NOW()
                WHERE id = 1 AND instance_id = $1
                RETURNING id
                """,
                self._lock_instance_id,
            )
            return row is not None
        except Exception as exc:
            log.warning("Failed to refresh singleton lock: %s", exc)
            return False

    async def release_singleton_lock(self) -> None:
        """Release the lock on graceful shutdown."""
        pool = self._pool()
        try:
            await pool.execute(
                f"DELETE FROM {LOCK_TABLE} WHERE id = 1 AND instance_id = $1",
                self._lock_instance_id,
            )
            log.info("Singleton lock released.")
        except Exception:
            pass

    async def close(self) -> None:
        if self.pool:
            await self.release_singleton_lock()
            await self.pool.close()
            self.pool = None

    async def init_db(self) -> None:
        pool = self._pool()
        try:
            await pool.fetchval(f"SELECT 1 FROM {SCHEMA}.categories LIMIT 1")
        except asyncpg.PostgresError as exc:
            raise RuntimeError(MISSING_SCHEMA_ERROR) from exc
        await self.upsert_categories(CATEGORIES)

    async def upsert_categories(self, categories: Iterable[Category]) -> None:
        pool = self._pool()
        rows = [
            (
                category.id,
                category.code,
                category.title,
                category.full_title,
                category.emoji,
                category.monthly_leads,
            )
            for category in categories
        ]
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.executemany(
                    f"""
                    INSERT INTO {SCHEMA}.categories (id, code, title, full_title, emoji, monthly_leads)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT(id) DO UPDATE SET
                        code = EXCLUDED.code,
                        title = EXCLUDED.title,
                        full_title = EXCLUDED.full_title,
                        emoji = EXCLUDED.emoji,
                        monthly_leads = EXCLUDED.monthly_leads
                    """,
                    rows,
                )

    async def ensure_user(self, telegram_id: int, username: Optional[str]) -> int:
        pool = self._pool()
        row = await pool.fetchrow(
            f"""
            INSERT INTO {SCHEMA}.users (telegram_id, username, created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT(telegram_id) DO UPDATE SET username = EXCLUDED.username
            RETURNING id
            """,
            telegram_id,
            username,
            iso_now(),
        )
        if not row:
            raise RuntimeError("Failed to ensure leadbot user")
        return int(row["id"])

    async def get_user_by_telegram_id(self, telegram_id: int) -> Optional[asyncpg.Record]:
        return await self._pool().fetchrow(
            f"SELECT * FROM {SCHEMA}.users WHERE telegram_id = $1",
            telegram_id,
        )

    async def get_user_by_id(self, user_id: int) -> Optional[asyncpg.Record]:
        return await self._pool().fetchrow(
            f"SELECT * FROM {SCHEMA}.users WHERE id = $1",
            user_id,
        )

    async def save_referral(self, user_id: int, referrer_id: int) -> bool:
        row = await self._pool().fetchrow(
            f"""
            UPDATE {SCHEMA}.users
            SET referred_by = $1
            WHERE id = $2 AND referred_by IS NULL AND id != $1
            RETURNING id
            """,
            referrer_id,
            user_id,
        )
        return row is not None

    async def add_referral_bonus(self, referrer_id: int, bonus: int = 10) -> int:
        result = await self._pool().fetchval(
            f"""
            UPDATE {SCHEMA}.user_category_state
            SET free_leads_total = free_leads_total + $1, updated_at = $2
            WHERE user_id = $3
            RETURNING user_id
            """,
            bonus,
            iso_now(),
            referrer_id,
        )
        return bonus if result is not None else 0

    async def ensure_user_category_state(
        self, user_id: int, category_id: int, free_total: int
    ) -> asyncpg.Record:
        pool = self._pool()
        now = iso_now()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    f"""
                    INSERT INTO {SCHEMA}.user_category_state
                        (user_id, category_id, free_leads_total, free_leads_used, free_started, created_at, updated_at)
                    VALUES ($1, $2, $3, 0, FALSE, $4, $4)
                    ON CONFLICT(user_id, category_id) DO NOTHING
                    """,
                    user_id,
                    category_id,
                    free_total,
                    now,
                )
                row = await conn.fetchrow(
                    f"""
                    SELECT *
                    FROM {SCHEMA}.user_category_state
                    WHERE user_id = $1 AND category_id = $2
                    """,
                    user_id,
                    category_id,
                )
        if not row:
            raise RuntimeError("Failed to ensure user category state")
        return row

    async def set_free_started(self, user_id: int, category_id: int, value: int = 1) -> None:
        await self._pool().execute(
            f"""
            UPDATE {SCHEMA}.user_category_state
            SET free_started = $1, updated_at = $2
            WHERE user_id = $3 AND category_id = $4
            """,
            bool(value),
            iso_now(),
            user_id,
            category_id,
        )

    async def increment_free_leads_used(self, user_id: int, category_id: int, delta: int = 1) -> None:
        await self._pool().execute(
            f"""
            UPDATE {SCHEMA}.user_category_state
            SET free_leads_used = free_leads_used + $1, updated_at = $2
            WHERE user_id = $3 AND category_id = $4
            """,
            delta,
            iso_now(),
            user_id,
            category_id,
        )

    async def get_user_category_state(self, user_id: int, category_id: int) -> Optional[asyncpg.Record]:
        return await self._pool().fetchrow(
            f"""
            SELECT *
            FROM {SCHEMA}.user_category_state
            WHERE user_id = $1 AND category_id = $2
            """,
            user_id,
            category_id,
        )

    async def list_user_category_state_ids(self, user_id: int) -> list[int]:
        rows = await self._pool().fetch(
            f"SELECT category_id FROM {SCHEMA}.user_category_state WHERE user_id = $1",
            user_id,
        )
        return [int(row["category_id"]) for row in rows]

    async def upsert_subscription(
        self,
        user_id: int,
        category_id: int,
        status: str,
        start_date: str,
        end_date: str,
        grant_type: str,
    ) -> None:
        now = iso_now()
        await self._pool().execute(
            f"""
            INSERT INTO {SCHEMA}.subscriptions
                (user_id, category_id, status, start_date, end_date, grant_type, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            ON CONFLICT(user_id, category_id) DO UPDATE SET
                status = EXCLUDED.status,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                grant_type = EXCLUDED.grant_type,
                updated_at = EXCLUDED.updated_at
            """,
            user_id,
            category_id,
            status,
            start_date,
            end_date,
            grant_type,
            now,
        )

    async def get_subscription(self, user_id: int, category_id: int) -> Optional[asyncpg.Record]:
        return await self._pool().fetchrow(
            f"SELECT * FROM {SCHEMA}.subscriptions WHERE user_id = $1 AND category_id = $2",
            user_id,
            category_id,
        )

    async def list_user_subscriptions(self, user_id: int) -> list[asyncpg.Record]:
        return await self._pool().fetch(
            f"""
            SELECT s.*, c.title, c.full_title, c.code
            FROM {SCHEMA}.subscriptions s
            JOIN {SCHEMA}.categories c ON c.id = s.category_id
            WHERE s.user_id = $1
            """,
            user_id,
        )

    async def redeem_promo_for_categories(
        self,
        *,
        user_id: int,
        code: str,
        category_ids: Sequence[int],
        free_leads_total: int,
        duration_days: int,
        now: datetime,
    ) -> Optional[datetime]:
        if not category_ids:
            raise ValueError("At least one category is required for promo activation")
        if duration_days <= 0:
            raise ValueError("Promo duration must be positive")

        pool = self._pool()
        now_iso = now.isoformat()
        promo_payment_id = f"promo:{code}:{user_id}"
        async with pool.acquire() as conn:
            async with conn.transaction():
                claimed = await conn.fetchrow(
                    f"""
                    INSERT INTO {SCHEMA}.payments
                        (user_id, category_id, provider, payment_id, status,
                         amount_rub, currency, idempotence_key, kind,
                         created_at, updated_at, paid_at, applied_at)
                    VALUES ($1, $2, 'promo', $3, 'succeeded',
                            0, 'RUB', $3, 'promo', $4, $4, $4, $4)
                    ON CONFLICT(payment_id) DO NOTHING
                    RETURNING id
                    """,
                    user_id,
                    category_ids[0],
                    promo_payment_id,
                    now_iso,
                )
                if not claimed:
                    return None

                await conn.executemany(
                    f"""
                    INSERT INTO {SCHEMA}.user_category_state
                        (user_id, category_id, free_leads_total, free_leads_used,
                         free_started, created_at, updated_at)
                    VALUES ($1, $2, $3, 0, FALSE, $4, $4)
                    ON CONFLICT(user_id, category_id) DO NOTHING
                    """,
                    [
                        (user_id, category_id, free_leads_total, now_iso)
                        for category_id in category_ids
                    ],
                )

                end_dates = []
                for category_id in category_ids:
                    existing = await conn.fetchrow(
                        f"""
                        SELECT end_date
                        FROM {SCHEMA}.subscriptions
                        WHERE user_id = $1 AND category_id = $2
                        FOR UPDATE
                        """,
                        user_id,
                        category_id,
                    )
                    end_date = calculate_access_until(
                        existing["end_date"] if existing else None,
                        now,
                        duration_days,
                    )
                    await conn.execute(
                        f"""
                        INSERT INTO {SCHEMA}.subscriptions
                            (user_id, category_id, status, start_date, end_date,
                             grant_type, created_at, updated_at)
                        VALUES ($1, $2, 'active', $3, $4, 'promo', $3, $3)
                        ON CONFLICT(user_id, category_id) DO UPDATE SET
                            status = EXCLUDED.status,
                            start_date = EXCLUDED.start_date,
                            end_date = EXCLUDED.end_date,
                            grant_type = EXCLUDED.grant_type,
                            updated_at = EXCLUDED.updated_at
                        """,
                        user_id,
                        category_id,
                        now_iso,
                        end_date.isoformat(),
                    )
                    end_dates.append(end_date)

        return min(end_dates)

    async def update_subscription_billing(
        self,
        user_id: int,
        category_id: int,
        auto_renew: Optional[int] = None,
        provider: Optional[str] = None,
        payment_method_id: object = _UNSET,
        last_payment_id: Optional[str] = None,
        canceled_at: object = _UNSET,
    ) -> None:
        fields: list[str] = []
        values: list[object] = []

        if auto_renew is not None:
            values.append(bool(auto_renew))
            fields.append(f"auto_renew = ${len(values)}")
        if provider is not None:
            values.append(provider)
            fields.append(f"provider = ${len(values)}")
        if payment_method_id is not _UNSET:
            values.append(payment_method_id)
            fields.append(f"payment_method_id = ${len(values)}")
        if last_payment_id is not None:
            values.append(last_payment_id)
            fields.append(f"last_payment_id = ${len(values)}")
        if canceled_at is not _UNSET:
            values.append(canceled_at)
            fields.append(f"canceled_at = ${len(values)}")
        if not fields:
            return

        values.append(iso_now())
        fields.append(f"updated_at = ${len(values)}")
        values.extend([user_id, category_id])
        user_idx = len(values) - 1
        category_idx = len(values)

        await self._pool().execute(
            f"""
            UPDATE {SCHEMA}.subscriptions
            SET {", ".join(fields)}
            WHERE user_id = ${user_idx} AND category_id = ${category_idx}
            """,
            *values,
        )

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
        now = iso_now()
        await self._pool().execute(
            f"""
            INSERT INTO {SCHEMA}.payments
                (user_id, category_id, provider, payment_id, status, amount_rub, currency,
                 confirmation_url, idempotence_key, kind, lead_id, payment_method_id,
                 cancellation_reason, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
            """,
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
        )

    async def get_payment_record(self, payment_id: str) -> Optional[asyncpg.Record]:
        return await self._pool().fetchrow(
            f"SELECT * FROM {SCHEMA}.payments WHERE payment_id = $1",
            payment_id,
        )

    async def update_payment_record(self, payment_id: str, **fields: object) -> None:
        if not fields:
            return

        assignments: list[str] = []
        values: list[object] = []
        for key, value in fields.items():
            values.append(value)
            assignments.append(f"{key} = ${len(values)}")
        values.append(iso_now())
        assignments.append(f"updated_at = ${len(values)}")
        values.append(payment_id)
        payment_idx = len(values)

        await self._pool().execute(
            f"""
            UPDATE {SCHEMA}.payments
            SET {", ".join(assignments)}
            WHERE payment_id = ${payment_idx}
            """,
            *values,
        )

    async def mark_payment_applied(self, payment_id: str) -> bool:
        now = iso_now()
        row = await self._pool().fetchrow(
            f"""
            UPDATE {SCHEMA}.payments
            SET applied_at = $1, updated_at = $1
            WHERE payment_id = $2 AND applied_at IS NULL
            RETURNING 1
            """,
            now,
            payment_id,
        )
        return row is not None

    async def mark_payment_lead_delivered(self, payment_id: str) -> bool:
        now = iso_now()
        row = await self._pool().fetchrow(
            f"""
            UPDATE {SCHEMA}.payments
            SET lead_delivered_at = $1, updated_at = $1
            WHERE payment_id = $2 AND lead_delivered_at IS NULL
            RETURNING 1
            """,
            now,
            payment_id,
        )
        return row is not None

    async def list_pending_payments(self, limit: int = 200) -> list[asyncpg.Record]:
        return await self._pool().fetch(
            f"""
            SELECT *
            FROM {SCHEMA}.payments
            WHERE status IN ('pending', 'waiting_for_capture')
            ORDER BY created_at ASC
            LIMIT $1
            """,
            limit,
        )


    async def get_latest_pending_payment(
        self,
        user_id: int,
        category_id: int,
        kind: Optional[str] = None,
        lead_id: Optional[int] = None,
    ) -> Optional[asyncpg.Record]:
        clauses = ["user_id = $1", "category_id = $2", "status IN ('pending', 'waiting_for_capture')"]
        values: list[object] = [user_id, category_id]
        if kind:
            values.append(kind)
            clauses.append(f"kind = ${len(values)}")
        if lead_id is not None:
            values.append(lead_id)
            clauses.append(f"lead_id = ${len(values)}")

        return await self._pool().fetchrow(
            f"""
            SELECT *
            FROM {SCHEMA}.payments
            WHERE {' AND '.join(clauses)}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            *values,
        )

    async def get_renewal_attempt_stats(
        self,
        user_id: int,
        category_id: int,
        since_iso: str,
    ) -> Optional[asyncpg.Record]:
        """Aggregate recent auto-renewal attempts for one subscription.

        Returns failed_count (declined charges), has_pending (a charge is still
        in flight) and last_attempt_at (latest attempt timestamp) within the
        given window. The renewal scheduler uses this to back off between
        attempts and to stop after too many declines, instead of re-charging the
        card on every poll cycle (declined charges are recorded as 'canceled',
        which the previous pending-only guard ignored).
        """
        return await self._pool().fetchrow(
            f"""
            SELECT
                COUNT(*) FILTER (WHERE status = 'canceled') AS failed_count,
                BOOL_OR(status IN ('pending', 'waiting_for_capture')) AS has_pending,
                MAX(created_at) AS last_attempt_at
            FROM {SCHEMA}.payments
            WHERE user_id = $1 AND category_id = $2 AND kind = 'renewal'
              AND created_at >= $3
            """,
            user_id,
            category_id,
            since_iso,
        )

    async def list_subscriptions_for_renewal(self, before_iso: str) -> list[asyncpg.Record]:
        return await self._pool().fetch(
            f"""
            SELECT s.*, u.telegram_id
            FROM {SCHEMA}.subscriptions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.status = 'active'
              AND s.auto_renew = TRUE
              AND s.payment_method_id IS NOT NULL
              AND s.end_date <= $1
            """,
            before_iso,
        )

    async def list_recipients_for_category(self, category_id: int) -> list[asyncpg.Record]:
        return await self._pool().fetch(
            f"""
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
            FROM {SCHEMA}.user_category_state ucs
            JOIN {SCHEMA}.users u ON u.id = ucs.user_id
            LEFT JOIN {SCHEMA}.subscriptions s
                   ON s.user_id = ucs.user_id AND s.category_id = ucs.category_id
            WHERE ucs.category_id = $1
            """,
            category_id,
        )

    async def mark_sent_lead(self, user_id: int, category_id: int, lead_id: int) -> bool:
        row = await self._pool().fetchrow(
            f"""
            INSERT INTO {SCHEMA}.sent_leads (user_id, category_id, lead_id, sent_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT(user_id, lead_id) DO NOTHING
            RETURNING lead_id
            """,
            user_id,
            category_id,
            lead_id,
            iso_now(),
        )
        return row is not None

    async def was_sent_lead(self, user_id: int, lead_id: int) -> bool:
        row = await self._pool().fetchval(
            f"SELECT 1 FROM {SCHEMA}.sent_leads WHERE user_id = $1 AND lead_id = $2",
            user_id,
            lead_id,
        )
        return row is not None

    async def get_max_sent_lead_id(self, user_id: int, category_id: int) -> int:
        value = await self._pool().fetchval(
            f"SELECT MAX(lead_id) FROM {SCHEMA}.sent_leads WHERE user_id = $1 AND category_id = $2",
            user_id,
            category_id,
        )
        return int(value or 0)

    async def store_leads(self, leads: Iterable[dict]) -> None:
        pool = self._pool()
        rows = [
            (
                lead["lead_id"],
                lead["category_id"],
                lead["text"],
                lead.get("contact"),
                lead.get("source"),
                lead["created_at"],
            )
            for lead in leads
        ]
        if not rows:
            return

        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.executemany(
                    f"""
                    INSERT INTO {SCHEMA}.leads
                        (lead_id, category_id, text, contact, source, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT(lead_id) DO NOTHING
                    """,
                    rows,
                )

    async def get_latest_leads(self, category_id: int, limit: int) -> list[asyncpg.Record]:
        return await self._pool().fetch(
            f"""
            SELECT *
            FROM {SCHEMA}.leads
            WHERE category_id = $1
            ORDER BY lead_id DESC
            LIMIT $2
            """,
            category_id,
            limit,
        )

    async def get_leads_after(self, category_id: int, after_id: int) -> list[asyncpg.Record]:
        return await self._pool().fetch(
            f"""
            SELECT *
            FROM {SCHEMA}.leads
            WHERE category_id = $1 AND lead_id > $2
            ORDER BY lead_id ASC
            """,
            category_id,
            after_id,
        )

    async def get_lead_by_id(self, lead_id: int) -> Optional[asyncpg.Record]:
        return await self._pool().fetchrow(
            f"SELECT * FROM {SCHEMA}.leads WHERE lead_id = $1",
            lead_id,
        )

    async def update_category_last_lead_id(self, category_id: int, last_lead_id: int) -> None:
        await self._pool().execute(
            f"""
            INSERT INTO {SCHEMA}.category_state (category_id, last_lead_id, updated_at)
            VALUES ($1, $2, $3)
            ON CONFLICT(category_id) DO UPDATE SET
                last_lead_id = EXCLUDED.last_lead_id,
                updated_at = EXCLUDED.updated_at
            """,
            category_id,
            last_lead_id,
            iso_now(),
        )

    async def get_category_last_lead_id(self, category_id: int) -> int:
        value = await self._pool().fetchval(
            f"SELECT last_lead_id FROM {SCHEMA}.category_state WHERE category_id = $1",
            category_id,
        )
        return int(value or 0)

    async def get_supabase_state(self) -> tuple[Optional[str], Optional[int]]:
        row = await self._pool().fetchrow(
            f"SELECT last_message_time, last_message_id FROM {SCHEMA}.supabase_state WHERE id = 1"
        )
        if not row:
            return None, None
        return row["last_message_time"], row["last_message_id"]

    async def update_supabase_state(
        self, last_message_time: Optional[str], last_message_id: Optional[int]
    ) -> None:
        await self._pool().execute(
            f"""
            INSERT INTO {SCHEMA}.supabase_state (id, last_message_time, last_message_id)
            VALUES (1, $1, $2)
            ON CONFLICT(id) DO UPDATE SET
                last_message_time = EXCLUDED.last_message_time,
                last_message_id = EXCLUDED.last_message_id
            """,
            last_message_time,
            last_message_id,
        )

    async def clear_pending_leads(self, user_id: int, category_id: int) -> None:
        await self._pool().execute(
            f"DELETE FROM {SCHEMA}.pending_leads WHERE user_id = $1 AND category_id = $2",
            user_id,
            category_id,
        )

    async def enqueue_pending_leads(
        self, user_id: int, category_id: int, lead_ids: list[int]
    ) -> None:
        pool = self._pool()
        rows = [(user_id, category_id, lead_id, iso_now()) for lead_id in lead_ids]
        if not rows:
            return

        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.executemany(
                    f"""
                    INSERT INTO {SCHEMA}.pending_leads (user_id, category_id, lead_id, created_at)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT(user_id, category_id, lead_id) DO NOTHING
                    """,
                    rows,
                )

    async def pop_pending_lead(self, user_id: int, category_id: int) -> Optional[int]:
        lead_id = await self._pool().fetchval(
            f"""
            WITH next_row AS (
                SELECT id, lead_id
                FROM {SCHEMA}.pending_leads
                WHERE user_id = $1 AND category_id = $2
                ORDER BY id ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            DELETE FROM {SCHEMA}.pending_leads p
            USING next_row
            WHERE p.id = next_row.id
            RETURNING next_row.lead_id
            """,
            user_id,
            category_id,
        )
        return int(lead_id) if lead_id is not None else None

    async def get_all_telegram_ids(self) -> list[int]:
        """Every telegram_id that has ever started the bot — the broadcast audience."""
        pool = self._pool()
        rows = await pool.fetch(
            f"SELECT telegram_id FROM {SCHEMA}.users WHERE telegram_id IS NOT NULL"
        )
        return [int(r["telegram_id"]) for r in rows]

    async def get_admin_stats(self) -> dict:
        pool = self._pool()
        counts = await pool.fetchrow(f"""
            SELECT
                (SELECT COUNT(*) FROM {SCHEMA}.users) AS total_users,
                (SELECT COUNT(DISTINCT user_id) FROM {SCHEMA}.user_category_state WHERE free_started = TRUE) AS activated_free,
                (SELECT COUNT(DISTINCT s.user_id) FROM {SCHEMA}.subscriptions s WHERE s.status = 'active' AND s.end_date::timestamptz > NOW()) AS active_subs,
                (SELECT COUNT(*) FROM {SCHEMA}.users WHERE referred_by IS NOT NULL) AS total_referrals
        """)
        active_users = await pool.fetch(f"""
            SELECT u.username, u.telegram_id, s.grant_type
            FROM {SCHEMA}.subscriptions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.status = 'active' AND s.end_date::timestamptz > NOW()
            GROUP BY u.username, u.telegram_id, s.grant_type
            ORDER BY s.grant_type
        """)
        payments = await pool.fetch(f"""
            SELECT p.status, u.username, p.amount_rub, p.kind, p.created_at
            FROM {SCHEMA}.payments p
            JOIN {SCHEMA}.users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
            LIMIT 10
        """)
        top_referrers = await pool.fetch(f"""
            SELECT r.telegram_id, r.username, COUNT(*) AS ref_count
            FROM {SCHEMA}.users u
            JOIN {SCHEMA}.users r ON r.id = u.referred_by
            GROUP BY r.telegram_id, r.username
            ORDER BY ref_count DESC
            LIMIT 5
        """)
        return {
            "total_users": counts["total_users"],
            "activated_free": counts["activated_free"],
            "active_subs": counts["active_subs"],
            "total_referrals": counts["total_referrals"],
            "active_users": [dict(r) for r in active_users],
            "payments": [dict(r) for r in payments],
            "top_referrers": [dict(r) for r in top_referrers],
        }

    async def is_leadbot_enabled(self) -> bool:
        pool = self._pool()
        try:
            enabled = await pool.fetchval(
                """
                SELECT COALESCE(
                    (
                        SELECT (value::text)::boolean
                        FROM public.system_config
                        WHERE key = 'leadbot_enabled'
                        LIMIT 1
                    ),
                    TRUE
                )
                """
            )
        except Exception as exc:
            logging.warning("Failed to read leadbot_enabled flag, defaulting to enabled: %s", exc)
            return True
        return True if enabled is None else bool(enabled)

    def _pool(self) -> asyncpg.Pool:
        if not self.pool:
            raise RuntimeError("Database not connected")
        return self.pool

    async def _init_connection(self, conn: asyncpg.Connection) -> None:
        await conn.execute("SET TIME ZONE 'UTC'")

    def _build_ssl_context(self) -> ssl.SSLContext:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    @staticmethod
    def _normalize_dsn(dsn: str) -> tuple[str, Optional[str]]:
        ssl_mode: Optional[str] = None
        parts = urlsplit(dsn)
        if parts.query:
            query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)]
            filtered: list[tuple[str, str]] = []
            for key, value in query:
                if key.lower() == "sslmode":
                    ssl_mode = value.lower()
                    continue
                filtered.append((key, value))
            new_query = urlencode(filtered)
            dsn = urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))
        if dsn.startswith("postgresql+asyncpg://"):
            return dsn.replace("postgresql+asyncpg://", "postgresql://", 1), ssl_mode
        return dsn, ssl_mode
