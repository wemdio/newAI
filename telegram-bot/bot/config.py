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
    subscription_duration_days: int
    subscription_auto_renew_default: bool
    subscription_renew_before_days: int
    subscription_renew_interval_seconds: int
    payments_poll_interval_seconds: int
    yookassa_shop_id: Optional[str]
    yookassa_secret_key: Optional[str]
    yookassa_return_url: Optional[str]
    log_level: str


def load_config() -> Config:
    bot_token = os.getenv("BOT_TOKEN", "").strip()
    if not bot_token:
        raise RuntimeError("BOT_TOKEN is required")

    admin_ids_raw = os.getenv("ADMIN_IDS", "").strip()
    admin_ids: List[int] = []
    if admin_ids_raw:
        for chunk in admin_ids_raw.split(","):
            chunk = chunk.strip()
            if chunk:
                admin_ids.append(int(chunk))

    sqlite_path = os.getenv("SQLITE_PATH", "./data/bot.db")
    leads_api_base = os.getenv("LEADS_API_BASE", "").strip() or None
    leads_api_token = os.getenv("LEADS_API_TOKEN", "").strip() or None
    supabase_dsn = os.getenv("SUPABASE_DSN", "").strip() or None
    if not supabase_dsn:
        supabase_host = os.getenv("SUPABASE_HOST", "").strip()
        supabase_port = os.getenv("SUPABASE_PORT", "").strip() or "5432"
        supabase_db = os.getenv("SUPABASE_DB", "").strip() or "postgres"
        supabase_user = os.getenv("SUPABASE_USER", "").strip()
        supabase_password = os.getenv("SUPABASE_PASSWORD", "").strip()
        supabase_sslmode = os.getenv("SUPABASE_SSLMODE", "").strip() or "require"
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
        os.getenv("SUPABASE_POLL_INTERVAL_SECONDS", "30"), 30
    )
    supabase_initial_backfill_limit = _parse_int(
        os.getenv("SUPABASE_INITIAL_BACKFILL_LIMIT", "300"), 300
    )
    supabase_ssl_insecure = _parse_bool(os.getenv("SUPABASE_SSL_INSECURE", "0"))

    leads_poll_interval_seconds = _parse_int(
        os.getenv("LEADS_POLL_INTERVAL_SECONDS", "20"), 20
    )
    leads_send_interval_seconds = _parse_int(
        os.getenv("LEADS_SEND_INTERVAL_SECONDS", "5"), 5
    )
    free_leads_total = _parse_int(os.getenv("FREE_LEADS_TOTAL", "10"), 10)
    subscription_price_rub = _parse_int(os.getenv("SUBSCRIPTION_PRICE_RUB", "990"), 990)
    subscription_duration_days = _parse_int(
        os.getenv("SUBSCRIPTION_DURATION_DAYS", "30"), 30
    )
    subscription_auto_renew_default = _parse_bool(
        os.getenv("SUBSCRIPTION_AUTO_RENEW_DEFAULT", "1")
    )
    subscription_renew_before_days = _parse_int(
        os.getenv("SUBSCRIPTION_RENEW_BEFORE_DAYS", "1"), 1
    )
    subscription_renew_interval_seconds = _parse_int(
        os.getenv("SUBSCRIPTION_RENEW_INTERVAL_SECONDS", "3600"), 3600
    )
    payments_poll_interval_seconds = _parse_int(
        os.getenv("PAYMENTS_POLL_INTERVAL_SECONDS", "5"), 5
    )
    yookassa_shop_id = os.getenv("YOOKASSA_SHOP_ID", "").strip() or None
    yookassa_secret_key = os.getenv("YOOKASSA_SECRET_KEY", "").strip() or None
    yookassa_return_url = os.getenv("YOOKASSA_RETURN_URL", "").strip() or None
    log_level = os.getenv("LOG_LEVEL", "INFO")

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
        subscription_duration_days=subscription_duration_days,
        subscription_auto_renew_default=subscription_auto_renew_default,
        subscription_renew_before_days=subscription_renew_before_days,
        subscription_renew_interval_seconds=subscription_renew_interval_seconds,
        payments_poll_interval_seconds=payments_poll_interval_seconds,
        yookassa_shop_id=yookassa_shop_id,
        yookassa_secret_key=yookassa_secret_key,
        yookassa_return_url=yookassa_return_url,
        log_level=log_level,
    )
