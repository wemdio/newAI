from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Optional


USERNAME_RE = re.compile(r"@([A-Za-z0-9_]{5,})")
TME_RE = re.compile(r"https?://t\.me/([A-Za-z0-9_]{5,})", re.IGNORECASE)
TME_SHORT_RE = re.compile(r"t\.me/([A-Za-z0-9_]{5,})", re.IGNORECASE)
HIDDEN_MARKERS = (
    "скрыт пользователем",
    "hidden by user",
    "🔒",
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().isoformat()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def extract_contact_url(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    if is_contact_hidden(text):
        return None
    match = TME_RE.search(text)
    if match:
        return f"https://t.me/{match.group(1)}"
    match = TME_SHORT_RE.search(text)
    if match:
        return f"https://t.me/{match.group(1)}"
    match = USERNAME_RE.search(text)
    if match:
        return f"https://t.me/{match.group(1)}"
    return None


def is_contact_hidden(text: Optional[str]) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(marker in lowered for marker in HIDDEN_MARKERS)
