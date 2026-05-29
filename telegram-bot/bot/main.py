from __future__ import annotations

import asyncio
import logging
import contextlib

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from dotenv import load_dotenv

from .config import load_config
from .db import Database, LOCK_REFRESH_SECONDS
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

    # ── singleton guard: prefer single instance, but don't block forever ──
    lock_acquired = False
    for attempt in range(4):
        if await db.try_acquire_singleton_lock():
            lock_acquired = True
            break
        logger.warning("Another instance holds the lock — retry %d/3 …", attempt + 1)
        await asyncio.sleep(10)
    if not lock_acquired:
        logger.warning("Could not acquire lock after retries — starting anyway.")

    leads = LeadService(db, config)
    await leads.start()
    supabase = SupabaseImporter(db, config)
    payments = PaymentService(config)

    # Route Telegram Bot API traffic through a proxy if configured (LEADBOT_PROXY).
    # Needed when the host network blocks api.telegram.org (e.g. RU hosting + RKN).
    session = AiohttpSession(proxy=config.proxy) if config.proxy else None
    if config.proxy:
        logger.info("Bot HTTP session routed through proxy")
    bot = Bot(token=config.bot_token, default=DefaultBotProperties(), session=session)

    from aiogram.exceptions import TelegramUnauthorizedError

    for _try in range(5):
        try:
            me = await bot.get_me()
            logger.info("Bot authenticated: @%s (id=%s)", me.username, me.id)
            break
        except TelegramUnauthorizedError:
            logger.critical("Bot token is INVALID — releasing lock and exiting.")
            await db.release_singleton_lock()
            await db.close()
            raise SystemExit(1)
        except Exception as exc:
            logger.warning("bot.get_me() failed (attempt %d/5): %s", _try + 1, exc)
            if _try == 4:
                logger.critical("Cannot reach Telegram after 5 attempts — exiting.")
                await db.release_singleton_lock()
                await db.close()
                raise SystemExit(1)
            await asyncio.sleep(5)

    dp = Dispatcher()
    dp.include_router(router)

    async def _refresh_lock_loop() -> None:
        while True:
            await asyncio.sleep(LOCK_REFRESH_SECONDS)
            if not await db.refresh_singleton_lock():
                logger.error("Lost singleton lock! Another instance took over.")

    bg_tasks: list[asyncio.Task] = []

    async def on_startup() -> None:
        bg_tasks.append(asyncio.create_task(_refresh_lock_loop()))
        bg_tasks.append(asyncio.create_task(start_lead_polling(bot, db, leads, config)))
        bg_tasks.append(asyncio.create_task(supabase.run()))
        if payments.enabled:
            bg_tasks.append(asyncio.create_task(start_payment_polling(bot, db, payments, config, leads)))
            bg_tasks.append(asyncio.create_task(start_subscription_renewal(bot, db, payments, config)))

    async def on_shutdown() -> None:
        for t in bg_tasks:
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await t
        await supabase.close()
        await leads.close()
        await payments.close()
        await db.close()

    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    await dp.start_polling(bot, db=db, config=config, leads=leads, payments=payments)


if __name__ == "__main__":
    asyncio.run(main())
