from __future__ import annotations

import unittest
from types import SimpleNamespace

from bot.db import Database
from bot.handlers import _build_my_subscriptions, cb_autorenew_off


class FakeSubscriptionsDatabase:
    def __init__(self) -> None:
        self.update_calls: list[dict] = []
        self.subscription = {
            "category_id": 1,
            "status": "active",
            "start_date": "2026-08-01T00:00:00+00:00",
            "end_date": "2099-09-01T00:00:00+00:00",
            "grant_type": "paid",
            "auto_renew": True,
            "payment_method_id": "saved-payment-method",
        }

    async def ensure_user(self, telegram_id: int, username: str | None) -> int:
        return 7

    async def get_subscription(self, user_id: int, category_id: int):
        return self.subscription

    async def list_user_subscriptions(self, user_id: int):
        return [self.subscription]

    async def list_user_category_state_ids(self, user_id: int):
        return [1]

    async def update_subscription_billing(self, user_id: int, category_id: int, **kwargs) -> None:
        self.update_calls.append(
            {"user_id": user_id, "category_id": category_id, **kwargs}
        )


class FakeMessage:
    def __init__(self) -> None:
        self.answers: list[str] = []

    async def answer(self, text: str, **kwargs) -> None:
        self.answers.append(text)


class FakeQuery:
    def __init__(self) -> None:
        self.data = "autorenew_off:1"
        self.from_user = SimpleNamespace(id=123, username="subscriber")
        self.message = FakeMessage()
        self.answers: list[tuple[str | None, bool]] = []

    async def answer(self, text: str | None = None, show_alert: bool = False) -> None:
        self.answers.append((text, show_alert))


class SubscriptionCancellationInterfaceTests(unittest.IsolatedAsyncioTestCase):
    async def test_my_subscriptions_contains_cancel_button_for_active_autorenewal(self) -> None:
        db = FakeSubscriptionsDatabase()

        _, keyboard = await _build_my_subscriptions(db, user_id=7)

        callbacks = [
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
        ]
        self.assertIn("autorenew_off:1", callbacks)

    async def test_cancel_disables_autorenewal_and_forgets_payment_method(self) -> None:
        db = FakeSubscriptionsDatabase()
        query = FakeQuery()

        await cb_autorenew_off(query, db, SimpleNamespace())

        self.assertEqual(len(db.update_calls), 1)
        self.assertEqual(db.update_calls[0]["auto_renew"], 0)
        self.assertIsNone(db.update_calls[0]["payment_method_id"])
        self.assertEqual(db.subscription["status"], "active")
        self.assertEqual(db.subscription["end_date"], "2099-09-01T00:00:00+00:00")

    async def test_expired_autorenewal_still_has_cancel_button(self) -> None:
        db = FakeSubscriptionsDatabase()
        db.subscription["end_date"] = "2020-01-01T00:00:00+00:00"

        _, keyboard = await _build_my_subscriptions(db, user_id=7)

        callbacks = [
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
        ]
        self.assertIn("autorenew_off:1", callbacks)

    async def test_expired_autorenewal_can_be_canceled(self) -> None:
        db = FakeSubscriptionsDatabase()
        db.subscription["end_date"] = "2020-01-01T00:00:00+00:00"
        query = FakeQuery()

        await cb_autorenew_off(query, db, SimpleNamespace())

        self.assertEqual(len(db.update_calls), 1)
        self.assertEqual(db.update_calls[0]["auto_renew"], 0)
        self.assertIsNone(db.update_calls[0]["payment_method_id"])


class RecordingPool:
    def __init__(self) -> None:
        self.query: str | None = None
        self.args: tuple[object, ...] = ()

    async def execute(self, query: str, *args) -> None:
        self.query = query
        self.args = args


class SubscriptionCancellationDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_billing_update_can_clear_saved_payment_method(self) -> None:
        pool = RecordingPool()
        db = Database("postgresql://unused")
        db.pool = pool

        await db.update_subscription_billing(
            user_id=7,
            category_id=1,
            auto_renew=0,
            payment_method_id=None,
            canceled_at="2026-08-24T08:49:39+00:00",
        )

        self.assertIn("payment_method_id", pool.query or "")
        self.assertIn(None, pool.args)


if __name__ == "__main__":
    unittest.main()
