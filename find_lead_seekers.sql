-- ═══════════════════════════════════════════════════════════════
-- КТО ИЩЕТ ЛИДОВ? (твоя целевая аудитория)
-- Люди которые пишут "нужны лиды", "ищу клиентов" и т.д.
-- ═══════════════════════════════════════════════════════════════

-- 1. ВСЕ СООБЩЕНИЯ ГДЕ ИЩУТ ЛИДОВ/КЛИЕНТОВ (последний месяц)
WITH lead_seekers AS (
    SELECT 
        id,
        chat_name,
        username,
        message,
        LOWER(message) as msg,
        message_time
    FROM messages
    WHERE message_time > NOW() - INTERVAL '1 month'
        AND (
            message ILIKE '%нужны лиды%'
            OR message ILIKE '%нужны лид%'
            OR message ILIKE '%ищу лидов%'
            OR message ILIKE '%ищу лиды%'
            OR message ILIKE '%нужны заявки%'
            OR message ILIKE '%ищу заявки%'
            OR message ILIKE '%нужны клиенты%'
            OR message ILIKE '%ищу клиентов%'
            OR message ILIKE '%не хватает лидов%'
            OR message ILIKE '%не хватает клиентов%'
            OR message ILIKE '%не хватает заявок%'
            OR message ILIKE '%мало лидов%'
            OR message ILIKE '%мало заявок%'
            OR message ILIKE '%нехватка лидов%'
            OR message ILIKE '%нехватка клиентов%'
            OR message ILIKE '%где брать лидов%'
            OR message ILIKE '%где брать клиентов%'
            OR message ILIKE '%где искать лидов%'
            OR message ILIKE '%где искать клиентов%'
            OR message ILIKE '%как найти лидов%'
            OR message ILIKE '%как найти клиентов%'
            OR message ILIKE '%куплю лиды%'
            OR message ILIKE '%куплю лидов%'
            OR message ILIKE '%куплю заявки%'
            OR message ILIKE '%купить лиды%'
            OR message ILIKE '%лидогенерация%'
            OR message ILIKE '%лидген%'
        )
)

-- 2. СКОЛЬКО ВСЕГО ТАКИХ ЗАПРОСОВ
SELECT 'Всего запросов на лиды' as metric, COUNT(*) as value FROM lead_seekers;

