const INDUSTRY_CATEGORIES = [
  {
    key: 'marketing',
    label: 'Маркетинг/Реклама',
    patterns: [
      /\bмаркетинг\b/i,
      /\bmarketing\b/i,
      /реклам/i,
      /\bsmm\b/i,
      /таргет/i,
      /\btarget\b/i,
      /\bseo\b/i,
      /\bppc\b/i,
      /контекст/i,
      /диджитал|digital/i,
      /performance/i,
      /бренд|branding/i,
      /\bpr\b/i,
      /пиар/i
    ]
  },
  {
    key: 'ved',
    label: 'ВЭД / Импорт-Экспорт',
    patterns: [
      /\bвэд\b/i,
      /\bved\b/i,
      /импорт/i,
      /экспорт/i,
      /тамож/i,
      /декларант/i,
      /foreign\s*trade/i,
      /international\s*trade/i
    ]
  },
  {
    key: 'legal',
    label: 'Юриспруденция',
    patterns: [
      /юрист/i,
      /юридич/i,
      /адвокат/i,
      /нотариус/i,
      /\blegal\b/i,
      /lawyer/i,
      /арбитраж/i,
      /суд/i
    ]
  },
  {
    key: 'manufacturing',
    label: 'Производство',
    patterns: [
      /производств/i,
      /завод/i,
      /фабрик/i,
      /цех/i,
      /manufactur/i,
      /factory/i,
      /equipment/i,
      /машиностро/i,
      /станк/i
    ]
  },
  {
    key: 'wholesale',
    label: 'Оптовые продажи',
    patterns: [
      /оптов/i,
      /\bопт\b/i,
      /wholesale/i,
      /дистриб/i,
      /дистрибуц/i,
      /дилер/i,
      /поставщик/i
    ]
  },
  {
    key: 'logistics',
    label: 'Логистика/Доставка',
    patterns: [
      /логист/i,
      /достав/i,
      /перевоз/i,
      /транспорт/i,
      /shipping/i,
      /freight/i,
      /fulfillment|фулфилмент/i,
      /склад/i
    ]
  },
  {
    key: 'it',
    label: 'IT/Разработка',
    patterns: [
      /\bit\b/i,
      /айти/i,
      /разработ/i,
      /developer/i,
      /software/i,
      /saas/i,
      /devops/i,
      /backend|frontend/i
    ]
  },
  {
    key: 'finance',
    label: 'Финансы/Бухгалтерия',
    patterns: [
      /бухгалтер/i,
      /финанс/i,
      /аудит/i,
      /налог/i,
      /accounting/i,
      /bank|банк/i,
      /финтех/i
    ]
  },
  {
    key: 'real_estate',
    label: 'Недвижимость',
    patterns: [
      /недвиж/i,
      /риэлтор|риелтор/i,
      /real\s*estate/i,
      /realtor/i
    ]
  },
  {
    key: 'construction',
    label: 'Строительство/Ремонт',
    patterns: [
      /строител/i,
      /ремонт/i,
      /девелоп/i,
      /подряд/i,
      /construction/i
    ]
  },
  {
    key: 'education',
    label: 'Образование',
    patterns: [
      /обучен/i,
      /курс/i,
      /школ/i,
      /университет/i,
      /edtech/i,
      /репетитор/i
    ]
  },
  {
    key: 'health',
    label: 'Медицина/Здоровье',
    patterns: [
      /медиц/i,
      /клиник/i,
      /стомат/i,
      /фарма/i,
      /health/i,
      /врач/i
    ]
  },
  {
    key: 'hr',
    label: 'HR/Рекрутинг',
    patterns: [
      /\bhr\b/i,
      /кадр/i,
      /рекрут/i,
      /recruit/i,
      /персонал/i
    ]
  },
  {
    key: 'ecommerce',
    label: 'E-commerce/Маркетплейсы',
    patterns: [
      /маркетплейс/i,
      /wildberries|ozon|amazon/i,
      /e-?commerce/i,
      /интернет-?магазин/i,
      /ретейл|ритейл|retail/i
    ]
  }
];

const normalizeText = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

const collectText = (contact = {}) => {
  const parts = [
    contact.industry,
    contact.position,
    contact.company_name,
    contact.bio,
    contact.ai_summary,
    contact.last_message_preview
  ];
  return parts.map(normalizeText).filter(Boolean).join(' ');
};

export function detectIndustryCategory(contact = {}) {
  const text = collectText(contact);
  if (!text) return null;

  let bestKey = null;
  let bestScore = 0;

  for (const category of INDUSTRY_CATEGORIES) {
    let score = 0;
    for (const pattern of category.patterns) {
      if (pattern.test(text)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = category.key;
    }
  }

  return bestScore > 0 ? bestKey : null;
}

export function getIndustryCategories() {
  return INDUSTRY_CATEGORIES.map(({ key, label }) => ({ key, label }));
}

