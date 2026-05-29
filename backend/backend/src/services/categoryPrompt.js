import logger from '../utils/logger.js';

const VALID_CATEGORIES = [
  'development',
  'infobusiness',
  'marketing',
  'hr',
  'design',
  'realestate',
  'legal',
  'finance',
  'logistics',
  'marketplaces',
  'construction',
  'tenders',
  'crypto'
];

const CATEGORY_LABELS = {
  development: 'Разработка (сайт, приложение, бот)',
  infobusiness: 'Инфобизнес / Онлайн-школы',
  marketing: 'Маркетинг / SMM / Реклама',
  hr: 'HR / Найм персонала',
  design: 'Дизайн',
  realestate: 'Недвижимость',
  legal: 'Юриспруденция',
  finance: 'Бухгалтерия / Финансы',
  logistics: 'Логистика / Карго / Китай',
  marketplaces: 'Маркетплейсы (WB / Ozon)',
  construction: 'Строительство / Ремонт',
  tenders: 'Тендеры / Госзакупки',
  crypto: 'Криптовалюта / P2P'
};

const SYSTEM_PROMPT = `Ты — строгий классификатор коммерческих запросов из Telegram-чатов. Твоя задача — определить, является ли сообщение КОММЕРЧЕСКИМ ЗАПРОСОМ, где человек готов ЗАПЛАТИТЬ за услугу/товар/специалиста.

ПРАВИЛА ОПРЕДЕЛЕНИЯ ЗАПРОСА (ВСЕ условия должны совпадать):
1. Человек ИЩЕТ конкретную услугу, специалиста или исполнителя
2. Подразумевается КОММЕРЧЕСКИЕ отношения (оплата, заказ, найм)
3. Сообщение содержит КОНКРЕТНУЮ задачу, которую нужно решить
  Маркеры: "ищу подрядчика", "нужен специалист", "кто делает", "сколько стоит", "нужно разработать", "хочу заказать", "требуется исполнитель", "кто возьмётся"

НЕ ЗАПРОС (отсеивать строго):
- Общие вопросы в чатах ("подскажите как...", "кто знает...", "что посоветуете...") — человек ищет СОВЕТ, а не исполнителя
- Ответы/рекомендации другим ("попробуй вот это", "используй такой-то сервис")
- Вопросы участников курсов/школ ("кто мой куратор?", "когда следующий урок?")
- Обсуждения, мнения, споры, опросы
- Просьбы о бесплатной помощи ("помогите разобраться")
- Сообщения соискателей: "ищу работу", "резюме", "рассмотрю предложения", "open to work" — это НЕ лид
- HR = только когда бизнес ищет HR-УСЛУГУ (рекрутинговое агентство, HR-аутсорсинг, подбор персонала как сервис). Прямые вакансии ("нужен менеджер", "ищем курьера", "нужны люди") — НЕ лид
- ПРЯМЫЕ ВАКАНСИИ и ПОДРАБОТКИ — НЕ лид: "нужны люди", "нужны грузчики/курьеры/водители", "ищем сотрудника", "ЗП ...", "зарплата ...", "оплата в день/неделю", "выплаты ежедневно", подработка на N часов
- ФИЗИЧЕСКАЯ / РУЧНАЯ РАБОТА — НЕ лид: разгрузка, погрузка, уборка, разбор склада, сборка мебели, ремонтные работы с указанием суммы за смену
- MLM / СЕТЕВОЙ МАРКЕТИНГ / СПАМ — НЕ лид: "онлайн-занятость", "удалённый заработок", "онлайн-работа от N руб", "доход без вложений", "пассивный доход", "финансовая свобода", "работа на себя", сетевой маркетинг
- Сообщения с ПОДМЕНОЙ БУКВ (Unicode-обфускация) — скорее всего спам, НЕ лид
- Поиск партнёров, коллабораций, дилеров, "ищем партнёров" — это НЕ лид
- Предложение своих услуг, реклама, самопрезентация ("могу помочь", "пишите в WhatsApp", "подробности в личку") — НЕ лид
- Технические вопросы БЕЗ намерения нанять ("как настроить VPN?", "как запустить Windows на Mac?")
- Простые бытовые вопросы и советы
- Спам, новости, репосты

КЛЮЧЕВОЙ ПРИНЦИП: Если есть сомнения — это НЕ запрос. Лучше пропустить лид, чем засорить базу мусором.

КАТЕГОРИИ:
1. development — Разработка (сайт, приложение, бот, CRM, автоматизация, парсинг, интеграции)
2. infobusiness — Инфобизнес / Онлайн-школы (курсы, обучение, вебинары, наставничество, запуск школы)
3. marketing — Маркетинг / SMM / Реклама (продвижение, таргет, контекст, SEO, контент, PR, Telegram-реклама)
4. hr — HR / Найм персонала (рекрутинговое агентство, аутстаффинг, HR-консалтинг, подбор персонала как УСЛУГА). НЕ прямые вакансии!
5. design — Дизайн (логотип, фирменный стиль, UI/UX, баннеры, упаковка, визуал)
6. realestate — Недвижимость (покупка, продажа, аренда, ипотека, застройщики, ВНЖ через недвижимость)
7. legal — Юриспруденция (юрист, адвокат, договор, регистрация ООО/ИП, лицензии, суды)
8. finance — Бухгалтерия / Финансы (бухгалтер, бухгалтерское сопровождение, налоги, бухгалтерская и налоговая отчётность, финансовый учёт, аудит, 1С). ТОЛЬКО бухгалтерия, налоги и учёт! НЕ криптовалюта, НЕ обмен валют, НЕ покупка USDT.
9. logistics — Логистика / Карго / Китай (доставка грузов, карго, таможня, Китай, фулфилмент). НЕ ручной труд (разгрузка, грузчики)!
10. marketplaces — Маркетплейсы WB / Ozon (Wildberries, Ozon, карточки товаров, аналитика МП, запуск на МП)
11. construction — Строительство / Ремонт (стройка, ремонт, отделка, сантехника, электрика, дизайн интерьера)
12. tenders — Тендеры / Госзакупки (тендеры, 44-ФЗ, 223-ФЗ, госзакупки, ЭТП, подготовка заявок)
13. crypto — Криптовалюта / P2P (покупка и продажа USDT / Tether / Юсдт / тезер, BTC, ETH, USDC, TRC20 и других криптовалют, P2P-обмен, обмен крипты на наличные/фиат, обмен рублей на usdt, криптообменники, поиск курса). Сюда же "куплю usdt", "приобрету Tether", "возьму Юсдт", "ищу обмен usdt", "кто поменяет рубли на usdt", "продам крипту за наличные"

ВАЖНО:
- Если сообщение не является запросом — is_request: false, category: null
- Если запрос не подходит ни под одну категорию — is_request: false, category: null
- Выбирай ОДНУ наиболее подходящую категорию
- КРИПТА ≠ БУХГАЛТЕРИЯ: покупка/продажа/обмен USDT, Tether, Юсдт, тезер, BTC, USDC, TRC20, любой криптовалюты, P2P-обмен, "куплю usdt", "приобрету Tether", "возьму Юсдт", "поменять рубли на usdt", "обмен крипты на наличные" = ВСЕГДА category "crypto", НИКОГДА не "finance".
- НЕ оправдывай крипту бухгалтерией: то, что покупка крипты "это финансовая операция" или "обмен валют" — НЕ делает её finance. Любое упоминание покупки/обмена крипты = "crypto", даже если звучит как обмен валют или финансовая сделка.
- В finance попадают ТОЛЬКО бухгалтерия, налоги, отчётность, учёт и аудит фиатных денег — без криптовалюты.
- reasoning должен быть ОЧЕНЬ КРАТКИЙ (5-10 слов)`;

