# 🚀 Деплой Python Worker на Timeweb Cloud

## ✅ Что готово:

1. ✅ **Dockerfile** - `backend/Dockerfile.python-worker`
2. ✅ **Python сервис** - `backend/python-service/`
3. ✅ **Дефолтные API credentials** - session import работает без api_id/api_hash
4. ✅ **Commit готов**: `7562197fffc249784e7f14ab4bb6275a5121ccdb`

---

## 📋 План деплоя:

### 1️⃣ **Редеплоить Backend v5**

**Приложение:** `wemdio newai backend v5` (https://wemdio-newai-f239.twc1.net)

**Действия:**
1. Открыть в Timeweb панели
2. Нажать **"Редеплой"**
3. Commit SHA: **`7562197fffc249784e7f14ab4bb6275a5121ccdb`**
4. Нажать **"Запустить"**

**Что изменилось:**
- Session import теперь использует дефолтные Telegram API credentials
- Больше не нужно вводить api_id/api_hash при импорте

---

### 2️⃣ **Редеплоить Frontend v6**

**Приложение:** `wemdio newai frontend v6` (https://wemdio-newai-bc31.twc1.net)

**Действия:**
1. **ВАЖНО:** Переключить Dockerfile в репозитории (временно):
   ```bash
   cd "C:\Users\wemd1\Desktop\new ai"
   cp Dockerfile.backend Dockerfile.tmp
   cp Dockerfile Dockerfile.backend
   cp frontend/Dockerfile Dockerfile
   git add Dockerfile
   git commit -m "Switch to frontend Dockerfile for frontend v6 redeploy"
   git push origin feature/ai-messaging
   git log -1 --format="%H"
   ```

2. В Timeweb панели:
   - Нажать **"Редеплой"**
   - Использовать новый commit SHA
   - Нажать **"Запустить"**

3. **Вернуть Dockerfile назад** после успешного деплоя:
   ```bash
   cp Dockerfile.tmp Dockerfile
   git add Dockerfile
   git commit -m "Restore backend Dockerfile"
   git push origin feature/ai-messaging
   ```

**Что изменилось:**
- Убраны поля api_id/api_hash из формы импорта session
- Добавлена подсказка: "🔐 API credentials будут использованы автоматически"

---

### 3️⃣ **Создать Python Worker** ⭐

**Тип приложения:** Backend (Docker)

**Настройки:**

**Основное:**
- **Название:** `wemdio newai python worker`
- **Provider:** GitHub
- **Repository:** `wemdio/newAI`
- **Branch:** `feature/ai-messaging`
- **Commit SHA:** `7562197fffc249784e7f14ab4bb6275a5121ccdb`

**Build settings:**
- **Framework:** `docker` ⚠️ ВАЖНО!
- **Dockerfile path:** `backend/Dockerfile.python-worker`
- **Build command:** (оставить пустым, Docker сам соберет)
- **Run command:** (оставить пустым, использует CMD из Dockerfile)

**Environment Variables (ОБЯЗАТЕЛЬНО!):**
```env
SUPABASE_URL=https://vvopntdqtzqxdnktiqam.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_PASSWORD=<ваш_database_password>
MAX_MESSAGES_PER_DAY=25
MESSAGE_DELAY_MIN=30
MESSAGE_DELAY_MAX=120
ACCOUNT_SWITCH_DELAY=300
LOG_LEVEL=INFO
```

**Пресет (Тариф):**
- Выберите минимальный (worker не требует много ресурсов)
- Рекомендуется: **1 CPU, 512MB RAM** или больше

**Auto-deploy:**
- Выключить (для контроля)

---

## 🔧 Где взять SUPABASE_DB_PASSWORD?

1. Откройте **Supabase Dashboard**
2. Перейдите в **Settings** → **Database**
3. Найдите **Connection string** → **Password**
4. Скопируйте пароль

---

## 🎯 Проверка работы Python Worker:

После деплоя проверьте логи в Timeweb:

**✅ Успешный старт выглядит так:**
```
============================================================
🤖 AI Messaging Service
============================================================
Started at: 2025-11-14 03:30:00 UTC

🔧 Initializing components...
✅ Connected to Supabase
✅ All components initialized

============================================================
🔄 Iteration #1 - 03:30:05 UTC
============================================================

ℹ️ No active campaigns

⏸️ Sleeping for 60 seconds...
```

**❌ Ошибки:**
- `ValueError: SUPABASE_URL and SUPABASE_DB_PASSWORD must be set` - не указаны env variables
- `Connection refused` - неверный DB password
- `ModuleNotFoundError` - проблема с зависимостями (проверьте Dockerfile)

---

## 🚨 ВАЖНО: Session файлы

Python Worker использует `/tmp/sessions` для хранения session файлов.  
**Проблема:** При рестарте контейнера sessions будут потеряны.

**Решение (для production):**
1. Использовать **Volume mount** в Timeweb (если поддерживается)
2. Или хранить session strings в БД и создавать файлы on-the-fly

---

## 📊 Мониторинг:

**Логи Python Worker покажут:**
- Какие кампании активны
- Сколько сообщений отправлено
- Детекцию горячих лидов
- Ошибки и предупреждения

**В Frontend (AI Рассылки):**
- Обновления статуса аккаунтов (messages_sent_today)
- Новые диалоги в списке "Диалоги"
- Горячие лиды в "Горячие лиды"

---

## ✅ Итоговый чеклист:

- [ ] Backend v5 редеплоен с commit `7562197f`
- [ ] Frontend v6 редеплоен с commit `7562197f`
- [ ] Python Worker создан и запущен
- [ ] Environment variables добавлены
- [ ] Логи Python Worker показывают успешный старт
- [ ] В Configuration добавлен OpenRouter API key
- [ ] Создана тестовая кампания
- [ ] Проверено, что сообщения отправляются

---

## 🎉 После успешного деплоя:

1. Откройте https://wemdio-newai-bc31.twc1.net
2. Войдите под вашим аккаунтом
3. Перейдите в **Configuration** → добавьте **OpenRouter API key**
4. Перейдите в **AI Рассылки**
5. Создайте тестовую кампанию
6. Запустите её
7. Python Worker начнет работу! 🚀

---

**Напишите результат после каждого шага!** 📝


