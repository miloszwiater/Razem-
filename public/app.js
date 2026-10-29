// Razem — frontend. Three screens (home, rewards, detection) drawn on a 390x860
// design stage; positions come from the reference PNGs (screen px / 1.7615).
// Plus the shared wardrobe (#/kolekcja), the meeting celebration and Puszystek.
// ?demo=1 renders the mock-up data and never writes to the API
// (?count=N and ?outfit=a,b override the demo values; ?still=1 freezes idle acts).
import { REWARDS as CATALOG, BY_ID, CATEGORIES, SLOTS, SET_SLOTS, MILESTONES, tierOf, unlockedIds, sanitizeOutfit, claimable, isVisible, isSpecial } from './rewards.js';
import { puszystekHTML, Puszystek, WEAR, DECOR } from './puszystek.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const STILL = params.has('still');
const cacheKey = 'razem-session-v1';
// last server state, only to paint instantly on launch; D1 stays the source of truth
const stateKey = 'razem-state-cache-v1';
const S = 687 / 390; // reference screen px per design px
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let token = DEMO ? '' : localStorage.getItem(cacheKey) || '';
let state = null, mode = 'create', route = '', sheet = '', locTimer = null, geoEnabled = false, working = false, tileStart = null, collCat = 'all', overlay = null;
let freshItem = '', loginCode = '';
const pref = (k, d) => { try { const v = localStorage.getItem('razem-' + k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('razem-' + k, v ? '1' : '0'); } catch { } };
let notifyOn = DEMO || pref('notify', false), syncOn = DEMO || pref('sync', true);

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, a, b, c) => { const v = Math.abs(n); return v === 1 ? a : (v % 10 >= 2 && v % 10 <= 4 && (v % 100 < 12 || v % 100 > 14)) ? b : c; };
const meetings = n => `${n} ${plural(n, 'spotkanie', 'spotkania', 'spotkań')}`;
const dp = v => `calc(${(+v).toFixed(2)} * var(--u))`;
const at = (x, y, w) => `left:${dp(x / S)};top:${dp(y / S)};width:${dp(w / S)}`;
const dateText = ms => new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
// whole calendar days between that date and today (local time), independent of the hour
const daysSince = date => { const [y, mo, d] = date.split('-').map(Number), t = new Date(); return Math.max(0, Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(y, mo - 1, d)) / 86400000)); };
const fmtDist = m => m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`;

const pusz = new Puszystek({ reduced, still: STILL });

// ------------------------------------------------------------------ icons
const I = {
  heart: (cls = '', fill = 'url(#hg)') => `<svg class="${cls}" viewBox="0 0 24 21" aria-hidden="true"><path fill="${fill}" d="M12 20.4C9.8 18.8 1.1 13.1 1.1 6.9 1.1 3.5 3.6 1.1 6.8 1.1c2.2 0 4 1.2 5.2 3 1.2-1.8 3-3 5.2-3 3.2 0 5.7 2.4 5.7 5.8 0 6.2-8.7 11.9-10.9 13.5z"/><path fill="#fff" opacity=".45" d="M5.2 4.4c1.3-.8 2.9-.4 3.4.3-.9.2-2.2.9-2.8 2.2-.4.8-1.5.4-1.4-.5 0-.8.3-1.6.8-2z"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 2.6h3.4l.6 2.6 1.7.9 2.5-.9 1.7 2.9-2 1.8v2l2 1.8-1.7 2.9-2.5-.9-1.7.9-.6 2.6h-3.4l-.6-2.6-1.7-.9-2.5.9-1.7-2.9 2-1.8v-2l-2-1.8 1.7-2.9 2.5.9 1.7-.9z"/><circle cx="12" cy="12" r="3.3"/></svg>`,
  back: `<svg viewBox="0 0 13 20" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2 2.5 10l8 8"/></svg>`,
  chev: (cls = 'chev') => `<svg class="${cls}" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m1.5 1.5 5 5.5-5 5.5"/></svg>`,
  chevL: `<svg viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 1.5 1.5 7l5 5.5"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="4.6" width="17.6" height="16" rx="3.4" fill="currentColor"/><rect x="3.2" y="4.6" width="17.6" height="5" rx="2.5" fill="currentColor"/><path d="M7.6 2.8v3.6M16.4 2.8v3.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><g fill="#fff"><rect x="6.8" y="11.6" width="2.4" height="2.2" rx=".6"/><rect x="10.8" y="11.6" width="2.4" height="2.2" rx=".6"/><rect x="14.8" y="11.6" width="2.4" height="2.2" rx=".6"/><rect x="6.8" y="15.4" width="2.4" height="2.2" rx=".6"/><rect x="10.8" y="15.4" width="2.4" height="2.2" rx=".6"/></g></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.4l3.4 2.4"/></svg>`,
  pin: (cls = 'pin') => `<svg class="${cls}" viewBox="0 0 14 18" aria-hidden="true"><path fill="currentColor" d="M7 .6C3.5.6.8 3.3.8 6.7c0 4.4 5 9.6 5.6 10.2.3.3.9.3 1.2 0 .6-.6 5.6-5.8 5.6-10.2C13.2 3.3 10.5.6 7 .6z"/><circle cx="7" cy="6.6" r="2.3" fill="#fff"/></svg>`,
  info: (cls = 'info') => `<svg class="${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6.8"/><path d="M8 7.2v4.2" stroke-linecap="round"/><circle cx="8" cy="4.8" r=".55" fill="currentColor"/></svg>`,
  gift: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.4" y="6.4" width="15.2" height="3.6" rx="1" fill="#f77ba4"/><rect x="3.4" y="10" width="13.2" height="7.8" rx="1.2" fill="#fa93b6"/><rect x="8.6" y="6.4" width="2.8" height="11.4" fill="#fff" opacity=".85"/><path d="M10 6.2C8.8 3.4 5.6 2.6 5.4 4.4c-.2 1.4 2.4 1.9 4.6 1.8zm0 0c1.2-2.8 4.4-3.6 4.6-1.8.2 1.4-2.4 1.9-4.6 1.8z" fill="none" stroke="#f06d9b" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  giftSolid: `<svg class="g" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.4" y="6.6" width="15.2" height="3.4" rx="1" fill="#fff"/><rect x="3.4" y="10" width="13.2" height="7.6" rx="1.2" fill="#fff" opacity=".92"/><rect x="8.7" y="6.6" width="2.6" height="11" fill="#f7a0bf"/><path d="M10 6.4C8.8 3.6 5.8 2.8 5.6 4.5c-.2 1.3 2.3 1.9 4.4 1.9zm0 0c1.2-2.8 4.2-3.6 4.4-1.9.2 1.3-2.3 1.9-4.4 1.9z" fill="none" stroke="#fff" stroke-width="1.5"/></svg>`,
  flag: `<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M1.6 1v12.4" stroke="#5c4677" stroke-width="1.4" stroke-linecap="round"/><path d="M2.2 1.4h7.6l-1.8 2.9 1.8 2.9H2.2z" fill="#f77ba4"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16.4V11a6 6 0 0 1 12 0v5.4l1.6 1.8H4.4z"/><path d="M10 20.4a2.2 2.2 0 0 0 4 0"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.6 10.4A7.8 7.8 0 0 0 5.4 7.6"/><path d="M5 3.8v4.2h4.2"/><path d="M4.4 13.6a7.8 7.8 0 0 0 14.2 2.8"/><path d="M19 20.2V16h-4.2"/></svg>`,
  locate: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M14.6 1.4 1.6 6.9c-.6.3-.5 1.1.1 1.2l5.3 1 1 5.3c.1.6.9.7 1.2.1z"/></svg>`,
  check: `<svg viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m1.5 5.2 3 3 6-6.4"/></svg>`,
  lock: `<svg viewBox="0 0 12 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="6" width="9" height="7" rx="2" fill="currentColor" stroke="none"/><path d="M3.5 6V4.4a2.5 2.5 0 0 1 5 0V6"/></svg>`,
  crown: `<svg class="emo" viewBox="0 0 20 18" aria-hidden="true"><path d="M2 5.6 6 9l4-6.4L14 9l4-3.4-1.6 9.6H3.6z" fill="#ffc63d" stroke="#e59a1c" stroke-width="1.1" stroke-linejoin="round"/><rect x="3.4" y="14.2" width="13.2" height="2.6" rx=".8" fill="#f7ae25"/><circle cx="10" cy="11" r="1.3" fill="#f2577f"/></svg>`,
  hearts2: `<svg class="emo" viewBox="0 0 22 20" aria-hidden="true"><path fill="#f45c9d" d="M7.4 18.6c-1.3-1-6.6-4.4-6.6-8.2 0-2 1.5-3.5 3.4-3.5 1.4 0 2.4.7 3.2 1.8.7-1.1 1.8-1.8 3.1-1.8 2 0 3.5 1.5 3.5 3.5 0 3.8-5.3 7.2-6.6 8.2z"/><path fill="#ff8cc0" d="M15.6 9.4c-.8-.6-4.2-2.8-4.2-5.2 0-1.3 1-2.2 2.2-2.2.9 0 1.5.4 2 1.1.5-.7 1.1-1.1 2-1.1 1.2 0 2.2.9 2.2 2.2 0 2.4-3.4 4.6-4.2 5.2z"/></svg>`,
  sparkHeart: `<svg class="emo" viewBox="0 0 22 20" aria-hidden="true"><path fill="url(#hg2)" d="M11 19c-1.9-1.4-9.8-6.6-9.8-12.2C1.2 3.8 3.4 1.6 6.3 1.6c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 2.9 0 5.1 2.2 5.1 5.2C20.8 12.4 12.9 17.6 11 19z"/><path fill="#fff" opacity=".6" d="M4.6 4.6c1-.7 2.4-.5 2.9.2-.8.2-1.8.8-2.3 1.8-.4.6-1.2.3-1.2-.4.1-.6.3-1.2.6-1.6z"/></svg>`,
};

