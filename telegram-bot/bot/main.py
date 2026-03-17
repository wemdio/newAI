from __future__ import annotations

import asyncio
import logging
import contextlib
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

from .config import load_config
from .db import Database
from .handlers import router
from .leads import LeadService
from .payments import PaymentService
from .scheduler import start_lead_polling, start_payment_polling, start_subscription_renewal
from .supabase_importer import SupabaseImporter


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


async def main() -> None:
    load_dotenv()
    config = load_config()
    _setup_logging(config.log_level)

    Path(config.sqlite_path).parent.mkdir(parents=True, exist_ok=True)
    db = Database(config.sqlite_path)
    await db.connect()
    await db.init_db()

    leads = LeadService(db, config)
    await leads.start()
    supabase = SupabaseImporter(db, config)
    payments = PaymentService(config)

    bot = Bot(token=config.bot_token, default=DefaultBotProperties())
    dispatcher = Dispatcher()
    dispatcher.include_router(router)

    poller_task: asyncio.Task | None = None
    supabase_task: asyncio.Task | None = None
    payments_task: asyncio.Task | None = None
    renewal_task: asyncio.Task | None = None

    async def on_startup() -> None:
        nonlocal poller_task, supabase_task, payments_task, renewal_task
        poller_task = asyncio.create_task(start_lead_polling(bot, db, leads, config))
        if config.supabase_dsn:
            supabase_task = asyncio.create_task(supabase.run())
        if payments.enabled:
            payments_task = asyncio.create_task(start_payment_polling(bot, db, payments, config, leads))
            renewal_task = asyncio.create_task(start_subscription_renewal(bot, db, payments, config))

    async def on_shutdown() -> None:
        if poller_task:
            poller_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await poller_task
        if supabase_task:
            supabase_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await supabase_task
        if payments_task:
            payments_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await payments_task
        if renewal_task:
            renewal_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await renewal_task
        await supabase.close()
        await leads.close()
        await payments.close()
        await db.close()

    dispatcher.startup.register(on_startup)
    dispatcher.shutdown.register(on_shutdown)

    await dispatcher.start_polling(bot, db=db, config=config, leads=leads, payments=payments)


if __name__ == "__main__":
    asyncio.run(main())
