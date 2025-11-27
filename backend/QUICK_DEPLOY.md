# ⚡ Быстрый деплой на Timeweb Cloud

## 🎯 Что нужно сделать СЕЙЧАС:

### 1️⃣ Подготовить GitHub репозиторий

**Если репозиторий еще не создан:**

1. Зайдите на **GitHub.com**
2. Создайте новый репозиторий (например: `telegram-lead-scanner`)
3. **НЕ** добавляйте README, .gitignore, лицензию
4. Скопируйте URL репозитория

**Обновите remote и запушьте код:**

```bash
cd "C:\Users\wemd1\Desktop\new ai"
git remote set-url origin https://github.com/YOUR-USERNAME/telegram-lead-scanner.git
git push -u origin main
```

---

### 2️⃣ Деплой Backend

1. **Timeweb Cloud Dashboard** → **"Приложения"** → **"Создать приложение"**
2. Настройки:
   - **Тип**: Backend
   - **Фреймворк**: Docker
   - **Название**: `telegram-lead-scanner-backend`
   - **VCS**: Подключите GitHub репозиторий
   - **Ветка**: `main`
   - **Dockerfile**: `Dockerfile` (из корня)
   - **Порт**: `3000`

3. **Переменные окружения:**
   ```
   SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key
   TELEGRAM_BOT_TOKEN=your-bot-token
   PORT=3000
   NODE_ENV=production
   ```

4. **Создать** и дождаться деплоя

5. **Проверить**: `https://wemdio-parserandscanner-40d8.twc1.net/health`

---

### 3️⃣ Деплой Frontend

1. **Timeweb Cloud Dashboard** → **"Приложения"** → **"Создать приложение"**
2. Настройки:
   - **Тип**: Frontend
   - **Фреймворк**: Docker
   - **Название**: `telegram-lead-scanner-frontend`
   - **VCS**: Тот же GitHub репозиторий
   - **Ветка**: `main`
   - **Dockerfile**: `frontend/Dockerfile`
   - **Порт**: `80`

3. **Переменные окружения (опционально):**
   ```
   VITE_SUPABASE_URL=https://liavhyhyzqadilfmicba.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_API_URL=https://wemdio-parserandscanner-40d8.twc1.net/api
   ```

4. **Создать** и дождаться деплоя

5. **Проверить**: Откройте frontend URL → должна быть страница входа

---

### 4️⃣ Настроить Supabase Auth

1. **Supabase Dashboard** → **Authentication** → **Providers** → **Email**
2. **Отключите** "Enable sign ups"
3. **Authentication** → **Users** → **Add user**
4. Создайте тестовый аккаунт с **Auto Confirm**

---

## ✅ Готово!

После этого:
- Backend будет доступен по своему URL
- Frontend будет доступен по своему URL
- При каждом push в `main` будет автоматический деплой

**Подробная инструкция**: См. `DEPLOY_STEPS.md`

