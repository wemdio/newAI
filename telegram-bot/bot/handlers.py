from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from aiogram import F, Router
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramRetryAfter,
)
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from .config import Config
from .constants import CATEGORY_BY_CODE, CATEGORY_BY_ID, CATEGORIES, Category
from .db import Database
from .formatters import format_lead_text
from .keyboards import (
    categories_keyboard,
    lead_actions_keyboard,
    main_menu_keyboard,
    my_actions_keyboard,
    offer_keyboard,
    post_activation_keyboard,
    start_keyboard,
)
from .subscriptions import activate_subscription
from .leads import Lead, LeadService
from .texts import (
    START_TEXT,
    POLZA_OFFER_HTML,
    admin_stats_text,
    autorenew_disabled_text,
    categories_text,
    grant_message,
    help_text,
    invite_link_text,
    my_subscriptions_text,
)
from .utils import extract_contact_url, is_contact_hidden, iso_now, parse_iso

router = Router()
log = logging.getLogger(__name__)


async def _show_offer(message: Message, continue_to: str = "categories", title: str = "") -> None:
    await message.answer(
        title + POLZA_OFFER_HTML, parse_mode="HTML", disable_web_page_preview=True,
        reply_markup=offer_keyboard(continue_to),
    )


@router.message(CommandStart())
async def cmd_start(message: Message, db: Database, config: Config) -> None:
    user_id = await db.ensure_user(message.from_user.id, message.from_user.username)
    is_admin = message.from_user.id in config.admin_ids
    await message.answer(START_TEXT, reply_markup=start_keyboard())
    await message.answer("Меню", reply_markup=main_menu_keyboard(is_admin))

    args = (message.text or "").split(maxsplit=1)
    if len(args) > 1 and args[1].startswith("ref_"):
        try:
            referrer_telegram_id = int(args[1][4:])
        except ValueError:
            return
        if referrer_telegram_id == message.from_user.id:
            return
        referrer_row = await db.get_user_by_telegram_id(referrer_telegram_id)
        if not referrer_row:
            return
        referrer_id = int(referrer_row["id"])
        await db.save_referral(user_id, referrer_id)


@router.message(Command("pay", "promo"))
@router.message(F.text == "Активировать промокод")
async def cmd_offer(message: Message) -> None:
    await _show_offer(message)


@router.message(Command("categories"))
@router.message(F.text == "Категории")
async def cmd_categories(message: Message) -> None:
    await message.answer(
        categories_text(),
        reply_markup=categories_keyboard(),
    )


@router.callback_query(F.data == "categories")
async def cb_categories(query: CallbackQuery) -> None:
    await query.message.answer(
        categories_text(),
        reply_markup=categories_keyboard(),
    )
    await query.answer()


@router.callback_query(F.data == "invite_friend")
async def cb_invite_friend(query: CallbackQuery) -> None:
    bot_user = await query.bot.get_me()
    link = f"https://t.me/{bot_user.username}?start=ref_{query.from_user.id}"
    await query.message.answer(invite_link_text(link))
    await query.answer()


@router.message(F.text == "Позвать друга")
async def msg_invite_friend(message: Message) -> None:
    bot_user = await message.bot.get_me()
    link = f"https://t.me/{bot_user.username}?start=ref_{message.from_user.id}"
    await message.answer(invite_link_text(link))


@router.callback_query(F.data.startswith("cat:"))
@router.callback_query(F.data.startswith("free:"))
@router.callback_query(F.data.startswith("buy:"))
@router.callback_query(F.data.startswith("autorenew_on:"))
async def cb_category(query: CallbackQuery) -> None:
    category = CATEGORY_BY_ID.get(_category_id(query.data))
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    await query.answer()
    await _show_offer(query.message, f"activate:{category.id}", f"<b>{category.title}</b>\n\n")


def _category_id(data: str) -> int | None:
    value = data.split(":", 1)[-1]
    return int(value) if value.isascii() and value.isdigit() else None


