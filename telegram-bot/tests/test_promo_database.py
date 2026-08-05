from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from bot.db import Database


class AsyncContext:
    def __init__(self, value) -> None:
        self.value = value
        self.entered = False

    async def __aenter__(self):
        self.entered = True
        return self.value

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None


class FakeConnection:
    def __init__(self, existing_end_dates=None, claim=True) -> None:
        self.existing_end_dates = existing_end_dates or {}
        self.claim = claim
        self.transaction_context = AsyncContext(self)
        self.promo_claim_args = None
        self.state_rows = []
        self.subscription_writes = []

    def transaction(self):
        return self.transaction_context

    async def fetchrow(self, query, *args):
        if "INSERT INTO leadbot.payments" in query and "'promo'" in query:
            self.promo_claim_args = args
            return {"id": 1} if self.claim else None
        if "FROM leadbot.subscriptions" in query:
            end_date = self.existing_end_dates.get(args[1])
            return {"end_date": end_date} if end_date else None
        raise AssertionError(f"Unexpected fetchrow query: {query}")

    async def executemany(self, query, rows) -> None:
        self.state_rows.extend(rows)

    async def execute(self, query, *args) -> None:
        if "INSERT INTO leadbot.subscriptions" not in query:
            raise AssertionError(f"Unexpected execute query: {query}")
        self.subscription_writes.append(args)


class FakePool:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection
        self.acquire_context = AsyncContext(connection)

    def acquire(self):
        return self.acquire_context


class PromoDatabaseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)

    async def test_activation_extends_existing_access_inside_transaction(self) -> None:
        connection = FakeConnection(
            existing_end_dates={1: (self.now + timedelta(days=10)).isoformat()}
        )
        database = Database("postgresql://unused")
        database.pool = FakePool(connection)

        access_until = await database.redeem_promo_for_categories(
            user_id=7,
            code="LEADSCAN30",
            category_ids=(1, 2),
            free_leads_total=10,
            duration_days=30,
            now=self.now,
        )

        self.assertTrue(connection.transaction_context.entered)
        self.assertEqual(
            connection.promo_claim_args,
            (7, 1, "promo:LEADSCAN30:7", self.now.isoformat()),
        )
        self.assertEqual(access_until, self.now + timedelta(days=30))
        self.assertEqual(len(connection.state_rows), 2)
        self.assertEqual(len(connection.subscription_writes), 2)
        self.assertEqual(
            connection.subscription_writes[0][3],
            (self.now + timedelta(days=40)).isoformat(),
        )
        self.assertEqual(
            connection.subscription_writes[1][3],
            (self.now + timedelta(days=30)).isoformat(),
        )

    async def test_repeated_activation_stops_before_subscription_writes(self) -> None:
        connection = FakeConnection(claim=False)
        database = Database("postgresql://unused")
        database.pool = FakePool(connection)

        access_until = await database.redeem_promo_for_categories(
            user_id=7,
            code="LEADSCAN30",
            category_ids=(1, 2),
            free_leads_total=10,
            duration_days=30,
            now=self.now,
        )

        self.assertIsNone(access_until)
        self.assertEqual(
            connection.promo_claim_args,
            (7, 1, "promo:LEADSCAN30:7", self.now.isoformat()),
        )
        self.assertEqual(connection.state_rows, [])
        self.assertEqual(connection.subscription_writes, [])


if __name__ == "__main__":
    unittest.main()
