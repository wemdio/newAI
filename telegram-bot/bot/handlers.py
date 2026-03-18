from __future__ import annotations

import logging
from typing import Optional
from datetime import datetime, timezone

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, Message

from .config import Config
from .constants import CATEGORY_BY_CODE, CATEGORY_BY_ID, CATEGORIES, Category
from .db import Database
from .formatters import format_lead_text
from .keyboards import (
    category_actions_keyboard,
    categories_keyboard,
    lead_actions_keyboard,
    main_menu_keyboard,
    my_actions_keyboard,
    pay_contact_keyboard,
    pay_required_keyboard,
    payment_keyboard,
    post_activation_keyboard,
    start_keyboard,
)
from .payment_flow import refresh_and_process_payment, start_user_payment
from .payments import PaymentService
from .subscriptions import activate_subscription
from .leads import LeadService
from .texts import (
    START_TEXT,
    autorenew_disabled_text,
    autorenew_enabled_text,
    category_text,
    categories_text,
    free_ended_text,
    grant_message,
    help_text,
    my_subscriptions_text,
    payment_link_text,
    payment_pending_text,
)
from .utils import extract_contact_url, is_contact_hidden, iso_now, now_utc, parse_iso

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message, db: Database, config: Config) -> None:
    await db.ensure_user(message.from_user.id, message.from_user.username)
    await message.answer(START_TEXT, reply_markup=start_keyboard())
    await message.answer("Меню", reply_markup=main_menu_keyboard())


@router.message(Command("categories"))
@router.message(F.text == "Категории")
async def cmd_categories(message: Message, config: Config) -> None:
    await message.answer(
        categories_text(config.subscription_price_rub),
        reply_markup=categories_keyboard(),
    )


@router.callback_query(F.data == "categories")
async def cb_categories(query: CallbackQuery, config: Config) -> None:
    await query.message.answer(
        categories_text(config.subscription_price_rub),
        reply_markup=categories_keyboard(),
    )
    await query.answer()


@router.callback_query(F.data.startswith("cat:"))
async def cb_category(query: CallbackQuery, db: Database, config: Config) -> None:
    category_id = int(query.data.split(":", 1)[1])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    await db.ensure_user_category_state(user_id, category_id, config.free_leads_total)
    subscription = await db.get_subscription(user_id, category_id)
    has_active = _subscription_active(subscription)
    auto_renew = bool(subscription["auto_renew"]) if subscription else False
    has_payment_method = bool(subscription["payment_method_id"]) if subscription else False
    await query.message.answer(
        category_text(category, config.subscription_price_rub),
        reply_markup=category_actions_keyboard(
            category_id,
            show_buy=True,
            show_autorenew_off=has_active and auto_renew,
            show_autorenew_on=has_active and (not auto_renew) and has_payment_method,
        ),
    )
    await query.answer()


@router.callback_query(F.data.startswith("free:"))
async def cb_free_leads(
    query: CallbackQuery, db: Database, config: Config, leads: LeadService
) -> None:
    category_id = int(query.data.split(":", 1)[1])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    state = await db.ensure_user_category_state(user_id, category_id, config.free_leads_total)
    if int(state["free_started"]) == 1:
        if int(state["free_leads_used"]) >= int(state["free_leads_total"]):
            await query.message.answer(
                free_ended_text(config.subscription_price_rub),
                reply_markup=pay_required_keyboard(category_id),
            )
        else:
            await query.message.answer(
                "Бесплатные лиды уже активированы. Новые лиды будут приходить автоматически."
            )
        await query.answer()
        return

    await db.set_free_started(user_id, category_id, 1)
    latest_leads = await leads.get_latest(category_id, 5)
    if not latest_leads:
        await query.message.answer("Пока нет доступных лидов в этой категории.")
        await query.answer()
        return

    latest_leads = sorted(latest_leads, key=lambda item: item.lead_id)
    pending_ids: list[int] = []
    for lead in latest_leads:
        if lead.contact and is_contact_hidden(lead.contact):
            continue
        if await db.was_sent_lead(user_id, lead.lead_id):
            continue
        pending_ids.append(lead.lead_id)

    if not pending_ids:
        await query.message.answer("Пока нет новых лидов для выдачи.")
        await query.answer()
        return

    await db.clear_pending_leads(user_id, category_id)
    await db.enqueue_pending_leads(user_id, category_id, pending_ids)

    sent = await _send_next_lead(query.message, db, config, leads, user_id, category_id, category)
    if not sent:
        await query.message.answer("Пока нет новых лидов для выдачи.")
    await query.answer()


