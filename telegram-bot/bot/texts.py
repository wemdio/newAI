from datetime import datetime
from typing import Optional

from .constants import Category


START_TEXT = (
    "Бот присылает реальные заявки из Telegram-чатов.\n\n"
    "Мы отслеживаем 200+ чатов и находим сообщения где ищут:\n\n"
    "• разработчиков\n"
    "• маркетологов\n"
    "• дизайнеров\n"
    "• подрядчиков\n"
    "• специалистов\n\n"
    "Вы получаете лиды сразу после появления.\n\n"
    "🎁 При старте — 10 бесплатных лидов.\n"
    "5 последних из базы + 5 новых.\n"
    "Выберите категорию:"
)


BONUS_ACCESS_TEXT = (
    "Можно получить бесплатный доступ на 30 дней. "
    "Если вы можете добавить нас в закрытый чат, где регулярно "
    "публикуются заявки и ищут подрядчиков — напишите @sorichev. "
    "После проверки мы выдадим бесплатный доступ к категориям."
)

REFERRAL_TEXT = "Также вы получаете +10 бесплатных заказов за каждого приглашенного друга."


def categories_text(price_rub: int) -> str:
    return (
        "Выберите категорию заявок.\n\n"
        f"{BONUS_ACCESS_TEXT}\n\n"
        f"{REFERRAL_TEXT}"
    )


def category_text(category: Category, price_rub: int) -> str:
    return (
        f"Категория: {category.full_title}\n\n"
        "Лидов:\n"
        f"{category.monthly_leads} в месяц\n\n"
        "Подписка:\n"
        f"{price_rub} ₽ / месяц\n\n"
        "После оплаты вы будете получать новые заявки сразу после их появления."
    )


def free_ended_text(price_rub: int) -> str:
    return (
        "Бесплатные лиды закончились.\n\n"
        "Чтобы продолжить получать заявки, оформите подписку.\n\n"
        "Стоимость:\n"
        f"{price_rub} ₽ / месяц"
    )


def subscription_activated_text(category: Category, duration_days: int) -> str:
    return (
        "Подписка активирована.\n\n"
        f"Категория:\n{category.title}\n\n"
        f"Срок:\n{duration_days} дней\n\n"
        "Новые лиды будут приходить автоматически."
    )


def subscription_renewed_text(category: Category, duration_days: int) -> str:
    return (
        "Подписка продлена.\n\n"
        f"Категория:\n{category.title}\n\n"
        f"Срок:\n{duration_days} дней\n\n"
        "Новые лиды будут приходить автоматически."
    )


def payment_link_text(category: Category, price_rub: int, duration_days: int) -> str:
    return (
        "Оплата подписки.\n\n"
        f"Категория:\n{category.title}\n\n"
        f"Стоимость:\n{price_rub} ₽ / {duration_days} дней\n\n"
        "При оплате способ оплаты будет сохранен для автопродления.\n"
        "Отменить автопродление можно в разделе «Мои подписки»."
    )


def payment_pending_text() -> str:
    return "Платеж еще обрабатывается. Попробуйте проверить позже."


def payment_canceled_text(category: Category) -> str:
    return (
        "Платеж отменен или истек.\n\n"
        f"Категория:\n{category.title}\n\n"
        "Если хотите оформить подписку, попробуйте еще раз."
    )


def autorenew_disabled_text(category: Category, end_date: datetime) -> str:
    return (
        "Автопродление отключено.\n\n"
        f"Категория:\n{category.title}\n\n"
        f"Доступ действует до:\n{end_date.strftime('%d.%m.%Y')}"
    )


def autorenew_enabled_text(category: Category, end_date: datetime) -> str:
    return (
        "Автопродление включено.\n\n"
        f"Категория:\n{category.title}\n\n"
        f"Доступ действует до:\n{end_date.strftime('%d.%m.%Y')}"
    )


def renewal_failed_text(category: Category) -> str:
    return (
        "Не удалось продлить подписку.\n\n"
        f"Категория:\n{category.title}\n\n"
        "Банк отклонил автосписание (нехватка средств или лимит карты), "
        "поэтому автопродление отключено.\n\n"
        "Чтобы продолжить получать заявки, оформите подписку заново — "
        "при оплате привяжется актуальная карта."
    )


def help_text(price_rub: int) -> str:
    return (
        "Бот присылает заявки из Telegram-чатов.\n\n"
        "Подписка:\n"
        f"{price_rub} ₽ / месяц за категорию.\n\n"
        "Вы получаете новые лиды сразу после их появления.\n\n"
        "Если есть вопросы: @sorichev\n\n"
        f"{BONUS_ACCESS_TEXT}\n\n"
        f"{REFERRAL_TEXT}"
    )


def grant_message(category: Category, duration_days: int, grant_type: str) -> str:
    text = (
        "Вам выдан бесплатный доступ.\n\n"
        f"Категория:\n{category.title}\n\n"
        f"Срок:\n{duration_days} дней\n\n"
    )
    if grant_type == "bonus":
        text += "Спасибо за помощь с источником лидов.\n"
    text += "Новые заявки будут приходить автоматически."
    return text


def my_subscriptions_text(lines: list[str]) -> str:
    header = "Ваши подписки\n\n"
    if not lines:
        return header + "У вас пока нет подписок."
    return header + "\n\n".join(lines)


def admin_stats_text(stats: dict) -> str:
    lines = [
        "📊 Статистика бота\n",
        "Пользователи:",
        f"  Всего: {stats['total_users']}",
        f"  Активировали бесплатные: {stats['activated_free']}",
        f"  С активной подпиской: {stats['active_subs']}",
        f"  Всего рефералов: {stats['total_referrals']}",
    ]

    if stats.get("active_users"):
        lines.append("\nАктивные подписчики:")
        for u in stats["active_users"]:
            gt = u["grant_type"]
            label = "/grant" if gt in ("admin", "bonus") else "оплатил"
            lines.append(f"  @{u['username'] or u['telegram_id']} — {gt} ({label})")

    if stats.get("payments"):
        lines.append("\nПоследние платежи:")
        for p in stats["payments"]:
            dt = str(p["created_at"])[:10]
            lines.append(f"  {p['status']} | @{p['username']} | {p['amount_rub']}₽ | {p['kind']} | {dt}")

    if stats.get("top_referrers"):
        lines.append("\nТоп рефереров:")
        for i, r in enumerate(stats["top_referrers"], 1):
            lines.append(f"  {i}. @{r['username'] or r['telegram_id']} — {r['ref_count']} приглашений")
    else:
        lines.append("\nРефералов пока нет.")

    return "\n".join(lines)


def invite_link_text(link: str) -> str:
    return (
        "Отправьте эту ссылку другу.\n"
        "За каждого друга, который запустит бота, "
        "вы получаете +10 бесплатных лидов.\n\n"
        f"{link}"
    )


def referral_bonus_text(username: str) -> str:
    who = f"@{username}" if username else "Новый пользователь"
    return f"{who} запустил бота по вашей ссылке! Вам начислено +10 бесплатных лидов."
