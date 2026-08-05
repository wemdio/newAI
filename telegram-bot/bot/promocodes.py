from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, Protocol, Sequence

from .constants import CATEGORIES
from .utils import now_utc, parse_iso


class PromoRedemptionStatus(str, Enum):
    ACTIVATED = "activated"
    INVALID = "invalid"
    ALREADY_USED = "already_used"
    DISABLED = "disabled"


@dataclass(frozen=True)
class PromoRedemptionResult:
    status: PromoRedemptionStatus
    access_until: Optional[datetime] = None
    category_count: int = 0


class PromoConfig(Protocol):
    promo_code: Optional[str]
    promo_duration_days: int
    free_leads_total: int


class PromoDatabase(Protocol):
    async def redeem_promo_for_categories(
        self,
        *,
        user_id: int,
        code: str,
        category_ids: Sequence[int],
        free_leads_total: int,
        duration_days: int,
        now: datetime,
    ) -> Optional[datetime]: ...


def normalize_promo_code(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def calculate_access_until(
    existing_end: object,
    now: datetime,
    duration_days: int,
) -> datetime:
    end_date = now
    try:
        if isinstance(existing_end, datetime):
            end_date = existing_end
        elif existing_end:
            end_date = parse_iso(str(existing_end))
    except (TypeError, ValueError):
        end_date = now

    if end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if end_date < now:
        end_date = now
    return end_date + timedelta(days=duration_days)


async def redeem_promo_code(
    db: PromoDatabase,
    config: PromoConfig,
    *,
    user_id: int,
    entered_code: Optional[str],
    now: Optional[datetime] = None,
) -> PromoRedemptionResult:
    configured_code = normalize_promo_code(config.promo_code)
    if not configured_code:
        return PromoRedemptionResult(PromoRedemptionStatus.DISABLED)
    if normalize_promo_code(entered_code) != configured_code:
        return PromoRedemptionResult(PromoRedemptionStatus.INVALID)

    category_ids = tuple(category.id for category in CATEGORIES)
    access_until = await db.redeem_promo_for_categories(
        user_id=user_id,
        code=configured_code,
        category_ids=category_ids,
        free_leads_total=config.free_leads_total,
        duration_days=max(1, int(config.promo_duration_days)),
        now=now or now_utc(),
    )
    if access_until is None:
        return PromoRedemptionResult(PromoRedemptionStatus.ALREADY_USED)
    return PromoRedemptionResult(
        PromoRedemptionStatus.ACTIVATED,
        access_until=access_until,
        category_count=len(category_ids),
    )