@router.callback_query(F.data.startswith("buycontact:"))
async def cb_buy_contact(
    query: CallbackQuery, db: Database, config: Config, payments: PaymentService
) -> None:
    parts = query.data.split(":")
    if len(parts) != 3:
        await query.answer("Ошибка", show_alert=True)
        return
    category_id = int(parts[1])
    lead_id = int(parts[2])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    await db.ensure_user_category_state(user_id, category_id, config.free_leads_total)
    if not payments.enabled:
        await query.message.answer("Оплата сейчас недоступна. Напишите в поддержку.")
        await query.answer()
        return
    pending = await db.get_latest_pending_payment(user_id, category_id, kind="contact", lead_id=lead_id)
    if pending and pending["confirmation_url"]:
        await query.message.answer(
            "У вас уже есть созданный платеж. Используйте его для оплаты.",
            reply_markup=payment_keyboard(pending["confirmation_url"], pending["payment_id"]),
        )
        await query.answer()
        return
    try:
        payment_row = await start_user_payment(
            db=db,
            payments=payments,
            config=config,
            user_id=user_id,
            category_id=category_id,
            amount_rub=config.subscription_price_rub,
            kind="contact",
            lead_id=lead_id,
        )
    except Exception as exc:
        logging.exception("Failed to create payment for contact: %s", exc)
        await query.message.answer("Не удалось создать платеж. Попробуйте позже.")
        await query.answer()
        return
    if not payment_row or not payment_row["confirmation_url"]:
        await query.message.answer("Не удалось создать платеж. Попробуйте позже.")
        await query.answer()
        return
    text = payment_link_text(category, config.subscription_price_rub, config.subscription_duration_days)
    text += "\n\nПосле оплаты мы отправим контакт."
    await query.message.answer(
        text,
        reply_markup=payment_keyboard(payment_row["confirmation_url"], payment_row["payment_id"]),
    )
    await query.answer()


@router.callback_query(F.data.startswith("buy:"))
async def cb_buy(
    query: CallbackQuery, db: Database, config: Config, payments: PaymentService
) -> None:
    category_id = int(query.data.split(":", 1)[1])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    await db.ensure_user_category_state(user_id, category_id, config.free_leads_total)
    if not payments.enabled:
        await query.message.answer("Оплата сейчас недоступна. Напишите в поддержку.")
        await query.answer()
        return
    pending = await db.get_latest_pending_payment(user_id, category_id, kind="subscription")
    if pending and pending["confirmation_url"]:
        await query.message.answer(
            "У вас уже есть созданный платеж. Используйте его для оплаты.",
            reply_markup=payment_keyboard(pending["confirmation_url"], pending["payment_id"]),
        )
        await query.answer()
        return
    try:
        payment_row = await start_user_payment(
            db=db,
            payments=payments,
            config=config,
            user_id=user_id,
            category_id=category_id,
            amount_rub=config.subscription_price_rub,
            kind="subscription",
        )
    except Exception as exc:
        logging.exception("Failed to create payment: %s", exc)
        await query.message.answer("Не удалось создать платеж. Попробуйте позже.")
        await query.answer()
        return
    if not payment_row or not payment_row["confirmation_url"]:
        await query.message.answer("Не удалось создать платеж. Попробуйте позже.")
        await query.answer()
        return
    await query.message.answer(
        payment_link_text(category, config.subscription_price_rub, config.subscription_duration_days),
        reply_markup=payment_keyboard(payment_row["confirmation_url"], payment_row["payment_id"]),
    )
    await query.answer()


@router.callback_query(F.data.startswith("paycheck:"))
async def cb_paycheck(
    query: CallbackQuery,
    db: Database,
    config: Config,
    payments: PaymentService,
    leads: LeadService,
) -> None:
    payment_id = query.data.split(":", 1)[1]
    payment_row = await db.get_payment_record(payment_id)
    if not payment_row:
        await query.answer("Платеж не найден", show_alert=True)
        return
    if not payments.enabled:
        await query.message.answer("Оплата сейчас недоступна. Попробуйте позже.")
        await query.answer()
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    if int(payment_row["user_id"]) != int(user_id):
        await query.answer("Нет доступа к платежу", show_alert=True)
        return
    try:
        status = await refresh_and_process_payment(
            db=db,
            payments=payments,
            config=config,
            bot=query.message.bot,
            leads=leads,
            payment_row=payment_row,
            notify=True,
        )
    except Exception as exc:
        logging.exception("Payment status check failed: %s", exc)
        await query.message.answer("Не удалось проверить оплату. Попробуйте позже.")
        await query.answer()
        return
    if status == "pending":
        await query.message.answer(payment_pending_text())
    elif status == "succeeded":
        await query.answer("Оплата подтверждена")
    elif status == "canceled":
        await query.answer("Платеж отменен", show_alert=True)
    else:
        await query.answer("Статус обновлен")


