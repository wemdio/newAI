import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeywords, hasKeywordMatch, preFilterMessage } from './messagePreFilter.js';

test('explicit short domain terms survive positive keyword extraction', () => {
  const keys = extractKeywords('SOC СИБ ПДн КИИ ОРД ГИС PIM ERP API 1С\nСТОП-ФАКТОРЫ: CRM');
  for (const term of ['soc', 'сиб', 'пдн', 'кии', 'орд', 'гис', 'pim', 'erp', 'api', '1с']) {
    assert.ok(keys.includes(term), term);
    assert.equal(hasKeywordMatch({ message: `Нужен подрядчик: ${term}.` }, keys).matches, true);
  }
  assert.ok(!keys.includes('crm'));
});
test('short terms match tokens, not parts of unrelated words', () => {
  const keys = ['soc', 'кии', 'орд', 'гис', 'api'];
  for (const message of ['social', 'логистика', 'координатор', 'высокий', 'capital']) {
    assert.equal(hasKeywordMatch({ message }, keys).matches, false, message);
  }
  assert.equal(hasKeywordMatch({ message: 'SOC/SIEM' }, keys).matches, true);
});
test('short ordinary words do not become keywords', () => {
  const keys = extractKeywords('как для кто ООО ищу');
  assert.equal(keys.length, 0);
});
test('long keyword stems still match word forms', () => {
  assert.equal(hasKeywordMatch({ message: 'Нужна аттестация системы' }, ['аттестац']).matches, true);
});
test('marketplace abbreviations are enabled only by positive criteria', () => {
  const keys = extractKeywords('FBS ФБС FBO ФБО FBW WB ВБ\nНЕ СЧИТАТЬ ЛИДОМ: ФФ');
  for (const term of ['fbs', 'фбс', 'fbo', 'фбо', 'fbw', 'wb', 'вб']) {
    assert.ok(keys.includes(term), term);
    assert.equal(hasKeywordMatch({ message: `Нужен подрядчик: ${term}.` }, keys).matches, true);
  }
  assert.ok(!keys.includes('фф'));
  assert.equal(hasKeywordMatch({ message: 'newbie offline' }, keys).matches, false);
});
test('fulfillment criteria recognize the short real-world request without a bio', () => {
  for (const criteria of ['фулфилмент', 'фулфиллмент', 'fulfillment', 'fulfilment']) {
    const result = preFilterMessage({ message: 'Ищу ФФ', username: 'test' }, criteria);
    assert.equal(result.passes, true, criteria);
    assert.ok(result.checks.keywords.matchedKeywords.includes('фф'));
  }
  assert.equal(hasKeywordMatch({ message: 'оффер' }, ['фф']).matches, false);
});
test('fulfillment aliases do not leak from exclusions or unrelated prompts', () => {
  for (const criteria of ['Налоговый аудит', 'Налоговый аудит\nНЕ СЧИТАТЬ ЛИДОМ: фулфилмент ФФ']) {
    assert.equal(preFilterMessage({ message: 'Ищу ФФ', username: 'test' }, criteria).passes, false);
  }
});
test('missing contact details do not discard a clear short fulfillment request', () => {
  const result = preFilterMessage({ message: 'Ищу ФФ' }, 'КЛЮЧЕВЫЕ СЛОВА: фулфилмент');
  assert.equal(result.checks.quality.isQuality, true);
  assert.equal(result.checks.keywords.matches, true);
  assert.equal(result.checks.contact.hasContact, false);
  assert.equal(result.passes, true);
});
test('marketplace software requests reach qualification despite logistics exclusions', () => {
  const criteria = 'КЛЮЧЕВЫЕ СЛОВА: PIM, остатки, FBS, WB, 1С.\nНЕ СЧИТАТЬ ЛИДОМ: физический фулфилмент, упаковка и доставка.';
  for (const message of [
    'Ищем программу учета остатков FBS по WB и Ozon.',
    'Нужно синхронизировать остатки 1С и WB.'
  ]) {
    const result = preFilterMessage({ message }, criteria);
    assert.equal(result.passes, true);
    assert.ok(result.checks.keywords.matchedKeywords.includes('wb'));
  }
  assert.equal(preFilterMessage({ message: 'Ищу ФФ' }, criteria).passes, false);
});
test('known welcome is filtered but a real request quoting it is not', () => {
  const text = 'Привет Анна, для общения в чате необходимо пройти верификацию и согласиться с правилами обработки и использования персональных данных https://umatg.ru/UMA_privacy_policy';
  assert.equal(preFilterMessage({ message: text }, 'персональных данных').passes, false);
  assert.equal(preFilterMessage({ message: `${text}\nНужна проверка защиты персональных данных нашей компании.` }, 'персональных данных').passes, true);
});
