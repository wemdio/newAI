from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot

from .config import Config
from .constants import CATEGORY_BY_ID, CATEGORIES
from .db import Database
from .formatters import format_lead_text
from .keyboards import lead_actions_keyboard, pay_contact_keyboard
from .leads import Lead, LeadService
from .payment_flow import refresh_and_process_payment, start_recurring_payment
from .payments import PaymentService
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
        show_contact = _should_show_contact(row, now)
        text = format_lead_text(lead, category, show_contact)
        reply_markup = _build_lead_keyboard(lead, category_id=lead.category_id, show_contact=show_contact, price_rub=config.contact_price_rub)
        try:
            await bot.send_message(telegram_id, text, reply_markup=reply_markup)
        except Exception as exc:
            logging.warning("Failed to send lead %s to %s: %s", lead.lead_id, telegram_id, exc)
        else:
            inserted = await db.mark_sent_lead(user_id, lead.category_id, lead.lead_id)
            if inserted and show_contact and not _is_subscription_active(row, now):
                if int(row["free_leads_used"]) < int(row["free_leads_total"]):
                    await db.increment_free_leads_used(user_id, lead.category_id, 1)
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


def _should_show_contact(row, now: datetime) -> bool:
    if _is_subscription_active(row, now):
        return True
    free_used = int(row["free_leads_used"] or 0)
    free_total = int(row["free_leads_total"] or 0)
    return free_used < free_total


def _build_lead_keyboard(lead: Lead, category_id: int, show_contact: bool, price_rub: int):
    if show_contact:
        contact_url = extract_contact_url(lead.contact)
        return lead_actions_keyboard(category_id=category_id, contact_url=contact_url)
    return pay_contact_keyboard(category_id=category_id, lead_id=lead.lead_id, price_rub=price_rub)


async def start_payment_polling(
    bot: Bot,
    db: Database,
    payments: PaymentService,
    config: Config,
    leads: LeadService,
) -> None:
    if not payments.enabled:
        return
    while True:
        if not await db.is_leadbot_enabled():
            await asyncio.sleep(config.payments_poll_interval_seconds)
            continue
        try:
            expired = await db.cancel_expired_payments(max_age_seconds=7200)
            if expired:
                logging.info("Auto-canceled %d expired pending payments", expired)
            pending = await db.list_pending_payments()
            for payment_row in pending:
                try:
                    await refresh_and_process_payment(
                        db=db,
                        payments=payments,
                        config=config,
                        bot=bot,
                        leads=leads,
                        payment_row=payment_row,
                        notify=True,
                    )
                except Exception as exc:
                    logging.warning("Payment poll error for %s: %s", payment_row["payment_id"], exc)
        except Exception as exc:
            logging.exception("Payment polling failed: %s", exc)
        await asyncio.sleep(config.payments_poll_interval_seconds)


async def start_subscription_renewal(
    bot: Bot,
    db: Database,
    payments: PaymentService,
    config: Config,
) -> None:
    if not payments.enabled:
        return
    while True:
        if not await db.is_leadbot_enabled():
            await asyncio.sleep(config.subscription_renew_interval_seconds)
            continue
        try:
            await _process_subscription_renewals(bot, db, payments, config)
        except Exception as exc:
            logging.exception("Subscription renewal failed: %s", exc)
        await asyncio.sleep(config.subscription_renew_interval_seconds)


async def _process_subscription_renewals(
    bot: Bot,
    db: Database,
    payments: PaymentService,
    config: Config,
) -> None:
    now = datetime.now(timezone.utc)
    renew_before = now + timedelta(days=config.subscription_renew_before_days)
    rows = await db.list_subscriptions_for_renewal(renew_before.isoformat())
    if not rows:
        return
    recent_cutoff = (now - timedelta(hours=6)).isoformat()
    for row in rows:
        user_id = int(row["user_id"])
        category_id = int(row["category_id"])
        payment_method_id = row["payment_method_id"]
        if not payment_method_id:
            continue
        recent = await db.get_recent_pending_payment(user_id, category_id, "renewal", recent_cutoff)
        if recent:
            continue
        try:
            payment_row = await start_recurring_payment(
                db=db,
                payments=payments,
                config=config,
                user_id=user_id,
                category_id=category_id,
                amount_rub=config.subscription_price_rub,
                payment_method_id=payment_method_id,
            )
        except Exception as exc:
            logging.warning("Failed to create renewal payment for user %s: %s", user_id, exc)
            continue
        if payment_row and payment_row["status"] not in ("pending", "waiting_for_capture"):
            try:
                await refresh_and_process_payment(
                    db=db,
                    payments=payments,
                    config=config,
                    bot=bot,
                    leads=None,
                    payment_row=payment_row,
                    notify=True,
                )
            except Exception as exc:
                logging.warning("Failed to process renewal payment %s: %s", payment_row["payment_id"], exc)
