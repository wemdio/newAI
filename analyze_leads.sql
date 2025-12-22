-- ═══════════════════════════════════════════════════════════════
-- АНАЛИЗ ЛИДОВ: ЧТО ЧАЩЕ ВСЕГО ИЩУТ (последний месяц)
-- Запусти в Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. ТОП-30 НИШИ ПО КОЛИЧЕСТВУ ЗАПРОСОВ
-- (только реальные запросы, без предложений услуг)
WITH requests AS (
    SELECT 
        LOWER(message) as msg,
        chat_name,
        username,
        message_time
    FROM messages
    WHERE message_time > NOW() - INTERVAL '1 month'
        AND (
            message ILIKE '%ищу %' 
            OR message ILIKE '%нужен %' 
            OR message ILIKE '%нужна %'
            OR message ILIKE '%нужно %'
            OR message ILIKE '%посоветуйте%'
            OR message ILIKE '%подскажите%'
            OR message ILIKE '%кто делает%'
            OR message ILIKE '%кто может%'
            OR message ILIKE '%требуется%'
        )
        -- Исключаем соискателей
        AND message NOT ILIKE '%ищу работу%'
        AND message NOT ILIKE '%ищу удален%'
        AND message NOT ILIKE '%резюме%'
        AND message NOT ILIKE '%готов рассмотреть%'
)
SELECT niche as "Ниша", cnt as "Запросов"
FROM (
    -- Маркетплейсы
    SELECT 'Wildberries' as niche, COUNT(*) FILTER (WHERE msg LIKE '%wildberries%' OR msg LIKE '% wb %' OR msg LIKE '% вб %') as cnt FROM requests
    UNION ALL SELECT 'Ozon', COUNT(*) FILTER (WHERE msg LIKE '%ozon%' OR msg LIKE '%озон%') FROM requests
    UNION ALL SELECT 'Карточки товаров/Инфографика', COUNT(*) FILTER (WHERE msg LIKE '%карточк%' OR msg LIKE '%инфографик%') FROM requests
    UNION ALL SELECT 'Маркетплейсы (общее)', COUNT(*) FILTER (WHERE msg LIKE '%маркетплейс%' OR msg LIKE '%мп %') FROM requests
    
    -- Дизайн
    UNION ALL SELECT 'Дизайн (общий)', COUNT(*) FILTER (WHERE msg LIKE '%дизайн%') FROM requests
    UNION ALL SELECT 'Логотип/Айдентика', COUNT(*) FILTER (WHERE msg LIKE '%логотип%' OR msg LIKE '%айдентик%' OR msg LIKE '%фирменн%стил%') FROM requests
    UNION ALL SELECT 'Веб-дизайн', COUNT(*) FILTER (WHERE msg LIKE '%веб%дизайн%' OR msg LIKE '%web%design%') FROM requests
    UNION ALL SELECT '3D визуализация', COUNT(*) FILTER (WHERE msg LIKE '%3d%' OR msg LIKE '%визуализ%' OR msg LIKE '%рендер%') FROM requests
    
    -- Разработка
    UNION ALL SELECT 'Сайты', COUNT(*) FILTER (WHERE msg LIKE '%сайт%') FROM requests
    UNION ALL SELECT 'Боты Telegram', COUNT(*) FILTER (WHERE msg LIKE '%бот%' AND (msg LIKE '%телеграм%' OR msg LIKE '%telegram%' OR msg LIKE '%тг %')) FROM requests
    UNION ALL SELECT 'Мобильные приложения', COUNT(*) FILTER (WHERE msg LIKE '%приложени%' OR msg LIKE '%ios%' OR msg LIKE '%android%') FROM requests
    UNION ALL SELECT 'CRM/Автоматизация', COUNT(*) FILTER (WHERE msg LIKE '%crm%' OR msg LIKE '%автоматиз%' OR msg LIKE '%интеграц%') FROM requests
    UNION ALL SELECT '1C', COUNT(*) FILTER (WHERE msg LIKE '%1с%' OR msg LIKE '%1c%') FROM requests
    
    -- Маркетинг
    UNION ALL SELECT 'SMM', COUNT(*) FILTER (WHERE msg LIKE '%smm%' OR msg LIKE '%смм%' OR msg LIKE '%соцсет%') FROM requests
    UNION ALL SELECT 'Таргет', COUNT(*) FILTER (WHERE msg LIKE '%таргет%') FROM requests
    UNION ALL SELECT 'SEO', COUNT(*) FILTER (WHERE msg LIKE '%seo%' OR msg LIKE '%сео%' OR msg LIKE '%продвижени%') FROM requests
    UNION ALL SELECT 'Контекстная реклама', COUNT(*) FILTER (WHERE msg LIKE '%контекст%' OR msg LIKE '%директ%' OR msg LIKE '%яндекс%реклам%') FROM requests
    UNION ALL SELECT 'Реклама Telegram', COUNT(*) FILTER (WHERE msg LIKE '%реклам%' AND msg LIKE '%телеграм%') FROM requests
    
    -- Контент
    UNION ALL SELECT 'Видео/Монтаж', COUNT(*) FILTER (WHERE msg LIKE '%видео%' OR msg LIKE '%монтаж%' OR msg LIKE '%видеограф%') FROM requests
    UNION ALL SELECT 'Копирайтинг/Тексты', COUNT(*) FILTER (WHERE msg LIKE '%копирайт%' OR msg LIKE '%текст%' OR msg LIKE '%статьи%') FROM requests
    UNION ALL SELECT 'Фото/Съемка', COUNT(*) FILTER (WHERE msg LIKE '%фото%' OR msg LIKE '%съемк%' OR msg LIKE '%фотограф%') FROM requests
    UNION ALL SELECT 'Reels/Shorts', COUNT(*) FILTER (WHERE msg LIKE '%reels%' OR msg LIKE '%рилс%' OR msg LIKE '%shorts%') FROM requests
    
    -- Логистика
    UNION ALL SELECT 'Китай/Карго', COUNT(*) FILTER (WHERE msg LIKE '%китай%' OR msg LIKE '%карго%' OR msg LIKE '%china%') FROM requests
    UNION ALL SELECT 'Логистика/Доставка', COUNT(*) FILTER (WHERE msg LIKE '%логист%' OR msg LIKE '%доставк%' OR msg LIKE '%перевоз%') FROM requests
    UNION ALL SELECT 'Фулфилмент', COUNT(*) FILTER (WHERE msg LIKE '%фулфил%' OR msg LIKE '%fulfil%') FROM requests
    
    -- Бизнес-услуги
    UNION ALL SELECT 'Бухгалтерия', COUNT(*) FILTER (WHERE msg LIKE '%бухгалтер%' OR msg LIKE '%бухучет%') FROM requests
    UNION ALL SELECT 'Юридические услуги', COUNT(*) FILTER (WHERE msg LIKE '%юрист%' OR msg LIKE '%юридич%' OR msg LIKE '%договор%') FROM requests
    UNION ALL SELECT 'Сертификация', COUNT(*) FILTER (WHERE msg LIKE '%сертифик%' OR msg LIKE '%декларац%') FROM requests
    
    -- Другое
    UNION ALL SELECT 'Найм/HR', COUNT(*) FILTER (WHERE msg LIKE '%подбор персонал%' OR msg LIKE '%рекрут%' OR msg LIKE '% hr %') FROM requests
    UNION ALL SELECT 'Обучение/Курсы', COUNT(*) FILTER (WHERE msg LIKE '%обучени%' OR msg LIKE '%курс%' OR msg LIKE '%наставник%') FROM requests
) t
WHERE cnt > 0
ORDER BY cnt DESC;