@router.callback_query(F.data.startswith("activate:"))
async def cb_free_leads(
    query: CallbackQuery, db: Database, config: Config, leads: LeadService
) -> None:
    category_id = _category_id(query.data)
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    state = await db.ensure_user_category_state(user_id, category_id, config.free_leads_total)
    if int(state["free_started"]) == 1:
        await query.message.answer(
            "Эта категория уже подключена. Новые заявки приходят бесплатно.",
            reply_markup=lead_actions_keyboard(category_id, None),
        )
        await query.answer()
        return

    await db.set_free_started(user_id, category_id, 1)
    latest_leads = await leads.get_latest(category_id, 5)
    if not latest_leads:
        await query.message.answer("Категория подключена. Отправим заявку, когда она появится.")
        await query.answer()
        return

    latest_leads = sorted(latest_leads, key=lambda item: item.lead_id)
    visible_ids = [
        lead.lead_id for lead in latest_leads
        if not (lead.contact and is_contact_hidden(lead.contact))
    ]
    pending_ids: list[int] = []
    for lid in visible_ids:
        if not await db.was_sent_lead(user_id, lid):
            pending_ids.append(lid)

    if not pending_ids:
        await query.message.answer("Категория подключена. Пока нет новых заявок.")
        await query.answer()
        return

    await db.clear_pending_leads(user_id, category_id)
    await db.enqueue_pending_leads(user_id, category_id, pending_ids)

    sent = await _send_next_lead(query.message, db, leads, user_id, category_id, category)
    if not sent:
        await query.message.answer("Категория подключена. Пока нет новых заявок.")
    await query.answer()


@router.callback_query(F.data.startswith("buycontact:"))
@router.callback_query(F.data.startswith("reveal:"))
async def cb_contact(query: CallbackQuery, db: Database, leads: LeadService) -> None:
    parts = query.data.split(":")
    if len(parts) != 3 or not all(p.isascii() and p.isdigit() for p in parts[1:]):
        await query.answer("Некорректная ссылка", show_alert=True)
        return
    category_id, lead_id = map(int, parts[1:])
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    if parts[0] == "buycontact":
        await query.answer()
        await _show_offer(query.message, f"reveal:{category_id}:{lead_id}")
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    lead = await leads.get_by_id(lead_id) if await db.was_sent_lead(user_id, lead_id) else None
    if not lead or lead.category_id != category_id or not lead.contact or is_contact_hidden(lead.contact):
        await query.answer("Контакт недоступен", show_alert=True)
        return
    await query.answer()
    await query.message.answer(
        format_lead_text(lead, category),
        reply_markup=lead_actions_keyboard(category_id, extract_contact_url(lead.contact)),
    )


@router.callback_query(F.data.startswith("paycheck:"))
async def cb_paycheck(query: CallbackQuery) -> None:
    await query.answer()
    await _show_offer(query.message)


@router.callback_query(F.data.startswith("autorenew_off:"))
async def cb_autorenew_off(query: CallbackQuery, db: Database, config: Config) -> None:
    category_id = _category_id(query.data)
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    subscription = await db.get_subscription(user_id, category_id)
    if not subscription:
        await query.answer("Подписка не найдена", show_alert=True)
        return
    await db.update_subscription_billing(
        user_id,
        category_id,
        auto_renew=0,
        payment_method_id=None,
        canceled_at=iso_now(),
    )
    await query.message.answer(autorenew_disabled_text(category))
    await query.answer()


@router.callback_query(F.data.startswith("next:"))
async def cb_next_lead(
    query: CallbackQuery, db: Database, leads: LeadService
) -> None:
    category_id = _category_id(query.data)
    category = CATEGORY_BY_ID.get(category_id)
    if not category:
        await query.answer("Категория не найдена", show_alert=True)
        return
    user_id = await db.ensure_user(query.from_user.id, query.from_user.username)
    sent = await _send_next_lead(query.message, db, leads, user_id, category_id, category)
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
    cancel_categories: list[Category] = []
    for category in CATEGORIES:
        if category.id not in relevant_ids:
            continue
        sub = by_category.get(category.id)
        if category.id in state_ids or _subscription_active(sub):
            lines.append(f"{category.title}: заявки подключены бесплатно")
        if sub and (sub["payment_method_id"] or sub["auto_renew"]):
            cancel_categories.append(category)
    return my_subscriptions_text(lines), my_actions_keyboard(cancel_categories)


@router.message(Command("my"))
@router.message(F.text.in_({"Мои подписки", "Мои категории"}))
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


@router.message(Command("help"))
@router.message(F.text == "Помощь")
async def cmd_help(message: Message) -> None:
    await message.answer(help_text())


@router.message(Command("stats"))
@router.message(F.text == "Статистика")
async def cmd_stats(message: Message, db: Database, config: Config) -> None:
    if message.from_user.id not in config.admin_ids:
        return
    stats = await db.get_admin_stats()
    await message.answer(admin_stats_text(stats))


# ── Broadcast (admin) ────────────────────────────────────────────────────────
# Reply /broadcast to a message → bot copies that exact message (text, links,
# formatting, emoji preserved 1:1 via copy_message) to every bot user.
BROADCAST_DELAY = 0.05  # ~20 msgs/sec — safely under Telegram limits


