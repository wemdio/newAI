from dataclasses import dataclass
import os
from urllib.parse import quote, urlsplit
from typing import List, Optional


def _parse_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_optional_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    return int(value)


def _getenv(name: str, fallback_name: Optional[str] = None, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None and fallback_name:
        value = os.getenv(fallback_name)
    if value is None:
        return default
    return value


@dataclass(frozen=True)
class Config:
    bot_token: str
    admin_ids: List[int]
    sqlite_path: str
    leads_api_base: Optional[str]
    leads_api_token: Optional[str]
    supabase_dsn: Optional[str]
    supabase_poll_interval_seconds: int
    supabase_initial_backfill_limit: int
    supabase_ssl_insecure: bool
    leads_poll_interval_seconds: int
    leads_send_interval_seconds: int
    free_leads_total: int
    subscription_price_rub: int
    contact_price_rub: int
    subscription_duration_days: int
    promo_code: Optional[str]
    promo_duration_days: int
    subscription_auto_renew_default: bool
    subscription_renew_before_days: int
    subscription_renew_interval_seconds: int
    subscription_renew_retry_hours: int
    subscription_renew_max_attempts: int
    payments_poll_interval_seconds: int
    yookassa_shop_id: Optional[str]
    yookassa_secret_key: Optional[str]
    yookassa_return_url: Optional[str]
    yookassa_receipt_email: Optional[str]
    yookassa_receipt_vat_code: int
    yookassa_receipt_tax_system_code: Optional[int]
    log_level: str
    proxy: Optional[str]


def load_config() -> Config:
    bot_token = (_getenv("BOT_TOKEN", "LEADBOT_BOT_TOKEN", "") or "").strip()
    if not bot_token:
        raise RuntimeError("BOT_TOKEN is required")

    admin_ids_raw = (_getenv("ADMIN_IDS", "LEADBOT_ADMIN_IDS", "") or "").strip()
    admin_ids: List[int] = []
    if admin_ids_raw:
        for chunk in admin_ids_raw.split(","):
            chunk = chunk.strip()
            if chunk:
                admin_ids.append(int(chunk))

    sqlite_path = (_getenv("SQLITE_PATH", "LEADBOT_SQLITE_PATH", "./data/bot.db") or "./data/bot.db")
    leads_api_base = (_getenv("LEADS_API_BASE", "LEADBOT_LEADS_API_BASE", "") or "").strip() or None
    leads_api_token = (_getenv("LEADS_API_TOKEN", "LEADBOT_LEADS_API_TOKEN", "") or "").strip() or None
    supabase_dsn = (_getenv("SUPABASE_DSN", "LEADBOT_SUPABASE_DSN", "") or "").strip() or None
    if not supabase_dsn:
        supabase_host = (_getenv("SUPABASE_HOST", "LEADBOT_SUPABASE_HOST", "") or "").strip()
        supabase_port = (_getenv("SUPABASE_PORT", "LEADBOT_SUPABASE_PORT", "5432") or "5432").strip()
        supabase_db = (_getenv("SUPABASE_DB", "LEADBOT_SUPABASE_DB", "postgres") or "postgres").strip()
        supabase_user = (_getenv("SUPABASE_USER", "LEADBOT_SUPABASE_USER", "") or "").strip()
        supabase_password = (_getenv("SUPABASE_PASSWORD", "LEADBOT_SUPABASE_PASSWORD", "") or "").strip()
        supabase_sslmode = (_getenv("SUPABASE_SSLMODE", "LEADBOT_SUPABASE_SSLMODE", "require") or "require").strip()
        if supabase_host and ".supabase.co" in supabase_host and ".pooler." not in supabase_host:
            raise RuntimeError(
                "SUPABASE_HOST must be the pooler host (e.g. aws-0-<region>.pooler.supabase.com)"
            )
        if supabase_host and supabase_user and supabase_password:
            encoded_password = quote(supabase_password, safe="")
            supabase_dsn = (
                f"postgresql://{supabase_user}:{encoded_password}"
                f"@{supabase_host}:{supabase_port}/{supabase_db}?sslmode={supabase_sslmode}"
            )
    else:
        parts = urlsplit(supabase_dsn)
        host = parts.hostname or ""
        if ".supabase.co" in host and ".pooler." not in host:
            raise RuntimeError(
                "SUPABASE_DSN must use the pooler host (e.g. aws-0-<region>.pooler.supabase.com)"
            )
    supabase_poll_interval_seconds = _parse_int(
        _getenv("SUPABASE_POLL_INTERVAL_SECONDS", "LEADBOT_SUPABASE_POLL_SECONDS", "30"), 30
    )
    supabase_initial_backfill_limit = _parse_int(
        _getenv("SUPABASE_INITIAL_BACKFILL_LIMIT", "LEADBOT_BACKFILL_LIMIT", "300"), 300
    )
    supabase_ssl_insecure = _parse_bool(_getenv("SUPABASE_SSL_INSECURE", "LEADBOT_SUPABASE_SSL_INSECURE", "0"))

    leads_poll_interval_seconds = _parse_int(
        _getenv("LEADS_POLL_INTERVAL_SECONDS", "LEADBOT_LEADS_POLL_INTERVAL_SECONDS", "20"), 20
    )
    leads_send_interval_seconds = _parse_int(
        _getenv("LEADS_SEND_INTERVAL_SECONDS", "LEADBOT_LEADS_SEND_INTERVAL_SECONDS", "5"), 5
    )
    free_leads_total = _parse_int(_getenv("FREE_LEADS_TOTAL", "LEADBOT_FREE_LEADS", "10"), 10)
    subscription_price_rub = _parse_int(_getenv("SUBSCRIPTION_PRICE_RUB", "LEADBOT_PRICE_RUB", "990"), 990)
    contact_price_rub = _parse_int(_getenv("CONTACT_PRICE_RUB", "LEADBOT_CONTACT_PRICE_RUB", "90"), 90)
    subscription_duration_days = _parse_int(
        _getenv("SUBSCRIPTION_DURATION_DAYS", "LEADBOT_DURATION_DAYS", "30"), 30
    )
    promo_code = (_getenv("PROMO_CODE", "LEADBOT_PROMO_CODE", "") or "").strip() or None
    promo_duration_days = _parse_int(
        _getenv("PROMO_DURATION_DAYS", "LEADBOT_PROMO_DURATION_DAYS", "30"), 30
    )
    subscription_auto_renew_default = _parse_bool(
        _getenv("SUBSCRIPTION_AUTO_RENEW_DEFAULT", "LEADBOT_SUBSCRIPTION_AUTO_RENEW_DEFAULT", "1")
    )
    subscription_renew_before_days = _parse_int(
        _getenv("SUBSCRIPTION_RENEW_BEFORE_DAYS", "LEADBOT_SUBSCRIPTION_RENEW_BEFORE_DAYS", "1"), 1
    )
    subscription_renew_interval_seconds = _parse_int(
        _getenv("SUBSCRIPTION_RENEW_INTERVAL_SECONDS", "LEADBOT_SUBSCRIPTION_RENEW_INTERVAL_SECONDS", "3600"), 3600
    )
    # Minimum hours between auto-renew charge attempts for the same subscription.
    subscription_renew_retry_hours = _parse_int(
        _getenv("SUBSCRIPTION_RENEW_RETRY_HOURS", "LEADBOT_SUBSCRIPTION_RENEW_RETRY_HOURS", "6"), 6
    )
    # Give up auto-renew (disable it + notify the user) after this many declines.
    subscription_renew_max_attempts = _parse_int(
        _getenv("SUBSCRIPTION_RENEW_MAX_ATTEMPTS", "LEADBOT_SUBSCRIPTION_RENEW_MAX_ATTEMPTS", "3"), 3
    )
    payments_poll_interval_seconds = _parse_int(
        _getenv("PAYMENTS_POLL_INTERVAL_SECONDS", "LEADBOT_PAYMENTS_POLL_INTERVAL_SECONDS", "5"), 5
    )
    yookassa_shop_id = (_getenv("YOOKASSA_SHOP_ID", "LEADBOT_YOOKASSA_SHOP_ID", "") or "").strip() or None
    yookassa_secret_key = (_getenv("YOOKASSA_SECRET_KEY", "LEADBOT_YOOKASSA_SECRET_KEY", "") or "").strip() or None
    yookassa_return_url = (_getenv("YOOKASSA_RETURN_URL", "LEADBOT_YOOKASSA_RETURN_URL", "") or "").strip() or None
    yookassa_receipt_email = (_getenv("YOOKASSA_RECEIPT_EMAIL", "LEADBOT_YOOKASSA_RECEIPT_EMAIL", "") or "").strip() or None
    yookassa_receipt_vat_code = _parse_int(
        _getenv("YOOKASSA_RECEIPT_VAT_CODE", "LEADBOT_YOOKASSA_RECEIPT_VAT_CODE", "1"), 1
    )
    yookassa_receipt_tax_system_code = _parse_optional_int(
        _getenv("YOOKASSA_RECEIPT_TAX_SYSTEM_CODE", "LEADBOT_YOOKASSA_RECEIPT_TAX_SYSTEM_CODE")
    )
    log_level = _getenv("LOG_LEVEL", "LEADBOT_LOG_LEVEL", "INFO") or "INFO"
    # Optional proxy for reaching api.telegram.org (e.g. when hosted on a
    # network where Telegram Bot API is blocked). Format: socks5://user:pass@host:port
    # or http://user:pass@host:port. Empty = direct connection (default).
    proxy = (_getenv("PROXY", "LEADBOT_PROXY", "") or "").strip() or None

    return Config(
        bot_token=bot_token,
        admin_ids=admin_ids,
        sqlite_path=sqlite_path,
        leads_api_base=leads_api_base,
        leads_api_token=leads_api_token,
        supabase_dsn=supabase_dsn,
        supabase_poll_interval_seconds=supabase_poll_interval_seconds,
        supabase_initial_backfill_limit=supabase_initial_backfill_limit,
        supabase_ssl_insecure=supabase_ssl_insecure,
        leads_poll_interval_seconds=leads_poll_interval_seconds,
        leads_send_interval_seconds=leads_send_interval_seconds,
        free_leads_total=free_leads_total,
        subscription_price_rub=subscription_price_rub,
        contact_price_rub=contact_price_rub,
        subscription_duration_days=subscription_duration_days,
        promo_code=promo_code,
        promo_duration_days=promo_duration_days,
        subscription_auto_renew_default=subscription_auto_renew_default,
        subscription_renew_before_days=subscription_renew_before_days,
        subscription_renew_interval_seconds=subscription_renew_interval_seconds,
        subscription_renew_retry_hours=subscription_renew_retry_hours,
        subscription_renew_max_attempts=subscription_renew_max_attempts,
        payments_poll_interval_seconds=payments_poll_interval_seconds,
        yookassa_shop_id=yookassa_shop_id,
        yookassa_secret_key=yookassa_secret_key,
        yookassa_return_url=yookassa_return_url,
        yookassa_receipt_email=yookassa_receipt_email,
        yookassa_receipt_vat_code=yookassa_receipt_vat_code,
        yookassa_receipt_tax_system_code=yookassa_receipt_tax_system_code,
        log_level=log_level,
        proxy=proxy,
    )
