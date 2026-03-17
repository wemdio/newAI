from dataclasses import dataclass
import json
import os
from typing import Dict, Iterable


@dataclass(frozen=True)
class Category:
    id: int
    code: str
    title: str
    full_title: str
    emoji: str
    monthly_leads: int


_BASE_CATEGORIES = [
    Category(1, "development", "Разработка", "Разработка (сайт, приложение, бот)", "💻", 1260),
    Category(2, "infobusiness", "Инфобизнес", "Инфобизнес / Онлайн-школы", "🎓", 606),
    Category(3, "marketing", "Маркетинг", "Маркетинг / SMM / Реклама", "📣", 533),
    Category(4, "hr", "HR", "HR / Найм персонала", "👥", 472),
    Category(5, "design", "Дизайн", "Дизайн", "🎨", 476),
    Category(6, "realestate", "Недвижимость", "Недвижимость", "🏠", 441),
    Category(7, "legal", "Юриспруденция", "Юриспруденция", "⚖️", 366),
    Category(8, "finance", "Бухгалтерия", "Бухгалтерия / Финансы", "💰", 186),
    Category(9, "logistics", "Логистика", "Логистика / Карго / Китай", "📦", 190),
    Category(10, "marketplaces", "Маркетплейсы", "Маркетплейсы (WB / Ozon)", "🛒", 153),
    Category(11, "construction", "Строительство", "Строительство / Ремонт", "🔨", 156),
    Category(12, "tenders", "Тендеры", "Тендеры / Госзакупки", "📋", 61),
]


def _apply_monthly_leads_overrides(
    categories: Iterable[Category], raw_overrides: str
) -> list[Category]:
    raw_overrides = (raw_overrides or "").strip()
    if not raw_overrides:
        return list(categories)

    categories_list = list(categories)
    code_to_id = {category.code: category.id for category in categories_list}
    overrides: Dict[int, int] = {}

    def _set_override(key: str, value: str) -> None:
        key = str(key).strip()
        if not key:
            return
        try:
            count = int(str(value).strip())
        except (TypeError, ValueError):
            return
        if key.isdigit():
            overrides[int(key)] = count
            return
        category_id = code_to_id.get(key)
        if category_id is not None:
            overrides[int(category_id)] = count

    if raw_overrides.startswith("{"):
        try:
            data = json.loads(raw_overrides)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            for key, value in data.items():
                _set_override(str(key), str(value))
    else:
        for chunk in raw_overrides.split(","):
            chunk = chunk.strip()
            if not chunk or "=" not in chunk:
                continue
            key, value = chunk.split("=", 1)
            _set_override(key, value)

    if not overrides:
        return categories_list

    updated: list[Category] = []
    for category in categories_list:
        monthly_leads = overrides.get(category.id, category.monthly_leads)
        updated.append(
            Category(
                category.id,
                category.code,
                category.title,
                category.full_title,
                category.emoji,
                monthly_leads,
            )
        )
    return updated


CATEGORIES = _apply_monthly_leads_overrides(
    _BASE_CATEGORIES, os.getenv("CATEGORY_MONTHLY_LEADS", "")
)

CATEGORY_BY_ID = {c.id: c for c in CATEGORIES}
CATEGORY_BY_CODE = {c.code: c for c in CATEGORIES}
