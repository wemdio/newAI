const JOYNIO_CONFIG_ID = 57;
const FRESH_MS = 60 * 60_000;
const FOLLOW_UP_MS = 15 * 60_000;

const AVITO_ROLE = /(?:^|[^\p{L}])авитолог[а-яё]*/iu;
const REAL_ESTATE = /(?:^|[^\p{L}])(?:недвижимост[а-яё]*|недвиг[а-яё]*|застройщик[а-яё]*|новостро[а-яё]*|жил[а-яё]+\s+комплекс[а-яё]*|ижс(?![\p{L}\d])|каркасн[а-яё]+\s+дом[а-яё]*|(?:продаж|аренд)[а-яё]+\s+(?:квартир[а-яё]*|кладов[а-яё]*|склад[а-яё]*)|кладов[а-яё]*.{0,35}аренд[а-яё]*)/iu;
const CLASSIFIEDS = /(?:^|[^\p{L}])(?:авито|avito|циан|cian|домклик|классифайд[а-яё]*)/iu;
const WORK = /(?:продви[а-яё]+|ведени[а-яё]+|размест[а-яё]+|размещен[а-яё]+|настро[а-яё]+|лид[а-яё]*)/iu;
const BUYER = /(?:^|[^\p{L}])(?:ищ[уеё]м?|нуж[а-яё]+|посовету[а-яё]+|порекоменду[а-яё]+|кто.{0,20}(?:сможет|занимается|возьм[её]тся|продвигал)|поделитесь\s+контактами)/iu;
const EXCLUDED = /(?:^|[^\p{L}])(?:не\s+ищ[уеё]м?|в\s+штат|оклад|полная\s+занятость|резюме|ищу\s+(?:работу|проекты)|я\s+авитолог|(?:ремонт|отделк[аи])\s+квартир|накрут[а-яё]*\s+отзыв)/iu;

export const isJoynioConfig = config =>
  Number(config?.id) === JOYNIO_CONFIG_ID && /\bJoynio\b/i.test(config.lead_prompt || '');

export const joynioCriteria = config => !isJoynioConfig(config) ? config.lead_prompt : `${config.lead_prompt}

УТОЧНЕНИЕ ДЛЯ JOYNIO:
- Поиск авитолога для продажи проектов ИЖС и каркасных домов относится к продвижению недвижимости. Поиск строителей и продвижение ремонта или стройуслуг не подходят.
- «Кто продвигал аренду кладовок на Авито? Пишите в личку» и «Ищем авитолога для продажи проектов ИЖС, отклик через анкету» — прямые запросы. «Ищу авитолога» без отрасли недостаточно.
- При явном поиске исполнителя для целевой услуги без стоп-факторов обычно уместны 90–100. Не штрафуй за краткость, анкету, отсутствие бюджета или ТЗ. Не повышай балл, если услуга или контекст не подтверждаются.`;

const time = value => Date.parse(value || '');

function fresh(message, now) {
  const observed = time(message?.message_time);
  return Number.isFinite(observed) && now - observed >= 0 && now - observed <= FRESH_MS;
}

// This is eligibility for an independent review, not an automatic lead verdict.
export function isDirectJoynioCandidate(message, now = Date.now()) {
  const text = String(message?.message || '');
  return fresh(message, now) && BUYER.test(text) && REAL_ESTATE.test(text) && !EXCLUDED.test(text) &&
    (AVITO_ROLE.test(text) || (CLASSIFIEDS.test(text) && WORK.test(text)));
}

export function orderJoynioMatches(matches, config, now = Date.now()) {
  if (!isJoynioConfig(config)) return matches;
  const priority = match => isDirectJoynioCandidate(match.message, now) ? 1 : 0;
  return [...matches].sort((a, b) => priority(b) - priority(a));
}

export async function reviewJoynioCandidates(messages, results, config, review, now = Date.now()) {
  if (!isJoynioConfig(config)) return { matches: results.matches, retryIds: [] };
  const threshold = Number(config.telegram_min_confidence);
  if (!Number.isFinite(threshold) || threshold <= 0) return { matches: results.matches, retryIds: [] };
  const byId = new Map(results.analyzed.map(result => [
    String(result.aiResponse?.id ?? result.metadata?.messageId), result
  ]));
  const matches = new Map(results.matches.map(match => [String(match.message.id), match]));
  const retryIds = [];

  for (const message of messages) {
    const key = String(message.id);
    const first = byId.get(key);
    if (!first || (first.isMatch && first.aiResponse.confidence_score >= threshold) ||
        !isDirectJoynioCandidate(message, now)) continue;

    const decision = await review(message, first.aiResponse);
    matches.delete(key);
    if (decision.retryable) {
      retryIds.push(message.id);
      continue;
    }
    if (!decision.verified || !Number.isInteger(decision.confidence) ||
        decision.confidence < 70 || decision.confidence > 100) continue;

    matches.set(key, {
      message,
      independentlyVerified: true,
      analysis: {
        ...first,
        isMatch: true,
        aiResponse: {
          ...first.aiResponse,
          is_match: true,
          confidence_score: decision.confidence,
          reasoning: '[AI ✓] ' + decision.reasoning,
          matched_criteria: ['поиск исполнителя', 'продвижение недвижимости на классифайдах']
        }
      }
    });
  }
  return { matches: orderJoynioMatches([...matches.values()], config, now), retryIds };
}

export function canUpgradeJoynioDuplicate(existing, earlier, message, confidence, config, now = Date.now()) {
  const threshold = Number(config?.telegram_min_confidence);
  if (!isJoynioConfig(config) || !Number.isFinite(threshold) || threshold <= 0 ||
      !Number.isFinite(confidence) || confidence < threshold ||
      !Number.isFinite(existing?.confidence_score) || existing.confidence_score >= threshold ||
      existing?.posted_to_telegram !== false || existing.is_contacted !== false ||
      existing.lead_status !== 'lead' || existing.skip_reason || existing.notes ||
      !fresh(earlier, now) || !isDirectJoynioCandidate(message, now)) return false;

  return Boolean(earlier.user_id && earlier.user_id === message.user_id && earlier.chat_name &&
    earlier.chat_name === message.chat_name &&
    Math.abs(time(earlier.message_time) - time(message.message_time)) <= FOLLOW_UP_MS &&
    AVITO_ROLE.test(earlier.message || '') && AVITO_ROLE.test(message.message || '') &&
    BUYER.test(earlier.message || '') && !REAL_ESTATE.test(earlier.message || ''));
}
