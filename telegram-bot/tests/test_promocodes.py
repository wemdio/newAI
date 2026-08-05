from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from bot.constants import CATEGORIES
from bot.promocodes import (
    PromoRedemptionStatus,
    calculate_access_until,
    redeem_promo_code,
)


class FakePromoDatabase:
    def __init__(self) -> None:
        self.redemptions: set[tuple[str, int]] = set()
        self.calls: list[dict] = []

    async def redeem_promo_for_categories(self, **kwargs):
        self.calls.append(kwargs)
        key = (kwargs["code"], kwargs["user_id"])
        if key in self.redemptions:
            return None
        self.redemptions.add(key)
        return kwargs["now"] + timedelta(days=kwargs["duration_days"])


class PromoCodeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.db = FakePromoDatabase()
        self.config = SimpleNamespace(
            promo_code="LEADSCAN30",
            promo_duration_days=30,
            free_leads_total=10,
        )
        self.now = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)

    async def test_valid_code_activates_every_category_for_30_days(self) -> None:
        result = await redeem_promo_code(
            self.db,
            self.config,
            user_id=101,
            entered_code="  leadscan30  ",
            now=self.now,
        )

        self.assertEqual(result.status, PromoRedemptionStatus.ACTIVATED)
        self.assertEqual(result.category_count, len(CATEGORIES))
        self.assertEqual(result.access_until, self.now + timedelta(days=30))
        self.assertEqual(self.db.calls[0]["code"], "LEADSCAN30")
        self.assertEqual(
            self.db.calls[0]["category_ids"],
            tuple(category.id for category in CATEGORIES),
        )

    async def test_shared_code_works_for_different_users_but_once_per_user(self) -> None:
        first = await redeem_promo_code(
            self.db, self.config, user_id=101, entered_code="LEADSCAN30", now=self.now
        )
        second_user = await redeem_promo_code(
            self.db, self.config, user_id=202, entered_code="LEADSCAN30", now=self.now
        )
        repeated = await redeem_promo_code(
            self.db, self.config, user_id=101, entered_code="LEADSCAN30", now=self.now
        )

        self.assertEqual(first.status, PromoRedemptionStatus.ACTIVATED)
        self.assertEqual(second_user.status, PromoRedemptionStatus.ACTIVATED)
        self.assertEqual(repeated.status, PromoRedemptionStatus.ALREADY_USED)

    async def test_invalid_code_does_not_touch_database(self) -> None:
        result = await redeem_promo_code(
            self.db, self.config, user_id=101, entered_code="WRONG", now=self.now
        )

        self.assertEqual(result.status, PromoRedemptionStatus.INVALID)
        self.assertEqual(self.db.calls, [])

    async def test_disabled_code_does_not_touch_database(self) -> None:
        self.config.promo_code = None

        result = await redeem_promo_code(
            self.db, self.config, user_id=101, entered_code="LEADSCAN30", now=self.now
        )

        self.assertEqual(result.status, PromoRedemptionStatus.DISABLED)
        self.assertEqual(self.db.calls, [])


class AccessExtensionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)

    def test_expired_access_starts_from_activation_time(self) -> None:
        expired = self.now - timedelta(days=5)

        result = calculate_access_until(expired, self.now, duration_days=30)

        self.assertEqual(result, self.now + timedelta(days=30))

    def test_active_access_is_extended_instead_of_reset(self) -> None:
        active_until = self.now + timedelta(days=12)

        result = calculate_access_until(active_until.isoformat(), self.now, duration_days=30)

        self.assertEqual(result, active_until + timedelta(days=30))


if __name__ == "__main__":
    unittest.main()
