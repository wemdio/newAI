# 🚀 Инструкции по деплою (feature/ai-messaging)

## ✅ Что уже сделано:

### 1. Миграции Supabase (✅ Применены)
- `telegram_accounts` - аккаунты для рассылок  
- `messaging_campaigns` - кампании
- `ai_conversations` - диалоги с лидами
- `hot_leads` - горячие лиды

### 2. Frontend (✅ Задеплоен)
- **URL**: https://wemdio-newai-f678.twc1.net
- **Ветка**: feature/ai-messaging
- **Стоимость**: 1₽/мес

### 3. Backend (✅ Задеплоен)
- **URL**: https://wemdio-newai-1dc4.twc1.net
- **Имя**: newAI Backend AI-Messaging v3
- **Ветка**: feature/ai-messaging  
- **Стоимость**: 250₽/мес (1GB RAM, 1 CPU)

---

## ⚙️ Настройка переменных окружения

### Node.js Backend (https://wemdio-newai-1dc4.twc1.net)

Зайдите в панель Timeweb и добавьте следующие переменные:

```env
NODE_ENV=production
SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM
AI_MODEL=google/gemini-2.0-flash-001
BOT_TOKEN=ваш_телеграм_бот_токен
TELEGRAM_MINI_APP_BOT_TOKEN=ваш_телеграм_бот_токен
FRONTEND_URL=https://wemdio-newai-f678.twc1.net
```

**⚠️ ВАЖНО:**
- **НЕ добавляйте** `PORT` - Timeweb сам его установит
- **НЕ добавляйте** `OPENROUTER_API_KEY` - каждый пользователь вводит свой ключ в настройках

### Python Service (локально или отдельный сервер)

Создайте файл `backend/python-service/.env`:

```env
# Supabase
SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM
SUPABASE_DB_PASSWORD=ваш_пароль_от_БД

# Anti-ban настройки
MAX_MESSAGES_PER_DAY=25
MESSAGE_DELAY_MIN=30
MESSAGE_DELAY_MAX=120
ACCOUNT_SWITCH_DELAY=300

# Логирование
LOG_LEVEL=INFO
```

**⚠️ НЕ нужен** `OPENROUTER_API_KEY` - Python service использует ключ из БД для каждого пользователя!

---

## 🔑 Архитектура работы с API ключами

### Мультитенантность
Каждый пользователь (компания):
1. ✅ Логинится в приложение
2. ✅ Вводит свой OpenRouter API ключ в настройках
3. ✅ Ключ сохраняется в `user_config.openrouter_api_key`
4. ✅ Node.js backend использует этот ключ для анализа сообщений (Gemini)
5. ✅ Python service использует этот же ключ для AI общения (Claude)

### Каждый платит за себя
- ✅ Node.js backend: Gemini 2.0 Flash ($0.075 / 1M токенов) - анализ
- ✅ Python service: Claude 3.5 Sonnet ($3 / 1M токенов) - общение
- ✅ Все списывается с OpenRouter счета конкретного пользователя

---

## 🧪 Проверка работы

### 1. Backend Health Check
```bash
curl https://wemdio-newai-1dc4.twc1.net/health
```

Ожидаемый ответ:
```json
{
  "status": "healthy",
  "checks": {
    "server": "healthy",
    "database": {"status": "healthy"},
    "openrouter": {"status": "not_configured"},  // OK! User-specific keys
    "telegram": {"status": "configured"}
  }
}
```

### 2. Frontend
Откройте https://wemdio-newai-f678.twc1.net

### 3. Python Service (локально)
```bash
cd backend/python-service
python main.py
```

---

## 📝 Следующие шаги

1. ⚠️ **Настройте переменные окружения** в Timeweb для Backend v3
2. ⚠️ **Получите Database Password** из Supabase для Python service
3. ✅ **Протестируйте деплой** через health check
4. ✅ **Запустите Python service** локально для тестирования
5. 🎯 **Доработайте Frontend** - добавьте страницу AI Messaging

---

## 🆘 Частые ошибки

### Backend падает при запуске
- Проверьте переменные окружения в Timeweb
- Убедитесь что `SUPABASE_URL` и `SUPABASE_ANON_KEY` правильные

### "User has no OpenRouter API key"
- Пользователь должен ввести ключ в настройках приложения
- Проверьте что в таблице `user_config` есть `openrouter_api_key`

### Python service не подключается к БД
- Проверьте `SUPABASE_DB_PASSWORD` в .env
- Убедитесь что проект активен в Supabase