-- ═══════════════════════════════════════════════════════════════
-- 2. ПРИМЕРЫ СООБЩЕНИЙ ПО ТОПОВЫМ НИШАМ (последние 20)
-- ═══════════════════════════════════════════════════════════════
/*
SELECT 
    chat_name as "Канал",
    LEFT(message, 300) as "Сообщение",
    TO_CHAR(message_time, 'DD.MM HH24:MI') as "Время"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (message ILIKE '%ищу %' OR message ILIKE '%нужен %')
    AND message ILIKE '%дизайн%'  -- ← замени на нужную нишу
    AND message NOT ILIKE '%ищу работу%'
ORDER BY message_time DESC
LIMIT 20;
*/

-- ═══════════════════════════════════════════════════════════════
-- 3. СТАТИСТИКА: ЗАПРОСЫ vs ПРЕДЛОЖЕНИЯ
-- ═══════════════════════════════════════════════════════════════
SELECT type as "Тип", cnt as "Количество",
    ROUND(cnt * 100.0 / SUM(cnt) OVER(), 1) as "Процент %"
FROM (
    SELECT 'ЗАПРОСЫ (ищу/нужен)' as type, COUNT(*) as cnt
    FROM messages WHERE message_time > NOW() - INTERVAL '1 month'
        AND (message ILIKE '%ищу %' OR message ILIKE '%нужен %' OR message ILIKE '%нужна %')
        AND message NOT ILIKE '%ищу работу%'
    UNION ALL
    SELECT 'ПРЕДЛОЖЕНИЯ (делаю/оказываю)', COUNT(*)
    FROM messages WHERE message_time > NOW() - INTERVAL '1 month'
        AND (message ILIKE '%предлагаю%' OR message ILIKE '%делаю %' OR message ILIKE '%оказываю%')
) t;

-- ═══════════════════════════════════════════════════════════════
-- 4. ТОПОВЫЕ КАНАЛЫ С ЛИДАМИ
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    COUNT(*) as "Запросов",
    COUNT(DISTINCT username) as "Уник. авторов"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (message ILIKE '%ищу %' OR message ILIKE '%нужен %' OR message ILIKE '%посоветуйте%')
    AND message NOT ILIKE '%ищу работу%'
    AND chat_name IS NOT NULL
GROUP BY chat_name
HAVING COUNT(*) >= 5
ORDER BY COUNT(*) DESC
LIMIT 25;

