-- БЫСТРЫЙ ЗАПРОС: Кто ищет лидов (оптимизирован)
-- Запускай по частям!

-- ═══════════════════════════════════════════════════════════════
-- ЧАСТЬ 1: ПРИМЕРЫ СООБЩЕНИЙ (запусти первым!)
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    username as "Юзер",
    LEFT(message, 250) as "Сообщение",
    TO_CHAR(message_time, 'DD.MM') as "Дата"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND message ILIKE '%нужны лиды%'
ORDER BY message_time DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════════════
-- ЧАСТЬ 2: Другие формулировки (запусти отдельно)
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    username as "Юзер", 
    LEFT(message, 250) as "Сообщение",
    TO_CHAR(message_time, 'DD.MM') as "Дата"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (message ILIKE '%ищу лидов%' OR message ILIKE '%ищу лиды%')
ORDER BY message_time DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════════════
-- ЧАСТЬ 3: Ищут клиентов/заявки
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    username as "Юзер",
    LEFT(message, 250) as "Сообщение",
    TO_CHAR(message_time, 'DD.MM') as "Дата"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (message ILIKE '%нужны клиенты%' OR message ILIKE '%ищу клиентов%')
ORDER BY message_time DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════════════
-- ЧАСТЬ 4: Покупают лиды
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    username as "Юзер",
    LEFT(message, 250) as "Сообщение",
    TO_CHAR(message_time, 'DD.MM') as "Дата"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (message ILIKE '%куплю лиды%' OR message ILIKE '%куплю заявки%')
ORDER BY message_time DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════════════
-- ЧАСТЬ 5: Лидогенерация
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    username as "Юзер",
    LEFT(message, 250) as "Сообщение",
    TO_CHAR(message_time, 'DD.MM') as "Дата"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (message ILIKE '%лидогенерация%' OR message ILIKE '%лидген%')
ORDER BY message_time DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════════════
-- ЧАСТЬ 6: ПОДСЧЁТ (каждый запрос отдельно)
-- ═══════════════════════════════════════════════════════════════
SELECT 'нужны лиды' as phrase, COUNT(*) as cnt
FROM messages WHERE message_time > NOW() - INTERVAL '1 month' AND message ILIKE '%нужны лиды%';

SELECT 'ищу лидов/лиды' as phrase, COUNT(*) as cnt
FROM messages WHERE message_time > NOW() - INTERVAL '1 month' AND (message ILIKE '%ищу лидов%' OR message ILIKE '%ищу лиды%');

SELECT 'нужны клиенты' as phrase, COUNT(*) as cnt
FROM messages WHERE message_time > NOW() - INTERVAL '1 month' AND message ILIKE '%нужны клиенты%';

SELECT 'ищу клиентов' as phrase, COUNT(*) as cnt
FROM messages WHERE message_time > NOW() - INTERVAL '1 month' AND message ILIKE '%ищу клиентов%';

SELECT 'куплю лиды/заявки' as phrase, COUNT(*) as cnt
FROM messages WHERE message_time > NOW() - INTERVAL '1 month' AND (message ILIKE '%куплю лиды%' OR message ILIKE '%куплю заявки%');

SELECT 'лидогенерация/лидген' as phrase, COUNT(*) as cnt
FROM messages WHERE message_time > NOW() - INTERVAL '1 month' AND (message ILIKE '%лидогенерация%' OR message ILIKE '%лидген%');

