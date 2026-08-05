# LeadScanly

Telegram-бот для доставки бизнес-лидов из 200+ Telegram-чатов. Freemium: 10 бесплатных лидов на категорию, далее подписка 990 руб./мес. с автопродлением через YooKassa.

**Стек:** Python 3.11, aiogram 3.4.1, SQLite (aiosqlite), asyncpg, httpx, YooKassa API, Docker.

---

## 1. Исходный код бота

```
leadscanly/
├── bot/
│   ├── __main__.py            # Точка входа (python -m bot)
│   ├── main.py                # Инициализация и event loop
│   ├── config.py              # Загрузка конфигурации из .env
│   ├── constants.py           # 12 категорий с метаданными
│   ├── db.py                  # SQLite: все CRUD-операции
│   ├── handlers.py            # Telegram-хендлеры (команды и callback'и)
│   ├── keyboards.py           # Inline- и reply-клавиатуры
│   ├── leads.py               # Сервис получения лидов (API / DB / Supabase)
│   ├── payments.py            # Клиент YooKassa API
│   ├── payment_flow.py        # Создание и обработка платежей
│   ├── subscriptions.py       # Активация подписок
│   ├── scheduler.py           # Фоновые задачи (polling, доставка, автопродление)
│   ├── supabase_importer.py   # Импорт лидов из Supabase PostgreSQL
│   ├── formatters.py          # Форматирование текста лидов
│   ├── texts.py               # Шаблоны сообщений
│   └── utils.py               # Утилиты (regex контактов, скрытие)
├── migrations/
│   ├── 001_init.sql
│   ├── 002_supabase.sql
│   └── 003_payments.sql
├── certs/                     # Кастомные CA-сертификаты (опционально)
├── data/                      # bot.db создаётся автоматически
├── supabase_rules.json        # Правила классификации по ключевым словам
├── requirements.txt
├── Dockerfile
├── .env.example
└── README.md
```

---

## 2. Dockerfile и команда запуска

### Dockerfile

```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

COPY bot /app/bot
COPY migrations /app/migrations
COPY supabase_rules.json /app/supabase_rules.json

ENV SQLITE_PATH=/app/data/bot.db
RUN mkdir -p /app/data

CMD ["python", "-m", "bot"]
```

### Команда запуска

```bash
# Сборка
docker build -t leadscanly-bot .

# Запуск
docker run --rm -it \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  leadscanly-bot
```

Если нужна host-сеть (корп. прокси, NAT):

```bash
docker run --rm -it --network=host \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  leadscanly-bot
```