@router.callback_query(F.data.startswith("autorenew_off:"))
async def cb_autorenew_off(query: CallbackQuery, db: Database, config: Config) -> None:
    category_id = int(query.data.split(":", 1)[1])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    subscription = await db.get_subscription(user_id, category_id)
    if not _subscription_active(subscription):
        await query.answer("Нет активной подписки", show_alert=True)
        return
    await db.update_subscription_billing(
        user_id,
        category_id,
        auto_renew=0,
        canceled_at=iso_now(),
    )
    end_date = parse_iso(subscription["end_date"])
    await query.message.answer(autorenew_disabled_text(category, end_date))
    await query.answer()


@router.callback_query(F.data.startswith("autorenew_on:"))
async def cb_autorenew_on(query: CallbackQuery, db: Database, config: Config) -> None:
    category_id = int(query.data.split(":", 1)[1])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    subscription = await db.get_subscription(user_id, category_id)
    if not _subscription_active(subscription):
        await query.answer("Нет активной подписки", show_alert=True)
        return
    if not subscription["payment_method_id"]:
        await query.answer("Нет сохраненного способа оплаты", show_alert=True)
        return
    await db.update_subscription_billing(
        user_id,
        category_id,
        auto_renew=1,
        canceled_at=None,
    )
    end_date = parse_iso(subscription["end_date"])
    await query.message.answer(autorenew_enabled_text(category, end_date))
    await query.answer()


@router.callback_query(F.data.startswith("next:"))
async def cb_next_lead(
    query: CallbackQuery, db: Database, config: Config, leads: LeadService
) -> None:
    category_id = int(query.data.split(":", 1)[1])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    sent = await _send_next_lead(query.message, db, config, leads, user_id, category_id, category)
    if not sent:
        await query.answer("Новых лидов пока нет", show_alert=True)
        return
    await query.answer()


async def _build_my_subscriptions(db: Database, user_id: int):
    rows = await db.list_user_subscriptions(user_id)
    by_category = {row["category_id"]: row for row in rows}
    state_ids = set(await db.list_user_category_state_ids(user_id))
    relevant_ids = state_ids | set(by_category.keys())
    lines: list[str] = []
    now = datetime.now(timezone.utc)
    for category in CATEGORIES:
        if category.id not in relevant_ids:
            continue
        sub = by_category.get(category.id)
        if not sub:
            lines.append(f"{category.title}\nНет подписки")
            continue
        end_date = sub["end_date"]
        active = False
        try:
            active = parse_iso(end_date) >= now and sub["status"] == "active"
        except Exception:
            active = False
        if active:
            line = f"{category.title}\nАктивна до: {parse_iso(end_date).strftime('%d.%m.%Y')}"
            auto_renew = int(sub["auto_renew"] or 0)
            line += f"\nАвтопродление: {'включено' if auto_renew else 'выключено'}"
        else:
            line = f"{category.title}\nНет подписки"
        grant_type = sub["grant_type"]
        if grant_type in ("bonus", "admin") and active:
            line += "\nТип: бонусный доступ"
        lines.append(line)
    return my_subscriptions_text(lines), my_actions_keyboard()


@router.message(Command("my"))
@router.message(F.text == "Мои подписки")
async def cmd_my(message: Message, db: Database) -> None:
    user_id = await db.ensure_user(message.from_user.id, message.from_user.username)
    text, markup = await _build_my_subscriptions(db, user_id)
    await message.answer(text, reply_markup=markup)


@router.callback_query(F.data == "my_subs")
async def cb_my_subs(query: CallbackQuery, db: Database) -> None:
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    text, markup = await _build_my_subscriptions(db, user_id)
    await query.message.answer(text, reply_markup=markup)
    await query.answer()


@router.message(Command("pay"))
async def cmd_pay(message: Message, config: Config) -> None:
    await message.answer(
        categories_text(config.subscription_price_rub),
        reply_markup=categories_keyboard(),
    )


@router.message(Command("help"))
@router.message(F.text == "Помощь")
async def cmd_help(message: Message, config: Config) -> None:
    await message.answer(help_text(config.subscription_price_rub))