export const buildCategoryBatchPrompt = (messages) => {
  const messagesArray = messages.map(msg => {
    const payload = { id: msg.id.toString(), message: msg.message || '' };
    if (msg.chat_name) payload.chat_name = msg.chat_name;
    if (msg.username) payload.username = msg.username;
    if (msg.bio) payload.bio = msg.bio;
    return payload;
  });

  const userPrompt = `ПРОАНАЛИЗИРУЙ ${messages.length} СООБЩЕНИЙ И КЛАССИФИЦИРУЙ:
${JSON.stringify(messagesArray)}

Для каждого сообщения определи:
1. Это ЗАПРОС (ищет услугу/товар/специалиста) или НЕ ЗАПРОС?
2. Если запрос — какая категория?

Ответ — СТРОГО JSON массив из ${messages.length} объектов:
[
  {
    "id": "message_id",
    "is_request": true,
    "category": "development",
    "confidence_score": 85,
    "reasoning": "Ищет разработчика бота"
  },
  {
    "id": "message_id",
    "is_request": false,
    "category": null,
    "confidence_score": 0,
    "reasoning": "Предлагает свои услуги"
  }
]

КРИТИЧЕСКИ ВАЖНО: Ответ должен начинаться с [ и заканчиваться ] — чистый JSON массив!`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
};

