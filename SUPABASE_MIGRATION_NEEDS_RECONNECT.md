# Добавление поля `needs_reconnect` в таблицу `telegram_accounts`

## 🎯 Зачем это нужно?

Теперь когда вы меняете прокси для аккаунта, Python Worker автоматически переподключит **только этот аккаунт**, не затрагивая других пользователей и их активные кампании!

## 📝 Инструкция

### 1. Откройте Supabase Dashboard
- Перейдите в https://supabase.com/dashboard
- Выберите ваш проект
- Откройте раздел **SQL Editor**

### 2. Создайте новый запрос
- Нажмите **New Query**

### 3. Вставьте и выполните SQL-скрипт

```sql
-- Add needs_reconnect column to telegram_accounts table
ALTER TABLE telegram_accounts 
ADD COLUMN IF NOT EXISTS needs_reconnect BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN telegram_accounts.needs_reconnect IS 'Set to true when account settings (e.g. proxy) changed and need reconnection';

-- Create index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_needs_reconnect 
ON telegram_accounts(needs_reconnect) 
WHERE needs_reconnect = true;
```

### 4. Запустите запрос
- Нажмите **Run** или `Ctrl+Enter`
- Убедитесь что видите "Success. No rows returned"

### 5. Проверьте результат

```sql
-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'telegram_accounts' 
  AND column_name = 'needs_reconnect';
```

## ✅ Готово!

Теперь система готова к graceful reconnect:

1. **Пользователь меняет прокси** → Frontend устанавливает `needs_reconnect = true`
2. **Python Worker видит флаг** → Переподключает только этот аккаунт
3. **Успешное переподключение** → Сбрасывает флаг в `false`
4. **Другие пользователи** → Не затронуты, их кампании продолжают работать

## 🚀 Что дальше?

После выполнения этого SQL-скрипта:

1. **Задеплойте обновления:**
   - Frontend: `git push origin frontend-deploy` → пересоберите в Timeweb
   - Worker: `git push origin worker-deploy` → пересоберите Python Worker

2. **Протестируйте:**
   - Измените прокси у аккаунта
   - Проверьте логи Python Worker
   - Убедитесь что аккаунт переподключился без перезагрузки всего воркера

## 📚 Дополнительная информация

### Как это работает технически?

**Backend API** (`backend/src/routes/messaging.js`):
```javascript
// При PUT /messaging/accounts/:id
{
  proxy_url: 'socks5://...',
  needs_reconnect: true  // <-- Frontend устанавливает этот флаг
}
```

**Python Worker** (`backend/python-service/main.py`):
```python
# В каждой итерации главного цикла (каждые 60 сек)
async def check_and_reconnect_accounts():
    accounts = await supabase.get_accounts_needing_reconnect()
    for account in accounts:
        await telethon.reconnect_account(account_id, account)
        await supabase.clear_reconnect_flag(account_id)
```

### Откат изменений (если что-то пошло не так)

```sql
-- Remove the column
ALTER TABLE telegram_accounts DROP COLUMN IF EXISTS needs_reconnect;

-- Remove the index
DROP INDEX IF EXISTS idx_telegram_accounts_needs_reconnect;
```

---

**Автор:** AI Assistant  
**Дата:** 2025-11-21  
**Версия:** 1.0