-- ═══════════════════════════════════════════════════════════════
-- 3. ПО КАКИМ НИШАМ ИЩУТ ЛИДОВ (ТОП-25)
-- ═══════════════════════════════════════════════════════════════
WITH lead_seekers AS (
    SELECT LOWER(message) as msg
    FROM messages
    WHERE message_time > NOW() - INTERVAL '1 month'
        AND (
            message ILIKE '%нужны лиды%' OR message ILIKE '%ищу лидов%' OR message ILIKE '%ищу лиды%'
            OR message ILIKE '%нужны заявки%' OR message ILIKE '%ищу заявки%'
            OR message ILIKE '%нужны клиенты%' OR message ILIKE '%ищу клиентов%'
            OR message ILIKE '%куплю лиды%' OR message ILIKE '%куплю заявки%'
            OR message ILIKE '%где брать лидов%' OR message ILIKE '%где брать клиентов%'
            OR message ILIKE '%лидогенерация%' OR message ILIKE '%лидген%'
        )
)
SELECT niche as "Ниша (ищут лидов на...)", cnt as "Запросов"
FROM (
    -- Маркетинг/Реклама
    SELECT 'SMM/Соцсети' as niche, COUNT(*) FILTER (WHERE msg LIKE '%smm%' OR msg LIKE '%смм%' OR msg LIKE '%соцсет%') as cnt FROM lead_seekers
    UNION ALL SELECT 'Таргет/Реклама', COUNT(*) FILTER (WHERE msg LIKE '%таргет%' OR msg LIKE '%реклам%') FROM lead_seekers
    UNION ALL SELECT 'SEO/Продвижение', COUNT(*) FILTER (WHERE msg LIKE '%seo%' OR msg LIKE '%сео%' OR msg LIKE '%продвижен%') FROM lead_seekers
    UNION ALL SELECT 'Маркетинг (общий)', COUNT(*) FILTER (WHERE msg LIKE '%маркетинг%' OR msg LIKE '%маркетолог%') FROM lead_seekers
    
    -- Дизайн
    UNION ALL SELECT 'Дизайн', COUNT(*) FILTER (WHERE msg LIKE '%дизайн%') FROM lead_seekers
    UNION ALL SELECT 'Веб-дизайн/Сайты', COUNT(*) FILTER (WHERE msg LIKE '%сайт%' OR msg LIKE '%веб%') FROM lead_seekers
    UNION ALL SELECT 'Брендинг/Логотипы', COUNT(*) FILTER (WHERE msg LIKE '%логотип%' OR msg LIKE '%бренд%' OR msg LIKE '%фирменн%') FROM lead_seekers
    
    -- Разработка
    UNION ALL SELECT 'Разработка/IT', COUNT(*) FILTER (WHERE msg LIKE '%разработ%' OR msg LIKE '% it %' OR msg LIKE '%программ%') FROM lead_seekers
    UNION ALL SELECT 'Боты', COUNT(*) FILTER (WHERE msg LIKE '%бот%') FROM lead_seekers
    UNION ALL SELECT 'Приложения', COUNT(*) FILTER (WHERE msg LIKE '%приложен%' OR msg LIKE '%мобильн%') FROM lead_seekers
    
    -- Маркетплейсы
    UNION ALL SELECT 'Маркетплейсы (WB/Ozon)', COUNT(*) FILTER (WHERE msg LIKE '%wildberries%' OR msg LIKE '%ozon%' OR msg LIKE '% wb %' OR msg LIKE '%маркетплейс%') FROM lead_seekers
    UNION ALL SELECT 'Карточки товаров', COUNT(*) FILTER (WHERE msg LIKE '%карточк%' OR msg LIKE '%инфографик%') FROM lead_seekers
    
    -- Услуги для бизнеса
    UNION ALL SELECT 'Бухгалтерия/Финансы', COUNT(*) FILTER (WHERE msg LIKE '%бухгалтер%' OR msg LIKE '%финанс%') FROM lead_seekers
    UNION ALL SELECT 'Юридические услуги', COUNT(*) FILTER (WHERE msg LIKE '%юрист%' OR msg LIKE '%юридич%') FROM lead_seekers
    UNION ALL SELECT 'Строительство/Ремонт', COUNT(*) FILTER (WHERE msg LIKE '%строител%' OR msg LIKE '%ремонт%' OR msg LIKE '%отделк%') FROM lead_seekers
    UNION ALL SELECT 'Недвижимость', COUNT(*) FILTER (WHERE msg LIKE '%недвижим%' OR msg LIKE '%риелтор%' OR msg LIKE '%квартир%') FROM lead_seekers
    
    -- Контент
    UNION ALL SELECT 'Видеопродакшн', COUNT(*) FILTER (WHERE msg LIKE '%видео%' OR msg LIKE '%монтаж%' OR msg LIKE '%съемк%') FROM lead_seekers
    UNION ALL SELECT 'Копирайтинг', COUNT(*) FILTER (WHERE msg LIKE '%копирайт%' OR msg LIKE '%текст%' OR msg LIKE '%контент%') FROM lead_seekers
    UNION ALL SELECT 'Фото', COUNT(*) FILTER (WHERE msg LIKE '%фото%') FROM lead_seekers
    
    -- Логистика
    UNION ALL SELECT 'Логистика/Доставка', COUNT(*) FILTER (WHERE msg LIKE '%логист%' OR msg LIKE '%доставк%' OR msg LIKE '%грузоперевоз%') FROM lead_seekers
    UNION ALL SELECT 'Китай/Карго', COUNT(*) FILTER (WHERE msg LIKE '%китай%' OR msg LIKE '%карго%') FROM lead_seekers
    
    -- Другое
    UNION ALL SELECT 'Обучение/Курсы', COUNT(*) FILTER (WHERE msg LIKE '%обучен%' OR msg LIKE '%курс%' OR msg LIKE '%тренинг%') FROM lead_seekers
    UNION ALL SELECT 'Ивент/Мероприятия', COUNT(*) FILTER (WHERE msg LIKE '%ивент%' OR msg LIKE '%event%' OR msg LIKE '%мероприят%') FROM lead_seekers
    UNION ALL SELECT 'HR/Рекрутинг', COUNT(*) FILTER (WHERE msg LIKE '% hr %' OR msg LIKE '%рекрут%' OR msg LIKE '%подбор персонал%') FROM lead_seekers
    UNION ALL SELECT 'Клининг', COUNT(*) FILTER (WHERE msg LIKE '%клининг%' OR msg LIKE '%уборк%') FROM lead_seekers
) t
WHERE cnt > 0
ORDER BY cnt DESC;

-- ═══════════════════════════════════════════════════════════════
-- 4. ПРИМЕРЫ РЕАЛЬНЫХ СООБЩЕНИЙ (последние 50)
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    username as "Юзер",
    LEFT(message, 300) as "Сообщение",
    TO_CHAR(message_time, 'DD.MM HH24:MI') as "Время"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (
        message ILIKE '%нужны лиды%' OR message ILIKE '%ищу лидов%' OR message ILIKE '%ищу лиды%'
        OR message ILIKE '%нужны заявки%' OR message ILIKE '%ищу заявки%'
        OR message ILIKE '%нужны клиенты%' OR message ILIKE '%ищу клиентов%'
        OR message ILIKE '%куплю лиды%' OR message ILIKE '%куплю заявки%'
        OR message ILIKE '%где брать лидов%' OR message ILIKE '%где брать клиентов%'
        OR message ILIKE '%не хватает лидов%' OR message ILIKE '%мало лидов%'
        OR message ILIKE '%лидогенерация%' OR message ILIKE '%лидген%'
    )
ORDER BY message_time DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════
-- 5. В КАКИХ КАНАЛАХ БОЛЬШЕ ВСЕГО ИЩУТ ЛИДОВ
-- ═══════════════════════════════════════════════════════════════
SELECT 
    chat_name as "Канал",
    COUNT(*) as "Запросов на лиды"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND (
        message ILIKE '%нужны лиды%' OR message ILIKE '%ищу лидов%' OR message ILIKE '%ищу лиды%'
        OR message ILIKE '%нужны заявки%' OR message ILIKE '%ищу заявки%'
        OR message ILIKE '%нужны клиенты%' OR message ILIKE '%ищу клиентов%'
        OR message ILIKE '%куплю лиды%' OR message ILIKE '%лидогенерация%'
    )
    AND chat_name IS NOT NULL
GROUP BY chat_name
HAVING COUNT(*) >= 2
ORDER BY COUNT(*) DESC
LIMIT 20;

