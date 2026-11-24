from __future__ import annotations

from .constants import Category
from .leads import Lead
from .utils import is_contact_hidden


def format_lead_text(lead: Lead, category: Category) -> str:
    parts = [
        "Новая заявка",
        "",
        f"Категория: {category.title}",
        "",
        lead.text.strip() or "(текст отсутствует)",
    ]
    if lead.contact and not is_contact_hidden(lead.contact):
        parts.extend(["", "Контакт:", lead.contact.strip()])
    if lead.source:
        parts.extend(["", "Источник:", str(lead.source).strip()])
    return "\n".join(parts)
