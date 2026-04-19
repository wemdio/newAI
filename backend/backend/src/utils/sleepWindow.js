/**
 * Sleep window helpers for skipping AI analysis during user-defined off-hours.
 *
 * Mirrors the behavior of `_parse_sleep_periods` and `_is_sleep_time` from
 * `backend/python-service/outreach_worker.py` so that the analysis sleep window
 * uses the exact same format as outreach `sleep_periods` (DRY across services).
 *
 * Boundaries are inclusive on both ends. Overnight windows (start > end) wrap
 * around midnight: matched if `now >= start || now <= end`.
 */

const TIME_REGEX = /^(\d{1,2}):(\d{2})$/;

const _toMinutes = (hour, minute) => hour * 60 + minute;

const _parseSleepPeriod = (raw) => {
  if (typeof raw !== 'string' || !raw.includes('-')) return null;

  const [startStr, endStr] = raw.split('-').map((s) => s.trim());
  const startMatch = startStr.match(TIME_REGEX);
  const endMatch = endStr.match(TIME_REGEX);
  if (!startMatch || !endMatch) return null;

  const startH = Number.parseInt(startMatch[1], 10);
  const startM = Number.parseInt(startMatch[2], 10);
  const endH = Number.parseInt(endMatch[1], 10);
  const endM = Number.parseInt(endMatch[2], 10);

  if (startH > 23 || startM > 59 || endH > 23 || endM > 59) return null;

  return {
    start: _toMinutes(startH, startM),
    end: _toMinutes(endH, endM)
  };
};

const _localMinutes = (now, timezoneOffset) => {
  const offsetMs = (Number.isFinite(timezoneOffset) ? timezoneOffset : 0) * 3600 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  return _toMinutes(local.getUTCHours(), local.getUTCMinutes());
};

/**
 * Normalize sleep period input into a flat array of trimmed non-empty strings.
 * Accepts:
 *   - null / undefined / '' → []
 *   - string with comma separators ('01:00-08:00, 14:00-15:00')
 *   - array of strings (each may itself contain commas)
 *
 * @param {string | string[] | null | undefined} input
 * @returns {string[]}
 */
export const parseSleepPeriods = (input) => {
  if (input === null || input === undefined) return [];

  let raw;
  if (typeof input === 'string') {
    raw = input.split(',');
  } else if (Array.isArray(input)) {
    raw = [];
    for (const item of input) {
      if (item === null || item === undefined) continue;
      raw.push(...String(item).split(','));
    }
  } else {
    return [];
  }

  return raw.map((p) => p.trim()).filter(Boolean);
};

/**
 * Check whether `now` (UTC) falls within any of the sleep periods, evaluated
 * in the local timezone given by `timezoneOffset` hours.
 *
 * @param {string | string[] | null | undefined} periods
 * @param {number} timezoneOffset - hours from UTC (e.g. 3 for MSK)
 * @param {Date} [now=new Date()] - UTC moment to test
 * @returns {boolean}
 */
export const isSleepTime = (periods, timezoneOffset = 0, now = new Date()) => {
  const list = Array.isArray(periods) ? periods : parseSleepPeriods(periods);
  if (!list || list.length === 0) return false;

  const nowMinutes = _localMinutes(now, timezoneOffset);

  for (const raw of list) {
    const parsed = _parseSleepPeriod(raw);
    if (!parsed) continue;

    const { start, end } = parsed;
    if (start > end) {
      // Overnight window (e.g. 23:00-07:00)
      if (nowMinutes >= start || nowMinutes <= end) return true;
    } else {
      // Same-day window (e.g. 01:00-08:00, 14:00-15:00)
      if (start <= nowMinutes && nowMinutes <= end) return true;
    }
  }

  return false;
};

/**
 * Strict validator for API input. Unlike `parseSleepPeriods` (lenient,
 * skips garbage), this returns the list of invalid entries so the API can
 * report them back to the user.
 *
 * @param {string | string[] | null | undefined} input
 * @returns {{ valid: boolean, periods: string[], invalid: string[] }}
 */
export const validateSleepPeriods = (input) => {
  if (input === null || input === undefined || input === '') {
    return { valid: true, periods: [], invalid: [] };
  }
  if (typeof input !== 'string' && !Array.isArray(input)) {
    return { valid: false, periods: [], invalid: [String(input)] };
  }

  const flat = parseSleepPeriods(input);
  const periods = [];
  const invalid = [];
  for (const raw of flat) {
    if (_parseSleepPeriod(raw)) {
      periods.push(raw);
    } else {
      invalid.push(raw);
    }
  }

  return { valid: invalid.length === 0, periods, invalid };
};

export default { parseSleepPeriods, isSleepTime, validateSleepPeriods };
