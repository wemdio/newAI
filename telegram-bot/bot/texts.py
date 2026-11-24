from .constants import Category


START_TEXT = (
    "Лидсканер присылает заявки из Telegram-чатов. Выберите категорию, "
    "чтобы получать новые заявки с контактами бесплатно. Карта не нужна."
)

POLZA_OFFER_HTML = (
    "Лидсканер теперь бесплатный. Чтобы получать заявки, нажмите «Продолжить бесплатно».\n\n"
    "<b>Нужны потенциальные клиенты в B2B?</b>\n"
    '<a href="https://t.me/agencypolzabot?start=base_leadscan">'
    "Забирайте контакты по вашему ICP в боте Polza Agency</a>.\n\n"
    "<b>А ещё с Polza можно запартнёриться.</b> Для этого нужна своя база B2B-компаний.\n"
    "Рекомендуйте нас и получайте 20% с первого платежа (средний чек 150 000 ₽) "
    "и 10% с последующих платежей.\n\n"
    "Кейс партнёра: за 6 месяцев он передал 65 лидов, 22 стали сделками. "
    "Комиссия составила более 550 000 ₽.\n\n"
    '<a href="https://polzaagency.ru/partner?utm_source=tg&amp;utm_medium=botleadscan">'
    "Условия партнёрской программы</a>"
)


def categories_text() -> str:
    return "Выберите категорию. Заявки и контакты бесплатны, без лимита по количеству."




def autorenew_disabled_text(category: Category) -> str:
    return f"{category.title}: сохранённый способ оплаты отвязан. Доступ к заявкам бесплатный."


def help_text() -> str:
    return (
        "Откройте /categories, выберите категорию и нажмите «Продолжить бесплатно». "
        "Новые заявки будут приходить автоматически. Переходить по ссылкам Polza необязательно.\n\n"
        "Ваши категории: /my."
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
    header = "Ваши категории\n\n"
    if not lines:
        return header + "Вы пока не подключили ни одной категории."
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
            label = {
                "admin": "/grant",
                "bonus": "/grant",
                "promo": "промокод",
            }.get(gt, "оплатил")
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
    return f"Пригласите друга пользоваться Лидсканером бесплатно:\n{link}"