Без Docker:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m bot
```

---

## 3. Переменные окружения (.env.example)

Полный файл — `.env.example` в корне проекта.

### Обязательные

| Переменная | Описание |
|-----------|----------|
| `BOT_TOKEN` | Токен Telegram-бота |
| `ADMIN_IDS` | ID админов через запятую |

### Хранилище

| Переменная | По умолчанию | Описание |
|-----------|:------------:|----------|
| `SQLITE_PATH` | `./data/bot.db` | Путь к SQLite-базе |

### Источник лидов — API (опционально)

| Переменная | Описание |
|-----------|----------|
| `LEADS_API_BASE` | Базовый URL сервиса лидов |
| `LEADS_API_TOKEN` | Токен авторизации API |

### Источник лидов — Supabase (опционально)

| Переменная | По умолчанию | Описание |
|-----------|:------------:|----------|
| `SUPABASE_DSN` | — | Строка подключения (приоритет над отдельными полями) |
| `SUPABASE_HOST` | — | Pooler-хост PostgreSQL |
| `SUPABASE_PORT` | `5432` | Порт |
| `SUPABASE_DB` | `postgres` | Имя базы |
| `SUPABASE_USER` | — | Пользователь |
| `SUPABASE_PASSWORD` | — | Пароль |
| `SUPABASE_SSLMODE` | `require` | Режим SSL |
| `SUPABASE_SSL_INSECURE` | `0` | Отключить проверку сертификата |
| `SUPABASE_POLL_INTERVAL_SECONDS` | `30` | Интервал опроса |
| `SUPABASE_INITIAL_BACKFILL_LIMIT` | `300` | Лимит первичного импорта |
| `SUPABASE_RULES_PATH` | — | Путь к JSON с правилами классификации |

### Поведение бота

| Переменная | По умолчанию | Описание |
|-----------|:------------:|----------|
| `LEADS_POLL_INTERVAL_SECONDS` | `20` | Интервал опроса новых лидов |
| `LEADS_SEND_INTERVAL_SECONDS` | `5` | Пауза между отправками (anti-flood) |
| `FREE_LEADS_TOTAL` | `10` | Бесплатных лидов на категорию |
| `CATEGORY_MONTHLY_LEADS` | — | Переопределение лидов/мес. (`1=1200,marketing=540` или JSON) |
| `LOG_LEVEL` | `INFO` | Уровень логирования |

### Подписки и платежи

| Переменная | По умолчанию | Описание |
|-----------|:------------:|----------|
| `SUBSCRIPTION_PRICE_RUB` | `990` | Цена подписки (руб.) |
| `SUBSCRIPTION_DURATION_DAYS` | `30` | Длительность (дней) |
| `PROMO_CODE` | — | Общий промокод для доступа ко всем категориям |
| `PROMO_DURATION_DAYS` | `30` | Срок доступа по промокоду |
| `SUBSCRIPTION_AUTO_RENEW_DEFAULT` | `1` | Автопродление по умолчанию |
| `SUBSCRIPTION_RENEW_BEFORE_DAYS` | `1` | За сколько дней до окончания продлевать |
| `SUBSCRIPTION_RENEW_INTERVAL_SECONDS` | `3600` | Интервал проверки автопродления |
| `PAYMENTS_POLL_INTERVAL_SECONDS` | `5` | Интервал проверки статусов платежей |
| `YOOKASSA_SHOP_ID` | — | ID магазина YooKassa |
| `YOOKASSA_SECRET_KEY` | — | Секретный ключ YooKassa |
| `YOOKASSA_RETURN_URL` | — | URL возврата после оплаты |

---

## 4. Инструкция деплоя

### Первый запуск

1. Клонировать репозиторий / распаковать архив
2. Скопировать `.env.example` в `.env`, заполнить обязательные переменные
3. Собрать и запустить:

```bash
docker build -t leadscanly-bot .
docker run -d --name leadscanly \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  leadscanly-bot
```

4. База данных и таблицы создаются автоматически при первом запуске

### Обновление

```bash
# Обновить код (git pull или распаковка нового архива)
docker build -t leadscanly-bot .
docker stop leadscanly && docker rm leadscanly
docker run -d --name leadscanly \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  leadscanly-bot
```

### Перезапуск

```bash
docker restart leadscanly
```

### Просмотр логов

```bash
docker logs -f leadscanly
```

### Кастомные CA-сертификаты

Если нужен доступ через корпоративный прокси или self-signed CA:

1. Положить `.crt` файлы в `certs/`
2. Пересобрать образ: `docker build -t leadscanly-bot .`

---

## 5. SQL-миграции и таблицы

Миграции применяются автоматически при старте. Отслеживание — таблица `schema_migrations`.

### Файлы миграций

| Файл | Что создаёт |
|------|-----------|
| `migrations/001_init.sql` | `users`, `categories`, `user_category_state`, `subscriptions`, `leads`, `sent_leads`, `category_state`, `pending_leads` |
| `migrations/002_supabase.sql` | `supabase_state` |
| `migrations/003_payments.sql` | `payments`, новые поля в `subscriptions` (автопродление, payment_method_id) |

### Таблицы и ключевые поля

| Таблица | Ключевые поля | Назначение |
|---------|--------------|-----------|
| `users` | `telegram_id` (PK), `username`, `created_at` | Пользователи бота |
| `categories` | `id` (PK), `code`, `title`, `full_title`, `emoji`, `monthly_leads` | 12 категорий ниш |
| `user_category_state` | `user_id` + `category_id` (PK), `free_leads_used`, `last_lead_id`, `active` | Состояние пользователя в категории, счётчик бесплатных лидов |
| `subscriptions` | `id` (PK), `user_id`, `category_id`, `status`, `starts_at`, `expires_at`, `grant_type`, `auto_renew`, `payment_method_id` | Подписки (платные, бонусные, админские) |
| `leads` | `id` (PK), `category_id`, `text`, `username`, `chat_title`, `message_url`, `created_at` | Хранилище лидов |
| `sent_leads` | `user_id` + `lead_id` (PK), `sent_at` | Дедупликация: какие лиды уже отправлены кому |
| `category_state` | `category_id` (PK), `last_lead_id` | Курсор polling'а — последний обработанный лид по категории |
| `pending_leads` | `user_id` + `lead_id` (PK), `category_id`, `position` | Очередь для постраничной выдачи |
| `supabase_state` | `key` (PK), `value` | Курсор Supabase-импортера (last_message_time, last_id) |
| `payments` | `id` (PK), `user_id`, `category_id`, `yookassa_id`, `status`, `amount`, `payment_type`, `created_at` | Все платежи |

---

## 6. Описание логики

### Как выбирается ниша

Пользователь выбирает категорию вручную через inline-клавиатуру (`/categories`). Доступно 12 категорий. Выбор сохраняется в `user_category_state`.

### Как определяется подходящий лид

Зависит от источника:

- **API** — лиды приходят уже с `category_id`, бот не фильтрует
- **Supabase** — импортер классифицирует сообщения по ключевым словам из `supabase_rules.json`. Каждая категория имеет набор паттернов; если текст сообщения содержит ключевое слово — присваивается соответствующий `category_id`
- **Локальная БД** — лиды уже лежат с `category_id` в таблице `leads`

### Как избежать дублей

Дедупликация на уровне БД: таблица `sent_leads` с составным первичным ключом `(user_id, lead_id)`. Перед отправкой бот проверяет, был ли этот лид уже отправлен данному пользователю. Если да — пропускает.

Дополнительно: лиды со скрытым контактом (username пустой, содержит "скрыт", "hidden" или символ 🔒) пропускаются автоматически.

### Порядок выдачи

1. Пользователь нажимает "Получить бесплатные лиды"
2. Бот загружает 5 последних лидов из истории в очередь `pending_leads`
3. Лиды выдаются по одному (кнопка "Следующий лид")
4. После 5 исторических — подписка на 5 новых лидов по мере появления
5. После 10 бесплатных (`free_leads_used = 10`) — контакты скрываются, предлагается покупка
6. При активной подписке — лимит снимается, доставка без ограничений

---

## 7. Где хранится состояние

| Что | Где | Таблица/поле |
|-----|-----|-------------|
| Подписки пользователей | SQLite | `subscriptions` (status, starts_at, expires_at, grant_type, auto_renew) |
| Выбранные ниши | SQLite | `user_category_state` (user_id + category_id, поле active) |
| Уже отправленные лиды | SQLite | `sent_leads` (user_id + lead_id) |
| Счётчик бесплатных лидов | SQLite | `user_category_state.free_leads_used` |
| Очередь постраничной выдачи | SQLite | `pending_leads` |
| Курсор polling'а | SQLite | `category_state.last_lead_id` |
| Курсор Supabase-импорта | SQLite | `supabase_state` |
| Платежи | SQLite | `payments` |
| Логи ошибок | stdout | Уровень настраивается через `LOG_LEVEL` (по умолчанию `INFO`) |

Вся БД — один файл `data/bot.db`. При Docker-запуске монтируется как volume (`-v $(pwd)/data:/app/data`), чтобы данные сохранялись между перезапусками.

---

## 8. Подключение Telegram

### Способ подключения

**Polling** (long polling). Webhook не используется — не нужен белый IP или домен.

Бот использует `aiogram 3.4.1`, запуск через `dp.start_polling(bot)`.

### Команды бота

| Команда | Доступ | Описание |
|---------|--------|----------|
| `/start` | все | Приветствие, онбординг, информация о бесплатных лидах |
| `/categories` | все | Список категорий, выбор ниши, экран категории |
| `/my` | все | Активные подписки, статус, управление автопродлением |
| `/pay` | все | Покупка подписки через YooKassa |
| `/promo КОД` | все | Активировать общий промокод на доступ ко всем нишам |
| `/help` | все | Справка, информация о бонусе за источник |
| `/grant` | только `ADMIN_IDS` | Выдача доступа: `/grant <tg_id> <category> <days> [reason]` |

### Callback-кнопки

- Выбор категории из списка
- "Получить бесплатные лиды" — старт выдачи
- "Следующий лид" — следующая страница
- "Купить подписку" — переход к оплате
- "Включить/выключить автопродление" — управление в `/my`

---

## 9. Тест-план

После переноса/деплоя проверить:

| # | Действие | Ожидаемый результат |
|---|---------|-------------------|
| 1 | `/start` | Приветственное сообщение с кнопкой "Категории" |
| 2 | `/categories` | Список 12 категорий с количеством лидов/мес. |
| 3 | Выбрать категорию | Экран категории с кнопкой "Получить бесплатные лиды" |
| 4 | Нажать "Получить бесплатные лиды" | Первый лид с контактом и кнопкой "Следующий лид" |
| 5 | Прокликать 5 лидов | 5 исторических лидов выданы, переход на ожидание новых |
| 6 | Добавить новый лид в источник | Лид приходит автоматически в течение 20 сек |
| 7 | Довести `free_leads_used` до 10 | Контакты скрыты (замена на `***`), кнопка "Купить подписку" |
| 8 | Нажать "Купить подписку" | Ссылка на оплату YooKassa, статус "ожидание" |
| 9 | Оплатить (тестовый режим YooKassa) | Подписка активна на 30 дней, контакты видны |
| 10 | `/my` | Отображение подписки, кнопка вкл/выкл автопродления |
| 11 | `/grant 123456 marketing 30 test` (от админа) | Подписка выдана, пользователь получил уведомление |
| 12 | Перезапустить бота | Все данные сохранены, подписки активны, счётчики на месте |