// ------------------------------------------------------------------ sprites (reference screen px)
const DECO = {
  home: [['home-heart-0', 164, 1176, 51], ['home-heart-1', 468, 1202, 50], ['home-heart-2', 208, 1236, 37], ['home-heart-3', 37, 1295, 34], ['home-spark-4', 328, 1174, 29], ['home-spark-5', 427, 1177, 33], ['home-spark-6', 247, 1187, 28], ['home-spark-7', 449, 1253, 28], ['home-spark-8', 175, 1284, 42]],
  rew: [['rew-heart-0', 64, 1306, 33], ['rew-heart-1', 101, 1329, 35], ['rew-heart-2', 68, 1371, 40], ['rew-heart-3', 321, 1392, 45], ['rew-spark-4', 133, 1289, 34], ['rew-spark-5', 289, 1288, 39], ['rew-spark-6', 299, 1346, 28]],
  det: [['det-heart-0', 324, 1241, 47], ['det-heart-1', 133, 1260, 63], ['det-heart-2', 413, 1265, 36], ['det-heart-3', 191, 1309, 57], ['det-heart-4', 187, 1376, 37], ['det-spark-5', 215, 1264, 27], ['det-spark-6', 146, 1338, 34]],
};
// where Puszystek stands on each screen: [x, y, width] in reference screen px
const SPOT = { home: [216, 1211, 242], rew: [96, 1318, 236], detCheer: [213, 1273, 241], detSit: [222, 1282, 236] };
const deco = set => DECO[set].map(([n, x, y, w], i) => `<img class="px ${n.includes('spark') ? 'deco-spark' : 'deco-heart'}" src="/img/${n}.png" alt="" style="${at(x, y, w)};--d:${(-i * 0.73).toFixed(2)}s">`).join('');
const cat = (spot, pose = 'home', label = 'Puszystek — dotknij', outfit = model()?.outfit || []) => puszystekHTML({ pose, box: SPOT[spot], outfit, label, stagePx: at, fresh: freshItem });
const themeOf = m => m?.outfit.find(id => BY_ID[id]?.slot === 'theme') || '';
const themeGlow = (m, top) => themeOf(m) ? `<span class="theme-glow ${themeOf(m)}" style="top:${dp(top / S)};height:${dp((1515 - top) / S)}"></span>` : '';

// ------------------------------------------------------------------ rewards presentation
const TILE_ART = { crown: 'tile-crown', badge: 'tile-heart', sunset: 'tile-sky', lavender: 'tile-sky', gift: 'tile-gift', bigGift: 'tile-gift' };
const TILE_FILTER = { bigGift: 'hue-rotate(200deg) saturate(1.2)', lavender: 'hue-rotate(40deg) saturate(.8)' };
const LABEL = { crown: '<b>Korona<br>dla Puszystka</b>', badge: 'Nowa<br>odznaka', sunset: '<b>Motyw tła</b><br>„Różowy zachód”', gift: 'Niespodzianka' };
const FX_ART = { hearts: 'home-heart-0', butterflies: 'items/butterfly', stars: 'home-spark-5', confetti: 'home-heart-2', fireworks: 'items/firework' };
const BADGE_NUM = { first: 1, week: 7, seventy5: 75, hundred: 100, legend: 200 };
const TILE_BG = { nakrycia: 'linear-gradient(160deg,#fff4dc,#ffe2ef)', ozdoby: 'linear-gradient(160deg,#fff1f7,#f6e6ff)', ubranka: 'linear-gradient(160deg,#eefaf5,#fde8f1)', akcesoria: 'linear-gradient(160deg,#fff5f8,#fde3ef)', efekty: 'linear-gradient(160deg,#f3efff,#fde6f2)', odznaki: 'linear-gradient(160deg,#fff9e8,#fdf0f6)', dekoracje: 'linear-gradient(160deg,#eef6ff,#fdeef4)' };
const badgeArt = r => { const n = BADGE_NUM[r.id] ?? r.at; return `<i class="badge-art ${n >= 100 ? 'diamond' : n >= 50 ? '' : n >= 20 ? 'silver' : 'pink'}">${n}</i>`; };
const FEATURED = CATALOG.filter(r => !r.hidden && r.at % 10 === 0);
function artHTML(r) {
  if (TILE_ART[r.id]) return `<img src="/img/${TILE_ART[r.id]}.webp" alt=""${TILE_FILTER[r.id] ? ` style="filter:${TILE_FILTER[r.id]}"` : ''}>`;
  if (r.slot === 'pin' || (r.cat === 'odznaki' && !WEAR[r.id])) return badgeArt(r);
  if (WEAR[r.id]) return `<img class="px-art" src="/img/${WEAR[r.id].src}" alt="">`;
  if (DECOR[r.id]) return `<img class="px-art decor-art" src="/img/${DECOR[r.id].src}" alt="">`;
  if (FX_ART[r.id]) return `<img class="px-art" src="/img/${FX_ART[r.id]}.png" alt="">`;
  return `<img src="/img/tile-gift.webp" alt="">`;
}
// locked -> ready (earned, waiting to be claimed) -> owned -> worn / set
const itemStatus = (r, m) => m.n < r.at ? 'locked' : !m.claimed.includes(r.id) ? 'ready' : m.outfit.includes(r.id) ? 'worn' : 'owned';
function itemTile(r, m, extra = '') {
  const st = itemStatus(r, m);
  const label = { locked: ', zablokowane', ready: ', do odebrania', worn: SET_SLOTS.includes(r.slot) ? ', ustawione' : ', założone', owned: ', w ekwipunku' }[st];
  return `<button class="item ${st} ${extra}" data-action="item" data-id="${r.id}" aria-label="${h(r.name)}${label}">
    <span class="art" style="--tile-bg:${TILE_BG[r.cat]}"><span class="ai">${artHTML(r)}</span>${st === 'locked' ? `<span class="lock">${I.lock}</span><span class="need">${r.at} sp.</span>` : ''}${st === 'worn' ? `<span class="ok">${I.check}</span>` : ''}${st === 'ready' ? '<span class="claim">Odbierz</span>' : ''}</span>
    <p>${h(r.name)}</p></button>`;
}
const LINES = { crown: 'Puszystek ma teraz koronę!' };
function lineFor(r) {
  if (LINES[r.id]) return LINES[r.id];
  if (r.cat === 'odznaki') return `Nowa odznaka w gablocie: ${r.name}!`;
  if (r.reveals) return `Czeka na was: ${r.name.toLowerCase()}!`;
  if (r.slot === 'effect' || r.slot === 'theme') return `Nowy efekt: ${r.name}!`;
  return `Puszystek nosi: ${r.name.toLowerCase()}!`;
}

// ------------------------------------------------------------------ data
const LADDER = [5, 10, ...Array.from({ length: 200 }, (_, i) => 20 + i * 10)];
const DEMO_DAY = 86400000;
let demoOutfit = params.has('outfit') ? params.get('outfit').split(',').filter(Boolean) : ['crown', 'bow'];
let demoOpened = [];
let demoClaimed = null;
function demoState() {
  const now = Date.now(), n = params.has('count') ? Math.max(0, +params.get('count') || 0) : 27;
  return {
    you: 1, connected: true, together: true, code: null, count: n,
    members: [{ name: 'Miłosz', slot: 1 }, { name: 'Ola', slot: 2 }],
    firstMetAt: (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date(now - 214 * DEMO_DAY)),
    meetings: [{ id: 'd1', occurred_at: now - 3 * DEMO_DAY - 3600000, source: 'auto' }, { id: 'd2', occurred_at: now - 9 * DEMO_DAY, source: 'manual' }],
    rewards: { unlocked: unlockedIds(n), claimed: demoClaimed ??= CATALOG.filter(r => claimable(r, n, demoOpened) && (params.has('outfit') || !['bowLav', 'week'].includes(r.id))).map(r => r.id), equipped: sanitizeOutfit(demoOutfit, n, demoOpened), opened: demoOpened, version: 1 },
    proximity: { radius: 150, mine: true, partner: true, fresh: true, near: true, distance: 40, since: now - 900000, recorded: true, canConfirm: false },
  };
}

function model() {
  if (!state) return null;
  const n = Number(state.count) || 0;
  const gi = LADDER.findIndex(v => v > n);
  const goal = LADDER[gi], next = LADDER[gi + 1];
  const level = gi + 1;
  const start = Math.max(0, gi + 1 - 5);
  const nodes = LADDER.slice(start, start + 6);
  const last = state.meetings?.[0];
  const d = last ? Math.max(0, Math.floor((Date.now() - last.occurred_at) / 86400000)) : null;
  const rw = state.rewards || { unlocked: unlockedIds(n), equipped: [], opened: [], claimed: [] };
  const pr = state.proximity || {};
  const m = {
    n, goal, next, level, levelGoal: goal, nodes, d,
    together: !!(pr.near || state.together), pr,
    left: goal - n,
    days: state.firstMetAt ? daysSince(state.firstMetAt) : null,
    unlocked: CATALOG.filter(r => n >= r.at && !r.hidden),
    outfit: rw.equipped || [], opened: rw.opened || [], claimed: rw.claimed || [],
  };
  // earned rewards waiting to be claimed into the shared inventory
  m.ready = CATALOG.filter(r => claimable(r, n, m.opened) && !m.claimed.includes(r.id));
  m.pin = m.outfit.map(id => BY_ID[id]).find(r => r?.slot === 'pin');
  if (DEMO && !params.has('count')) Object.assign(m, { goal: 50, next: 60, level: 4, levelGoal: 50, left: 23, nodes: [10, 20, 30, 40, 50, 60], reachedAll: 5 });
  m.reached = m.reachedAll ?? m.nodes.filter(v => n >= v).length;
  return m;
}
const daysLabel = days => days === null ? 'Ustaw datę' : `${days} ${days === 1 ? 'dzień' : 'dni'}`;
const lastLabel = d => d === null ? 'Jeszcze nie' : d === 0 ? 'Dzisiaj' : d === 1 ? 'Wczoraj' : `${d} dni temu`;
const otherName = () => state?.members?.find(m => m.slot !== state.you)?.name || 'Druga osoba';
const myName = () => state?.members?.find(m => m.slot === state.you)?.name || 'Ty';

