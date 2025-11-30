# Deployment Guide - Telegram Lead Scanner

Полное руководство по развертыванию системы Telegram Lead Scanner & Analyzer.

## 📋 Предварительные требования

### 1. Необходимые учетные записи

- **Supabase Account** - база данных PostgreSQL
- **OpenRouter Account** - API для AI модели Gemini
- **Telegram Bot** - создайте бота через @BotFather
- **Telegram Channel** - приватный канал для постинга лидов

### 2. Системные требования

- Node.js v18 или выше
- npm или yarn
- Git

## 🚀 Шаг 1: Подготовка базы данных (Supabase)

### 1.1 Создайте проект в Supabase

1. Зайдите на [supabase.com](https://supabase.com)
2. Создайте новый проект
3. Сохраните URL и ANON KEY

### 1.2 Запустите миграции

Откройте SQL Editor в Supabase Dashboard и выполните в порядке:

```sql
-- 1. Создайте таблицу user_config
-- Скопируйте и выполните содержимое src/database/migrations/001_create_user_config.sql

-- 2. Создайте таблицу detected_leads
-- Скопируйте и выполните содержимое src/database/migrations/002_create_detected_leads.sql

-- 3. Создайте таблицу api_usage
-- Скопируйте и выполните содержимое src/database/migrations/003_create_api_usage.sql

-- 4. Создайте таблицу processing_logs
-- Скопируйте и выполните содержимое src/database/migrations/004_create_processing_logs.sql
```

### 1.3 Проверьте таблицы

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_config', 'detected_leads', 'api_usage', 'processing_logs');
```

Должны быть созданы все 4 таблицы.

## 🤖 Шаг 2: Настройка Telegram Bot

### 2.1 Создайте бота

1. Найдите [@BotFather](https://t.me/botfather) в Telegram
2. Отправьте команду `/newbot`
3. Следуйте инструкциям для создания бота
4. Сохраните **Bot Token** (например: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2.2 Создайте приватный канал

1. Создайте новый канал в Telegram
2. Сделайте его приватным
3. Добавьте бота в администраторы канала
4. Получите Channel ID:
   - Отправьте сообщение в канал
   - Перешлите его боту [@userinfobot](https://t.me/userinfobot)
   - Скопируйте Channel ID (например: `-1001234567890`)

## 🔑 Шаг 3: Получите API ключи

### 3.1 OpenRouter API Key

1. Зарегистрируйтесь на [openrouter.ai](https://openrouter.ai)
2. Пополните баланс (минимум $1)
3. Перейдите в [Keys](https://openrouter.ai/keys)
4. Создайте новый API ключ
5. Сохраните ключ (начинается с `sk-or-...`)

### 3.2 Создайте JWT Secret

Сгенерируйте случайную строку (минимум 32 символа):

```bash
# Используйте один из методов:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# или
openssl rand -hex 32
```

## ⚙️ Шаг 4: Настройка приложения

### 4.1 Клонируйте проект и установите зависимости

```bash
# Перейдите в директорию backend
cd backend

# Зависимости уже установлены
# Если нужно переустановить:
npm install
```

### 4.2 Создайте .env файл

```bash
# Скопируйте пример
cp .env.example .env

# Отредактируйте .env
nano .env
```

### 4.3 Заполните .env файл

```env
# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

# AI Service (OpenRouter) - может быть настроен через UI
OPENROUTER_API_KEY=sk-or-your-api-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=google/gemini-2.0-flash-001

# Telegram Bot
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHANNEL_ID=-1001234567890

# Server Configuration
PORT=3000
NODE_ENV=production
API_BASE_URL=http://your-domain.com/api

# Security
JWT_SECRET=your-generated-jwt-secret-32-chars
ENCRYPTION_KEY=another-random-32-char-string

# Cost & Performance Limits
MONTHLY_BUDGET_USD=50
MAX_MESSAGES_PER_HOUR=10000
AI_CONFIDENCE_THRESHOLD=70

# Monitoring & Logging
LOG_LEVEL=info

# Site Information (for OpenRouter)
YOUR_SITE_URL=http://your-domain.com
YOUR_SITE_NAME=Telegram Lead Analyzer
```

## 🧪 Шаг 5: Тестирование

### 5.1 Проверьте подключение к базе данных

```bash
npm run test-db
```

Создайте файл `scripts/test-db.js`:

```javascript
import 'dotenv/config';
import { initializeDatabase, testConnection } from './src/config/database.js';

async function test() {
  try {
    await initializeDatabase();
    await testConnection();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

test();
```

### 5.2 Проверьте Telegram bot

```bash
npm run test-telegram
```

### 5.3 Запустите сервер в dev режиме

```bash
npm run dev
```

Проверьте:
- `http://localhost:3000` - должен вернуть информацию об API
- `http://localhost:3000/health` - должен показать статус всех сервисов

## 🎯 Шаг 6: Создание пользовательской конфигурации

### Через API

```bash
# Создайте конфигурацию пользователя
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -H "x-user-id: your-user-uuid" \
  -d '{
    "openrouter_api_key": "sk-or-your-api-key",
    "lead_prompt": "Find messages from people looking for marketing services...",
    "telegram_channel_id": "-1001234567890",
    "is_active": true
  }'
```

### Через SQL (временное решение)

```sql
INSERT INTO user_config (user_id, openrouter_api_key, lead_prompt, telegram_channel_id, is_active)
VALUES (
  'your-user-uuid',
  'sk-or-your-api-key',
  'Find messages from people who are:
- Looking for marketing help
- Mentioning website development
- Asking for recommendations for agencies',
  '-1001234567890',
  true
);
```

## 🔄 Шаг 7: Запуск в production

### 7.1 Используйте PM2 для управления процессом

```bash
# Установите PM2
npm install -g pm2

# Запустите приложение
pm2 start src/index.js --name telegram-lead-scanner

# Настройте автозапуск
pm2 startup
pm2 save

# Просмотр логов
pm2 logs telegram-lead-scanner

# Перезапуск
pm2 restart telegram-lead-scanner
```

### 7.2 Создайте ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'telegram-lead-scanner',
    script: './src/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
```

Запуск:

```bash
pm2 start ecosystem.config.js
```

## 🌐 Шаг 8: Настройка домена и HTTPS (опционально)

### 8.1 Используйте Nginx как reverse proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 8.2 Настройте SSL с Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📊 Шаг 9: Мониторинг

### 9.1 Проверка статуса

```bash
# Статус приложения
pm2 status

# Логи
pm2 logs --lines 100

# Мониторинг в реальном времени
pm2 monit
```

### 9.2 API endpoints для мониторинга

```bash
# Health check
curl http://localhost:3000/health

# Processing history
curl http://localhost:3000/api/analytics/performance \
  -H "x-user-id: your-user-uuid"

# Budget status
curl http://localhost:3000/api/analytics/budget \
  -H "x-user-id: your-user-uuid"
```

## 🧪 Шаг 10: Тестирование системы

### 10.1 Ручной запуск сканирования

```bash
# Создайте тестовый скрипт scripts/manual-scan.js
node scripts/manual-scan.js
```

### 10.2 Тестирование prompt

```bash
curl -X POST http://localhost:3000/api/config/test-prompt \
  -H "Content-Type: application/json" \
  -H "x-user-id: your-user-uuid" \
  -d '{
    "lead_prompt": "Find people looking for developers",
    "openrouter_api_key": "sk-or-your-api-key"
  }'
```

## ⚠️ Troubleshooting

### База данных не подключается

```bash
# Проверьте переменные окружения
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Проверьте подключение
psql "postgresql://postgres:[password]@[host]:5432/postgres"
```

### Cron job не запускается

```bash
# Проверьте логи
pm2 logs telegram-lead-scanner | grep "HOURLY SCAN"

# Ручной запуск для тестирования
curl -X POST http://localhost:3000/api/admin/trigger-scan
```

### Telegram бот не может постить

- Убедитесь что бот добавлен в канал как администратор
- Проверьте Channel ID (должен начинаться с `-100`)
- Проверьте права бота в канале

## 📈 Оптимизация производительности

### Настройка под высокую нагрузку

```javascript
// ecosystem.config.js
{
  instances: 2,  // Количество инстансов
  exec_mode: 'cluster',
  max_memory_restart: '500M'
}
```

### Настройка базы данных

```sql
-- Создайте дополнительные индексы для больших объемов
CREATE INDEX CONCURRENTLY idx_messages_time_chat 
ON messages(message_time DESC, chat_name);
```

## 🔒 Безопасность в production

1. **Никогда не коммитьте .env файлы**
2. **Используйте переменные окружения на сервере**
3. **Настройте firewall:**

```bash
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 80/tcp  # HTTP
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable
```

4. **Регулярно обновляйте зависимости:**

```bash
npm audit
npm audit fix
```

## 📝 Checklist развертывания

- [ ] Supabase проект создан
- [ ] Миграции выполнены
- [ ] Telegram bot создан
- [ ] Channel создан и бот добавлен как админ
- [ ] OpenRouter API key получен
- [ ] .env файл настроен
- [ ] Зависимости установлены
- [ ] База данных подключается
- [ ] Сервер запускается
- [ ] Health check проходит
- [ ] User config создан
- [ ] Тестовое сканирование работает
- [ ] PM2 настроен для production
- [ ] Логи настроены
- [ ] Мониторинг работает

## 📞 Поддержка

Если возникли проблемы:

1. Проверьте логи: `pm2 logs`
2. Проверьте health check: `curl http://localhost:3000/health`
3. Проверьте переменные окружения
4. Убедитесь что все миграции выполнены

## 🎉 Готово!

После выполнения всех шагов система будет:
- Сканировать сообщения каждый час
- Находить лиды с помощью AI
- Автоматически постить их в Telegram канал
- Отслеживать расходы и статистику

Проверьте что первое сканирование запустится в начале следующего часа!

