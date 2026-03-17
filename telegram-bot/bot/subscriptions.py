from __future__ import annotations

from datetime import datetime, timedelta

from .config import Config
from .db import Database
from .utils import now_utc, parse_iso


async def activate_subscription(
    db: Database,
    config: Config,
    user_id: int,
    category_id: int,
    grant_type: str,
    duration_days: int | None = None,
) -> datetime:
    duration = duration_days if duration_days is not None else config.subscription_duration_days
    now = now_utc()
    existing = await db.get_subscription(user_id, category_id)
    if existing and existing["end_date"]:
        try:
            end_date = parse_iso(existing["end_date"])
        except Exception:
            end_date = now
    else:
        end_date = now
    if end_date < now:
        end_date = now
    end_date = end_date + timedelta(days=duration)
    await db.upsert_subscription(
        user_id,
        category_id,
        status="active",
        start_date=now.isoformat(),
        end_date=end_date.isoformat(),
        grant_type=grant_type,
    )
    return end_date