function phrase(m) {
  if (DEMO || m.together) return `Cieszę się, że znowu jesteście razem! ${I.hearts2}`;
  if (!state.connected) return `Czekam na drugą osobę ${I.hearts2}`;
  if (m.n === 0) return `Dotknijcie licznika po spotkaniu ${I.hearts2}`;
  if (m.d === 0) return `Puszystek dziś promienieje! ${I.hearts2}`;
  if (m.d !== null && m.d < 5) return `Cieszę się, że się widzieliście! ${I.hearts2}`;
  return `Tęsknię razem z wami ${I.hearts2}`;
}

// ------------------------------------------------------------------ network
let toastTimer;
function toast(s) { const el = document.getElementById('toast'); el.innerHTML = s; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000); }
async function request(path, data) {
  if (DEMO && data !== undefined) throw new Error('To tylko podgląd — nic nie zapisujemy ♡');
  const opts = { method: data === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, cache: 'no-store' };
  if (data !== undefined) opts.body = JSON.stringify(data);
  const res = await fetch(path, opts);
  let json; try { json = await res.json(); } catch { throw new Error('Brak odpowiedzi serwera.'); }
  if (!res.ok) { const e = new Error(json.error || 'Wystąpił błąd.'); e.data = json; e.status = res.status; throw e; }
  return json;
}

// ------------------------------------------------------------------ shell
function shell() {
  root.innerHTML = `<div class="app" data-route="${route}">
    <div class="stage">
      <div class="plates"><img class="plate-home" src="/img/header-home.webp" alt=""><img class="plate-rewards" src="/img/header-rewards.webp" alt=""><img class="plate-detect" src="/img/header-detect.webp" alt=""></div>
      <div class="views" id="views"></div>
      <header class="hdr">
        <button class="back" data-action="back" aria-label="Wróć">${I.back}</button>
        <h1 class="sr">Razem</h1>
        <img class="logo" src="/img/logo-razem.png" alt="Razem" data-action="home">
        ${I.heart('logo-heart')}
        <p class="tagline">Ty + &lt;3<i>|</i>Zawsze razem lepiej</p>
        <button class="gear" data-action="settings" aria-label="Ustawienia">${I.gear}</button>
        ${I.heart('link-heart')}
        <span class="avatar-hit a" title="${h(state?.members?.[0]?.name || '')}"></span><span class="avatar-hit b" title="${h(state?.members?.[1]?.name || '')}"></span>
      </header>
    </div>
  </div>`;
}

const bigNum = (cls, v) => `<p class="big-num ${cls} d${String(v).length}">${v}</p>`;

function viewHome(m) {
  const pct = DEMO && !params.has('count') ? 61 : Math.min(100, Math.max(0, (m.n / m.levelGoal) * 100));
  return `
  <section class="card hero tap rise" style="--i:0" data-action="meeting" aria-label="Licznik spotkań">
    <img class="plate" src="/img/hero-home.webp" alt="">
    ${I.heart('hero-heart')}
    ${m.pin ? `<span class="hero-pin" title="${h(m.pin.name)}">${badgeArt(m.pin)}</span>` : ''}
    <svg class="count" viewBox="0 0 365 92" role="img" aria-label="${m.n}" data-count="${m.n}"><text x="182.5" y="68.5" text-anchor="middle">${m.n}</text></svg>
    <p class="count-label">${plural(m.n, 'spotkanie na żywo', 'spotkania na żywo', 'spotkań na żywo')}</p>
    <p class="count-sub">${I.heart()}liczone wspólnie</p>
    <div class="panel" data-action="rewards">
      <p class="panel-title">Pasek spotkań</p>
      <p class="ratio"><b>${m.n}</b> / ${m.levelGoal}</p>
      <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${m.levelGoal}" aria-valuenow="${m.n}"><div class="fill" data-w="${pct}">${hearts4()}</div></div>
      <button class="gift ${m.left <= 3 || m.ready.length ? 'ready' : ''}" data-action="${m.ready.length ? 'collection' : 'rewards'}" aria-label="Nagrody${m.ready.length ? `, ${m.ready.length} do odebrania` : ''}">${I.gift}${m.ready.length ? `<span class="dot">${m.ready.length}</span>` : ''}</button>
      <p class="hint">${I.flag}Jeszcze ${m.left} ${plural(m.left, 'spotkanie', 'spotkania', 'spotkań')} do kolejnego celu!</p>
    </div>
  </section>
  <section class="card stats rise" style="--i:1">
    <button class="stat tap" data-action="first-date"><span class="ic lav">${I.cal}</span><span class="lbl">Od pierwszego spotkania:</span><span class="val">${daysLabel(m.days)}</span>${I.chev()}</button>
    <span class="div"></span>
    <button class="stat s2 tap" data-action="history"><span class="ic pink">${I.clock}</span><span class="lbl">Ostatnie spotkanie:</span><span class="val">${lastLabel(m.d)}</span>${I.chev()}</button>
  </section>
  <button class="pill rise ${geoEnabled ? 'on' : ''}" style="--i:2" data-action="detect">${I.pin()}<span>Auto-zliczanie, gdy jesteście razem</span><span data-action="location-info" role="button" aria-label="Jak to działa">${I.info()}</span></button>
  <img class="meadow-bg" src="/img/meadow-home.webp" alt="" style="position:absolute;left:0;width:100%;top:${dp(1150 / S)}">
  ${themeGlow(m, 1150)}
  ${deco('home')}
  ${cat('home')}
  <div class="bubble" ${!DEMO && state && !state.connected ? 'data-action="copy"' : ''}>${phrase(m)}</div>`;
}
const hearts4 = () => [8.6, 15.8, 34, 64.6].map((l, i) => `<span class="wh" style="left:${dp(l + 22)};animation-delay:${i * .4}s">${I.heart('', '#fff')}</span>`).join('');

function viewRewards(m) {
  const pctLevel = DEMO && !params.has('count') ? 63 : Math.min(100, (m.n / m.levelGoal) * 100);
  const xs = [49.4, 105.6, 162.4, 219.1, 275.9, 336.6];
  const barFill = m.reached <= 0 ? 0 : Math.min(1, (xs[Math.min(m.reached, 5) - 1] - 49.4) / (xs[5] - 49.4));
  const latest = m.unlocked.filter(r => FEATURED.includes(r)).at(-1) || m.unlocked.at(-1);
  const nextReward = CATALOG.find(r => m.n < r.at && !r.hidden);
  if (tileStart === null) tileStart = DEMO && !params.has('count') ? FEATURED.findIndex(r => r.id === 'crown') : Math.max(0, Math.min(FEATURED.length - 4, FEATURED.findIndex(r => m.n < r.at) - 1));
  const tiles = FEATURED.slice(tileStart, tileStart + 4);
  const gifted = latest?.reveals && !m.opened.includes(latest.id);
  return `
  <section class="card wide goal rise" style="--i:0">
    <img class="plate" src="/img/goal-rewards.webp" alt="">
    <h2>Cel rośnie razem z wami</h2>
    <p class="sub">Im więcej czasu razem, tym większe cele<br>i jeszcze więcej nagród!</p>
    ${bigNum('cur', m.goal)}<p class="big-lbl cur">Aktualny cel</p>
    ${bigNum('new', m.next)}<p class="big-lbl new">Nowy cel</p>
    <div class="ms">
      <div class="ms-bar"><i data-w="${barFill * 100}"></i></div>
      ${m.nodes.map((v, i) => `<div class="ms-node ${i === 5 ? 'gift-node' : ''}" style="left:${dp(xs[i] - 10.2)}">${i === 5 ? `<span class="h">${I.heart('', 'url(#hg3)')}${I.giftSolid}</span>` : `<span class="h ${i < m.reached ? '' : 'off'}">${I.heart()}</span>`}<b>${v}</b><span>spotkań</span></div>`).join('')}
    </div>
  </section>
  <section class="card wide level rise" style="--i:1">
    <img class="plate" src="/img/level-rewards.webp" alt="">
    <p class="lbl">Wasz poziom</p>
    <h3>Poziom ${m.level} ${I.heart()}</h3>
    <div class="track"><div class="fill" data-w="${pctLevel}">${hearts3()}</div></div>
    <p class="ratio"><b>${m.n}</b> / ${m.levelGoal}</p>
    <p class="hint">Jeszcze ${m.left} ${plural(m.left, 'spotkanie', 'spotkania', 'spotkań')} do poziomu ${m.level + 1}!</p>
  </section>
  <section class="card wide rewards rise" style="--i:2">
    <h3>${I.gift}Nagrody</h3>
    <button class="see-all" data-action="collection">${m.ready.length ? `Do odebrania<span class="dot">${m.ready.length}</span>` : 'Zobacz wszystkie'} ${I.chev('')}</button>
    <button class="nav-arrow l" data-action="tile-prev" aria-label="Poprzednie nagrody" ${tileStart <= 0 ? 'aria-disabled="true"' : ''}>${I.chevL}</button>
    <div class="tiles">${tiles.map((r, i) => `<button class="tile ${m.n >= r.at ? '' : 'locked'}" data-action="item" data-id="${r.id}" style="left:${dp([-1.4, 85.6, 172.4, 254.2][i])}"><span class="art">${TILE_ART[r.id] ? artHTML(r) : `<span class="gen" style="background:${TILE_BG[r.cat]}">${artHTML(r)}</span>`}${m.n >= r.at ? `<span class="ok">${I.check}</span>` : ''}</span><p>${LABEL[r.id] || h(r.name).replace(' ', '<br>')}</p></button>`).join('')}</div>
    <button class="nav-arrow r" data-action="tile-next" aria-label="Następne nagrody" ${tileStart >= FEATURED.length - 4 ? 'aria-disabled="true"' : ''}>${I.chev('')}</button>
  </section>
  <section class="unlock">
    <img class="plate" src="/img/unlock-rewards.webp" alt="" style="width:100%">
    ${latest
      ? `<h3>Kolejny odblokowany prezent</h3><p>${h(lineFor(latest))} ${latest.id === 'crown' ? I.crown : I.hearts2}<br>Jeszcze więcej radości razem! ${I.hearts2}</p>`
      : `<h3>Pierwszy prezent już blisko</h3><p>Jeszcze ${meetings(nextReward.at - m.n)} do nagrody! ${I.crown}<br>Puszystek już nie może się doczekać ${I.hearts2}</p>`}
    <button class="btn-super" data-action="${gifted ? 'item' : 'super'}" ${gifted ? `data-id="${latest.id}"` : ''}>${gifted ? 'Otwórz!' : 'Super!'} ${I.heart('', '#fff')}</button>
  </section>
  ${themeGlow(m, 1270)}
  ${deco('rew')}
  ${cat('rew')}`;
}
const hearts3 = () => [27, 52, 74].map((l, i) => `<span class="wh" style="left:${dp(l)};animation-delay:${i * .5}s">${I.heart('', '#fff')}</span>`).join('');

