import sqlite3
import unittest
from html import unescape
from types import SimpleNamespace
from unittest.mock import AsyncMock

from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import EditMessageText, SendMessage
from aiogram.types import Update

from bot.db import Database
from bot.handlers import router
from bot.leads import Lead, LeadService
from bot.scheduler import _deliver_lead_to_category


class FreeFunnelTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.dp = Dispatcher()
        cls.dp.include_router(router)

    def setUp(self):
        self.session = AsyncMock()
        self.bot = Bot("12345:offline-test", session=self.session)
        self.db = AsyncMock(spec=Database)
        self.db.ensure_user.return_value = 8
        self.leads = AsyncMock(spec=LeadService)
        self.lead = Lead(77, 3, "Ищем маркетолога", "@example", "чат", "")
        self.cfg = SimpleNamespace(free_leads_total=10, leads_send_interval_seconds=0)

    async def press(self, data, message=None):
        self.session.reset_mock()
        user = {"id": 42, "is_bot": False, "first_name": "Test"}
        msg = {"message_id": 1, "date": 1, "chat": {"id": 42, "type": "private"}, "from": user}
        if message:
            msg.update(message)
        update = {"update_id": 1}
        if data.startswith("/"):
            update["message"] = {**msg, "text": data}
        else:
            update["callback_query"] = {"id": "cb", "chat_instance": "x", "message": msg,
                                        "from": user, "data": data}
        await self.dp.feed_update(
            self.bot, Update.model_validate(update, context={"bot": self.bot}),
            config=self.cfg, db=self.db, leads=self.leads,
        )
        return [call.args[1] for call in self.session.await_args_list
                if isinstance(call.args[1], SendMessage)]

    async def test_all_checkout_entries_show_both_links_and_a_free_exit(self):
        for entry, target in [
            ("cat:3", "activate:3"), ("free:3", "activate:3"), ("buy:3", "activate:3"),
            ("autorenew_on:3", "activate:3"), ("buycontact:3:77", "reveal:3:77"),
            ("/pay", "categories"), ("/promo OLD", "categories"), ("paycheck:old", "categories"),
        ]:
            with self.subTest(entry=entry):
                msg, = await self.press(entry)
                self.assertIn('href="https://t.me/agencypolzabot?start=base_leadscan"', msg.text)
                self.assertIn('href="https://polzaagency.ru/partner?utm_source=tg&utm_medium=botleadscan"',
                              unescape(msg.text))
                self.assertEqual(msg.reply_markup.inline_keyboard[0][0].callback_data, target)
        self.assertEqual(self.db.method_calls, [])

    async def test_old_card_is_edited_in_place_without_rewriting_lead_or_source(self):
        data = "buycontact:3:77"
        price = "Открыть контакт — 90 ₽"
        body = "Новая заявка\n\nКатегория: Маркетинг\n\nБюджет 90 ₽ за клик <тест>."
        footer = "\n\nКонтакт скрыт.\n\nОформите подписку чтобы видеть контакты."
        source = "\n\nИсточник:\nКанал: тест"
        def card(label, text):
            return {"from": {"is_bot": True, "id": self.bot.id, "first_name": "Bot"},
                    "text": text, "reply_markup": {"inline_keyboard": [[
                        {"text": label, "callback_data": data}]]}}
        def edits():
            return [c.args[1] for c in self.session.await_args_list
                    if isinstance(c.args[1], EditMessageText)]
        for suffix in ("", source):
            offer, = await self.press(data, card(price, body + footer + suffix))
            edit, = edits()
            self.assertEqual((edit.chat_id, edit.message_id), (42, 1))
            self.assertEqual(edit.text, body + "\n\nКонтакт доступен бесплатно." + suffix)
            btn = edit.reply_markup.inline_keyboard[0][0]
            self.assertEqual((btn.text, btn.callback_data), ("Открыть контакт бесплатно", data))
            self.assertEqual(offer.reply_markup.inline_keyboard[0][0].callback_data, "reveal:3:77")
        for other in (card(btn.text, edit.text), card(price, body + footer + "\nцитата"),
                      {**card(price, body + footer), "chat": {"id": -99, "type": "group"}},
                      {**card(price, body + footer), "from": {"id": 7, "is_bot": True, "first_name": "Other"}}):
            await self.press(data, other)
            self.assertEqual(edits(), [])
        async def cannot_edit(bot, method, **kwargs):
            if isinstance(method, EditMessageText):
                raise TelegramBadRequest(method, "message can't be edited")
        self.session.side_effect = cannot_edit
        offer, = await self.press(data, card(price, body + footer))
        self.assertEqual(offer.reply_markup.inline_keyboard[0][0].callback_data, "reveal:3:77")
        self.assertEqual(len(edits()), 1)
        self.assertEqual(self.db.method_calls, [])

    async def test_activate_and_receive_lead_without_opening_external_links(self):
        self.db.ensure_user_category_state.return_value = {"free_started": False}
        self.leads.get_latest.return_value = [self.lead]
        self.db.was_sent_lead.return_value = False
        self.db.pop_pending_lead.return_value = 77
        self.leads.get_by_id.return_value = self.lead
        msg, = await self.press("activate:3")
        self.assertIn("@example", msg.text)
        self.db.set_free_started.assert_awaited_once_with(8, 3, 1)
        self.db.mark_sent_lead.assert_awaited_once_with(8, 3, 77)

    async def test_old_quota_does_not_block_manual_delivery_or_restart_history(self):
        self.db.ensure_user_category_state.return_value = {"free_started": True, "free_leads_used": 10}
        msg, = await self.press("activate:3")
        self.leads.get_latest.assert_not_awaited()
        self.assertEqual(msg.reply_markup.inline_keyboard[-1][0].callback_data, "next:3")
        self.db.pop_pending_lead.return_value = None
        self.db.get_max_sent_lead_id.return_value = 76
        self.leads.get_new.return_value = [self.lead]
        msg, = await self.press("next:3")
        self.assertIn("@example", msg.text)
        self.db.increment_free_leads_used.assert_not_awaited()


    async def test_legacy_contact_only_reveals_original_visible_delivered_lead(self):
        self.leads.get_by_id.return_value = self.lead
        self.db.was_sent_lead.return_value = False
        self.assertEqual(await self.press("reveal:3:77"), [])
        self.leads.get_by_id.assert_not_awaited()
        self.db.was_sent_lead.return_value = True
        self.assertEqual(await self.press("reveal:2:77"), [])
        msg, = await self.press("reveal:3:77")
        self.assertIn(self.lead.text, msg.text)
        self.assertIn("@example", msg.text)
        self.lead.contact = "скрыт пользователем"
        self.assertEqual(await self.press("reveal:3:77"), [])

    async def test_automatic_delivery_after_quota_without_ad_or_duplicates(self):
        row = {"user_id": 8, "telegram_id": 42, "free_started": True, "free_leads_used": 10,
               "free_leads_total": 10, "sub_status": None, "sub_end_date": None}
        self.db.list_recipients_for_category.return_value = [
            dict(row, user_id=9, free_started=False), row, dict(row, user_id=10),
        ]
        self.db.was_sent_lead.side_effect = [False, True]
        bot = AsyncMock()
        await _deliver_lead_to_category(bot, self.db, self.cfg, self.lead)
        bot.send_message.assert_awaited_once()
        text = bot.send_message.await_args.args[1]
        self.assertIn("@example", text)
        self.assertNotIn("Polza", text)
        self.db.mark_sent_lead.assert_awaited_once_with(8, 3, 77)
        self.db.increment_free_leads_used.assert_not_awaited()


class FreeCutoverTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_current_uncanceled_recurring_categories_are_carried_over(self):
        # Execute the actual UPDATE on an isolated SQL fixture, never a real bot database.
        sql = sqlite3.connect(":memory:")
        self.addCleanup(sql.close)
        sql.executescript("""
            ATTACH DATABASE ':memory:' AS leadbot;
            CREATE TABLE leadbot.user_category_state
                (user_id INT, category_id INT, free_started BOOL, updated_at TEXT);
            CREATE TABLE leadbot.subscriptions
                (user_id INT, category_id INT, grant_type TEXT, status TEXT,
                 auto_renew BOOL, canceled_at TEXT, end_date TEXT);
            INSERT INTO leadbot.user_category_state VALUES
                (1,1,0,''),(1,2,0,''),(1,3,0,''),(1,4,0,''),
                (1,5,0,''),(1,6,0,''),(2,1,0,''),(2,2,1,'untouched');
            INSERT INTO leadbot.subscriptions VALUES
                (1,1,'paid','active',1,NULL,'2099'),
                (1,2,'paid','active',1,NULL,'2000'),
                (1,3,'paid','active',1,'2020','2099'),
                (1,4,'promo','active',1,NULL,'2099'),
                (1,5,'paid','active',0,NULL,'2099'),
                (1,6,'paid','inactive',1,NULL,'2099');
        """)
        db = Database("unused")
        db.pool = SimpleNamespace(execute=AsyncMock(side_effect=lambda q, t: sql.execute(q, (t,))))
        await db.keep_renewing_categories_free()
        self.assertEqual(sql.execute("SELECT changes()").fetchone(), (1,))
        await db.keep_renewing_categories_free()
        self.assertEqual(sql.execute("SELECT changes()").fetchone(), (0,))
        self.assertEqual(sql.execute(
            "SELECT user_id, category_id FROM leadbot.user_category_state WHERE free_started ORDER BY 1,2"
        ).fetchall(), [(1, 1), (2, 2)])
