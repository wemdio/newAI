from __future__ import annotations

import asyncio
import logging
import ssl
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .config import Config
from .constants import CATEGORY_BY_CODE
from .db import Database
from .utils import is_contact_hidden


def _resolve_category_id(view_code: str) -> Optional[int]:
    cat = CATEGORY_BY_CODE.get(view_code)
    return cat.id if cat else None


class SupabaseImporter:
    def __init__(self, db: Database, config: Config) -> None:
        self.db = db
        self.dsn = config.supabase_dsn
        self.poll_interval = config.supabase_poll_interval_seconds
        self.initial_backfill_limit = config.supabase_initial_backfill_limit
        self.ssl_insecure = config.supabase_ssl_insecure
        self.engine: Optional[AsyncEngine] = None
        self._error_streak = 0

    async def start(self) -> None:
        if not self.dsn:
            return
        dsn, ssl_mode = self._normalize_dsn(self.dsn)
        connect_args = {}
        if ssl_mode and ssl_mode != "disable":
            if self.ssl_insecure or ssl_mode == "require":
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                connect_args["ssl"] = ctx
            else:
                connect_args["ssl"] = True
        self.engine = create_async_engine(dsn, pool_pre_ping=True, connect_args=connect_args)

    async def close(self) -> None:
        if self.engine:
            await self.engine.dispose()
            self.engine = None

    async def run(self) -> None:
        if not self.dsn:
            return
        await self.start()
        backoff = self.poll_interval
        max_backoff = max(self.poll_interval, 300)
        while True:
            try:
                if not await self.db.is_leadbot_enabled():
                    await asyncio.sleep(self.poll_interval)
                    continue
                await self._tick()
                self._error_streak = 0
                backoff = self.poll_interval
                await asyncio.sleep(self.poll_interval)
            except Exception as exc:
                self._error_streak += 1
                if self._error_streak == 1:
                    logging.exception("Supabase import error: %s", exc)
                else:
                    logging.warning(
                        "Supabase import error: %s (retry in %ss)", exc, backoff
                    )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)

    async def _tick(self) -> None:
        if not self.engine:
            return
        last_time_raw, last_id = await self.db.get_supabase_state()
        last_time = self._parse_time(last_time_raw)
        if not last_time:
            rows = await self._fetch_initial(self.initial_backfill_limit)
        else:
            rows = await self._fetch_since(last_time, last_id or 0)

        if not rows:
            return

        max_time = last_time_raw
        max_id = last_id or 0
        leads: list[dict[str, Any]] = []

        for row in rows:
            row_id = int(row["id"])
            message_time = self._normalize_time(row.get("message_time"))
            if message_time:
                max_time = message_time
            if row_id > max_id:
                max_id = row_id

            if self._username_hidden(row):
                continue

            category_id = _resolve_category_id(row.get("category") or "")
            if not category_id:
                continue

            contact = self._build_contact(row)
            source = self._build_source(row)

            created_at = message_time or self._normalize_time(row.get("created_at"))
            leads.append(
                {
                    "lead_id": row_id,
                    "category_id": category_id,
                    "text": row.get("message_text") or "",
                    "contact": contact,
                    "source": source,
                    "created_at": created_at or "",
                }
            )

        if leads:
            await self.db.store_leads(leads)
        await self.db.update_supabase_state(max_time, max_id)

    async def _fetch_since(self, last_time: datetime, last_id: int) -> list[dict[str, Any]]:
        assert self.engine
        query = text(
            """
            SELECT id, category, username, first_name, last_name,
                   message_text, chat_name, profile_link, message_time,
                   confidence_score, created_at
            FROM contractor_access.categorized_leads_feed
            WHERE (message_time > :last_time)
               OR (message_time = :last_time AND id > :last_id)
            ORDER BY message_time ASC, id ASC
            LIMIT 500
            """
        )
        async with self.engine.connect() as conn:
            result = await conn.execute(query, {"last_time": last_time, "last_id": last_id})
            rows = result.mappings().all()
        return [dict(row) for row in rows]

    async def _fetch_initial(self, limit: int) -> list[dict[str, Any]]:
        assert self.engine
        query = text(
            """
            SELECT id, category, username, first_name, last_name,
                   message_text, chat_name, profile_link, message_time,
                   confidence_score, created_at
            FROM contractor_access.categorized_leads_feed
            ORDER BY message_time DESC
            LIMIT :limit
            """
        )
        async with self.engine.connect() as conn:
            result = await conn.execute(query, {"limit": limit})
            rows = result.mappings().all()
        rows = list(reversed(rows))
        return [dict(row) for row in rows]

    def _build_contact(self, row: dict[str, Any]) -> Optional[str]:
        username = (row.get("username") or "").strip()
        if not username or is_contact_hidden(username):
            return None
        first_name = (row.get("first_name") or "").strip()
        last_name = (row.get("last_name") or "").strip()
        profile = (row.get("profile_link") or "").strip()
        name = " ".join(part for part in [first_name, last_name] if part)
        parts = []
        if name:
            parts.append(f"Имя: {name}")
        parts.append(f"Username: @{username}")
        if profile:
            parts.append(f"Профиль: {profile}")
        return "\n".join(parts)

    def _build_source(self, row: dict[str, Any]) -> str:
        chat_name = (row.get("chat_name") or "").strip()
        message_time = self._normalize_time(row.get("message_time")) or ""
        parts = []
        if chat_name:
            parts.append(f"Канал: {chat_name}")
        if message_time:
            parts.append(f"Время: {message_time}")
        return "\n".join(parts)

    def _username_hidden(self, row: dict[str, Any]) -> bool:
        username = (row.get("username") or "").strip()
        if not username:
            return True
        return is_contact_hidden(username)

    @staticmethod
    def _normalize_time(value: Any) -> Optional[str]:
        if not value:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)

    @staticmethod
    def _parse_time(value: Any) -> Optional[datetime]:
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value))
        except Exception:
            return None

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
            return dsn, ssl_mode
        if dsn.startswith("postgresql://"):
            return dsn.replace("postgresql://", "postgresql+asyncpg://", 1), ssl_mode
        return dsn, ssl_mode
