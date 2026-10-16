import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['app/lib/calendar-dates.ts'],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { isValidDate, shiftDate } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

for (const date of ['0100-01-01', '1900-02-28', '2000-02-29', '2024-02-29', '2026-10-16', '9999-12-31']) {
  assert.equal(isValidDate(date), true, date);
}
for (const date of [
  '', '2026-1-01', '2026-01-1', '2026-10-16T00:00:00Z', ' 2026-10-16', '2026-10-16 ',
  '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-04-31',
  '1900-02-29', '2100-02-29', '2026-02-29', '2024-02-30', '10000-01-01',
]) {
  assert.equal(isValidDate(date), false, date);
}
// Preserve the existing Date.UTC validation behavior for years 00 through 99.
for (let year = 0; year < 100; year += 1) {
  const date = `${String(year).padStart(4, '0')}-01-01`;
  assert.equal(isValidDate(date), false, date);
}

const originalTimezone = process.env.TZ;
try {
  // Include both DST transitions and a zone on the other side of midnight.
  for (const timezone of ['UTC', 'Asia/Taipei', 'America/Los_Angeles', 'Pacific/Auckland']) {
    process.env.TZ = timezone;
    for (const [date, amount, expected] of [
      ['2024-02-28', 1, '2024-02-29'],
      ['2024-02-29', 1, '2024-03-01'],
      ['2026-03-01', -1, '2026-02-28'],
      ['2026-01-31', 1, '2026-02-01'],
      ['2026-12-31', 1, '2027-01-01'],
      ['2026-01-01', -1, '2025-12-31'],
      ['2026-03-07', 2, '2026-03-09'],
      ['2026-10-31', 2, '2026-11-02'],
      ['2026-10-16', 0, '2026-10-16'],
      ['2026-10-16', -29, '2026-09-17'],
    ]) {
      assert.equal(shiftDate(date, amount), expected, `${timezone}: ${date} + ${amount}`);
      assert.equal(isValidDate(expected), true, `${timezone}: ${expected}`);
    }
    assert.throws(() => shiftDate('not-a-date', 1), RangeError);
  }
} finally {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
}

console.log('PASS: calendar date validation, leap years, legacy year bounds, UTC date shifts, and timezone invariance.');
