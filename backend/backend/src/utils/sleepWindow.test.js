import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseSleepPeriods, isSleepTime, validateSleepPeriods } from './sleepWindow.js';

describe('parseSleepPeriods', () => {
  test('пусто/null/undefined → []', () => {
    assert.deepEqual(parseSleepPeriods(null), []);
    assert.deepEqual(parseSleepPeriods(undefined), []);
    assert.deepEqual(parseSleepPeriods(''), []);
    assert.deepEqual(parseSleepPeriods([]), []);
  });

  test('строка через запятую → массив с тримом', () => {
    assert.deepEqual(
      parseSleepPeriods('01:00-08:00, 14:00-15:00'),
      ['01:00-08:00', '14:00-15:00']
    );
  });

  test('массив строк проходит как есть', () => {
    assert.deepEqual(
      parseSleepPeriods(['01:00-08:00', '14:00-15:00']),
      ['01:00-08:00', '14:00-15:00']
    );
  });

  test('массив с запятыми внутри элементов разворачивается', () => {
    assert.deepEqual(
      parseSleepPeriods(['01:00-08:00,14:00-15:00']),
      ['01:00-08:00', '14:00-15:00']
    );
  });

  test('пустые элементы выкидываются', () => {
    assert.deepEqual(
      parseSleepPeriods('01:00-08:00, ,14:00-15:00'),
      ['01:00-08:00', '14:00-15:00']
    );
  });
});

describe('isSleepTime', () => {
  const utcAt = (h, m = 0) => new Date(Date.UTC(2026, 3, 19, h, m, 0));

  test('пустые периоды → false', () => {
    assert.equal(isSleepTime([], 3, utcAt(0, 30)), false);
    assert.equal(isSleepTime(null, 3, utcAt(0, 30)), false);
  });

  describe('дефолтное окно 01:00-08:00 MSK (UTC+3)', () => {
    const periods = ['01:00-08:00'];
    const tz = 3;

    test('03:00 MSK → true (внутри)', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(0, 0)), true);
    });

    test('ровно 01:00 MSK → true (граница включена)', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(22, 0)), true);
    });

    test('ровно 08:00 MSK → true (граница включена)', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(5, 0)), true);
    });

    test('00:59 MSK → false (за минуту до старта)', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(21, 59)), false);
    });

    test('08:01 MSK → false (через минуту после конца)', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(5, 1)), false);
    });

    test('12:00 MSK → false', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(9, 0)), false);
    });

    test('22:00 MSK → false', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(19, 0)), false);
    });
  });

  describe('окно через полночь 23:00-07:00', () => {
    const periods = ['23:00-07:00'];
    const tz = 3;

    test('02:00 MSK → true (после полуночи)', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(23, 0)), true);
    });

    test('23:30 MSK → true (до полуночи)', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(20, 30)), true);
    });

    test('12:00 MSK → false', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(9, 0)), false);
    });
  });

  describe('несколько окон', () => {
    const periods = ['01:00-08:00', '14:00-15:00'];
    const tz = 3;

    test('попадает во второе → true', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(11, 30)), true);
    });

    test('попадает в первое → true', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(0, 0)), true);
    });

    test('не попадает ни в одно → false', () => {
      assert.equal(isSleepTime(periods, tz, utcAt(9, 0)), false);
    });
  });

  describe('кривой ввод', () => {
    test('один битый период скипается, валидный срабатывает', () => {
      assert.equal(
        isSleepTime(['мусор', '01:00-08:00'], 3, utcAt(0, 0)),
        true
      );
    });

    test('все периоды битые → false', () => {
      assert.equal(
        isSleepTime(['мусор', 'тоже-плохо', '99:99-100:00'], 3, utcAt(0, 0)),
        false
      );
    });
  });

  describe('таймзоны', () => {
    test('UTC (tz=0): 03:00 UTC внутри 01:00-08:00 → true', () => {
      assert.equal(isSleepTime(['01:00-08:00'], 0, utcAt(3, 0)), true);
    });

    test('UTC (tz=0): 09:00 UTC снаружи → false', () => {
      assert.equal(isSleepTime(['01:00-08:00'], 0, utcAt(9, 0)), false);
    });

    test('Красноярск (tz=7): 04:00 локально внутри → true', () => {
      assert.equal(isSleepTime(['01:00-08:00'], 7, utcAt(21, 0)), true);
    });

    test('Красноярск (tz=7): 12:00 локально снаружи → false', () => {
      assert.equal(isSleepTime(['01:00-08:00'], 7, utcAt(5, 0)), false);
    });
  });
});

describe('validateSleepPeriods', () => {
  test('пусто → valid с пустым массивом', () => {
    assert.deepEqual(validateSleepPeriods(null), { valid: true, periods: [], invalid: [] });
    assert.deepEqual(validateSleepPeriods(''), { valid: true, periods: [], invalid: [] });
    assert.deepEqual(validateSleepPeriods([]), { valid: true, periods: [], invalid: [] });
  });

  test('один валидный период', () => {
    assert.deepEqual(
      validateSleepPeriods('01:00-08:00'),
      { valid: true, periods: ['01:00-08:00'], invalid: [] }
    );
  });

  test('строка с несколькими валидными периодами', () => {
    assert.deepEqual(
      validateSleepPeriods('01:00-08:00, 14:00-15:00'),
      { valid: true, periods: ['01:00-08:00', '14:00-15:00'], invalid: [] }
    );
  });

  test('массив валидных периодов', () => {
    assert.deepEqual(
      validateSleepPeriods(['01:00-08:00', '23:00-07:00']),
      { valid: true, periods: ['01:00-08:00', '23:00-07:00'], invalid: [] }
    );
  });

  test('один битый период → valid:false с invalid списком', () => {
    const res = validateSleepPeriods(['мусор']);
    assert.equal(res.valid, false);
    assert.deepEqual(res.invalid, ['мусор']);
  });

  test('часть валидных, часть битых → valid:false и invalid содержит битые', () => {
    const res = validateSleepPeriods(['01:00-08:00', '99:99-100:00']);
    assert.equal(res.valid, false);
    assert.deepEqual(res.periods, ['01:00-08:00']);
    assert.deepEqual(res.invalid, ['99:99-100:00']);
  });

  test('не строка и не массив → valid:false', () => {
    assert.equal(validateSleepPeriods(123).valid, false);
    assert.equal(validateSleepPeriods({ foo: 'bar' }).valid, false);
  });

  test('часы > 23 или минуты > 59 → invalid', () => {
    assert.equal(validateSleepPeriods(['25:00-08:00']).valid, false);
    assert.equal(validateSleepPeriods(['08:60-09:00']).valid, false);
    assert.equal(validateSleepPeriods(['08:00-25:00']).valid, false);
  });

  test('периоды без минусов → invalid', () => {
    assert.equal(validateSleepPeriods(['08:00 09:00']).valid, false);
  });
});
