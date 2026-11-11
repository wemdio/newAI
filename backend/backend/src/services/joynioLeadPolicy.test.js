import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preFilterMessage } from '../validators/messagePreFilter.js';
import { initializeDatabase } from '../config/database.js';
import { saveDetectedLead } from './leadDetector.js';
import {
  canUpgradeJoynioDuplicate, isDirectJoynioCandidate, joynioCriteria, reviewJoynioCandidates
} from './joynioLeadPolicy.js';

const config = {
  id: 57,
  telegram_min_confidence: 85,
  lead_prompt: 'КЛЮЧЕВЫЕ СЛОВА:\nавитолог, Авито, недвижимость, кладовки\n\nКОГО ИЩЕМ: клиенты Joynio.'
};
const now = Date.parse('2026-11-08T18:00:00Z');
const source = (id, text, age = 10) => ({
  id, message: text, user_id: 'test-author', username: 'test_author', chat_name: 'Test chat',
  message_time: new Date(now - age * 60_000).toISOString()
});

const complete = source(4861675,
  'Мы вновь ищем Авитолога для сотрудничества в сфере продажи проектов ИЖС (строительство каркасных домов). Кому бы было интересно сотрудничество, и готов хорошо лидовать - закиньте вашу заявку. Мы обязательно свяжемся с вами. Анкета: [ссылка]', 14);
const short = source(4861702,
  'Здравствуйте, мы вновь ищем Авитолога. Где они сейчас обитают? В первую очереь ищем среди своих - Аномальцев. Стучите в личку.');
const storage = source(4654713,
  'Здравствуйте! Есть кто с «крутым» опытом продвигал на авито аренду КЛАДОВОК/складов из контейнеров. Пишите в л.с.');
const unrelated = source(4894809, 'Ищу авитолога, ниша SEO и AEO продвижение.');
const verdicts = (...items) => {
  const analyzed = items.map(([message, confidence, isMatch = true]) => ({
    isMatch, aiResponse: { id: String(message.id), is_match: isMatch, confidence_score: confidence }
  }));
  return {
    analyzed,
    matches: items.flatMap(([message], index) => analyzed[index].isMatch ? [{ message, analysis: analyzed[index] }] : [])
  };
};
const noReview = () => assert.fail('Unexpected verification');

test('grounded archived examples pass the prefilter; bio or keywords alone do not qualify for rescoring', () => {
  const criteria = joynioCriteria(config);
  assert.match(criteria, /каркасных домов/);
  for (const message of [complete, short, storage]) {
    assert.equal(preFilterMessage(message, criteria).passes, true, String(message.id));
  }
  for (const message of [complete, storage, source(3, 'Нужен авитолог для продажи квартир застройщика.')]) {
    assert.equal(isDirectJoynioCandidate(message, now), true, String(message.id));
  }
  for (const message of [
    { ...short, bio: 'Домоподбор и технадзор' },
    unrelated,
    source(4868512, 'Где взять отзывы для ремонта квартир на Авито?'),
    source(4883677, 'Продаю коммерческую недвижимость. Помогите продать.'),
    source(4, 'Ищем авитолога в штат для застройщика, оклад.'),
    source(5, 'Ищу подрядчика построить каркасный дом.')
  ]) assert.equal(isDirectJoynioCandidate(message, now), false, String(message.id));
});

test('a rejected full request and low-scored request get independent scores; the full request is saved first', async () => {
  const reviews = [];
  const result = await reviewJoynioCandidates([short, complete, storage, unrelated],
    verdicts([short, 80], [complete, 65, false], [storage, 75], [unrelated, 0, false]),
    config, async (message, initial) => {
      reviews.push([message.id, initial.confidence_score]);
      return { verified: true, confidence: message === complete ? 94 : 91, reasoning: 'Explicit request for a property promotion contractor' };
    }, now);
  assert.deepEqual(reviews, [[complete.id, 65], [storage.id, 75]]);
  assert.deepEqual(result.matches.map(({ message, analysis, independentlyVerified }) =>
    [message.id, analysis.aiResponse.confidence_score, independentlyVerified]),
  [[complete.id, 94, true], [storage.id, 91, true], [short.id, 80, undefined]]);
  assert.equal(result.matches[0].message, complete);
  assert.deepEqual(result.retryIds, []);
});

