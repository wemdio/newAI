from __future__ import annotations

from .constants import Category
from .leads import Lead
from .utils import is_contact_hidden


def format_lead_text(lead: Lead, category: Category, show_contact: bool) -> str:
    parts = [
        "Новая заявка",
        "",
        f"Категория: {category.title}",
        "",
        lead.text.strip() or "(текст отсутствует)",
    ]
    if show_contact:
        if lead.contact and not is_contact_hidden(lead.contact):
            parts.extend(["", "Контакт:", lead.contact.strip()])
    else:
        parts.extend(["", "Контакт скрыт.", "", "Оформите подписку чтобы видеть контакты."])
    if lead.source:
        parts.extend(["", "Источник:", str(lead.source).strip()])
    return "\n".join(parts)
