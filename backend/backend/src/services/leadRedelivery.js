import { getSupabase } from '../config/database.js';
import { getActiveUserConfigs } from '../database/queries.js';
import { postLeadToChannel, markLeadAsPosted } from './telegramPoster.js';
import logger from '../utils/logger.js';

/**
 * Lead redelivery safety net.
 *
 * Posting to a client channel can fail transiently (e.g. a flaky SOCKS proxy
 * timing out — see config/telegram.js). Without a retry the lead is saved with
 * posted_to_telegram=false and never delivered, because the scanner's per-user
 * high-water-mark has already advanced past it.
 *
 * This re-attempts recent unposted leads, scoped tightly so it:
 *  - never dredges the old backlog (only the last WINDOW_HOURS),
 *  - never races the live post (only leads older than SETTLE_MINUTES),
 *  - only delivers what SHOULD have posted (active client + >= its threshold),
 *  - never hammers a permanently-failing lead (gives up after MAX_ATTEMPTS and
 *    marks skip_reason so it's excluded from future cycles).
 */
const WINDOW_HOURS = 3;       // only consider leads detected within the last 3h
const SETTLE_MINUTES = 10;    // ...and older than 10 min (let the live post finish first)
const MAX_ATTEMPTS = 5;       // give up after N tries, then mark the lead
const POST_DELAY_MS = 1500;   // gentle pacing between posts
const BATCH_LIMIT = 50;

const attempts = new Map(); // detectedLeadId -> attempt count (in-memory, resets on restart)

const coerceCriteria = (c) => {
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') {
    try { const p = JSON.parse(c); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

export const retryUnpostedLeads = async () => {
  try {
    const supabase = getSupabase();
    const now = Date.now();
    const since = new Date(now - WINDOW_HOURS * 3600_000).toISOString();
    const until = new Date(now - SETTLE_MINUTES * 60_000).toISOString();

    const configs = await getActiveUserConfigs();
    const cfgByUser = new Map((configs || []).map((c) => [c.user_id, c]));
    if (cfgByUser.size === 0) return;

    const { data: leads, error } = await supabase
      .from('detected_leads')
      .select('id, message_id, user_id, confidence_score, reasoning, matched_criteria, detected_at')
      .eq('posted_to_telegram', false)
      .is('skip_reason', null)
      .gte('detected_at', since)
      .lte('detected_at', until)
      .order('detected_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw error;
    if (!leads || leads.length === 0) return;

    let posted = 0;
    let dropped = 0;
    let failed = 0;

    for (const lead of leads) {
      const cfg = cfgByUser.get(lead.user_id);
      if (!cfg || !cfg.telegram_channel_id) continue; // client inactive / no channel -> leave for later
      const threshold = Number.parseInt(cfg.telegram_min_confidence ?? 0, 10) || 0;
      if (threshold > 0 && (Number(lead.confidence_score) || 0) < threshold) continue; // below threshold -> shouldn't post

      const { data: msg } = await supabase
        .from('messages')
        .select('*')
        .eq('id', lead.message_id)
        .maybeSingle();
      if (!msg) continue;

      const analysis = {
        confidence_score: lead.confidence_score,
        reasoning: lead.reasoning,
        matched_criteria: coerceCriteria(lead.matched_criteria),
      };

      try {
        const result = await postLeadToChannel(msg, analysis, cfg.telegram_channel_id, null, lead.user_id, null);
        if (result?.success && !result.skipped) {
          await markLeadAsPosted(lead.id);
          attempts.delete(lead.id);
          posted++;
          logger.info('Redelivered previously-unposted lead', { leadId: lead.id, userId: lead.user_id });
        } else if (result?.skipped) {
          // duplicate of an already-posted lead -> stop retrying it
          await supabase.from('detected_leads').update({ skip_reason: 'redelivery_duplicate' }).eq('id', lead.id);
          dropped++;
        }
      } catch (e) {
        const n = (attempts.get(lead.id) || 0) + 1;
        attempts.set(lead.id, n);
        failed++;
        if (n >= MAX_ATTEMPTS) {
          await supabase.from('detected_leads').update({ skip_reason: 'post_retry_exhausted' }).eq('id', lead.id);
          attempts.delete(lead.id);
          logger.warn('Redelivery gave up after max attempts', {
            leadId: lead.id, userId: lead.user_id, attempts: n, error: e.message,
          });
        }
      }

      await new Promise((r) => setTimeout(r, POST_DELAY_MS));
    }

    if (posted || dropped || failed) {
      logger.info('Lead redelivery cycle complete', { candidates: leads.length, posted, dropped, failed });
    }
  } catch (e) {
    logger.error('Lead redelivery cycle failed', { error: e.message });
  }
};

export default { retryUnpostedLeads };