test('independent score below 85 stays below 85; an explicit rejection or unavailable review cannot publish', async () => {
  for (const [review, expectedScores, retryIds] of [
    [{ verified: true, confidence: 83, reasoning: 'Some details are uncertain' }, [83], []],
    [{ verified: false, confidence: 100 }, [], []],
    [{ retryable: true }, [], [storage.id]]
  ]) {
    const result = await reviewJoynioCandidates([storage], verdicts([storage, 75]), config, async () => review, now);
    assert.deepEqual(result.matches.map(({ analysis }) => analysis.aiResponse.confidence_score), expectedScores);
    assert.deepEqual(result.retryIds, retryIds);
  }
});

test('other projects, archival messages and already passing scores are not rechecked', async () => {
  const other = { ...config, id: 59 };
  assert.equal(joynioCriteria(other), other.lead_prompt);
  for (const [project, clock, score] of [[other, now, 75], [config, now + 60 * 60_000, 75], [config, now, 95]]) {
    const results = verdicts([storage, score]);
    const reviewed = await reviewJoynioCandidates([storage], results, project, noReview, clock);
    assert.deepEqual(reviewed, { matches: results.matches, retryIds: [] });
  }
});

test('only a fresh, unsent short repeat from the same author and chat can be upgraded', () => {
  const lead = { posted_to_telegram: false, is_contacted: false, lead_status: 'lead', confidence_score: 80 };
  assert.equal(canUpgradeJoynioDuplicate(lead, short, complete, 94, config, now), true);
  for (const edit of [
    { posted_to_telegram: true }, { is_contacted: true }, { lead_status: 'not_lead' },
    { notes: 'Reviewed' }, { skip_reason: 'manual' }, { confidence_score: 85 }
  ]) assert.equal(canUpgradeJoynioDuplicate({ ...lead, ...edit }, short, complete, 94, config, now), false);
  for (const earlier of [
    { ...short, chat_name: 'Other chat' }, { ...short, user_id: 'Other author' },
    { ...short, message_time: source(1, '', 31).message_time }, complete
  ]) assert.equal(canUpgradeJoynioDuplicate(lead, earlier, complete, 94, config, now), false);
  assert.equal(canUpgradeJoynioDuplicate(lead, short, complete, 83, config, now), false);
  assert.equal(canUpgradeJoynioDuplicate(lead, short, complete, 94, config, now + 60 * 60_000), false);
});

test('saving a fuller request updates only the fresh unsent lead and retains its ID', async t => {
  const requests = [];
  const current = { ...config, user_id: 'test-client' };
  const oldLead = {
    id: 100, message_id: short.id, confidence_score: 80,
    posted_to_telegram: false, is_contacted: false, lead_status: 'lead'
  };
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, 'https://test.invalid');
    requests.push([options.method, target.pathname, target.searchParams]);
    let rows;
    if (options.method === 'PATCH') {
      assert.equal(target.searchParams.get('message_id'), `eq.${short.id}`);
      assert.equal(target.searchParams.get('confidence_score'), 'eq.80');
      assert.equal(target.searchParams.get('user_id'), 'eq.test-client');
      assert.equal(target.searchParams.get('posted_to_telegram'), 'eq.false');
      assert.equal(target.searchParams.get('is_contacted'), 'eq.false');
      assert.equal(target.searchParams.get('notes'), 'is.null');
      const patch = JSON.parse(options.body);
      assert.equal(patch.message_id, complete.id);
      assert.equal(patch.confidence_score, 94);
      assert.equal(patch.posted_to_telegram, false);
      rows = { ...oldLead, ...patch };
    } else {
      assert.equal(options.method, 'GET');
      rows = target.pathname.endsWith('/messages') ? [short] : target.searchParams.has('message_id') ? [] : [oldLead];
    }
    return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } });
  });
  initializeDatabase();
  const lead = await saveDetectedLead(current.user_id, complete, {
    aiResponse: { confidence_score: 94, reasoning: 'Full request', matched_criteria: ['Property marketing'] }
  }, current);
  assert.equal(lead.id, oldLead.id);
  assert.equal(lead.message_id, complete.id);
  assert.deepEqual(requests.map(([method, path]) => [method, path]), [
    ['GET', '/rest/v1/detected_leads'], ['GET', '/rest/v1/detected_leads'],
    ['GET', '/rest/v1/messages'], ['PATCH', '/rest/v1/detected_leads']
  ]);
});