@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message, db: Database, config: Config) -> None:
    if message.from_user.id not in config.admin_ids:
        return
    target = message.reply_to_message
    if target is None:
        await message.answer(
            "Рассылка: ответь (reply) командой /broadcast на сообщение, которое нужно "
            "разослать всем пользователям бота. Я пришлю тестовую копию и спрошу подтверждение."
        )
        return
    ids = await db.get_all_telegram_ids()
    total = len(ids)
    # Test copy to the admin so they see exactly how it will look.
    try:
        await message.bot.copy_message(
            chat_id=message.chat.id,
            from_chat_id=target.chat.id,
            message_id=target.message_id,
        )
    except Exception as exc:  # noqa: BLE001
        await message.answer(f"Не удалось скопировать сообщение: {exc}")
        return
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=f"✅ Разослать всем ({total})",
                    callback_data=f"bcast:{target.chat.id}:{target.message_id}",
                ),
                InlineKeyboardButton(text="❌ Отмена", callback_data="bcast_cancel"),
            ]
        ]
    )
    await message.answer(
        f"☝️ Так выглядит рассылка. Получателей в базе: <b>{total}</b>. "
        "Кто заблокировал бота — тем не дойдёт. Разослать?",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


@router.callback_query(F.data == "bcast_cancel")
async def cb_broadcast_cancel(callback: CallbackQuery, config: Config) -> None:
    if callback.from_user.id not in config.admin_ids:
        await callback.answer()
        return
    await callback.message.edit_text("Рассылка отменена.")
    await callback.answer()


@router.callback_query(F.data.startswith("bcast:"))
async def cb_broadcast_run(callback: CallbackQuery, db: Database, config: Config) -> None:
    if callback.from_user.id not in config.admin_ids:
        await callback.answer("Недостаточно прав.", show_alert=True)
        return
    try:
        _, from_chat_id_s, message_id_s = callback.data.split(":")
        from_chat_id = int(from_chat_id_s)
        message_id = int(message_id_s)
    except (ValueError, AttributeError):
        await callback.answer("Битые данные рассылки.", show_alert=True)
        return
    await callback.answer()
    bot = callback.bot
    ids = await db.get_all_telegram_ids()
    total = len(ids)
    await callback.message.edit_text(f"📤 Рассылка запущена… 0/{total}")

    sent = blocked = errors = 0
    for index, telegram_id in enumerate(ids, start=1):
        try:
            await bot.copy_message(
                chat_id=telegram_id, from_chat_id=from_chat_id, message_id=message_id
            )
            sent += 1
        except TelegramForbiddenError:
            blocked += 1
        except TelegramRetryAfter as exc:
            await asyncio.sleep(exc.retry_after + 1)
            try:
                await bot.copy_message(
                    chat_id=telegram_id, from_chat_id=from_chat_id, message_id=message_id
                )
                sent += 1
            except Exception:  # noqa: BLE001
                errors += 1
        except (TelegramBadRequest, TelegramAPIError):
            errors += 1
        except Exception:  # noqa: BLE001
            errors += 1
        if index % 100 == 0:
            try:
                await callback.message.edit_text(f"📤 Рассылка… {index}/{total}")
            except Exception:  # noqa: BLE001
                pass
        await asyncio.sleep(BROADCAST_DELAY)

    log.info("Broadcast done: sent=%s blocked=%s errors=%s total=%s", sent, blocked, errors, total)
    await callback.message.answer(
        "✅ Рассылка завершена.\n"
        f"Доставлено: <b>{sent}</b>\n"
        f"Заблокировали бота: <b>{blocked}</b>\n"
        f"Ошибок: <b>{errors}</b>\n"
        f"Всего в базе: {total}",
        parse_mode="HTML",
    )


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
    message: Message, db: Database, leads: LeadService,
    user_id: int, category_id: int, category: Category,
) -> bool:
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

    await message.answer(
        format_lead_text(lead, category),
        reply_markup=lead_actions_keyboard(category_id, extract_contact_url(lead.contact)),
    )
    await db.mark_sent_lead(user_id, category_id, lead.lead_id)
    return True


async def _get_pending_lead(
    leads: LeadService,
    db: Database,
    user_id: int,
    category_id: int,
) -> Lead | None:
    for _ in range(5):
        pending_id = await db.pop_pending_lead(user_id, category_id)
        if not pending_id:
            return None
        lead = await leads.get_by_id(pending_id)
        if not lead or lead.category_id != category_id or await db.was_sent_lead(user_id, pending_id):
            continue
        if lead.contact and is_contact_hidden(lead.contact):
            continue
        return lead
    return None
