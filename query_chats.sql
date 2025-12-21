-- Список всех чатов с количеством сообщений (за последний месяц)
SELECT 
    chat_name as "Название чата",
    COUNT(*) as "Сообщений"
FROM messages
WHERE message_time > NOW() - INTERVAL '1 month'
    AND chat_name IS NOT NULL
GROUP BY chat_name
ORDER BY COUNT(*) DESC;


