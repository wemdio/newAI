/**
 * Contact normalization utilities
 * - Company name cleanup (ООО/ИП/LLC + quotes)
 * - Position/title cleanup
 * - Mapping free-text titles to canonical position_type codes
 */

const LEGAL_FORMS = [
  'ооо', 'ип', 'оао', 'зао', 'пао', 'ао',
  'llc', 'inc', 'ltd', 'gmbh', 'sarl', 'srl', 'sas'
];

const LEGAL_FORMS_RE = new RegExp(`\\b(?:${LEGAL_FORMS.join('|')})\\b\\.?`, 'i');

/**
 * Нормализация компании (убираем ООО/ИП/LLC, кавычки, лишние пробелы)
 * Важно: это НЕ "верификация" компании, а косметическая очистка строки.
 */
export function normalizeCompanyName(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;

  // Убираем кавычки/ёлочки по краям
  s = s.replace(/^[«"'\s]+/g, '').replace(/[»"'\s]+$/g, '').trim();

  // Убираем юридические формы в начале (ООО Ромашка / LLC Romashka)
  s = s.replace(new RegExp(`^(?:${LEGAL_FORMS.join('|')})\\b\\.?\\s+`, 'i'), '');

  // Убираем юридические формы в конце (Ромашка, ООО / Romashka LLC)
  s = s.replace(new RegExp(`[,\\s]+(?:${LEGAL_FORMS.join('|')})\\b\\.?$`, 'i'), '');

  // Иногда пишут "ООО «Ромашка»" — после удаления формы снова чистим кавычки
  s = s.replace(/^[«"'\s]+/g, '').replace(/[»"'\s]+$/g, '').trim();

  // Убираем повторные пробелы
  s = s.replace(/\s+/g, ' ').trim();

  // Если в итоге осталась только юр-форма — считаем пустым
  if (!s || LEGAL_FORMS_RE.test(s) && s.replace(LEGAL_FORMS_RE, '').trim() === '') return null;

  return s.length ? s : null;
}

/**
 * Нормализация должности (убираем мусор/эмодзи, нормализуем пробелы)
 */
export function normalizePositionTitle(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;

  // Убираем эмодзи (грубая, но полезная чистка)
  s = s.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim();

  // Убираем лишние разделители по краям
  s = s.replace(/^[\-\–\—•·\s]+/g, '').replace(/[\-\–\—•·\s]+$/g, '').trim();

  // Нормализуем пробелы
  s = s.replace(/\s+/g, ' ').trim();

  return s.length ? s : null;
}

/**
 * Единый "справочник" ролей: набор паттернов → position_type
 * Это помогает привести разные формулировки ("гендир", "founder", "owner") к одному коду.
 */
const POSITION_TYPE_RULES = [
  {
    type: 'CEO',
    patterns: [
      /\bceo\b/i,
      /\bfounder\b/i,
      /\bco[-\s]?founder\b/i,
      /\bowner\b/i,
      /\bпредпринимател[ья]\b/i,
      /\bосновател[ья]\b/i,
      /\bсоосновател[ья]\b/i,
      /\bвладелец\b/i,
      /\bсобственник\b/i,
      /\bгенеральн\w*\s+директор\b/i,
      /\bгендир\b/i,
      /\bуправляющ\w*\s+партнер\b/i,
      /\bmanaging\s+partner\b/i
    ]
  },
  {
    type: 'DIRECTOR',
    patterns: [
      /\bдиректор\b/i,
      /\bexecutive\s+director\b/i,
      /\bуправляющ\w*\s+директор\b/i,
      /\bvp\b/i,
      /\bvice\s+president\b/i,
      /\bchief\s+(technology|marketing|financial|operating)\s+officer\b/i,
      /\bcto\b/i,
      /\bcmo\b/i,
      /\bcfo\b/i,
      /\bcoo\b/i
    ]
  },
  {
    type: 'MANAGER',
    patterns: [
      /\bhead\s+of\b/i,
      /\bmanager\b/i,
      /\bменеджер\b/i,
      /\bруководител\w*\b/i,
      /\bначальник\b/i,
      /\bтимлид\b/i,
      /\bteam\s+lead\b/i,
      /\bлид\b/i,
      /\bproduct\s+manager\b/i,
      /\bproject\s+manager\b/i,
      /\bpm\b/i
    ]
  },
  {
    type: 'FREELANCER',
    patterns: [
      /\bfreelanc\w*\b/i,
      /\bфриланс\w*\b/i,
      /\bсамозанят\w*\b/i
    ]
  },
  {
    type: 'SPECIALIST',
    patterns: [
      /\bмаркетолог\b/i,
      /\bmarketing\b/i,
      /\bsmm\b/i,
      /\bseo\b/i,
      /\bdeveloper\b/i,
      /\bразработчик\b/i,
      /\bпрограммист\b/i,
      /\bинженер\b/i,
      /\bдизайнер\b/i,
      /\bdesigner\b/i,
      /\bаналитик\b/i,
      /\bsales\b/i,
      /\bпродавец\b/i,
      /\baccountant\b/i,
      /\bбухгалтер\b/i
    ]
  }
];

export function inferPositionTypeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;

  for (const rule of POSITION_TYPE_RULES) {
    if (rule.patterns.some((re) => re.test(t))) return rule.type;
  }
  return null;
}

export function normalizePositionType(typeFromAI, positionText) {
  const valid = ['CEO', 'DIRECTOR', 'MANAGER', 'SPECIALIST', 'FREELANCER', 'OTHER'];
  const aiType = typeof typeFromAI === 'string' ? typeFromAI.trim().toUpperCase() : '';

  // Если AI уже дал конкретный код — оставляем (не ломаем)
  if (valid.includes(aiType) && aiType !== 'OTHER') return aiType;

  const inferred = inferPositionTypeFromText(positionText);
  if (inferred) return inferred;

  return valid.includes(aiType) ? aiType : 'OTHER';
}