// What the detection card says, from the server's proximity verdict.
function detectCopy(m) {
  const p = m.pr;
  if (DEMO || (p.near && p.recorded)) return { title: 'Spotkanie wykryte!', sub: `Jesteście razem ${I.sparkHeart}`, together: true };
  if (p.near && p.canConfirm) return { title: 'Jesteście blisko!', sub: `ok. ${fmtDist(p.distance)} od siebie ${I.sparkHeart}`, together: true, cta: true };
  if (p.near) return { title: 'Jesteście blisko!', sub: 'Sprawdzamy jeszcze chwilę…', together: true };
  if (p.fresh) return { title: 'Szukamy siebie…', sub: `Jeszcze ${fmtDist(p.distance)} od siebie`, apart: true };
  if (geoEnabled && !p.partner) return { title: 'Czekamy na drugą osobę', sub: 'Niech otworzy Razem z włączoną lokalizacją', apart: true };
  if (geoEnabled) return { title: 'Szukamy siebie…', sub: 'Czekamy na dokładniejszą lokalizację', apart: true };
  return { title: 'Wykrywanie spotkań', sub: 'Włączcie lokalizację na obu telefonach', apart: true };
}

function viewDetect(m) {
  const c = detectCopy(m);
  return `
  <section class="card det rise" style="--i:0" data-action="replay" aria-label="Animacja spotkania">
    <img class="plate" src="/img/detect-top.webp" alt="" style="height:auto">
    <div class="burst">${I.heart('bh')}<i></i><i></i><i></i><i></i></div>
    <h2>${c.title}</h2>
    <p class="sub">${c.sub}</p>
    <div class="map">
      <img class="bg" src="/img/map.webp" alt="Poglądowa mapa okolicy">
      <span class="glow"></span>
      ${c.together ? I.heart('map-heart') : ''}
      <div class="chips ${c.apart ? 'apart' : ''}"><img class="boy" src="/img/chip-boy.png" alt="${h(state?.members?.[0]?.name || '')}"><img class="girl" src="/img/chip-girl.png" alt="${h(state?.members?.[1]?.name || '')}"></div>
      <div class="map-bubble">${c.together ? `Jesteście razem! ${I.hearts2}` : 'Jeszcze osobno'}</div>
      <button class="locate" data-action="locate" aria-label="Odśwież lokalizację">${I.locate}</button>
      <div class="acc" data-action="radius" role="button" aria-label="Zasięg wykrywania">${I.pin()}Dokładność: w przybliżeniu${I.info()}</div>
      ${DEMO ? '<span class="preview-tag">Podgląd</span>' : ''}
    </div>
    <div class="caption">${c.cta ? `${I.heart()}<div class="near-cta"><button class="btn-main" data-action="confirm-meeting">Zaczynamy spotkanie ${I.heart('', '#fff')}</button><span>Potwierdźcie,<br>a zapiszemy je w pasku.</span></div>` : `${I.heart()}<p>Gdy obie osoby są blisko siebie,<br>spotkanie zapisuje się <em>automatycznie.</em></p>`}</div>
  </section>
  <section class="card row rise" style="--i:1;top:${dp(525.1)}"><span class="ic loc">${I.pin('')}</span><h4>Lokalizacja</h4><p>Pozwala wykrywać, kiedy jesteście razem.</p><button class="switch" role="switch" aria-checked="${DEMO || geoEnabled}" data-action="toggle-location" aria-label="Lokalizacja"></button></section>
  <section class="card row rise" style="--i:2;top:${dp(583.2)}"><span class="ic bell">${I.bell}</span><h4>Powiadomienia</h4><p>Otrzymujecie informację, gdy się spotkacie.</p><button class="switch" role="switch" aria-checked="${notifyOn}" data-action="toggle-notify" aria-label="Powiadomienia"></button></section>
  <section class="card row rise" style="--i:3;top:${dp(641.6)};height:${dp(64.4)}"><span class="ic sync" style="top:${dp(11.6)}">${I.sync}</span><h4>Wspólna synchronizacja</h4><p>Spotkania zapisują się automatycznie<br>w Waszym pasku.</p><button class="switch" role="switch" aria-checked="${syncOn}" data-action="toggle-sync" aria-label="Wspólna synchronizacja" style="top:${dp(14.2)}"></button></section>
  <img class="meadow-bg" src="/img/meadow-detect.webp" alt="" style="position:absolute;left:0;width:100%;top:${dp(1245 / S)}">
  ${themeGlow(m, 1245)}
  ${deco('det')}
  ${c.together ? cat('detCheer', 'cheer', 'Puszystek cieszy się') : cat('detSit')}
  <div class="hurra">${c.together ? `<b>Hurra!</b><span>Jesteście razem! ${I.hearts2}</span>` : `<b>Hej!</b><span>Czekam na was ${I.hearts2}</span>`}</div>`;
}

function viewCollection(m) {
  const visible = CATALOG.filter(r => isVisible(r, m.opened));
  const owned = visible.filter(r => m.claimed.includes(r.id)).length;
  const worn = m.outfit.map(id => BY_ID[id]).filter(Boolean);
  const box = [178, 0, 236];
  const cats = collCat === 'all' ? Object.keys(CATEGORIES) : [collCat];
  return `<div class="coll-wrap">
    <section class="card wardrobe rise" style="--i:0">
      <img class="plate" src="/img/unlock-rewards.webp" alt="">
      ${themeGlow(m, 0).replace('style="', 'style="bottom:0;')}
      <h2>Wspólny ekwipunek</h2>
      <p class="sub">${h(myName())} + ${h(otherName())} — jedna garderoba Puszystka.</p>
      <span class="stat-pill"><b>${owned}</b> / ${visible.length}</span>
      <div class="worn">${worn.length ? worn.map(r => `<span class="chip">${h(r.name)}</span>`).join('') : '<span class="chip empty">Nic nie ma na sobie</span>'}</div>
      ${m.ready.length ? `<button class="claim-all" data-action="claim-all">${I.gift}Odbierz wszystko (${m.ready.length})</button>` : ''}
      ${puszystekHTML({ pose: 'home', box, outfit: m.outfit, label: 'Puszystek', fresh: freshItem, stagePx: (x, y, w) => `right:${dp(8)};bottom:${dp(-6)};width:${dp(w / S * .74)}` })}
    </section>
    <div class="cats" role="group" aria-label="Kategorie">${[['all', 'Wszystkie'], ...Object.entries(CATEGORIES)].map(([k, v]) => `<button aria-pressed="${collCat === k}" data-action="coll-cat" data-cat="${k}">${v}</button>`).join('')}</div>
    ${cats.map((c, i) => { const list = visible.filter(r => r.cat === c); return `<section class="card coll-card rise" style="--i:${i + 1}"><h3>${CATEGORIES[c]} <small>${list.filter(r => m.claimed.includes(r.id)).length} z ${list.length}</small></h3><div class="grid">${list.map(r => itemTile(r, m)).join('')}</div></section>`; }).join('')}
    <p class="coll-note">Nagrody zdobywacie razem. To, co założy jedna osoba, druga zobaczy u siebie.</p>
  </div>`;
}

function viewOnboarding() {
  return `
  <section class="card welcome rise">
    <h2>Wasz mały świat</h2>
    <p class="sub">Liczcie wspólne spotkania i zbierajcie nagrody z Puszystkiem.</p>
    <div class="seg" role="group"><button aria-pressed="${mode === 'create'}" data-action="mode-create">Stwórz parę</button><button aria-pressed="${mode === 'join'}" data-action="mode-join">Dołącz z kodem</button></div>
    <form id="start-form">
      ${mode === 'restore' ? '<label class="field-l" for="code">Twój kod logowania</label><input id="code" class="field" maxlength="16" placeholder="12 znaków z ustawień" required autocapitalize="characters" autocomplete="one-time-code">' : `<label class="field-l" for="name">Jak masz na imię?</label>
      <input id="name" class="field" maxlength="28" minlength="2" placeholder="Twoje imię" required autocomplete="given-name">`}
      ${mode === 'join' ? '<label class="field-l" for="code">Kod od drugiej osoby</label><input id="code" class="field" maxlength="11" placeholder="Np. ABCD1234" required autocapitalize="characters" autocomplete="off">' : ''}
      <button class="btn-main" type="submit">${mode === 'create' ? 'Stwórz nasz świat' : mode === 'join' ? 'Połącz nasze światy' : 'Zaloguj się'} ${I.heart('', '#fff')}</button>
    </form>
    <p class="note">${mode === 'restore' ? '<button data-action="mode-create" style="text-decoration:underline">Wróć</button>' : 'Masz już parę na innym telefonie? <button data-action="mode-restore" style="text-decoration:underline">Zaloguj się kodem</button>'}</p>
  </section>
  <img class="meadow-bg" src="/img/meadow-home.webp" alt="" style="position:absolute;left:0;width:100%;top:${dp(1150 / S)}">
  ${deco('home')}
  ${cat('home', 'home', 'Puszystek', [])}
  <div class="bubble">Puszystek czeka na waszą historię ${I.hearts2}</div>`;
}

