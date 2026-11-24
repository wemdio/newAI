# LeadScanly

Бесплатная выдача заявок и контактов из Telegram-чатов. Вместо оплаты бот показывает предложение Polza. Переход по рекламным ссылкам необязателен.

**Переход с платной версии:** остановите все старые экземпляры бота и проверьте незавершённые платежи в кабинете провайдера. Уже выданные прямые ссылки на оплату не отзываются заменой кода. Не запускайте старый образ с действующими платёжными ключами. История платежей и доставки не удаляется.

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
│   ├── subscriptions.py       # Активация подписок
│   ├── scheduler.py           # Фоновые задачи (polling, доставка)
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
| `FREE_LEADS_TOTAL` | `10` | Устаревшее поле состояния; выдачу не ограничивает |
| `CATEGORY_MONTHLY_LEADS` | — | Переопределение лидов/мес. (`1=1200,marketing=540` или JSON) |
| `LOG_LEVEL` | `INFO` | Уровень логирования |

### Платёжные настройки

Ключи YooKassa и платёжные интервалы больше не нужны. Бот не создаёт счета и не запускает автосписания.

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

1. При выборе категории бот показывает предложение Polza со ссылками на базу и партнёрскую программу.
2. «Продолжить бесплатно» подключает выбранную категорию. При первом подключении до пяти последних заявок доступны по одной, без повтора уже отправленных.
3. Новые заявки приходят автоматически, с доступными контактами и без лимита. Реклама не добавляется в каждую заявку.

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
| `/my` | все | Подключённые категории и отвязка ранее сохранённой карты |
| `/pay`, `/promo` | все | Предложение Polza и переход к бесплатному выбору категории |
| `/help` | все | Справка |
| `/grant` | только `ADMIN_IDS` | Выдача доступа: `/grant <tg_id> <category> <days> [reason]` |

### Проверка перехода

- Открыть категорию, нажать «Продолжить бесплатно» без перехода по внешним ссылкам и получить заявку.
- Проверить старые кнопки покупки подписки и контакта. Для контакта продолжение должно открыть именно прежнюю заявку.
- Проверить ручную и автоматическую выдачу пользователю с исчерпанным прежним лимитом.
- Из каталога `telegram-bot`: `python -m unittest discover -s tests`.
