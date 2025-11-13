# AI Messaging Service (Python/Telethon)

Автоматический сервис для общения с лидами через Telegram с использованием AI (Claude 3.5 Sonnet).

## Требования

- Python 3.8+
- PostgreSQL (Supabase)
- OpenRouter API key (для Claude)
- Telegram API credentials (api_id, api_hash)

## Установка

```bash
# Создать виртуальное окружение
python -m venv venv

# Активировать (Windows)
venv\Scripts\activate

# Активировать (Linux/Mac)
source venv/bin/activate

# Установить зависимости
pip install -r requirements.txt
```

## Конфигурация

1. Скопируйте `.env.example` в `.env`
2. Заполните переменные окружения:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_DB_PASSWORD=your-db-password

# OpenRouter (Claude)
OPENROUTER_API_KEY=sk-or-v1-...

# Настройки безопасности
MAX_MESSAGES_PER_DAY=25
MESSAGE_DELAY_MIN=30
MESSAGE_DELAY_MAX=120
ACCOUNT_SWITCH_DELAY=300
```

## Структура

```
python-service/
  ├── main.py                 # Главный файл (запуск сервиса)
  ├── config.py               # Конфигурация
  ├── supabase_client.py      # Клиент БД
  ├── telethon_client.py      # Telethon клиент
  ├── tdata_converter.py      # Конвертер tdata -> session
  ├── ai_communicator.py      # AI общение (Claude)
  ├── safety_manager.py       # Антибан система
  ├── lead_manager.py         # Управление лидами
  ├── sessions/               # Telegram session файлы
  └── logs/                   # Логи
```

## Запуск

```bash
python main.py
```

## Как это работает

1. **Инициализация**: Подключение к Supabase, загрузка конфигурации
2. **Главный цикл** (каждую минуту):
   - Получить активные кампании из БД
   - Для каждой кампании:
     - Получить необработанные лиды (is_contacted=false)
     - Выбрать доступный аккаунт (ротация)
     - Генерировать первое сообщение через AI
     - Отправить сообщение через Telethon
     - Сохранить диалог в БД
3. **Обработка ответов**:
   - Слушать входящие сообщения
   - Генерировать ответы через AI
   - Проверять критерии горячего лида
   - Если горячий - сохранить и уведомить

## Антибан система

- **Лимиты**: Макс 25 сообщений/день на аккаунт
- **Задержки**: 30-120 сек между сообщениями (случайно)
- **Ротация**: 5 мин между переключениями аккаунтов
- **Прокси**: Поддержка SOCKS5/HTTP прокси
- **FloodWait**: Автоматическая обработка и пауза аккаунта
- **Бан-детекция**: Автоматическая пометка забаненных аккаунтов

## Добавление аккаунтов

### Способ 1: Через tdata (Telegram Desktop)

1. Экспортируйте tdata из Telegram Desktop
2. Загрузите через Frontend
3. Конвертация произойдет автоматически

### Способ 2: Вручную (через session файл)

1. Создайте session через Telethon:
```python
from telethon import TelegramClient
client = TelegramClient('session_name', api_id, api_hash)
await client.start(phone='+1234567890')
```

2. Разместите session файл в `sessions/`
3. Добавьте аккаунт через API

## API Integration

Сервис интегрирован с Node.js Backend через Supabase:

- Backend создает кампании и управляет аккаунтами
- Python сервис читает данные из БД
- Статусы и результаты сохраняются в БД
- Frontend получает обновления через Backend API

## Troubleshooting

### Ошибка: "Could not find TGConvertor"

Установите TGConvertor:
```bash
git clone https://github.com/nazar220160/TGConvertor
# Или скачайте binary
```

### Ошибка: "FloodWait"

Telegram ограничил аккаунт. Подождите указанное время или используйте другой аккаунт.

### Ошибка: "AuthKeyUnregistered"

Аккаунт забанен или session устарел. Создайте новый session.

### Ошибка подключения к БД

Проверьте `SUPABASE_DB_PASSWORD` и формат `DATABASE_URL` в config.py.

## Логи

Логи сохраняются в:
- Console (stdout)
- `logs/` (если настроено)

## Безопасность

⚠️ **Важно**:
- Никогда не коммитьте `.env` файлы
- Храните session файлы в безопасности
- Используйте прокси для множественных аккаунтов
- Соблюдайте лимиты Telegram

## Лицензия

MIT



