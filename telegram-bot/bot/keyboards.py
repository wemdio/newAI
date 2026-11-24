from __future__ import annotations

from collections.abc import Iterable

from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)

from .constants import CATEGORIES, Category


def main_menu_keyboard(is_admin: bool = False) -> ReplyKeyboardMarkup:
    rows = [
        [KeyboardButton(text="Категории")],
        [KeyboardButton(text="Мои категории")],
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


def offer_keyboard(continue_to: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Продолжить бесплатно", callback_data=continue_to)],
    ])


def my_actions_keyboard(cancel_categories: Iterable[Category] = ()) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton(
                text=f"Отвязать карту: {category.title}",
                callback_data=f"autorenew_off:{category.id}",
            )
        ]
        for category in cancel_categories
    ]
    rows.append([InlineKeyboardButton(text="Выбрать категорию", callback_data="categories")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def lead_actions_keyboard(category_id: int, contact_url: str | None) -> InlineKeyboardMarkup | None:
    rows = []
    if contact_url:
        rows.append([InlineKeyboardButton(text="Открыть контакт", url=contact_url)])
    rows.append([InlineKeyboardButton(text="Следующий лид", callback_data=f"next:{category_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


def post_activation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Мои категории", callback_data="my_subs")],
            [InlineKeyboardButton(text="Категории", callback_data="categories")],
        ]
    )
