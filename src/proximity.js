// Meeting detection rules. Pure functions: the Worker feeds them the two
// members' last positions and the pair's session state; tools/proximity-test.mjs
// unit-tests every case. Coordinates never leave the server.
export const RULES = {
  FRESH: 120000,        // a position older than 2 min is not evidence
  MAX_ACC: 100,         // m: worse GPS readings are ignored
  STRONG_ACC: 50,       // m: both phones at least this precise -> automatic
  TOGETHER: 50,         // m: certainly together
  NEAR: 300,            // m: level 1, "niedaleko siebie" (not counted)
  HOLD: 60000,          // ms together, with a new reading from both phones, before an automatic record
  CONFIRM_WINDOW: 600000, // both confirmations within 10 min
  APART: 200,           // m beyond the radius that counts as clearly apart
  APART_RESET: 1800000, // 30 min apart ends a session
  COOLDOWN: 6 * 3600000, // one meeting per 6 h
  KEEP: 900000,         // coordinates are erased 15 min after the reading
};
export const RADII = [50, 100, 150];
export const radiusOf = r => Math.min(150, Math.max(50, Number(r) || 100));

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const z = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z));
}

const view = (m, now) => m ? { on: !!m.geo_on, age: m.location_at ? Math.max(0, now - m.location_at) : null, acc: m.accuracy == null ? null : Math.round(m.accuracy), has: m.latitude != null } : { on: false, age: null, acc: null, has: false };
const usable = (v) => v.has && v.age != null && v.age <= RULES.FRESH;

// me / partner: member rows {geo_on, latitude, longitude, accuracy, location_at}
// pair: {active_since, active_recorded, confirm1_at, confirm2_at}; you: 1|2
// Returns the stage shown to the people and a reason code for diagnostics.
export function verdict({ me, partner, pair = {}, radius, you = 1, now = Date.now(), lastMeetingAt = null }) {
  const out = { stage: 'off', reason: 'me_off', distance: null, strong: false, since: null, held: 0, canAuto: false, canConfirm: false, needsBoth: false, myConfirm: false, partnerConfirm: false, radius: radiusOf(radius), me: view(me, now), partner: view(partner, now), recorded: !!pair.active_recorded };
  if (!partner) return { ...out, stage: 'unpaired', reason: 'not_connected' };
  if (!out.me.on) return out;
  if (!usable(out.me)) return { ...out, stage: 'checking', reason: 'me_stale' };
  if (out.me.acc > RULES.MAX_ACC) return { ...out, stage: 'checking', reason: 'me_inaccurate' };
  if (!out.partner.on) return { ...out, stage: 'waiting', reason: 'partner_off' };
  if (!usable(out.partner)) return { ...out, stage: 'waiting', reason: 'partner_stale' };
  if (out.partner.acc > RULES.MAX_ACC) return { ...out, stage: 'waiting', reason: 'partner_inaccurate' };
  const d = haversine(me.latitude, me.longitude, partner.latitude, partner.longitude);
  out.distance = Math.round(d);
  // together for sure (<= 50 m), or within the pair's radius when the two
  // accuracy circles overlap (cannot be told apart from being together)
  const together = d <= RULES.TOGETHER || (d <= out.radius && d <= out.me.acc + out.partner.acc);
  const inCooldown = lastMeetingAt != null && now - lastMeetingAt < RULES.COOLDOWN;
  if (together || d <= RULES.NEAR) {
    if (pair.active_recorded) return { ...out, stage: 'recorded', reason: 'recorded' };
    if (inCooldown) return { ...out, stage: 'recorded', reason: 'cooldown' };
  }
  if (together) {
    out.stage = 'together';
    out.strong = d <= RULES.TOGETHER && out.me.acc <= RULES.STRONG_ACC && out.partner.acc <= RULES.STRONG_ACC;
    out.since = pair.active_since ? Number(pair.active_since) : null;
    out.held = out.since ? now - out.since : 0;
    const bothSince = !!out.since && me.location_at > out.since && partner.location_at > out.since;
    out.canAuto = out.strong && out.held >= RULES.HOLD && bothSince;
    out.canConfirm = true;
    out.needsBoth = !out.strong;
    const mine = Number(pair[`confirm${you}_at`]) || 0, theirs = Number(pair[`confirm${you === 1 ? 2 : 1}_at`]) || 0;
    out.myConfirm = now - mine < RULES.CONFIRM_WINDOW;
    out.partnerConfirm = now - theirs < RULES.CONFIRM_WINDOW;
    out.reason = out.strong ? (out.canAuto ? 'together_auto' : 'together_hold') : 'together_confirm';
    return out;
  }
  if (d <= RULES.NEAR) return { ...out, stage: 'near', reason: 'near' };
  return { ...out, stage: 'far', reason: 'far' };
}

// What a fresh position does to the pair's proximity session.
// Returns the columns to update on `pairs` and whether to record a meeting.
export function transition(v, pair, now = Date.now()) {
  const set = {};
  if (v.stage === 'together') {
    if (pair.apart_since) set.apart_since = null;
    if (!pair.active_since) Object.assign(set, { active_since: now, active_recorded: 0, confirm1_at: null, confirm2_at: null });
    return { set, record: v.canAuto && !pair.active_recorded };
  }
  if (v.distance != null && v.distance > v.radius + RULES.APART) {
    if (!pair.apart_since) set.apart_since = now;
    else if (now - pair.apart_since >= RULES.APART_RESET && pair.active_since) Object.assign(set, { active_since: null, active_recorded: 0, confirm1_at: null, confirm2_at: null });
  }
  return { set, record: false };
}