// ------------------------------------------------------------------ render + transitions
const ROUTES = { '': 'home', '#/nagrody': 'rewards', '#/spotkanie': 'detect', '#/kolekcja': 'collection' };
const HASH = { home: '', rewards: '#/nagrody', detect: '#/spotkanie', collection: '#/kolekcja' };
const ORDER = { onboarding: 0, home: 0, rewards: 1, detect: 2, collection: 3 };
const routeFromHash = () => ROUTES[location.hash] || 'home';

function render(next, animate = false) {
  const prev = route;
  route = state ? next : 'onboarding';
  if (!root.querySelector('.app')) shell();
  const app = root.querySelector('.app');
  app.dataset.route = route;
  const views = document.getElementById('views');
  const m = model();
  const html = route === 'onboarding' ? viewOnboarding() : route === 'rewards' ? viewRewards(m) : route === 'detect' ? viewDetect(m) : route === 'collection' ? viewCollection(m) : viewHome(m);
  const v = document.createElement('div');
  v.className = 'view' + (themeOf(m) ? ' ' + themeOf(m) : '');
  v.dataset.route = route;
  v.innerHTML = html;
  const old = [...views.children];
  if (animate && old.length && prev !== route) {
    const backNav = ORDER[route] < ORDER[prev];
    v.classList.add('enter'); if (backNav) v.classList.add('back-nav');
    old.forEach(o => { o.classList.remove('enter'); o.classList.add('leave'); if (backNav) o.classList.add('back-nav'); setTimeout(() => o.remove(), 340); });
    app.scrollTo?.({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
  } else {
    old.forEach(o => o.remove());
    if (!animate) v.querySelectorAll('.rise').forEach(e => e.classList.remove('rise'));
  }
  views.appendChild(v);
  // the wardrobe is longer than one screen: let the stage grow with it
  const stage = app.querySelector('.stage');
  stage.style.height = '';
  if (route === 'collection') requestAnimationFrame(() => { const w = v.querySelector('.coll-wrap'); if (w) stage.style.height = Math.max(stage.offsetHeight, w.offsetTop + w.offsetHeight) + 'px'; });
  if (!overlay) pusz.mount(v.querySelector('.pusz'));
  settle(v, animate || !old.length);
  freshItem = '';
}

// After a view is in the DOM: grow progress bars, count up numbers.
function settle(v, fresh) {
  // long counts ("135 / 140"): shorten the level bar so the numbers never sit on it
  const lv = v.querySelector('.level');
  if (lv) { const t = lv.querySelector('.track'), r = lv.querySelector('.ratio'); const gap = r.getBoundingClientRect().left - t.getBoundingClientRect().right; if (gap < 6) t.style.width = `${t.offsetWidth + gap - 6}px`; }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    v.querySelectorAll('[data-w]').forEach(el => { el.style.width = `calc(${el.dataset.w}% - ${el.classList.contains('fill') ? dp(6) : '0px'} * ${(1 - el.dataset.w / 100).toFixed(3)})`; });
  }));
  const c = v.querySelector('.count');
  if (c && fresh && !reduced.matches) countUp(c, 0, +c.dataset.count, 1100);
}
function countUp(el, from, to, ms) {
  const t0 = performance.now();
  const txt = el.querySelector('text') || el;
  const step = t => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); txt.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ Puszystek extras
function burst(fromEl, n = 6, spread = 180) {
  if (!fromEl || reduced.matches) return;
  const r = fromEl.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const img = document.createElement('img');
    img.className = 'burst-heart px-art'; img.src = i % 3 === 2 ? '/img/home-spark-5.png' : '/img/home-heart-' + (i % 3) + '.png'; img.alt = '';
    img.style.left = r.left + r.width / 2 - 8 + 'px'; img.style.top = r.top + r.height * .25 + 'px';
    img.style.setProperty('--dx', ((Math.random() - .5) * spread).toFixed(0) + 'px');
    img.style.setProperty('--dy', (-60 - Math.random() * 90).toFixed(0) + 'px');
    img.style.setProperty('--r', ((Math.random() - .5) * 50).toFixed(0) + 'deg');
    img.style.animationDelay = i * 60 + 'ms';
    document.body.appendChild(img); setTimeout(() => img.remove(), 1700 + i * 60);
  }
}
// a small heart drifts up from Puszystek every few seconds (not while asleep)
setInterval(() => {
  if (document.hidden || reduced.matches || STILL || pusz.state === 'sleepy') return;
  const c = document.querySelector('.view:not(.leave) .pusz'); if (!c) return;
  const v = c.closest('.view');
  const img = document.createElement('img');
  img.className = 'rise-heart px-art'; img.src = '/img/home-heart-2.png'; img.alt = '';
  img.style.left = `calc(${c.style.left} + ${c.style.width} * ${(.3 + Math.random() * .4).toFixed(2)})`;
  img.style.top = c.style.top;
  img.style.setProperty('--dx', ((Math.random() - .5) * 30).toFixed(0) + 'px');
  v.appendChild(img); setTimeout(() => img.remove(), 2700);
}, 4200);

// ------------------------------------------------------------------ meeting celebration
// Two hearts meet, light, "Jesteście razem!", Puszystek cheers, the counter
// rolls to the new number, then any newly unlocked reward gets its own card.
const ovPusz = (outfit, fresh = '') => puszystekHTML({ pose: 'cheer', box: [0, 0, 241], outfit, fresh, label: 'Puszystek świętuje', stagePx: (x, y, w) => `left:calc(50% - ${dp(w / S * .62)});bottom:${dp(18)};width:${dp(w / S * 1.24)}` });
function celebrationHTML({ n, preview, milestone }) {
  const m = model();
  const confetti = reduced.matches ? '' : Array.from({ length: 18 }, (_, i) => `<img class="px-art" src="/img/${['home-heart-0', 'home-heart-2', 'home-spark-5', 'det-heart-2'][i % 4]}.png" alt="" style="left:${(i * 53) % 100}%;--dx:${((i % 5) - 2) * 30}px;--r:${(i * 67) % 360}deg;animation-duration:${2.6 + (i % 4) * .5}s;animation-delay:${1.2 + (i % 6) * .15}s">`).join('');
  return `<div class="ov" id="ov" role="dialog" aria-modal="true" aria-label="Jesteście razem">
    <div class="ov-stage ${themeOf(m)}">
      ${preview ? '<span class="ov-preview">Podgląd — bez naliczania</span>' : ''}
      <img class="ov-meadow" src="/img/meadow-detect.webp" alt="">
      <span class="ov-rays"></span>
      ${I.heart('ov-heart a')}${I.heart('ov-heart b', 'url(#hg2)')}
      <span class="ov-ring"></span><span class="ov-ring r2"></span>
      ${I.heart('ov-big', 'url(#hg2)')}
      <h2 class="ov-title">${milestone ? 'Wielki dzień!' : 'Jesteście razem!'}</h2>
      <p class="ov-sub">${h(myName())} + ${h(otherName())}${milestone ? ` · kamień milowy ${n}` : ''}</p>
      <div class="ov-count">Wasze <b data-to="${n}">${Math.max(0, n - 1)}</b>. spotkanie!</div>
      <div class="ov-pusz">${ovPusz(m.outfit)}</div>
      <div class="ov-confetti">${confetti}</div>
      <div class="ov-actions"><button class="btn-main" data-action="ov-next">Super! ${I.heart('', '#fff')}</button></div>
    </div></div>`;
}
function rewardCardHTML(r) {
  const m = model();
  const claimed = m.claimed.includes(r.id), worn = m.outfit.includes(r.id);
  const slotFree = r.slot && !m.outfit.some(id => BY_ID[id]?.slot === r.slot);
  const btn = !claimed
    ? `<button class="btn-soft" data-action="ov-next">Później</button><button class="btn-main" data-action="ov-claim" data-id="${r.id}">${r.reveals ? 'Otwórz prezent' : slotFree ? (SET_SLOTS.includes(r.slot) ? 'Odbierz i ustaw' : 'Odbierz i załóż') : 'Odbierz'} ${I.heart('', '#fff')}</button>`
    : r.slot && !worn ? `<button class="btn-soft" data-action="ov-next">Później</button><button class="btn-main" data-action="ov-wear" data-id="${r.id}">${SET_SLOTS.includes(r.slot) ? 'Ustaw' : 'Załóż'} ${I.heart('', '#fff')}</button>`
      : `<button class="btn-main" data-action="ov-next">Super! ${I.heart('', '#fff')}</button>`;
  return `<div class="ov-reward" role="group" aria-label="Nowa nagroda">
    <div class="kick">${r.reveals ? 'Niespodzianka!' : isSpecial(r) ? 'Wyjątkowa nagroda!' : 'Nowa nagroda!'}</div>
    <div class="art-wrap">${itemTile(r, { ...m, n: Math.max(m.n, r.at) }).replace('data-action="item"', '')}</div>
    <h3>${h(r.name)}</h3><p>${h(r.desc)}</p>
    <div class="row-btns">${btn}</div>
  </div>`;
}
function showCelebration({ n = state.count, preview = false, rewards = [] } = {}) {
  closeSheet();
  document.getElementById('ov')?.remove();
  const milestone = MILESTONES.includes(n);
  const wrap = document.createElement('div');
  wrap.innerHTML = celebrationHTML({ n, preview, milestone });
  const el = wrap.firstElementChild;
  document.body.appendChild(el);
  overlay = { el, queue: [...rewards], preview };
  pusz.mount(el.querySelector('.pusz'));
  const b = el.querySelector('.ov-count b');
  setTimeout(() => { if (b?.isConnected) { if (reduced.matches) b.textContent = n; else countUp(b, Math.max(0, n - 1), n, 700); } }, reduced.matches ? 0 : 2400);
  setTimeout(() => { if (overlay?.el === el) { pusz.celebrate(milestone ? 'milestone' : 'meeting'); burst(el.querySelector('.pz-body'), 8, 240); } }, reduced.matches ? 0 : 1700);
  if (overlay.queue.length) setTimeout(() => overlay?.el === el && nextReward(), reduced.matches ? 300 : 4200);
}
function showRewards(list, title = 'Nowa nagroda!') {
  if (!list.length) return;
  showCelebration({ n: state.count, preview: false, rewards: list });
  overlay.el.querySelector('.ov-title').textContent = title;
  overlay.el.querySelector('.ov-count').style.display = 'none';
}
// refresh the cheering Puszystek in the overlay after the outfit changed
function overlayPusz(fresh) {
  const p = overlay?.el.querySelector('.ov-pusz'); if (!p) return;
  p.innerHTML = ovPusz(model().outfit, fresh); pusz.mount(p.querySelector('.pusz'));
}
function nextReward() {
  if (!overlay) return;
  overlay.el.querySelector('.ov-reward')?.remove();
  const r = overlay.queue.shift();
  if (!r) return closeOverlay();
  overlay.el.querySelector('.ov-stage').insertAdjacentHTML('beforeend', rewardCardHTML(r));
  overlay.el.querySelector('.ov-actions')?.remove();
  pusz.celebrate('reward');
}
function closeOverlay() {
  const o = overlay; overlay = null;
  if (!o) return;
  o.el.classList.add('out'); setTimeout(() => o.el.remove(), 340);
  pusz.mount(document.querySelector('.view:not(.leave) .pusz'));
}
let seenRewards = null;
const seenKey = 'razem-seen-rewards';
// rewards unlocked since this device last looked (first run: nothing to celebrate)
function newRewards() {
  const ids = CATALOG.filter(r => !r.hidden && (Number(state.count) || 0) >= r.at).map(r => r.id);
  if (seenRewards === null) { try { seenRewards = JSON.parse(localStorage.getItem(seenKey)); } catch { } }
  if (!Array.isArray(seenRewards)) { seenRewards = ids; if (!DEMO) try { localStorage.setItem(seenKey, JSON.stringify(ids)); } catch { } return []; }
  const fresh = ids.filter(id => !seenRewards.includes(id) && !state.rewards?.claimed?.includes(id));
  if (fresh.length) { seenRewards = [...seenRewards, ...fresh]; if (!DEMO) try { localStorage.setItem(seenKey, JSON.stringify(seenRewards)); } catch { } }
  return fresh.map(id => BY_ID[id]);
}

