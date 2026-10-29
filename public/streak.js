// Streak: consecutive calendar days (in the pair's time zone) with at least
// one recorded meeting. Several meetings on one day are one day. A streak
// stays alive through the next day (there is still time to meet); only a
// whole day without a meeting breaks it. The date the pair first met is a
// keepsake and plays no part here.
export const dayKey = (t, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// times: meeting timestamps (ms); today: 'YYYY-MM-DD' in the pair's zone
export function streakOf(times, tz, today = dayKey(Date.now(), tz)) {
  const days = [...new Set(times.map(t => dayKey(t, tz)))].filter(d => d <= today).sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev && shift(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const set = new Set(days), yesterday = shift(today, -1);
  const end = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  let current = 0;
  for (let d = end; d && set.has(d); d = shift(d, -1)) current++;
  return { current, best, today: set.has(today), last: days.at(-1) || null, days: days.length };
}
