# 🔧 Настройка переменных окружения для локальной разработки

## Backend (.env файл)

Создайте файл `backend/.env` с таким содержимым:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTU4NDU3MiwiZXhwIjoyMDc3MTYwNTcyfQ.QCr3bxvqBGOK9LRKqVHzl8K6Jqn_WIZjGdTWbP7VVRI

# AI Configuration
OPENROUTER_API_KEY=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

# Telegram Configuration
TELEGRAM_BOT_TOKEN=7862278028:AAHIKwpN5_CZSQcNl3uM4k-t2s-vXoqU52Q
TELEGRAM_CHANNEL_ID=-1002443635095
```

## Frontend (.env файл)

Создайте файл `frontend/.env` с таким содержимым:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM

# API Configuration (для локальной разработки)
VITE_API_URL=http://localhost:3000/api
```

## 📝 Как создать файлы:

### Вариант 1: Через PowerShell

```powershell
# Backend .env
@"
PORT=3000
NODE_ENV=development

SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTU4NDU3MiwiZXhwIjoyMDc3MTYwNTcyfQ.QCr3bxvqBGOK9LRKqVHzl8K6Jqn_WIZjGdTWbP7VVRI

OPENROUTER_API_KEY=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

TELEGRAM_BOT_TOKEN=7862278028:AAHIKwpN5_CZSQcNl3uM4k-t2s-vXoqU52Q
TELEGRAM_CHANNEL_ID=-1002443635095
"@ | Out-File -FilePath "backend\.env" -Encoding UTF8

# Frontend .env
@"
VITE_SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM
VITE_API_URL=http://localhost:3000/api
"@ | Out-File -FilePath "frontend\.env" -Encoding UTF8
```

### Вариант 2: Вручную

1. Откройте `backend/.env` в блокноте
2. Скопируйте содержимое из раздела "Backend (.env файл)" выше
3. Сохраните

4. Откройте `frontend/.env` в блокноте
5. Скопируйте содержимое из раздела "Frontend (.env файл)" выше
6. Сохраните

## 🔄 После создания файлов:

Перезапустите сервисы:
1. Закройте окна PowerShell с backend и frontend
2. Запустите заново

---

**✅ Готово! Теперь всё должно работать локально!**

