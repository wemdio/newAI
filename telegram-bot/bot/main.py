from __future__ import annotations

import asyncio
import logging
import contextlib

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
    logger = logging.getLogger(__name__)

    if not config.supabase_dsn:
        raise RuntimeError(
            "Supabase Postgres credentials are required for the lead bot. "
            "Set SUPABASE_DSN or SUPABASE_HOST / SUPABASE_USER / SUPABASE_PASSWORD."
        )

    db = Database(config.supabase_dsn, ssl_insecure=config.supabase_ssl_insecure)
    await db.connect()
    await db.init_db()

    # ── singleton guard: only one bot instance may poll Telegram ──
    while True:
        if await db.try_acquire_singleton_lock():
            break
        logger.warning("Another bot instance holds the lock — retrying in 15 s …")
        await asyncio.sleep(15)

    leads = LeadService(db, config)
    await leads.start()
    supabase = SupabaseImporter(db, config)
    payments = PaymentService(config)

    bot = Bot(token=config.bot_token, default=DefaultBotProperties())
    dp = Dispatcher()
    dp.include_router(router)

    poller_task: asyncio.Task | None = None
    supabase_task: asyncio.Task | None = None
    payments_task: asyncio.Task | None = None
    renewal_task: asyncio.Task | None = None

    async def on_startup() -> None:
        nonlocal poller_task, supabase_task, payments_task, renewal_task
        poller_task = asyncio.create_task(start_lead_polling(bot, db, leads, config))
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

    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    await dp.start_polling(bot, db=db, config=config, leads=leads, payments=payments)


if __name__ == "__main__":
    asyncio.run(main())