@router.message(Command("grant"))
async def cmd_grant(message: Message, db: Database, config: Config) -> None:
    if message.from_user.id not in config.admin_ids:
        await message.answer("Недостаточно прав.")
        return
    parts = message.text.split()
    if len(parts) < 4:
        await message.answer("Формат: /grant <telegram_id> <category_code|id|all> <days> [reason]")
        return
    telegram_id = int(parts[1])
    category_key = parts[2]
    days = int(parts[3])
    reason = parts[4] if len(parts) > 4 else "admin"

    if category_key.lower() == "all":
        target_categories = list(CATEGORIES)
    else:
        cat = CATEGORY_BY_CODE.get(category_key)
        if not cat:
            try:
                cat = CATEGORY_BY_ID.get(int(category_key))
            except ValueError:
                cat = None
        if not cat:
            await message.answer("Категория не найдена")
            return
        target_categories = [cat]

    user_row = await db.get_user_by_telegram_id(telegram_id)
    if user_row:
        user_id = int(user_row["id"])
    else:
        user_id = await db.ensure_user(telegram_id, None)

    grant_type = "bonus" if reason in ("bonus", "source_access_bonus") else "admin"
    granted_names = []
    last_end_date = None

    for category in target_categories:
        await db.ensure_user_category_state(user_id, category.id, config.free_leads_total)
        last_end_date = await activate_subscription(
            db,
            config,
            user_id,
            category.id,
            grant_type=grant_type,
            duration_days=days,
        )
        granted_names.append(category.title)

    if len(target_categories) == 1:
        cat = target_categories[0]
        try:
            await message.bot.send_message(
                telegram_id,
                grant_message(cat, days, grant_type),
                reply_markup=post_activation_keyboard(),
            )
        except Exception as exc:
            logging.warning("Failed to notify user %s: %s", telegram_id, exc)
        await message.answer(
            f"Доступ выдан: {cat.title} до {last_end_date.strftime('%d.%m.%Y')} (type: {grant_type})."
        )
    else:
        try:
            await message.bot.send_message(
                telegram_id,
                f"Вам выдан доступ ко всем {len(target_categories)} категориям на {days} дней!",
                reply_markup=post_activation_keyboard(),
            )
        except Exception as exc:
            logging.warning("Failed to notify user %s: %s", telegram_id, exc)
        await message.answer(
            f"Доступ выдан ко всем {len(granted_names)} категориям до {last_end_date.strftime('%d.%m.%Y')} (type: {grant_type})."
        )


def _resolve_access(state, subscription) -> bool:
    if _subscription_active(subscription):
        return True
    free_used = int(state["free_leads_used"] or 0)
    free_total = int(state["free_leads_total"] or 0)
    return free_used < free_total


def _subscription_active(subscription) -> bool:
    if not subscription:
        return False
    if subscription["status"] != "active":
        return False
    try:
        return parse_iso(subscription["end_date"]) >= datetime.now(timezone.utc)
    except Exception:
        return False


async def _send_next_lead(
    message: Message,
    db: Database,
    config: Config,
    leads: LeadService,
    user_id: int,
    category_id: int,
    category: Category,
) -> bool:
    state = await db.ensure_user_category_state(user_id, category_id, config.free_leads_total)
    subscription = await db.get_subscription(user_id, category_id)

    lead = await _get_pending_lead(leads, db, user_id, category_id)
    if not lead:
        max_sent_id = await db.get_max_sent_lead_id(user_id, category_id)
        new_leads = await leads.get_new(category_id, max_sent_id, limit=10)
        lead = next(
            (item for item in new_leads if not (item.contact and is_contact_hidden(item.contact))),
            None,
        )
    if not lead:
        return False

    show_contact = _resolve_access(state, subscription)
    text = format_lead_text(lead, category, show_contact)
    if show_contact:
        contact_url = extract_contact_url(lead.contact)
        reply_markup = lead_actions_keyboard(category_id, contact_url)
    else:
        reply_markup = pay_contact_keyboard(category_id, lead.lead_id, config.subscription_price_rub)
    await message.answer(text, reply_markup=reply_markup)
    inserted = await db.mark_sent_lead(user_id, category_id, lead.lead_id)
    if inserted and show_contact and not _subscription_active(subscription):
        await db.increment_free_leads_used(user_id, category_id, 1)
    return True


async def _get_pending_lead(
    leads: LeadService,
    db: Database,
    user_id: int,
    category_id: int,
) -> Optional["Lead"]:
    for _ in range(5):
        pending_id = await db.pop_pending_lead(user_id, category_id)
        if not pending_id:
            return None
        lead = await leads.get_by_id(pending_id)
        if not lead:
            continue
        if lead.contact and is_contact_hidden(lead.contact):
            continue
        return lead
    return None
