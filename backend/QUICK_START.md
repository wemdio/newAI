# Quick Start Guide - Telegram Lead Scanner

## 🚀 Быстрый старт (5 минут)

### Предварительные требования

1. ✅ Node.js v18+ установлен
2. ✅ У вас есть Supabase проект
3. ✅ У вас есть Telegram Bot Token
4. ✅ У вас есть OpenRouter API Key

### Шаг 1: Настройка базы данных

1. Откройте Supabase SQL Editor
2. Выполните миграции по порядку:
   - `backend/src/database/migrations/001_create_user_config.sql`
   - `backend/src/database/migrations/002_create_detected_leads.sql`
   - `backend/src/database/migrations/003_create_api_usage.sql`
   - `backend/src/database/migrations/004_create_processing_logs.sql`

### Шаг 2: Конфигурация

```bash
cd backend
cp .env.example .env
```

Отредактируйте `.env`:

```env
# ОБЯЗАТЕЛЬНЫЕ поля
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...

TELEGRAM_BOT_TOKEN=1234567890:ABCxxx
TELEGRAM_CHANNEL_ID=-1001234567

# Остальное можно оставить по умолчанию
PORT=3000
NODE_ENV=development
```

### Шаг 3: Установка и запуск

```bash
# Зависимости уже установлены
npm install  # если нужно переустановить

# Запуск в dev режиме
npm run dev
```

### Шаг 4: Создание конфигурации пользователя

**Вариант A: Через API (рекомендуется)**

```bash
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -H "x-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "openrouter_api_key": "sk-or-v1-xxx",
    "lead_prompt": "Find messages from people who are:\n- Looking for marketing help\n- Mentioning website development\n- Asking for recommendations",
    "telegram_channel_id": "-1001234567890",
    "is_active": true
  }'
```

**Вариант B: Через SQL**

```sql
INSERT INTO user_config (user_id, openrouter_api_key, lead_prompt, telegram_channel_id, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'sk-or-v1-xxx',
  'Find messages from people who are:
- Looking for marketing help
- Mentioning website development
- Asking for recommendations for agencies',
  '-1001234567890',
  true
);
```

### Шаг 5: Проверка

```bash
# Health check
curl http://localhost:3000/health

# Получить конфигурацию
curl http://localhost:3000/api/config \
  -H "x-user-id: 00000000-0000-0000-0000-000000000001"

# Тестировать prompt
curl -X POST http://localhost:3000/api/config/test-prompt \
  -H "Content-Type: application/json" \
  -H "x-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "lead_prompt": "Find people looking for developers",
    "openrouter_api_key": "sk-or-v1-xxx"
  }'
```

## ✅ Готово!

Система запущена и будет:
- ✅ Сканировать сообщения каждый час
- ✅ Находить лиды с помощью AI
- ✅ Постить их в Telegram канал
- ✅ Отслеживать расходы

## 📊 Просмотр результатов

```bash
# Просмотр лидов
curl http://localhost:3000/api/leads \
  -H "x-user-id: 00000000-0000-0000-0000-000000000001"

# Статистика
curl http://localhost:3000/api/analytics/dashboard \
  -H "x-user-id: 00000000-0000-0000-0000-000000000001"
```

## 🔧 Ручной запуск (для тестирования)

Создайте файл `test-scan.js`:

```javascript
import 'dotenv/config';
import { runHourlyScan } from './src/jobs/hourlyScanner.js';
import { initializeDatabase } from './src/config/database.js';

async function test() {
  await initializeDatabase();
  const results = await runHourlyScan();
  console.log('Scan results:', results);
}

test();
```

Запустите:
```bash
node test-scan.js
```

## 🎯 Примеры Lead Prompts

### Marketing Agency Leads
```
Find messages from people who are:
- Looking for marketing help or advertising services
- Mentioning website development or social media management
- Asking for recommendations for digital marketing agencies
- Expressing frustration with current marketing results
- Mentioning budget for marketing services
```

### SaaS Sales Leads
```
Identify potential leads who are:
- Looking for CRM software or project management tools
- Mentioning problems with team collaboration
- Asking about automation tools
- Expressing need for better workflow management
- Mentioning they're a business owner or decision maker
```

### Developer Leads
```
Find messages where someone is:
- Looking for a web developer or programmer
- Mentioning they need an app or website built
- Asking for development cost estimates
- Looking for technical help with a project
- Mentioning specific technologies (React, Node.js, Python, etc.)
```

## 🐛 Troubleshooting

### "Cannot connect to database"
- Проверьте `SUPABASE_URL` и `SUPABASE_ANON_KEY`
- Убедитесь что миграции выполнены

### "Telegram bot cannot post"
- Проверьте что бот добавлен в канал как admin
- Channel ID должен начинаться с `-100`

### "OpenRouter API error"
- Проверьте API key
- Убедитесь что на балансе есть средства

### Cron не запускается
- Подождите до начала следующего часа
- Или запустите вручную через `test-scan.js`

## 📚 Документация

- **Полное руководство**: `backend/DEPLOYMENT_GUIDE.md`
- **Детали реализации**: `PROJECT_SUMMARY.md`
- **API документация**: `backend/README.md`

## 💰 Стоимость

**Gemini 2.0 Flash:**
- $0.10 / 1M input tokens
- $0.40 / 1M output tokens

**Средняя стоимость:**
- ~$0.05 за 1000 сообщений
- ~$5 за 100,000 сообщений

**Budget control:**
- Установите `MONTHLY_BUDGET_USD` в `.env`
- Система автоматически остановит анализ при превышении

## 🎉 Готово к использованию!

Система полностью автономна и будет работать 24/7 после запуска.

Первое сканирование произойдет в начале следующего часа (например, если сейчас 14:30, то в 15:00).

Удачи в поиске лидов! 🚀

