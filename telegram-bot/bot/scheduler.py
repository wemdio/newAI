from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from aiogram import Bot

from .config import Config
from .constants import CATEGORY_BY_ID, CATEGORIES
from .db import Database
from .formatters import format_lead_text
from .keyboards import lead_actions_keyboard
from .leads import Lead, LeadService
from .utils import extract_contact_url, is_contact_hidden, parse_iso


async def start_lead_polling(bot: Bot, db: Database, lead_service: LeadService, config: Config) -> None:
    while True:
        if not await db.is_leadbot_enabled():
            await asyncio.sleep(config.leads_poll_interval_seconds)
            continue
        for category in CATEGORIES:
            try:
                await _process_category(bot, db, lead_service, config, category.id)
            except Exception as exc:
                logging.exception("Poll error for category %s: %s", category.id, exc)
        await asyncio.sleep(config.leads_poll_interval_seconds)


async def _process_category(
    bot: Bot,
    db: Database,
    lead_service: LeadService,
    config: Config,
    category_id: int,
) -> None:
    last_id = await db.get_category_last_lead_id(category_id)
    if last_id == 0:
        latest = await lead_service.get_latest(category_id, 1)
        if latest:
            await db.update_category_last_lead_id(category_id, latest[0].lead_id)
        return
    new_leads = await lead_service.get_new(category_id, last_id)
    if not new_leads:
        return
    new_leads = sorted(new_leads, key=lambda item: item.lead_id)
    for lead in new_leads:
        await _deliver_lead_to_category(bot, db, config, lead)
        last_id = max(last_id, lead.lead_id)
    await db.update_category_last_lead_id(category_id, last_id)


async def _deliver_lead_to_category(bot: Bot, db: Database, config: Config, lead: Lead) -> None:
    category = CATEGORY_BY_ID.get(lead.category_id)
    if not category:
        return
    if lead.contact and is_contact_hidden(lead.contact):
        return
    recipients = await db.list_recipients_for_category(lead.category_id)
    if not recipients:
        return
    now = datetime.now(timezone.utc)
    send_delay = max(0, int(config.leads_send_interval_seconds))
    for row in recipients:
        user_id = int(row["user_id"])
        telegram_id = int(row["telegram_id"])
        free_started = int(row["free_started"] or 0)
        if not free_started and not _is_subscription_active(row, now):
            continue
        if await db.was_sent_lead(user_id, lead.lead_id):
            continue
        text = format_lead_text(lead, category)
        reply_markup = lead_actions_keyboard(lead.category_id, extract_contact_url(lead.contact))
        try:
            await bot.send_message(telegram_id, text, reply_markup=reply_markup)
        except Exception as exc:
            logging.warning("Failed to send lead %s to %s: %s", lead.lead_id, telegram_id, exc)
        else:
            await db.mark_sent_lead(user_id, lead.category_id, lead.lead_id)
        if send_delay:
            await asyncio.sleep(send_delay)


def _is_subscription_active(row, now: datetime) -> bool:
    status = row["sub_status"]
    end_date = row["sub_end_date"]
    if not status or not end_date:
        return False
    if status != "active":
        return False
    try:
        return parse_iso(end_date) >= now
    except Exception:
        return False
