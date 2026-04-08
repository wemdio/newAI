from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from .constants import CATEGORIES


def main_menu_keyboard(is_admin: bool = False) -> ReplyKeyboardMarkup:
    rows = [
        [KeyboardButton(text="Категории")],
        [KeyboardButton(text="Мои подписки")],
        [KeyboardButton(text="Позвать друга")],
        [KeyboardButton(text="Помощь")],
    ]
    if is_admin:
        rows.append([KeyboardButton(text="Статистика")])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


def start_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть категории", callback_data="categories")]]
    )


def categories_keyboard() -> InlineKeyboardMarkup:
    rows = []
    row = []
    for category in CATEGORIES:
        label = f"{category.emoji} {category.title} ({category.monthly_leads} лид/мес)"
        row.append(InlineKeyboardButton(text=label, callback_data=f"cat:{category.id}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def category_actions_keyboard(
    category_id: int,
    show_buy: bool = True,
    show_autorenew_off: bool = False,
    show_autorenew_on: bool = False,
) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text="Получить бесплатные лиды", callback_data=f"free:{category_id}")]
    ]
    if show_buy:
        rows.append([InlineKeyboardButton(text="Купить подписку", callback_data=f"buy:{category_id}")])
    if show_autorenew_off:
        rows.append(
            [InlineKeyboardButton(text="Отменить автопродление", callback_data=f"autorenew_off:{category_id}")]
        )
    if show_autorenew_on:
        rows.append(
            [InlineKeyboardButton(text="Включить автопродление", callback_data=f"autorenew_on:{category_id}")]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def pay_required_keyboard(category_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Купить подписку", callback_data=f"buy:{category_id}")],
            [InlineKeyboardButton(text="Позвать друга (+10 лидов)", callback_data="invite_friend")],
            [InlineKeyboardButton(text="Выбрать другую категорию", callback_data="categories")],
        ]
    )


def my_actions_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Продлить", callback_data="categories")],
            [InlineKeyboardButton(text="Категории", callback_data="categories")],
        ]
    )


def lead_actions_keyboard(category_id: int, contact_url: str | None) -> InlineKeyboardMarkup | None:
    rows = []
    if contact_url:
        rows.append([InlineKeyboardButton(text="Открыть контакт", url=contact_url)])
    rows.append([InlineKeyboardButton(text="Следующий лид", callback_data=f"next:{category_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


def post_activation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Мои подписки", callback_data="my_subs")],
            [InlineKeyboardButton(text="Категории", callback_data="categories")],
        ]
    )


def pay_contact_keyboard(category_id: int, lead_id: int, price_rub: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=f"Открыть контакт — {price_rub} ₽",
                    callback_data=f"buycontact:{category_id}:{lead_id}",
                )
            ]
        ]
    )


def payment_keyboard(payment_url: str, payment_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Оплатить", url=payment_url)],
            [InlineKeyboardButton(text="Проверить оплату", callback_data=f"paycheck:{payment_id}")],
        ]
    )