// ------------------------------------------------------------------ sheets
function openSheet(name) { sheet = name; renderSheet(); }
function closeSheet() {
  const bg = document.getElementById('sheet'); sheet = '';
  if (!bg) return; bg.classList.add('out'); setTimeout(() => bg.remove(), 240);
  if (!overlay && bg.querySelector('.pusz')) pusz.mount(document.querySelector('.view:not(.leave) .pusz'));
}
function itemSheet(r, m) {
  const st = itemStatus(r, m), set = SET_SLOTS.includes(r.slot);
  const inSlot = r.slot ? m.outfit.map(id => BY_ID[id]).find(x => x?.slot === r.slot) : null;
  const previewOutfit = r.slot ? sanitizeOutfit([...m.outfit, r.id], Math.max(m.n, r.at), [...m.opened, r.hidden].filter(Boolean)) : m.outfit;
  const gift = r.reveals && st === 'ready';
  const tags = `<div class="tags"><span class="tag-pill">${CATEGORIES[r.cat]}</span>${r.slot ? `<span class="tag-pill">${SLOTS[r.slot]}</span>` : ''}<span class="tag-pill gold">${tierOf(r.at)}</span>${st === 'worn' ? `<span class="tag-pill pink">${set ? 'Ustawione' : 'Założone'}</span>` : st === 'owned' ? '<span class="tag-pill">W ekwipunku</span>' : ''}</div>`;
  const stageArt = r.reveals ? `<div class="gift-open"><img src="/img/tile-gift.webp" alt=""${TILE_FILTER[r.id] ? ` style="filter:${TILE_FILTER[r.id]}"` : ''}></div>`
    : r.slot === 'pin' ? `<div class="pin-art">${badgeArt(r)}</div>`
      : r.slot ? `<div class="preview ${r.slot === 'theme' ? r.id : ''}"><img class="bg" src="/img/unlock-rewards.webp" alt="">${puszystekHTML({ pose: 'home', box: [0, 0, 242], outfit: previewOutfit, label: 'Podgląd', stagePx: (x, y, w) => `left:calc(50% - ${dp(w / S * .4)});bottom:${dp(-4)};width:${dp(w / S * .8)}` })}</div>`
        : `<div class="gift-open">${itemTile(r, m).replace('data-action="item"', '').replace('class="item', 'style="width:110px" class="item')}</div>`;
  const have = Math.min(m.n, r.at);
  const cond = `<div class="cond ${m.n >= r.at ? 'met' : ''}"><span class="ck">${m.n >= r.at ? I.check : I.lock}</span><div><b>Warunek: ${meetings(r.at)} razem</b><small>${m.n >= r.at ? 'Spełniony — nagroda jest wasza' : `Macie ${have} z ${r.at}. Jeszcze ${meetings(r.at - m.n)}.`}</small><div class="bar"><i style="width:${(have / r.at * 100).toFixed(1)}%"></i></div></div></div>`;
  const wearLabel = set ? 'Ustaw' : 'Załóż';
  const btns = st === 'locked' ? `<button class="btn-soft wide" data-action="close" disabled aria-disabled="true">Zablokowane</button>`
    : st === 'ready' ? `<button class="btn-main" data-action="claim" data-id="${r.id}">${gift ? 'Otwórz prezent' : 'Odbierz'} ${I.heart('', '#fff')}</button>`
      : r.reveals ? `<button class="btn-main" data-action="item" data-id="${r.reveals}">Zobacz zawartość ${I.heart('', '#fff')}</button>`
        : !r.slot ? `<button class="btn-main" data-action="close">Super! ${I.heart('', '#fff')}</button>`
          : st === 'worn' ? `<button class="btn-soft wide" data-action="unequip" data-id="${r.id}">${set ? 'Wyłącz' : 'Zdejmij'}</button>`
            : `${inSlot ? `<p class="swap-note">Zamiast: ${h(inSlot.name)}</p>` : ''}<button class="btn-main" data-action="equip" data-id="${r.id}">${inSlot ? (set ? 'Zamień' : 'Zamień i załóż') : wearLabel} ${I.heart('', '#fff')}</button>`;
  return `${stageArt}<h2>${h(r.name)}</h2>${tags}${cond}<p>${h(r.desc)}${r.reveals && m.opened.includes(r.id) ? ` W środku: ${h(BY_ID[r.reveals].name)}.` : ''}</p>${btns}`;
}
function renderSheet(quiet = false) {
  document.getElementById('sheet')?.remove();
  if (!sheet) return;
  const m = model();
  let c = '';
  if (sheet === 'settings') c = `<h2>Ustawienia</h2><p>Wszystko, czego potrzebujecie, w jednym miejscu.</p>
    <div class="set"><div><b>Wasza para</b><small>${h(myName())} + ${h(otherName())}</small></div>${I.heart('emo')}</div>
    <div class="set"><div><b>Wspólny ekwipunek${m?.ready.length ? `<span class="dot">${m.ready.length}</span>` : ''}</b><small>${m ? `${m.claimed.length} w ekwipunku · wspólny dla was obojga` : ''}</small></div><button class="btn-soft" data-action="collection">Otwórz</button></div>
    <div class="set"><div><b>Data pierwszego spotkania</b><small>Od niej liczymy dni razem.</small></div><button class="btn-soft" data-action="first-date">${h(state?.firstMetAt || 'Ustaw')}</button></div>
    <div class="set"><div><b>Zasięg spotkania</b><small>Odległość, przy której jesteście „razem”.</small></div><button class="btn-soft" data-action="radius">${m?.pr.radius || 150} m</button></div>
    <div class="set"><div><b>Zapisz spotkanie</b><small>Dodajcie spotkanie ręcznie.</small></div><button class="btn-soft" data-action="meeting">Dodaj</button></div>
    ${state && !state.connected ? `<div class="set"><div><b>Kod zaproszenia</b><small>Druga osoba wybiera „Dołącz z kodem”.</small><div class="code">${h(state.code || '')}</div></div><button class="btn-soft" data-action="copy">Kopiuj</button></div>` : ''}
    <div class="set"><div><b>Logowanie na innym telefonie</b><small>Jednorazowo pokażemy Twój kod logowania.</small></div><button class="btn-soft" data-action="login-code">Pokaż kod</button></div>
    <p>Imiona, licznik, nagrody i ekwipunek są na wspólnym serwerze. Pozycja jest tymczasowa — nie tworzymy historii lokalizacji.</p>
    <button class="btn-soft wide" data-action="history">Historia spotkań</button><div style="height:8px"></div>
    <button class="btn-soft wide btn-danger" data-action="logout">Odłącz ten telefon</button>`;
  else if (sheet === 'history') c = `<h2>Wasze spotkania</h2><p>Ta sama historia na obu telefonach. Pomyłki można usunąć.</p>
    ${state.meetings.length ? state.meetings.map(e => `<div class="hist"><div><b>${dateText(e.occurred_at)}</b><small>${e.source === 'auto' ? 'Wykryte automatycznie' : 'Dodane ręcznie'}</small></div><button data-action="delete" data-id="${h(e.id)}">Usuń</button></div>`).join('') : '<div class="empty">Jeszcze nie zapisaliście żadnego spotkania.</div>'}`;
  else if (sheet === 'first-date') c = `<h2>Wasz pierwszy dzień</h2><p>Ustawcie datę pierwszego spotkania — oboje zobaczycie ten sam licznik dni.</p>
    <form id="date-form"><label class="field-l" for="startdate">Data</label><input class="field" id="startdate" required type="date" max="${new Date().toISOString().slice(0, 10)}" value="${h(state?.firstMetAt || '')}"><button type="submit" class="btn-main">Zapisz datę ${I.heart('', '#fff')}</button></form>`;
  else if (sheet === 'meeting') c = `<h2>Zapisać spotkanie?</h2><p>Licznik jest wspólny — druga osoba od razu zobaczy nowe spotkanie.</p>
    <form id="meeting-form"><label class="field-l" for="mdate">Kiedy?</label><input class="field" id="mdate" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}"><button type="submit" class="btn-main">Zapisz spotkanie ${I.heart('', '#fff')}</button></form>`;
  else if (sheet === 'location-info') c = `<h2>Auto-zliczanie</h2><p>Gdy oboje włączycie lokalizację i macie otwartą aplikację, sprawdzamy, czy jesteście blisko siebie (zasięg: ${m?.pr.radius || 150} m).</p>
    <p>Liczą się tylko świeże (do 3 minut) i dokładne pomiary. Po minucie bliskości możecie potwierdzić spotkanie, a po 10 minutach zapisze się samo. Jedno spotkanie na jedno bycie razem — kolejne dopiero, gdy byliście osobno przez 30 minut.</p>
    <p><b>Ważne:</b> PWA na iPhonie nie lokalizuje w tle — obie osoby muszą mieć Razem otwarte. Zawsze możecie dotknąć licznika i zapisać spotkanie ręcznie.</p>
    <div class="row-btns"><button class="btn-soft" data-action="replay">Podgląd animacji</button><button class="btn-main" data-action="toggle-location">${geoEnabled ? 'Wyłącz lokalizację' : 'Włącz lokalizację'}</button></div>`;
  else if (sheet === 'radius') c = `<h2>Zasięg spotkania</h2><p>Jak blisko musicie być, żeby Razem uznało, że jesteście razem? Mniejszy zasięg wymaga dokładniejszego GPS.</p>
    <div class="radius-opts">${[100, 150, 300, 500].map(v => `<button aria-pressed="${(m?.pr.radius || 150) === v}" data-action="set-radius" data-r="${v}">${v} m</button>`).join('')}</div>
    <p>Wspólne ustawienie dla was obojga. Dokładność pomiaru musi być nie gorsza niż zasięg (maks. 150 m).</p>`;
  else if (sheet === 'nearby') c = `<h2>Jesteście blisko!</h2><p>${h(myName())} i ${h(otherName())} — ok. ${fmtDist(m.pr.distance)} od siebie. Zaczynamy wspólne spotkanie?</p>
    <div class="row-btns"><button class="btn-soft" data-action="close">Nie teraz</button><button class="btn-main" data-action="confirm-meeting">Zaczynamy ${I.heart('', '#fff')}</button></div>`;
  else if (sheet === 'login') c = `<h2>Twój kod logowania</h2><p>Na nowym telefonie wybierz „Zaloguj się kodem” i wpisz:</p>
    <div class="login-code">${h(loginCode.replace(/(.{4})(?=.)/g, '$1 '))}</div>
    <p>Kod jest tylko Twój — nie wysyłaj go nikomu. Wygenerowanie nowego unieważnia poprzedni.</p>
    <button class="btn-main" data-action="copy-login">Kopiuj kod ${I.heart('', '#fff')}</button>`;
  else if (sheet.startsWith('item:')) c = itemSheet(BY_ID[sheet.slice(5)], m);
  const bg = document.createElement('div');
  bg.className = 'sheet-bg' + (quiet ? ' static' : ''); bg.id = 'sheet';
  bg.innerHTML = `<div class="sheet${quiet ? ' static' : ''}" role="dialog" aria-modal="true" aria-label="${h(sheet)}">${c}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg);
  if (sheet.startsWith('item:')) { const p = bg.querySelector('.pusz'); if (p) pusz.mount(p); }
}

// ------------------------------------------------------------------ actions
function go(r) { const hsh = HASH[r]; if ((location.hash || '') === hsh) return render(r, true); if (hsh) location.hash = hsh; else history.pushState(null, '', location.pathname + location.search); if (!hsh) render('home', true); }

// One shared inventory: every change names the slot content this phone saw
// (`expect`), so a simultaneous change by the partner is never overwritten.
async function changeOutfit(op, id) {
  const r = BY_ID[id], cur = model().outfit.find(x => BY_ID[x]?.slot === r.slot) || null;
  if (DEMO) {
    demoOutfit = op === 'equip' ? [...demoOutfit.filter(x => x !== cur), id] : demoOutfit.filter(x => x !== id);
    state.rewards.equipped = sanitizeOutfit(demoOutfit, state.count, demoOpened); state.rewards.version++;
    return true;
  }
  try { state = await request('/api/equip', { op, id, expect: cur }); return true; }
  catch (e) {
    if (!e.data?.conflict) throw e;
    state = e.data.state; saveState();
    const now = model().outfit.find(x => BY_ID[x]?.slot === r.slot);
    render(route); if (sheet) renderSheet(true);
    toast(`${h(otherName())} właśnie ${now ? `wybrał(a): ${h(BY_ID[now].name)}` : 'zdjął(-ęła) ten przedmiot'}. Spróbuj jeszcze raz ♡`);
    return false;
  }
}
async function claim(id) {
  const r = BY_ID[id];
  if (DEMO) {
    demoClaimed = [...new Set([...state.rewards.claimed, id, ...(r.reveals ? [r.reveals] : [])])];
    if (r.reveals) demoOpened = [...demoOpened, id];
    state.rewards.claimed = demoClaimed; state.rewards.opened = demoOpened;
    if (r.slot && !model().outfit.some(x => BY_ID[x]?.slot === r.slot)) { demoOutfit = [...demoOutfit, id]; state.rewards.equipped = sanitizeOutfit(demoOutfit, state.count, demoOpened); }
    return;
  }
  state = await request('/api/claim', { id });
}

async function act(action, el) {
  try {
    if (action === 'home') go('home');
    else if (action === 'back') go(route === 'collection' ? 'rewards' : 'home');
    else if (action === 'rewards') go('rewards');
    else if (action === 'detect') go('detect');
    else if (action === 'collection') { closeSheet(); go('collection'); }
    else if (action === 'mode-create' || action === 'mode-join' || action === 'mode-restore') { mode = action.split('-')[1]; render('onboarding'); }
    else if (['settings', 'history', 'first-date', 'location-info', 'meeting', 'radius'].includes(action)) { if (!state && action !== 'location-info') return; openSheet(action); }
    else if (action === 'close') closeSheet();
    else if (action === 'cat') { const pick = await pusz.tap(); if (pick === 'hop' || pick === 'hug') burst(el, 4, 120); }
    else if (action === 'super') { burst(document.querySelector('.view:not(.leave) .pz-body'), 9); pusz.celebrate('reward'); el.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' }); }
    else if (action === 'item') { openSheet('item:' + el.dataset.id); }
    else if (action === 'equip' || action === 'unequip' || action === 'ov-wear') {
      const id = el.dataset.id, r = BY_ID[id], on = action !== 'unequip';
      if (!await changeOutfit(on ? 'equip' : 'unequip', id)) return;
      saveState();
      if (on) freshItem = id;
      if (action === 'ov-wear') { render(route); overlayPusz(id); pusz.celebrate('reward'); return nextReward(); }
      render(route); renderSheet(true);
      if (on) { pusz.celebrate('reward'); burst(document.querySelector(`.view:not(.leave) .pz-item[data-item="${id}"]`) || document.querySelector('.view:not(.leave) .pz-body'), 6, 160); toast(`${h(r.name)} — ${SET_SLOTS.includes(r.slot) ? 'ustawione' : 'założone'} ♥`); }
      else toast(SET_SLOTS.includes(r.slot) ? 'Wyłączone' : 'Zdjęte');
    }
    else if (action === 'claim' || action === 'ov-claim' || action === 'open-gift' || action === 'ov-gift') {
      const id = el.dataset.id, r = BY_ID[id], before = model().outfit;
      const box = el.closest('.sheet, .ov-reward')?.querySelector('.gift-open, .art-wrap, .preview, .pin-art');
      if (r.reveals) box?.classList.add('opened');
      burst(box || el, r.reveals ? 12 : 8, 240);
      await claim(id); saveState();
      const wornNow = model().outfit.includes(id) && !before.includes(id);
      if (wornNow) freshItem = id;
      if (r.reveals) await new Promise(res => setTimeout(res, reduced.matches ? 0 : 650));
      render(route);
      if (overlay) { if (wornNow) overlayPusz(id); pusz.celebrate('reward'); if (r.reveals) { overlay.queue.unshift(BY_ID[r.reveals]); } return nextReward(); }
      if (r.reveals) return openSheet('item:' + r.reveals);
      if (isSpecial(r)) { closeSheet(); return showRewards([r], 'Wyjątkowa nagroda!'); }
      renderSheet(true); pusz.celebrate('reward');
      toast(wornNow ? `${h(r.name)} — w ekwipunku i ${SET_SLOTS.includes(r.slot) ? 'ustawione' : 'założone'} ♥` : `${h(r.name)} — w ekwipunku ♥`);
    }
    else if (action === 'claim-all') {
      const list = model().ready;
      for (const r of list) await claim(r.id);
      saveState(); render(route); pusz.celebrate('reward'); burst(el, 12, 260);
      toast(`Odebrane: ${list.length} ♥`);
    }
    else if (action === 'login-code') {
      if (DEMO) throw new Error('To tylko podgląd — nic nie zapisujemy ♡');
      loginCode = (await request('/api/login-code', {})).code; openSheet('login');
    }
    else if (action === 'copy-login') { await navigator.clipboard.writeText(loginCode); toast('Kod logowania skopiowany'); }
    else if (action === 'coll-cat') { collCat = el.dataset.cat; render('collection'); }
    else if (action === 'tile-prev' || action === 'tile-next') {
      const next = Math.max(0, Math.min(FEATURED.length - 4, tileStart + (action === 'tile-next' ? 1 : -1)));
      if (next === tileStart) { el.animate?.([{ transform: 'translateX(0)' }, { transform: `translateX(${action === 'tile-next' ? 4 : -4}px)` }, { transform: 'translateX(0)' }], { duration: 260 }); return; }
      tileStart = next; render('rewards');
    }
    else if (action === 'replay') { if (el.closest('.near-cta')) return; showCelebration({ n: state.count, preview: true }); }
    else if (action === 'ov-next') { if (overlay?.queue.length) nextReward(); else closeOverlay(); }
    else if (action === 'locate') { const g = document.querySelector('.view:not(.leave) .chips'); g?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' }); if (geoEnabled) sendNow(); }
    else if (action === 'set-radius') {
      const r = +el.dataset.r;
      if (DEMO) { state.proximity.radius = r; } else state = await request('/api/settings', { radius: r });
      renderSheet(); render(route); toast(`Zasięg: ${r} m`);
    }
    else if (action === 'confirm-meeting') {
      const old = state.count;
      state = await request('/api/meeting-confirm', {});
      saveState(); closeSheet(); render(route); afterCountChange(old);
    }
    else if (action === 'copy') { await navigator.clipboard.writeText(state.code); toast('Kod zaproszenia skopiowany ♡'); }
    else if (action === 'delete') { if (!confirm('Usunąć to spotkanie z waszego licznika?')) return; state = await request('/api/delete-meeting', { id: el.dataset.id }); render(route); renderSheet(); toast('Spotkanie usunięte'); }
    else if (action === 'toggle-location') {
      if (DEMO) { el.setAttribute?.('aria-checked', String(el.getAttribute('aria-checked') !== 'true')); toast('To tylko podgląd — lokalizacja nie jest używana'); return; }
      if (geoEnabled) { stopGeo(); toast('Lokalizacja wyłączona'); } else await startGeo();
      closeSheet(); render(route);
    }
    else if (action === 'toggle-notify') {
      const on = el.getAttribute('aria-checked') !== 'true';
      if (on && !DEMO && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { toast('Brak zgody na powiadomienia'); return; } }
      notifyOn = on; if (!DEMO) setPref('notify', on); el.setAttribute('aria-checked', String(on));
    }
    else if (action === 'toggle-sync') { syncOn = el.getAttribute('aria-checked') !== 'true'; if (!DEMO) setPref('sync', syncOn); el.setAttribute('aria-checked', String(syncOn)); if (syncOn) refresh(); }
    else if (action === 'logout') {
      if (!confirm('Odłączyć ten telefon? Wrócisz do pary tylko z kodem logowania (Ustawienia → Pokaż kod). Wasze dane zostają na serwerze.')) return;
      stopGeo(); signOut(); closeSheet(); render('onboarding');
    }
  } catch (err) { toast(h(err.message)); }
}

root.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) { e.stopPropagation(); act(b.dataset.action, b); } });
document.addEventListener('click', e => { if (!e.target.closest('#sheet, #ov')) return; const b = e.target.closest('[data-action]'); if (b) act(b.dataset.action, b); });
document.addEventListener('submit', async e => {
  e.preventDefault(); const form = e.target; if (working) return; working = true;
  const btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (form.id === 'start-form') {
      const name = form.querySelector('#name')?.value.trim();
      if (DEMO) throw new Error('To tylko podgląd — nic nie zapisujemy ♡');
      const res = mode === 'create' ? await request('/api/create', { name }) : mode === 'join' ? await request('/api/join', { name, code: form.querySelector('#code').value }) : await request('/api/restore', { code: form.querySelector('#code').value });
      token = res.token; localStorage.setItem(cacheKey, token); state = null;
      await refresh(); toast(mode === 'create' ? 'Wasz świat jest gotowy ♥' : mode === 'join' ? 'Jesteście połączeni! ♥' : 'Witaj z powrotem! ♥');
    } else if (form.id === 'date-form') {
      state = await request('/api/first-date', { date: form.querySelector('#startdate').value }); closeSheet(); render(route); toast('Data zapisana ♥');
    } else if (form.id === 'meeting-form') {
      const d = form.querySelector('#mdate').value, today = new Date().toISOString().slice(0, 10);
      const old = state.count;
      state = await request('/api/meeting', d && d !== today ? { at: d + 'T12:00:00' } : {});
      saveState(); closeSheet(); render(route); afterCountChange(old);
    }
  } catch (err) { toast(h(err.message)); } finally { working = false; if (btn) btn.disabled = false; }
});

// The shared count went up (here or on the other phone): roll the counter and celebrate.
function afterCountChange(old) {
  const c = document.querySelector('.view:not(.leave) .count');
  if (c && !reduced.matches) { countUp(c, old, state.count, 700); c.classList.add('pop'); setTimeout(() => c.classList.remove('pop'), 700); }
  if (state.count > old) { showCelebration({ n: state.count, rewards: newRewards() }); notify('Jesteście razem!', `Wasze ${state.count}. spotkanie ♥`); }
  else newRewards();
}

function saveState() { if (!DEMO && state) try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch { } }
function signOut() { localStorage.removeItem(cacheKey); try { localStorage.removeItem(stateKey); } catch { } token = ''; state = null; }
const verb = op => ({ equip: 'założył(a) Puszystkowi', unequip: 'zdjął(-ęła) Puszystkowi', claim: 'odebrał(a)' }[op]);

let promptedSession = null, syncing = false, cached = false;
async function refresh() {
  if (DEMO) { state = state || demoState(); newRewards(); return render(routeFromHash()); }
  if (!token) return render('onboarding');
  if (syncing) return; syncing = true;
  try {
    const next = await request('/api/state');
    // the first answer after painting the cached state counts as the initial load
    const old = cached ? undefined : state?.count, oldVersion = cached ? undefined : state?.rewards?.version;
    if (state && !cached && JSON.stringify(next) === JSON.stringify(state)) return;
    state = next; cached = false; saveState();
    // the partner changed the shared inventory: show it and let Puszystek react
    const ch = next.rewards?.lastChange;
    const partnerChange = oldVersion !== undefined && next.rewards.version > oldVersion && ch && ch.by !== next.you && BY_ID[ch.id];
    if (partnerChange && (ch.op === 'equip' || (ch.op === 'claim' && ch.worn))) freshItem = ch.id;
    // the view under an open celebration is refreshed too, so nothing is stale when it closes
    if (!sheet || old === undefined || sheet.startsWith('item:') || partnerChange) { render(route === 'onboarding' || !route ? routeFromHash() : route); if (sheet && old !== undefined) renderSheet(true); }
    if (partnerChange) { toast(`${h(otherName())} ${verb(ch.op) || 'zmienił(a) ekwipunek'}: ${h(BY_ID[ch.id].name)} ♥`); if (ch.op !== 'unequip') pusz.celebrate('reward'); }
    if (old === undefined) newRewards();
    else if (next.count !== old) afterCountChange(old);
    else { const fresh = newRewards(); if (fresh.length) showRewards(fresh); }
    // proximity: offer to start the meeting once per proximity session
    const p = next.proximity;
    if (p?.canConfirm && promptedSession !== p.since && !overlay && !sheet) { promptedSession = p.since; openSheet('nearby'); }
  } catch (err) {
    if (err.status === 401) { signOut(); stopGeo(); render('onboarding'); }
    else console.warn('Synchronizacja:', err.message);
  } finally { syncing = false; }
}
function notify(title, body) { try { if (notifyOn && document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon.svg' }); } catch { } }

// ------------------------------------------------------------------ geolocation
// Positions are sent every 30 s while the app is visible; the server decides
// proximity from fresh, accurate readings of both phones.
async function startGeo() {
  if (!navigator.geolocation) throw new Error('Ta przeglądarka nie udostępnia lokalizacji.');
  await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(async pos => { try { await sendGeo(pos); resolve(); } catch (err) { reject(err); } }, () => reject(new Error('Brak zgody na lokalizację. Sprawdź ustawienia telefonu.')), { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }));
  geoEnabled = true;
  locTimer = setInterval(sendNow, 30000);
  toast('Wykrywanie jest aktywne, gdy aplikacja jest otwarta ♡');
}
function sendNow() { if (document.visibilityState !== 'visible' || !geoEnabled) return; navigator.geolocation.getCurrentPosition(pos => sendGeo(pos).catch(() => { }), () => { }, { enableHighAccuracy: true, maximumAge: 20000, timeout: 12000 }); }
async function sendGeo(pos) {
  const c = pos.coords; if (!c || c.accuracy > 1500) return;
  const old = state.count, oldP = JSON.stringify(state.proximity);
  const next = await request('/api/location', { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy });
  state = next;
  if (next.count !== old) { render(route); afterCountChange(old); }
  else if (JSON.stringify(next.proximity) !== oldP && !sheet && !overlay) render(route);
  const p = next.proximity;
  if (p?.canConfirm && promptedSession !== p.since && !overlay && !sheet) { promptedSession = p.since; openSheet('nearby'); }
}
function stopGeo() { geoEnabled = false; clearInterval(locTimer); locTimer = null; if (token && !DEMO) request('/api/location-off', {}).catch(() => { }); }

window.addEventListener('hashchange', () => { if (state) render(routeFromHash(), true); });
window.addEventListener('popstate', () => { if (state && !location.hash) render('home', true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (overlay) closeOverlay(); else if (sheet) closeSheet(); } });
// back to the app (unlock, app switcher, tab, network): sync right away
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && token && syncOn) { refresh(); sendNow(); }
});
['focus', 'pageshow', 'online'].forEach(e => addEventListener(e, () => { if (token && syncOn && document.visibilityState === 'visible') refresh(); }));
// no accidental pinch/double-tap zoom of the app shell (iOS ignores user-scalable=no)
['gesturestart', 'gesturechange'].forEach(e => document.addEventListener(e, ev => ev.preventDefault(), { passive: false }));

(async () => {
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('/sw.js').catch(() => { });
  // paint the last known state at once, then ask the server
  if (token && !DEMO) try { const c = JSON.parse(localStorage.getItem(stateKey)); if (c?.rewards) { state = c; cached = true; render(routeFromHash()); } } catch { }
  await refresh();
  // demo: ?celebrate=1[&reward=id] plays the meeting animation as a preview
  if (DEMO && params.has('celebrate')) showCelebration({ n: state.count, preview: true, rewards: (params.get('reward') || '').split(',').map(id => BY_ID[id]).filter(Boolean) });
  // live sync while the app is open: the shared counter, rewards and Puszystek's outfit
  setInterval(() => { if (document.visibilityState === 'visible' && token && syncOn) refresh(); }, 6000);
})();