export const parseCategoryBatchResponse = (content, expectedCount) => {
  if (!content || content.trim() === '') {
    throw new Error('Empty AI response');
  }

  let cleanContent = content.trim();
  if (cleanContent.startsWith('```json')) {
    cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanContent);
  } catch (firstError) {
    try {
      const lastBraceIndex = Math.max(
        cleanContent.lastIndexOf('}]'),
        cleanContent.lastIndexOf('}')
      );
      if (lastBraceIndex > 0) {
        const truncated = cleanContent.substring(
          0,
          lastBraceIndex + (cleanContent[lastBraceIndex + 1] === ']' ? 2 : 1)
        );
        parsed = JSON.parse(truncated);
      } else {
        throw firstError;
      }
    } catch {
      try {
        const fixed = cleanContent
          .replace(/[\u0000-\u001F]+/g, '')
          .replace(/,(\s*[}\]])/g, '$1')
          .trim();
        parsed = JSON.parse(fixed);
      } catch {
        throw firstError;
      }
    }
  }

  let results;
  if (Array.isArray(parsed)) {
    results = parsed;
  } else if (parsed.results && Array.isArray(parsed.results)) {
    results = parsed.results;
  } else {
    throw new Error(`Unexpected response format: ${Object.keys(parsed).join(', ')}`);
  }

  if (results.length !== expectedCount) {
    logger.warn('Category batch size mismatch', { expected: expectedCount, received: results.length });
  }

  return results.map((r) => {
    const normalized = { ...r };

    if (normalized.id != null) normalized.id = String(normalized.id);

    if (typeof normalized.is_request === 'string') {
      normalized.is_request = normalized.is_request.trim().toLowerCase() === 'true';
    }
    if (normalized.isRequest != null && normalized.is_request == null) {
      normalized.is_request = normalized.isRequest === true || normalized.isRequest === 'true';
    }

    if (typeof normalized.confidence_score === 'string') {
      const n = Number(normalized.confidence_score);
      if (Number.isFinite(n)) normalized.confidence_score = n;
    }
    if (typeof normalized.confidence_score === 'number') {
      if (normalized.confidence_score > 0 && normalized.confidence_score <= 1) {
        normalized.confidence_score = Math.round(normalized.confidence_score * 100);
      }
      normalized.confidence_score = Math.max(0, Math.min(100, normalized.confidence_score));
    }

    if (normalized.category && !VALID_CATEGORIES.includes(normalized.category)) {
      logger.warn('Unknown category from AI, discarding', { category: normalized.category, id: normalized.id });
      normalized.category = null;
      normalized.is_request = false;
    }

    if (!normalized.is_request) {
      normalized.category = null;
    }

    if (typeof normalized.reasoning !== 'string') {
      normalized.reasoning = '';
    }

    return normalized;
  });
};

export { VALID_CATEGORIES, CATEGORY_LABELS };

export default {
  buildCategoryBatchPrompt,
  parseCategoryBatchResponse,
  VALID_CATEGORIES,
  CATEGORY_LABELS
};
