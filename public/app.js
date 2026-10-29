// Razem — frontend. Three screens (home, rewards, detection) drawn on a 390x860
// design stage; positions come from the reference PNGs (screen px / 1.7615).
// Plus the shared wardrobe (#/kolekcja), the meeting celebration and Puszystek.
// ?demo=1 renders the mock-up data and never writes to the API
// (?count=N and ?outfit=a,b override the demo values; ?still=1 freezes idle acts).
import { REWARDS as CATALOG, BY_ID, CATEGORIES, SLOTS, SET_SLOTS, MILESTONES, RARITY, rarityOf, unlockedIds, sanitizeOutfit, claimable, isVisible, isSpecial, isHouse, HOUSE_CATS, ACHIEVEMENTS, achievementOf } from './rewards.js';
import { puszystekHTML, Puszystek, WEAR, DECOR } from './puszystek.js';
import { medalSVG } from './medals.js';
import { ART as HOUSE_ART, ITEMS as ROOM_ITEMS, ROOM, roomHTML, RoomEditor, HouseLife, positions, placedIds, freeSpot } from './house.js';
import { check as roomCheck, movable } from './room.js';
import { PairMap } from './map.js';

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
let state = null, mode = 'create', route = '', sheet = '', working = false, tileStart = null, collCat = 'all', collTab = 'pusz', overlay = null;
let freshItem = '', loginCode = '';
// the last reward whose state changed here (claimed / worn / pinned), for its state animation
let justChanged = null;
const pref = (k, d) => { try { const v = localStorage.getItem('razem-' + k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('razem-' + k, v ? '1' : '0'); } catch { } };
let syncOn = DEMO || pref('sync', true);

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
  // Lucide "settings" (ISC licence), drawn at one stroke weight
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>`,
  // a little display shelf: "in the trophy case"
  shelf: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="7.4" r="4.2"/><path d="M8.4 11.2 7.4 15M11.6 11.2l1 3.8M3 16.6h14"/></svg>`,
  pinIc: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.6a5 5 0 0 1 5 5c0 3.6-5 9.8-5 9.8s-5-6.2-5-9.8a5 5 0 0 1 5-5z"/><path d="M10 9.6l-1.9-1.8a1.2 1.2 0 0 1 1.9-1.4 1.2 1.2 0 0 1 1.9 1.4z" fill="currentColor"/></svg>`,
  wear: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 8.6 6 5.2l2.4 1.6L10 3.4l1.6 3.4L14 5.2l2.4 3.4-1.4 6.4H5z"/></svg>`,
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
const TILE_BG = { nakrycia: 'linear-gradient(160deg,#fff4dc,#ffe2ef)', ozdoby: 'linear-gradient(160deg,#fff1f7,#f6e6ff)', ubranka: 'linear-gradient(160deg,#eefaf5,#fde8f1)', akcesoria: 'linear-gradient(160deg,#fff5f8,#fde3ef)', efekty: 'linear-gradient(160deg,#f3efff,#fde6f2)', odznaki: 'linear-gradient(160deg,#fff9e8,#fdf0f6)', dekoracje: 'linear-gradient(160deg,#eef6ff,#fdeef4)' };
// badges are medallions in their rarity's metal (medals.js)
const badgeArt = (r, cls = '') => medalSVG(r, rarityOf(r), cls);
const isBadge = r => r.slot === 'pin' || (r.cat === 'odznaki' && !WEAR[r.id]);
const FEATURED = CATALOG.filter(r => !r.hidden && r.at % 10 === 0 && !isHouse(r));
function artHTML(r) {
  if (TILE_ART[r.id]) return `<img src="/img/${TILE_ART[r.id]}.webp" alt=""${TILE_FILTER[r.id] ? ` style="filter:${TILE_FILTER[r.id]}"` : ''}>`;
  if (isHouse(r)) return `<img class="px-art house-art" src="/img/house/${HOUSE_ART[r.id].src}.png" alt="">`;
  if (isBadge(r)) return badgeArt(r);
  if (WEAR[r.id]) return `<img class="px-art" src="/img/${WEAR[r.id].src}" alt="">`;
  if (DECOR[r.id]) return `<img class="px-art decor-art" src="/img/${DECOR[r.id].src}" alt="">`;
  if (FX_ART[r.id]) return `<img class="px-art" src="/img/${FX_ART[r.id]}.png" alt="">`;
  return `<img src="/img/tile-gift.webp" alt="">`;
}
// locked -> ready (earned, waiting to be claimed) -> owned (in the inventory,
// or "in the trophy case" for badges) -> worn / set / pinned
const itemStatus = (r, m) => m.n < r.at ? 'locked' : !m.claimed.includes(r.id) ? 'ready' : m.outfit.includes(r.id) ? 'worn' : 'owned';
function statusText(r, st) {
  if (st === 'locked') return meetings(r.at);
  if (st === 'ready') return 'Do odebrania';
  if (st === 'worn') return isHouse(r) ? 'W domku' : r.slot === 'pin' ? 'Na liczniku' : SET_SLOTS.includes(r.slot) ? 'Ustawione' : 'Założone';
  return isHouse(r) ? 'W schowku' : isBadge(r) ? 'W gablocie' : 'W ekwipunku';
}
const STATUS_IC = { locked: () => I.lock, ready: () => I.gift, worn: r => r.slot === 'pin' ? I.pinIc : I.check, owned: r => isBadge(r) ? I.shelf : '' };
function itemTile(r, m, extra = '') {
  const st = itemStatus(r, m), rar = rarityOf(r);
  return `<button class="item ${st} ${extra}" data-action="item" data-id="${r.id}" data-rar="${rar}" aria-label="${h(r.name)}, ${RARITY[rar].toLowerCase()}, ${statusText(r, st).toLowerCase()}">
    <span class="art"><span class="ai">${artHTML(r)}</span><i class="gem" aria-hidden="true"></i>${st === 'worn' ? `<span class="ok">${I.check}</span>` : ''}</span>
    <span class="nm">${h(r.name)}</span>
    <span class="st">${STATUS_IC[st](r)}${statusText(r, st)}</span></button>`;
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
    rewards: { room: {}, achieved: {}, unlocked: unlockedIds(n), claimed: demoClaimed ??= CATALOG.filter(r => claimable(r, n, demoOpened) && (params.has('outfit') || !['bowLav', 'week'].includes(r.id))).map(r => r.id), equipped: sanitizeOutfit(demoOutfit, n, demoOpened), opened: demoOpened, version: 1 },
    proximity: { stage: 'recorded', reason: 'recorded', radius: 100, distance: 4, strong: true, since: now - 900000, held: 900000, canConfirm: false, recorded: true, me: { on: true, age: 4000, acc: 12 }, partner: { on: true, age: 7000, acc: 14 } },
    push: { available: false, subscribed: false },
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
  m.ready = CATALOG.filter(r => claimable(r, n, m.opened) && !m.claimed.includes(r.id) && !isHouse(r));
  m.houseReady = CATALOG.filter(r => isHouse(r) && claimable(r, n, m.opened) && !m.claimed.includes(r.id));
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
// "Miłosz ♡ Kornelia | Zawsze razem lepiej": both names from the server; the
// slogan steps aside when the names need the room (settleHeader).
function taglineHTML() {
  if (!state) return `<span class="slogan">Ty + &lt;3<i>|</i>Zawsze razem lepiej</span>`;
  const byslot = s => state.members?.find(m => m.slot === s)?.name;
  const a = byslot(1), b = byslot(2);
  const names = b ? `<b>${h(a)}</b>${I.heart('tl-heart')}<b>${h(b)}</b>` : `<b>${h(a || myName())}</b>${I.heart('tl-heart')}<b class="wait">czeka na drugą osobę</b>`;
  return `<span class="pair" title="${h(a || '')}${b ? ' i ' + h(b) : ''}">${names}</span><span class="slogan"><i>|</i>Zawsze razem lepiej</span>`;
}
function settleHeader() {
  const t = document.querySelector('.tagline'); if (!t) return;
  const html = taglineHTML(); if (t.dataset.html !== html) { t.innerHTML = html; t.dataset.html = html; }
  t.classList.remove('short'); if (t.scrollWidth > t.clientWidth + 1) t.classList.add('short');
}
function shell() {
  root.innerHTML = `<div class="app" data-route="${route}">
    <div class="stage">
      <div class="plates"><img class="plate-home" src="/img/header-home.webp" alt=""><img class="plate-rewards" src="/img/header-rewards.webp" alt=""><img class="plate-detect" src="/img/header-detect.webp" alt=""></div>
      <div class="views" id="views"></div>
      <header class="hdr">
        <button class="back" data-action="back" aria-label="Wróć">${I.back}</button>
        <h1 class="sr">Razem</h1>
        <img class="logo" src="/img/logo-razem.svg" alt="Razem" data-action="home" width="494" height="162">
        ${I.heart('logo-heart')}
        <p class="tagline">${taglineHTML()}</p>
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
    <img class="hero-heart px-heart" src="/img/ui/heart-pink.png" alt=""><img class="hero-corner l" src="/img/ui/heart-white.png" alt=""><img class="hero-corner r" src="/img/ui/heart-white.png" alt="">
    ${m.pin ? `<span class="hero-pin" title="${h(m.pin.name)}">${badgeArt(m.pin)}</span>` : ''}
    <svg class="count" viewBox="0 0 365 92" role="img" aria-label="${m.n}" data-count="${m.n}"><text x="182.5" y="68.5" text-anchor="middle">${m.n}</text></svg>
    <p class="count-label">${plural(m.n, 'spotkanie na żywo', 'spotkania na żywo', 'spotkań na żywo')}</p>
    <p class="count-sub">${I.heart()}liczone wspólnie</p>
    <div class="panel" data-action="rewards">
      <p class="panel-title">Pasek spotkań</p>
      <p class="ratio"><b>${m.n}</b> / ${m.levelGoal}</p>
      <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${m.levelGoal}" aria-valuenow="${m.n}"><div class="fill" data-w="${pct}">${hearts4()}</div></div>
      <button class="gift ${m.left <= 3 || m.ready.length ? 'ready' : ''}" data-action="${m.ready.length ? 'collection' : 'rewards'}" aria-label="Nagrody${m.ready.length ? `, ${m.ready.length} do odebrania` : ''}"><img src="/img/ui/ic-gift.png" alt="">${m.ready.length ? `<span class="dot">${m.ready.length}</span>` : ''}</button>
      <p class="hint">${I.flag}Jeszcze ${m.left} ${plural(m.left, 'spotkanie', 'spotkania', 'spotkań')} do kolejnego celu!</p>
    </div>
  </section>
  <section class="card stats rise" style="--i:1">
    <button class="stat tap" data-action="first-date"><span class="ic lav">${I.cal}</span><span class="lbl">Od pierwszego spotkania:</span><span class="val">${daysLabel(m.days)}</span>${I.chev()}</button>
    <span class="div"></span>
    <button class="stat s2 tap" data-action="history"><span class="ic pink">${I.clock}</span><span class="lbl">Ostatnie spotkanie:</span><span class="val">${lastLabel(m.d)}</span>${I.chev()}</button>
  </section>
  <button class="pill rise ${pillState(m).cls}" style="--i:2" data-action="detect">${I.pin()}<span>${pillState(m).text}</span><span data-action="location-info" role="button" aria-label="Jak to działa">${I.info()}</span></button>
  <img class="meadow-bg" src="/img/meadow-home.webp" alt="" style="position:absolute;left:0;width:100%;top:${dp(1150 / S)}">
  ${themeGlow(m, 1150)}
  ${deco('home')}
  ${cat('home')}
  <button class="house-btn" data-action="house" aria-label="Domek Puszystka${m.houseReady.length ? `, ${m.houseReady.length} nowe rzeczy` : ''}"><img class="px-art" src="/img/house/icon.png" alt="">${m.houseReady.length ? `<span class="dot">${m.houseReady.length}</span>` : ''}</button>
  <div class="bubble" ${!DEMO && state && !state.connected ? 'data-action="copy"' : ''}>${phrase(m)}</div>`;
}
const hearts4 = () => [8.6, 15.8, 34, 64.6].map((l, i) => `<span class="wh" style="left:${dp(l + 22)};animation-delay:${i * .4}s"><img src="/img/ui/heart-white.png" alt=""></span>`).join('');

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

// ------------------------------------------------------------------ meeting detection: words
// Everything people read about detection comes from the server's verdict
// (stage + reason) and this phone's own geolocation state.
const partnerName = () => otherName();
function reasonText(p) {
  const P = h(partnerName()), d = p?.distance != null ? fmtDist(p.distance) : '';
  if (geoError === 'denied') return 'Brak zgody na lokalizację dla Razem. Na iPhonie: Ustawienia → Prywatność → Usługi lokalizacji → Razem/Safari → „Podczas używania”.';
  if (geoError && geoOn && !p?.me?.age) return 'Ten telefon nie może teraz ustalić pozycji. Spróbuj bliżej okna lub na zewnątrz.';
  return ({
    not_connected: 'Najpierw połączcie się kodem z ustawień.',
    me_off: 'Włącz lokalizację na tym telefonie, żeby Puszystek mógł sprawdzić, czy jesteście razem.',
    me_stale: 'Czekamy na pomiar GPS z tego telefonu…',
    me_inaccurate: `GPS tego telefonu jest teraz mało dokładny (±${p?.me?.acc} m). Spróbuj bliżej okna albo na zewnątrz.`,
    partner_off: `${P} nie ma włączonego udostępniania lokalizacji.`,
    partner_stale: `${P} nie ma teraz otwartej aplikacji Razem. Gdy ją otworzy, sprawdzimy od razu.`,
    partner_inaccurate: `GPS u ${P} jest teraz mało dokładny (±${p?.partner?.acc} m).`,
    near: `Jesteście niedaleko siebie (ok. ${d}). Spotkanie liczy się, gdy jesteście naprawdę razem.`,
    far: `Jesteście teraz daleko od siebie (ok. ${d}).`,
    together_hold: 'Jesteście razem! Jeszcze chwilka i spotkanie zapisze się samo.',
    together_auto: 'Jesteście razem! Zapisujemy spotkanie…',
    together_confirm: 'Wygląda na to, że jesteście razem, ale GPS jest mniej dokładny. Potwierdźcie spotkanie oboje.',
    recorded: 'To spotkanie jest już zaliczone ♥',
    cooldown: 'Spotkanie z ostatnich 6 godzin jest już zapisane.',
  })[p?.reason] || 'Sprawdzamy, czy jesteście razem…';
}
function pillState(m) {
  const p = m.pr || {};
  if (DEMO || !geoOn) return { cls: '', text: 'Auto-zliczanie, gdy jesteście razem' };
  if (geoError === 'denied') return { cls: 'warn', text: 'Brak zgody na lokalizację' };
  if (p.stage === 'together') return { cls: 'hot', text: `Wygląda na to, że jesteście razem! ${I.heart('ph')}` };
  if (p.stage === 'recorded') return { cls: 'on', text: `Spotkanie zaliczone ${I.heart('ph')}` };
  if (p.stage === 'near') return { cls: 'near', text: `Jesteście niedaleko siebie! ${I.heart('ph')}` };
  if (p.stage === 'far') return { cls: 'on', text: `Puszystek czeka na wasze spotkanie` };
  if (p.reason === 'partner_stale' || p.reason === 'partner_off') return { cls: 'on', text: `Czekamy na ${h(partnerName())}…` };
  return { cls: 'on checking', text: 'Sprawdzamy, czy jesteście razem…' };
}
// ------------------------------------------------------------------ the real map
// One persistent map, moved into each re-rendered detection card. My own dot
// comes from this phone's last reading; my partner's only if they share it.
const pairMap = new PairMap();
let mapView = null, mapTimer = 0;
const AV = slot => slot === 1 ? '/img/chip-boy.png' : '/img/chip-girl.png';
function mapChip(m) {
  const p = m?.pr || {};
  if (DEMO) return 'Dokładność: ±12 m';
  if (!mapView?.me?.sharing) return 'Pokazuj mnie na mapie: wył.';
  if (mapView?.partner && !mapView.partner.sharing) return `${partnerName()} nie pokazuje się na mapie`;
  return p.distance != null ? `ok. ${fmtDist(p.distance)} od siebie · ±${p.me?.acc ?? '–'} m` : 'Dokładność: czekamy na pomiar';
}
function mapData() {
  const m = model(); if (!m) return null;
  if (DEMO) return { me: { lat: 52.21503, lon: 21.03475, acc: 12, age: 4000 }, partner: { lat: 52.21507, lon: 21.03482, acc: 15, age: 7000 }, meName: 'Ty', partnerName: h(otherName()), meAvatar: AV(1), partnerAvatar: AV(2), together: true };
  const fresh = lastFix && Date.now() - lastFix.timestamp < 120000;
  const me = fresh ? { lat: lastFix.coords.latitude, lon: lastFix.coords.longitude, acc: Math.round(lastFix.coords.accuracy), age: Date.now() - lastFix.timestamp } : mapView?.me?.pos || null;
  return { me, partner: mapView?.partner?.pos || null, meName: 'Ty', partnerName: h(otherName()), meAvatar: AV(state.you), partnerAvatar: AV(state.you === 1 ? 2 : 1), together: ['together', 'recorded'].includes(m.pr?.stage) && !!mapView?.partner?.pos };
}
async function refreshMap() {
  if (route !== 'detect' || DEMO || !token) return;
  try { mapView = await request('/api/map'); } catch { }
  const card = document.querySelector('.view:not(.leave) .map');
  if (card) { const a = card.querySelector('.acc'); if (a) a.innerHTML = `${I.pin()}${h(mapChip(model()))}${I.info()}`; }
  pairMap.update(mapData());
}
function mountMap(v) {
  const slot = v.querySelector('.map-slot'); if (!slot) return;
  pairMap.attach(slot);
  pairMap.start().then(() => { pairMap.attach(slot); slot.closest('.map')?.classList.add('live'); pairMap.update(mapData()); }).catch(() => slot.closest('.map')?.classList.add('offline'));
  refreshMap();
  clearInterval(mapTimer); mapTimer = setInterval(() => { if (route === 'detect' && document.visibilityState === 'visible') refreshMap(); else clearInterval(mapTimer); }, 6000);
}

// What the detection card says
function detectCopy(m) {
  const p = m.pr || {};
  if (DEMO || p.stage === 'recorded') return { title: 'Spotkanie wykryte!', sub: `Jesteście razem ${I.sparkHeart}`, together: true };
  if (p.stage === 'together') return { title: 'Jesteście razem!', sub: `ok. ${fmtDist(p.distance)} od siebie ${I.sparkHeart}`, together: true, cta: true };
  if (p.stage === 'near') return { title: 'Jesteście niedaleko!', sub: `ok. ${fmtDist(p.distance)} od siebie ${I.sparkHeart}`, apart: true, check: true };
  if (p.stage === 'far') return { title: 'Szukamy siebie…', sub: `Jeszcze ${fmtDist(p.distance)} od siebie`, apart: true, check: true };
  if (!geoOn) return { title: 'Wykrywanie spotkań', sub: 'Włączcie lokalizację na obu telefonach', apart: true, check: true };
  if (p.reason === 'partner_stale' || p.reason === 'partner_off') return { title: `Czekamy na ${h(partnerName())}`, sub: 'Niech otworzy Razem z włączoną lokalizacją', apart: true, check: true };
  return { title: 'Sprawdzamy…', sub: 'Czy jesteście razem?', apart: true, check: true };
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
      <img class="bg" src="/img/map.webp" alt="">
      <div class="map-slot" aria-label="Mapa: wasze pozycje"></div>
      <span class="glow"></span>
      ${c.together ? I.heart('map-heart') : ''}
      <div class="chips ${c.apart ? 'apart' : ''}"><img class="boy" src="/img/chip-boy.png" alt="${h(state?.members?.[0]?.name || '')}"><img class="girl" src="/img/chip-girl.png" alt="${h(state?.members?.[1]?.name || '')}"></div>
      <div class="map-bubble">${c.together ? `Jesteście razem! ${I.hearts2}` : 'Jeszcze osobno'}</div>
      <button class="locate" data-action="locate" aria-label="Odśwież lokalizację">${I.locate}</button>
      <button class="map-btn fit" data-action="map-fit" aria-label="Pokaż nas oboje">${I.heart('', 'url(#hg2)')}</button>
      <button class="map-btn full" data-action="map-full" aria-label="Mapa na cały ekran"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg></button>
      <div class="acc" data-action="map-share" role="button" aria-label="Widoczność na mapie">${I.pin()}${h(mapChip(m))}${I.info()}</div>
      ${DEMO ? '<span class="preview-tag">Podgląd</span>' : ''}
    </div>
    <div class="caption">${c.cta ? `${I.heart()}<div class="near-cta"><button class="btn-main" data-action="confirm-meeting">Zaliczamy spotkanie ${I.heart('', '#fff')}</button><span>${m.pr?.needsBoth ? 'Potwierdźcie<br>oboje.' : 'Albo zapisze się<br>samo za chwilę.'}</span></div>` : c.check && !DEMO ? `${I.heart()}<div class="near-cta"><button class="btn-main" data-action="check-now">Sprawdź, czy jesteśmy razem</button></div>` : `${I.heart()}<p>Gdy obie osoby są blisko siebie,<br>spotkanie zapisuje się <em>automatycznie.</em></p>`}</div>
  </section>
  <section class="card row rise" style="--i:1;top:${dp(525.1)}"><span class="ic loc">${I.pin('')}</span><h4>Lokalizacja</h4><p>Pozwala wykrywać, kiedy jesteście razem.</p><button class="switch" role="switch" aria-checked="${DEMO || geoOn}" data-action="toggle-location" aria-label="Lokalizacja"></button></section>
  <section class="card row rise" style="--i:2;top:${dp(583.2)}"><span class="ic bell">${I.bell}</span><h4>Powiadomienia</h4><p>Puszystek da znać, gdy będziecie blisko.</p><button class="switch" role="switch" aria-checked="${DEMO || !!state?.push?.subscribed}" data-action="toggle-notify" aria-label="Powiadomienia"></button></section>
  <section class="card row rise" style="--i:3;top:${dp(641.6)};height:${dp(64.4)}"><span class="ic sync" style="top:${dp(11.6)}">${I.sync}</span><h4>Wspólna synchronizacja</h4><p>Spotkania zapisują się automatycznie<br>w Waszym pasku.</p><button class="switch" role="switch" aria-checked="${syncOn}" data-action="toggle-sync" aria-label="Wspólna synchronizacja" style="top:${dp(14.2)}"></button></section>
  <img class="meadow-bg" src="/img/meadow-detect.webp" alt="" style="position:absolute;left:0;width:100%;top:${dp(1245 / S)}">
  ${themeGlow(m, 1245)}
  ${deco('det')}
  ${c.together ? cat('detCheer', 'cheer', 'Puszystek cieszy się') : cat('detSit')}
  <div class="hurra">${c.together ? `<b>Hurra!</b><span>Jesteście razem! ${I.hearts2}</span>` : `<b>Hej!</b><span>Czekam na was ${I.hearts2}</span>`}</div>`;
}

// Two inventories (Puszystek's things, the house's things) and the achievements
// that grant them. One shared inventory underneath (D1), split for clarity.
const COLL_TABS = [['pusz', 'Dla Puszystka'], ['dom', 'Do domku'], ['ach', 'Osiągnięcia']];
function viewCollection(m) {
  const ti = Math.max(0, COLL_TABS.findIndex(t => t[0] === collTab));
  const tabs = `<div class="coll-tabs" role="tablist" aria-label="Nagrody"><span class="ind" style="transform:translateX(${ti * 100}%)"></span>${COLL_TABS.map(([k, v]) => `<button role="tab" aria-selected="${collTab === k}" data-action="coll-tab" data-tab="${k}">${v}</button>`).join('')}</div>`;
  return `<div class="coll-wrap">${collTab === 'dom' ? collHouse(m, tabs) : collTab === 'ach' ? collAch(m, tabs) : collPusz(m, tabs)}</div>`;
}
function collPusz(m, tabs) {
  const visible = CATALOG.filter(r => isVisible(r, m.opened) && !isHouse(r));
  const owned = visible.filter(r => m.claimed.includes(r.id)).length;
  const worn = m.outfit.map(id => BY_ID[id]).filter(r => r && !isHouse(r));
  const box = [178, 0, 236];
  const cats = collCat === 'all' ? Object.keys(CATEGORIES).filter(c => c !== 'domek') : [collCat];
  return `<section class="card wardrobe rise" style="--i:0">
      <img class="plate" src="/img/unlock-rewards.webp" alt="">
      ${themeGlow(m, 0).replace('style="', 'style="bottom:0;')}
      <h2>Ekwipunek Puszystka</h2>
      <p class="sub">${h(myName())} + ${h(otherName())} — jedna garderoba Puszystka.</p>
      <span class="stat-pill"><b>${owned}</b> / ${visible.length}</span>
      <div class="worn">${worn.length ? worn.map(r => `<span class="chip">${h(r.name)}</span>`).join('') : '<span class="chip empty">Nic nie ma na sobie</span>'}</div>
      ${m.ready.length ? `<button class="claim-all" data-action="claim-all">${I.gift}Odbierz wszystko (${m.ready.length})</button>` : ''}
      ${puszystekHTML({ pose: 'home', box, outfit: m.outfit, label: 'Puszystek', fresh: freshItem, stagePx: (x, y, w) => `right:${dp(8)};bottom:${dp(-6)};width:${dp(w / S * .74)}` })}
    </section>
    ${tabs}
    <div class="cats" role="group" aria-label="Kategorie">${[['all', 'Wszystkie'], ...Object.entries(CATEGORIES).filter(([k]) => k !== 'domek')].map(([k, v]) => `<button aria-pressed="${collCat === k}" data-action="coll-cat" data-cat="${k}">${v}</button>`).join('')}</div>
    ${cats.map((c, i) => { const list = visible.filter(r => r.cat === c); return `<section class="card coll-card rise" style="--i:${i + 1}"><h3>${CATEGORIES[c]} <small>${list.filter(r => m.claimed.includes(r.id)).length} z ${list.length}</small></h3><div class="grid">${list.map(r => itemTile(r, m)).join('')}</div></section>`; }).join('')}
    <p class="coll-note">Nagrody zdobywacie razem. To, co założy jedna osoba, druga zobaczy u siebie.</p>`;
}
function collHouse(m, tabs) {
  const items = CATALOG.filter(isHouse), inRoom = items.filter(r => m.outfit.includes(r.id)).length;
  return `${tabs}
    <div class="house-cta rise" style="--i:0"><img class="px-art" src="/img/house/icon.png" alt=""><div><b>Domek Puszystka</b><small>${inRoom} ${plural(inRoom, 'rzecz', 'rzeczy', 'rzeczy')} w pokoju · ${m.houseReady.length} do odebrania</small></div><button class="btn-main sm" data-action="house-open-edit">Urządzaj</button></div>
    ${Object.entries(HOUSE_CATS).filter(([k]) => k !== 'specjalne').map(([k, v], i) => { const list = items.filter(r => r.hcat === k); return `<section class="card coll-card rise" style="--i:${i + 1}"><h3>${v} <small>${list.filter(r => m.claimed.includes(r.id)).length} z ${list.length}</small></h3><div class="grid">${list.map(r => itemTile(r, m)).join('')}</div></section>`; }).join('')}
    <p class="coll-note">Rzeczy do domku ustawiacie w pokoju Puszystka. Układ jest wspólny dla was obojga.</p>`;
}
function collAch(m, tabs) {
  const ach = state?.rewards?.achieved || {};
  const rows = ACHIEVEMENTS.map(a => {
    const done = m.n >= a.at, when = ach[a.id] ? dateText(ach[a.id]) : done ? 'Zdobyte' : `Jeszcze ${meetings(a.at - m.n)}`;
    const chips = a.rewards.map(id => { const r = BY_ID[id]; return `<button data-action="item" data-id="${id}"><span class="k">${isHouse(r) ? 'Domek' : 'Puszystek'}</span>${h(r.name)}</button>`; }).join('');
    return `<div class="ach ${done ? 'done' : 'locked'}"><span class="ach-num">${a.at}</span><div><b>${h(a.name)}</b><small>${when}</small></div><div class="ach-rw">${chips}</div></div>`;
  }).join('');
  return `${tabs}<div class="ach-list">${rows}</div><p class="coll-note">Osiągnięcie to wspólny moment. Każde daje jedną lub kilka nagród: dla Puszystka albo do domku.</p>`;
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

// ------------------------------------------------------------------ Domek Puszystka
// The house is its own little game screen over home. The room is the stage, as
// large as the screen allows at a whole-pixel scale. "Urządzaj" opens the
// furniture drawer (a side panel on wide screens) and makes things draggable.
const life = new HouseLife(pusz, reduced);
let houseEditing = false, houseSig = '', houseOrigin = null, houseSel = '', houseCat = 'all', lastMove = null;
const roomPos = () => positions(model()?.outfit || [], state?.rewards?.room);
const houseArt = (id, box) => { const a = HOUSE_ART[id], k = Math.max(1, Math.min(6, Math.floor(box / Math.max(a.w, a.h)))); return `<img class="px-art" src="/img/house/${a.src}.png" alt="" style="width:${a.w * k}px;height:${a.h * k}px">`; };
function houseCard(r, m) {
  const st = itemStatus(r, m);
  const label = { locked: `${I.lock}${meetings(r.at)}`, ready: `${I.gift}Do odebrania`, worn: `${I.check}W pokoju`, owned: 'W schowku' }[st];
  return `<button class="hc ${st}${houseSel === r.id ? ' sel' : ''}" data-action="house-pick" data-id="${r.id}" data-rar="${rarityOf(r)}" aria-label="${h(r.name)}: ${label.replace(/<[^>]+>/g, '')}"><span class="hc-art">${houseArt(r.id, 56)}</span><span class="hc-nm">${h(r.name)}</span><span class="hc-st">${label}</span></button>`;
}
function housePanel(m) {
  const items = CATALOG.filter(isHouse), owned = items.filter(r => m.claimed.includes(r.id)).length;
  const inRoom = placedIds(m.outfit).length + items.filter(r => ROOM_ITEMS[r.id]?.zone === 'bg' && m.outfit.includes(r.id)).length;
  const next = items.find(r => m.n < r.at);
  if (!houseEditing) return `<div class="hp-view">
      <div class="hp-sum"><div><b>${owned}</b><span>z ${items.length} rzeczy</span></div><div><b>${inRoom}</b><span>w pokoju</span></div><div><b>${m.houseReady.length}</b><span>do odebrania</span></div></div>
      ${next ? `<div class="hp-next" data-rar="${rarityOf(next)}"><span class="hc-art">${houseArt(next.id, 46)}</span><div><small>Następna rzecz do domku</small><b>${h(next.name)}</b><em>za ${meetings(next.at - m.n)}</em><i class="bar"><i style="width:${Math.min(100, m.n / next.at * 100).toFixed(1)}%"></i></i></div></div>` : '<p class="hp-done">Wszystko do domku zdobyte ♥</p>'}
      <button class="btn-main hp-go" data-action="house-edit">Urządzaj pokój ${I.heart('', '#fff')}</button>
      <div class="hp-wide"><h3>Wyposażenie domku</h3><div class="hp-grid">${items.map(r => houseCard(r, m)).join('')}</div></div>
    </div>`;
  const list = items.filter(r => houseCat === 'all' || (houseCat === 'specjalne' ? r.special : r.hcat === houseCat));
  return `<div class="hp-edit"><div class="hp-tabs" role="tablist" aria-label="Kategorie wyposażenia">${[['all', 'Wszystko'], ...Object.entries(HOUSE_CATS)].map(([k, v]) => `<button role="tab" aria-selected="${houseCat === k}" data-action="house-cat" data-cat="${k}">${v}</button>`).join('')}</div>
    <div class="hp-grid">${list.map(r => houseCard(r, m)).join('')}</div>
    <p class="hp-hint">Dotknij rzeczy, żeby ją ustawić, a potem przeciągnij ją w pokoju.</p></div>`;
}
function houseScale(box) {
  const dpr = window.devicePixelRatio || 1, cs = getComputedStyle(box);
  const w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 8, hgt = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 8; // minus the plum frame
  const k = Math.max(1, Math.floor(Math.min(w * dpr / ROOM.w, hgt * dpr / ROOM.h)));
  return k / dpr;
}
// buttons over the selected item: undo the last move, put it away, done
function placeTools(el) {
  const tools = el.querySelector('.r-tools'), id = houseSel, p = roomPos()[id];
  if (!houseEditing || !id || !p) { tools.hidden = true; return; }
  const it = ROOM_ITEMS[id], basic = id === 'bedBasic' || id === 'rugBasic';
  tools.hidden = false;
  tools.style.left = `calc(${p[0] + it.w / 2} * var(--px))`;
  tools.style.top = `calc(${p[1] < 30 ? p[1] + it.h + 2 : p[1] - 2} * var(--px))`;
  tools.classList.toggle('below', p[1] < 30);
  tools.innerHTML = `<span class="rt-name">${h(BY_ID[id]?.name || (id === 'bedBasic' ? 'Wiklinowe legowisko' : 'Lawendowy dywanik'))}</span>
    ${lastMove?.id === id ? '<button data-action="house-undo">Cofnij</button>' : ''}${basic ? '' : '<button data-action="house-stow">Schowaj</button>'}<button class="ok" data-action="house-done">Gotowe</button>`;
  // keep the toolbar inside the room
  const room = el.querySelector('.room').getBoundingClientRect(), half = tools.offsetWidth / 2, cx = (p[0] + it.w / 2) * (room.width / ROOM.w);
  tools.style.left = `${Math.max(half + 2, Math.min(room.width - half - 2, cx))}px`;
}
function selectInRoom(el, id) {
  houseSel = id;
  el.querySelectorAll('.room .r-it').forEach(i => i.classList.toggle('sel', i.dataset.item === id));
  el.querySelectorAll('.hc').forEach(c => c.classList.toggle('sel', c.dataset.id === id));
  placeTools(el);
}
const editor = new RoomEditor({
  onSelect: (id, dragging) => { const el = document.getElementById('house'); if (el) selectInRoom(el, id); if (dragging) life.stop(); },
  onMove: async (id, p, prev) => { state.rewards.room = { ...(state.rewards.room || {}), [id]: p }; if (await moveItem(id, p, prev)) { syncHouse(); life.cheer(); } },
  onInvalid: reason => toast(h(reason)),
});
async function moveItem(id, p, prev) {
  if (DEMO) { state.rewards.room = { ...(state.rewards.room || {}), [id]: p }; lastMove = { id, prev }; return true; }
  try { state = await request('/api/room-move', { id, x: p[0], y: p[1], expect: prev }); saveState(); lastMove = { id, prev }; return true; }
  catch (e) {
    if (e.data?.conflict) { state = e.data.state; toast(`${h(otherName())} właśnie przestawił(a) ten przedmiot ♡`); }
    else { state.rewards.room = { ...(state.rewards.room || {}), [id]: prev }; toast(h(e.message)); }
    syncHouse(true); return false;
  }
}
// put a house item into the room: claim it if needed, place it (swapping what
// stood in its place), find it a free spot, select it
async function placeHouse(id) {
  const r = BY_ID[id];
  if (!model().claimed.includes(id)) await claim(id);
  if (!model().outfit.includes(id) && !await changeOutfit('equip', id)) return;
  saveState(); freshItem = id;
  if (!movable(id)) { houseSel = ''; syncHouse(); life.cheer(); return toast(`${h(r.name)} — w domku ♥`); }
  const pos = roomPos(), here = pos[id];
  if (here && !roomCheck(id, here, pos).ok) await moveItem(id, freeSpot(id, pos), here);
  houseSel = id; syncHouse(); life.cheer();
  toast(`${h(r.name)} — przeciągnij, żeby przestawić ♡`);
}
function syncHouse(force = false) {
  let el = document.getElementById('house');
  if (route !== 'house' || !state) {
    if (el && !el.classList.contains('out')) { el.classList.add('out'); life.stop(); setTimeout(() => el.remove(), 320); if (!overlay) pusz.mount(document.querySelector('.view:not(.leave) .pusz')); }
    houseEditing = false; houseSig = ''; houseSel = '';
    return;
  }
  const m = model();
  if (!el || el.classList.contains('out')) {
    el?.remove();
    el = document.createElement('div'); el.id = 'house'; el.className = 'house'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Domek Puszystka');
    if (houseOrigin) { el.style.setProperty('--ox', houseOrigin[0] + 'px'); el.style.setProperty('--oy', houseOrigin[1] + 'px'); }
    el.innerHTML = `<header class="h-top"><button class="h-back" data-action="house-back" aria-label="Wróć">${I.back}</button><h2>Domek Puszystka</h2><button class="h-edit" data-action="house-edit" aria-pressed="false">Urządzaj</button></header>
      <div class="h-main"><div class="room-wrap"><div class="room-frame"><div class="room"></div><div class="r-tools" hidden></div></div></div><aside class="h-panel"></aside></div>`;
    document.body.appendChild(el);
    editor.attach(el.querySelector('.room'), roomPos);
  }
  el.classList.toggle('editing', houseEditing);
  const ed = el.querySelector('.h-edit'); ed.textContent = houseEditing ? 'Gotowe' : 'Urządzaj'; ed.setAttribute('aria-pressed', String(houseEditing));
  el.querySelector('.h-panel').innerHTML = housePanel(m);
  const room = el.querySelector('.room');
  room.style.setProperty('--px', houseScale(el.querySelector('.room-wrap')) + 'px');
  el.querySelector('.room-frame').style.setProperty('--px', room.style.getPropertyValue('--px'));
  const pos = roomPos();
  const sig = JSON.stringify([pos, m.outfit]);
  if (force || sig !== houseSig) {
    const fresh = freshItem && isHouse(BY_ID[freshItem]) ? freshItem : '';
    room.innerHTML = roomHTML({ outfit: m.outfit, room: state.rewards?.room, fresh, sel: houseEditing ? houseSel : '' });
    houseSig = sig;
    if (!overlay) pusz.mount(room.querySelector('.pusz'));
    life.mount(room.querySelector('.hcat'), pos);
    if (fresh) freshItem = '';
  }
  if (!pos[houseSel]) houseSel = '';
  selectInRoom(el, houseEditing ? houseSel : '');
}
addEventListener('resize', () => { const el = document.getElementById('house'); if (el) { const px = houseScale(el.querySelector('.room-wrap')) + 'px'; el.querySelector('.room').style.setProperty('--px', px); el.querySelector('.room-frame').style.setProperty('--px', px); placeTools(el); } });

// ------------------------------------------------------------------ render + transitions
const ROUTES = { '': 'home', '#/nagrody': 'rewards', '#/spotkanie': 'detect', '#/kolekcja': 'collection', '#/domek': 'house' };
const HASH = { home: '', rewards: '#/nagrody', detect: '#/spotkanie', collection: '#/kolekcja', house: '#/domek' };
const ORDER = { onboarding: 0, home: 0, house: 0, rewards: 1, detect: 2, collection: 3 };
const routeFromHash = () => ROUTES[location.hash] || 'home';

function render(next, animate = false) {
  const prev = route === 'house' ? 'home' : route;
  route = state ? next : 'onboarding';
  if (!root.querySelector('.app')) shell();
  const app = root.querySelector('.app');
  // the house is a layer over the home screen (opened straight from #/domek: home first)
  if (route === 'house' && !root.querySelector('.view')) { route = 'home'; render('home'); route = 'house'; return syncHouse(); }
  syncHouse();
  if (route === 'house') { settleHeader(); return; }
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
  if (route === 'detect') mountMap(v);
  // the wardrobe is longer than one screen: let the stage grow with it
  const stage = app.querySelector('.stage');
  stage.style.height = '';
  if (route === 'collection') requestAnimationFrame(() => { const w = v.querySelector('.coll-wrap'); if (w) stage.style.height = Math.max(stage.offsetHeight, w.offsetTop + w.offsetHeight) + 'px'; });
  if (!overlay && route !== 'house') pusz.mount(v.querySelector('.pusz'));
  settleHeader();
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
// One orchestrated moment: two small hearts glide in from both sides and merge
// into one (light pulse, a few particles, soft rays), "Jesteście razem!" and
// the pair, the meeting number rolls on an odometer, Puszystek cheers on his
// little meadow, then any newly unlocked reward gets its own reveal card.
const ovPusz = (outfit, fresh = '') => puszystekHTML({ pose: 'cheer', box: [0, 0, 241], outfit, fresh, label: 'Puszystek świętuje', stagePx: (x, y, w) => `left:calc(50% - ${dp(w / S * .46)});bottom:${dp(34)};width:${dp(w / S * .92)}` });
const LOVE = ['Każda wspólna chwila się liczy.', 'Kolejne wspomnienie do waszej kolekcji.', 'Puszystek zapisał to w swoim serduszku.', 'Razem jest najpiękniej.', 'Ten dzień zostanie z wami.'];
// digits roll from the previous number to the new one (only changed columns move)
function odometer(from, to) {
  const a = String(from).padStart(String(to).length, '0'), b = String(to);
  return [...b].map((d, i) => {
    const s = +a[i], e = +d, steps = (e - s + 10) % 10;
    const seq = Array.from({ length: steps + 1 }, (_, k) => (s + k) % 10);
    const lead = i === 0 && a[0] === '0' && from < to && String(from).length < b.length;
    return `<span class="od-col${lead ? ' lead' : ''}" style="--steps:${steps}"><span class="od-strip">${seq.map(x => `<span>${x}</span>`).join('')}</span></span>`;
  }).join('');
}
function celebrationHTML({ n, preview, milestone }) {
  const m = model();
  const sparks = reduced.matches ? '' : Array.from({ length: 12 }, (_, i) => `<img class="px-art" src="/img/${['home-heart-0', 'home-spark-5', 'home-heart-2', 'det-heart-2'][i % 4]}.png" alt="" style="--a:${i * 30 + (i % 2) * 11}deg;--d:${(46 + (i % 3) * 16)}dp;--t:${(i % 4) * 40}ms">`).join('').replace(/(\d+)dp/g, (_, v) => dp(v));
  const deco = [['det-heart-1', -118, 46, 26, 0], ['home-heart-0', 112, 20, 22, .6], ['home-spark-5', -92, -8, 16, 1.1], ['home-spark-4', 102, 84, 14, .3], ['det-heart-2', 128, 112, 16, 1.6], ['home-heart-3', -128, 118, 15, .9]]
    .map(([src, x, y, w, d]) => `<img class="ov-deco px-art" src="/img/${src}.png" alt="" style="left:calc(50% + ${dp(x)});top:${dp(y)};width:${dp(w)};--d:${d}s">`).join('');
  const bokeh = reduced.matches ? '' : [[12, 18, 90], [78, 12, 70], [88, 58, 110], [6, 66, 80], [44, 84, 120]].map(([x, y, s], i) => `<i style="left:${x}%;top:${y}%;width:${dp(s)};height:${dp(s)};--d:${i * 1.3}s"></i>`).join('');
  const count = n === 1 ? 'Wasze pierwsze spotkanie!' : n >= 1000 ? `Wasze ${n.toLocaleString('pl-PL')}. spotkanie!` : `Wasze <b class="odo" aria-hidden="true">${odometer(Math.max(0, n - 1), n)}</b>. spotkanie!`;
  return `<div class="ov" id="ov" role="dialog" aria-modal="true" aria-label="Jesteście razem">
    <div class="ov-stage ${themeOf(m)}">
      <div class="ov-bokeh" aria-hidden="true">${bokeh}</div>
      ${preview ? '<span class="ov-preview">Podgląd, bez naliczania</span>' : ''}
      <div class="ov-col">
        <div class="ov-emblem" aria-hidden="true">
          <span class="ov-glow"></span><span class="ov-rays"></span>
          ${I.heart('ov-heart a')}${I.heart('ov-heart b', 'url(#hg2)')}
          <span class="ov-ring"></span><span class="ov-ring r2"></span>
          ${I.heart('ov-big', 'url(#hg2)')}
          <div class="ov-sparks">${sparks}</div>
        </div>
        <h2 class="ov-title">${milestone ? 'Wielki dzień!' : 'Jesteście razem!'}</h2>
        <p class="ov-sub"><b>${h(myName())} i ${h(otherName())}</b><span>${milestone ? `Kamień milowy: ${meetings(n)}.` : LOVE[n % LOVE.length]}</span></p>
        <div class="ov-count" role="status" aria-label="Wasze ${n}. spotkanie">${count}</div>
        <div class="ov-scene">
          <span class="ov-halo"></span>
          <img class="ov-hill" src="/img/meadow-home.webp" alt="">
          ${deco}
          <div class="ov-pusz">${ovPusz(m.outfit)}</div>
        </div>
        <div class="ov-actions"><button class="btn-main" data-action="ov-next">Super! ${I.heart('', '#fff')}</button></div>
      </div>
    </div></div>`;
}
function rewardCardHTML(r) {
  const m = model(), rar = rarityOf(r);
  const claimed = m.claimed.includes(r.id), worn = m.outfit.includes(r.id);
  const slotFree = r.slot && !m.outfit.some(id => BY_ID[id]?.slot === r.slot);
  const primary = !claimed
    ? `<button class="btn-main" data-action="ov-claim" data-id="${r.id}">${r.reveals ? 'Otwórz prezent' : slotFree && r.slot !== 'pin' ? (SET_SLOTS.includes(r.slot) ? 'Odbierz i ustaw' : 'Odbierz i załóż') : isBadge(r) ? 'Odbierz do gabloty' : 'Odbierz'} ${I.heart('', '#fff')}</button>`
    : r.slot && !worn ? `<button class="btn-main" data-action="ov-wear" data-id="${r.id}">${r.slot === 'pin' ? 'Przypnij' : SET_SLOTS.includes(r.slot) ? 'Ustaw' : 'Załóż'} ${I.heart('', '#fff')}</button>`
      : `<button class="btn-main" data-action="ov-next">Super! ${I.heart('', '#fff')}</button>`;
  // the object itself (sprite / medal), not its tile picture
  const art = isBadge(r) ? badgeArt(r, 'big') : r.reveals ? `<img src="/img/tile-gift.webp" alt=""${TILE_FILTER[r.id] ? ` style="filter:${TILE_FILTER[r.id]}"` : ''}>`
    : WEAR[r.id] ? `<img class="px-art" src="/img/${WEAR[r.id].src}" alt="">` : DECOR[r.id] ? `<img class="px-art decor-art" src="/img/${DECOR[r.id].src}" alt="">` : artHTML(r);
  return `<div class="ov-reward" role="group" aria-label="Nowa nagroda: ${h(r.name)}" data-rar="${rar}">
    <p class="rw-kick">${r.reveals ? 'Niespodzianka dla was' : isSpecial(r) ? 'Wyjątkowa nagroda' : 'Nowa nagroda'}</p>
    <div class="rw-stage"><span class="rw-light"></span><div class="rw-art">${art}</div></div>
    <span class="rar-chip"><i class="gem"></i>${RARITY[rar]}</span>
    <h3>${h(r.name)}</h3><p>${h(r.desc)}</p>
    <div class="rw-btns">${primary}<div class="rw-more"><button class="btn-link" data-action="ov-collection">Zobacz w ekwipunku</button><button class="btn-link" data-action="ov-next">Później</button></div></div>
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
  const later = (ms, fn) => setTimeout(() => overlay?.el === el && fn(), reduced.matches ? 0 : ms);
  later(2350, () => el.querySelector('.ov-count')?.classList.add('roll'));
  later(2000, () => { pusz.celebrate(milestone ? 'milestone' : 'meeting'); burst(el.querySelector('.pz-body'), 6, 200); });
  if (overlay.queue.length) later(4300, nextReward);
}
function showRewards(list, title = 'Nowa nagroda!') {
  if (!list.length) return;
  showCelebration({ n: state.count, preview: false, rewards: list });
  overlay.el.querySelector('.ov-title').textContent = title;
  overlay.el.querySelector('.ov-count').style.display = 'none';
  overlay.el.querySelector('.ov-sub span').textContent = 'Puszystek ma dla was coś wyjątkowego.';
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
  overlay.el.classList.add('has-reward');
  overlay.el.querySelector('.ov-actions')?.remove(); // the card has its own buttons
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
  if (!bg || bg.classList.contains('out')) return;
  const sh = bg.querySelector('.sheet'); sh.style.animation = ''; sh.style.transition = '';
  bg.classList.add('out'); setTimeout(() => bg.remove(), 260);
  if (!overlay && bg.querySelector('.pusz')) pusz.mount(document.querySelector('.view:not(.leave) .pusz'));
}
function itemSheet(r, m) {
  const st = itemStatus(r, m), set = SET_SLOTS.includes(r.slot), rar = rarityOf(r), badge = isBadge(r);
  const fx = justChanged?.id === r.id ? ` just-${justChanged.kind}` : '';
  const inSlot = r.slot ? m.outfit.map(id => BY_ID[id]).find(x => x?.slot === r.slot) : null;
  const previewOutfit = r.slot ? sanitizeOutfit([...m.outfit, r.id], Math.max(m.n, r.at), [...m.opened, r.hidden].filter(Boolean)) : m.outfit;
  const stage = isHouse(r) ? `<div class="ri-stage house-stage${st === 'locked' ? ' locked' : ''}"><div class="ri-art">${houseArt(r.id, 150)}</div></div>`
    : badge ? `<div class="ri-stage medal-stage${st === 'locked' ? ' locked' : ''}"><span class="ri-rays"></span><div class="ri-art">${badgeArt(r, 'big')}</div><span class="ri-shelf"></span></div>`
    : r.reveals ? `<div class="ri-stage gift-open"><span class="ri-rays"></span><div class="ri-art"><img src="/img/tile-gift.webp" alt=""${TILE_FILTER[r.id] ? ` style="filter:${TILE_FILTER[r.id]}"` : ''}></div></div>`
      : r.slot ? `<div class="ri-stage preview ${r.slot === 'theme' ? r.id : ''}"><img class="bg" src="/img/unlock-rewards.webp" alt=""><div class="ri-art">${puszystekHTML({ pose: 'home', box: [0, 0, 242], outfit: previewOutfit, label: 'Podgląd', stagePx: (x, y, w) => `left:calc(50% - ${dp(w / S * .38)});bottom:${dp(-4)};width:${dp(w / S * .76)}` })}</div></div>`
        : `<div class="ri-stage"><div class="ri-art">${artHTML(r)}</div></div>`;
  const have = Math.min(m.n, r.at);
  const cond = `<div class="cond ${m.n >= r.at ? 'met' : ''}"><span class="ck">${m.n >= r.at ? I.check : I.lock}</span><div><b>${meetings(r.at)} razem</b><small>${m.n >= r.at ? 'Warunek spełniony' : `Macie ${have} z ${r.at}, jeszcze ${meetings(r.at - m.n)}`}</small><div class="bar"><i style="width:${(have / r.at * 100).toFixed(1)}%"></i></div></div></div>`;
  // where the item is now (an elegant status, not a button)
  const house = isHouse(r);
  const status = st === 'worn' ? `<div class="ri-status on">${r.slot === 'pin' ? I.pinIc : I.wear}<span>${house ? 'Stoi w domku Puszystka' : r.slot === 'pin' ? 'Przypięta na liczniku' : set ? 'Ustawione przy Puszystku' : 'Puszystek ma to na sobie'}</span>${I.check}</div>`
    : st === 'owned' ? `<div class="ri-status${badge ? ' case' : ''}">${badge ? I.shelf : I.check}<span>${house ? 'W schowku — możesz ustawić w domku' : badge ? 'W gablocie' : 'W waszym ekwipunku'}</span>${I.check}</div>` : '';
  const verb = house ? 'Ustaw w domku' : r.slot === 'pin' ? 'Przypnij na liczniku' : set ? 'Ustaw' : 'Załóż';
  const btns = st === 'locked' ? `<button class="btn-ghost wide" disabled aria-disabled="true">${I.lock}Zablokowane</button>`
    : st === 'ready' ? `<button class="btn-main" data-action="claim" data-id="${r.id}">${r.reveals ? 'Otwórz prezent' : badge ? 'Odbierz do gabloty' : 'Odbierz'} ${I.heart('', '#fff')}</button>`
      : r.reveals ? `<button class="btn-main" data-action="item" data-id="${r.reveals}">Zobacz zawartość ${I.heart('', '#fff')}</button>`
        : !r.slot ? ''
          : st === 'worn' ? `<button class="btn-ghost wide" data-action="unequip" data-id="${r.id}">${house ? 'Schowaj' : r.slot === 'pin' ? 'Odepnij' : set ? 'Wyłącz' : 'Zdejmij'}</button>`
            : `${inSlot ? `<p class="swap-note">Zamiast: ${h(inSlot.name)}</p>` : ''}<button class="btn-main" data-action="equip" data-id="${r.id}">${inSlot && r.slot !== 'pin' ? 'Zamień' : verb} ${I.heart('', '#fff')}</button>`;
  return `<div class="ri ${st}${fx}" data-rar="${rar}">${stage}
    <div class="ri-head"><h2>${h(r.name)}</h2><p class="ri-meta"><span class="rar-chip"><i class="gem"></i>${RARITY[rar]}</span><span>${CATEGORIES[r.cat]}${r.slot && !badge ? `, ${SLOTS[r.slot].toLowerCase()}` : ''}</span></p></div>
    ${status}${cond}<p class="ri-desc">${h(r.desc)}${r.reveals && m.opened.includes(r.id) ? ` W środku: ${h(BY_ID[r.reveals].name)}.` : ''}</p>
    <div class="ri-btns">${btns}</div></div>`;
}
// iOS-style bottom sheet: follows the finger from the handle (or from the
// content when it is scrolled to the top), closes past a distance/velocity
// threshold, springs back otherwise. Content scroll is never hijacked.
function attachSheetDrag(bg) {
  const sh = bg.querySelector('.sheet'), body = sh.querySelector('.sheet-body'), grab = sh.querySelector('.sheet-grab');
  let y0 = 0, dy = 0, drag = false, active = false, fromGrab = false, track = [];
  const set = v => { sh.style.transform = v ? `translateY(${v}px)` : ''; bg.style.setProperty('--dim', Math.max(0, 1 - Math.max(0, v) / sh.offsetHeight).toFixed(3)); };
  const start = (y, onGrab) => { active = true; drag = false; fromGrab = onGrab; y0 = y; dy = 0; track = [[performance.now(), y]]; };
  const move = (y, e) => {
    if (!active) return;
    dy = y - y0; track.push([performance.now(), y]); if (track.length > 6) track.shift();
    if (!drag) {
      if ((fromGrab || body.scrollTop <= 0) && dy > 4) { drag = true; y0 = y; dy = 0; sh.style.animation = 'none'; sh.style.transition = 'none'; sh.classList.add('dragging'); }
      else if (!fromGrab && Math.abs(dy) > 4) { active = false; return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    set(dy > 0 ? dy : dy / 4);
  };
  const end = () => {
    if (!active) return; active = false;
    if (!drag) return; drag = false; sh.classList.remove('dragging');
    const [t1, ya] = track[0], [t2, yb] = track.at(-1), v = (yb - ya) / Math.max(16, t2 - t1);
    if (dy > Math.min(150, sh.offsetHeight * .3) || (v > .5 && dy > 24)) return closeSheet();
    sh.style.transition = 'transform .45s cubic-bezier(.3, 1.35, .5, 1)'; set(0);
    setTimeout(() => { sh.style.transition = ''; }, 460);
  };
  sh.addEventListener('touchstart', e => { if (e.touches.length === 1) start(e.touches[0].clientY, !!e.target.closest('.sheet-grab')); else active = false; }, { passive: true });
  sh.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
  // mouse / pen: drag by the handle
  grab.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; grab.setPointerCapture?.(e.pointerId); start(e.clientY, true); });
  grab.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') move(e.clientY, e); });
  grab.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') end(); });
  grab.addEventListener('pointercancel', e => { if (e.pointerType !== 'touch') end(); });
  sh.addEventListener('animationend', () => { if (!bg.classList.contains('out')) sh.style.animation = 'none'; }, { once: true });
}
function renderSheet(quiet = false) {
  if (!sheet) return document.getElementById('sheet')?.remove();
  const m = model();
  let c = '';
  if (sheet === 'settings') {
    const ic = (n, tone = '') => `<span class="set-ic ${tone}"><img src="/img/ui/ic-${n}.png" alt=""></span>`;
    const row = (icon, title, sub, btn) => `<div class="set">${icon}<div><b>${title}</b><small>${sub}</small></div>${btn}</div>`;
    c = `<h2>Ustawienia</h2><p>Wszystko, czego potrzebujecie, w jednym miejscu.</p>
    <p class="sec-h">Wasza para</p><div class="sec">
      ${row(ic('heart'), 'Para', `${h(myName())} ♡ ${state?.connected ? h(otherName()) : 'czeka na drugą osobę'}`, '')}
      ${row(ic('heart', 'lav'), 'Twoje imię', 'Widzicie je oboje w nagłówku.', `<button class="btn-soft" data-action="name">${h(myName())}</button>`)}
      ${row(ic('cal', 'lav'), 'Data pierwszego spotkania', 'Od niej liczymy dni razem.', `<button class="btn-soft" data-action="first-date">${h(state?.firstMetAt || 'Ustaw')}</button>`)}
      ${state && !state.connected ? `<div class="set">${ic('key', 'gold')}<div><b>Kod zaproszenia</b><small>Druga osoba wybiera „Dołącz z kodem”.</small><div class="code">${h(state.code || '')}</div></div><button class="btn-soft" data-action="copy">Kopiuj</button></div>` : ''}
    </div>
    <p class="sec-h">Spotkania</p><div class="sec">
      ${row(ic('clock'), 'Zapisz spotkanie', 'Dodajcie spotkanie ręcznie.', '<button class="btn-soft" data-action="meeting">Dodaj</button>')}
      ${row(ic('cal'), 'Historia spotkań', 'Ta sama na obu telefonach.', '<button class="btn-soft" data-action="history">Pokaż</button>')}
      ${row(ic('radar', 'mint'), 'Status wykrywania spotkań', h(statusLine(m)), '<button class="btn-soft" data-action="diag">Pokaż</button>')}
      ${row(ic('pin', 'mint'), 'Zasięg spotkania', 'Przy słabszym GPS potwierdzacie oboje.', `<button class="btn-soft" data-action="radius">${m?.pr.radius || 100} m</button>`)}
    </div>
    <p class="sec-h">Puszystek i domek</p><div class="sec">
      ${row(ic('bag', 'gold'), `Ekwipunek Puszystka${m?.ready.length ? `<span class="dot">${m.ready.length}</span>` : ''}`, 'Korony, kokardki, efekty i odznaki.', '<button class="btn-soft" data-action="collection">Otwórz</button>')}
      ${row(ic('house', 'gold'), `Domek Puszystka${m?.houseReady.length ? `<span class="dot">${m.houseReady.length}</span>` : ''}`, 'Meble i dekoracje do wspólnego pokoju.', '<button class="btn-soft" data-action="house">Wejdź</button>')}
    </div>
    <p class="sec-h">Konto</p><div class="sec">
      ${row(ic('key', 'lav'), 'Logowanie na innym telefonie', 'Jednorazowo pokażemy Twój kod logowania.', '<button class="btn-soft" data-action="login-code">Pokaż kod</button>')}
    </div>
    <p class="set-note">Imiona, licznik, nagrody, ekwipunek i domek są na wspólnym serwerze. Pozycja jest tymczasowa — nie tworzymy historii lokalizacji.</p>
    <button class="btn-soft wide btn-danger" data-action="logout">Odłącz ten telefon</button>`;
  }
  else if (sheet === 'history') c = `<h2>Wasze spotkania</h2><p>Ta sama historia na obu telefonach. Pomyłki można usunąć.</p>
    ${state.meetings.length ? state.meetings.map(e => `<div class="hist"><div><b>${dateText(e.occurred_at)}</b><small>${e.source === 'auto' ? 'Wykryte automatycznie' : 'Dodane ręcznie'}</small></div><button data-action="delete" data-id="${h(e.id)}">Usuń</button></div>`).join('') : '<div class="empty">Jeszcze nie zapisaliście żadnego spotkania.</div>'}`;
  else if (sheet === 'first-date') c = `<h2>Wasz pierwszy dzień</h2><p>Ustawcie datę pierwszego spotkania — oboje zobaczycie ten sam licznik dni.</p>
    <form id="date-form"><label class="field-l" for="startdate">Data</label><input class="field" id="startdate" required type="date" max="${new Date().toISOString().slice(0, 10)}" value="${h(state?.firstMetAt || '')}"><button type="submit" class="btn-main">Zapisz datę ${I.heart('', '#fff')}</button></form>`;
  else if (sheet === 'meeting') c = `<h2>Zapisać spotkanie?</h2><p>Licznik jest wspólny — druga osoba od razu zobaczy nowe spotkanie.</p>
    <form id="meeting-form"><label class="field-l" for="mdate">Kiedy?</label><input class="field" id="mdate" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}"><button type="submit" class="btn-main">Zapisz spotkanie ${I.heart('', '#fff')}</button></form>`;
  else if (sheet === 'location-info') c = `<h2>Auto-zliczanie</h2><p>Gdy oboje włączycie lokalizację i macie otwarte Razem, telefony co kilkanaście sekund porównują swoje pozycje. Do 300 m: „jesteście niedaleko”. Do 50 m przy dokładnym GPS: jesteście razem, a po minucie spotkanie zapisuje się samo. Przy słabszym GPS (do ${m?.pr.radius || 100} m) potwierdzacie je oboje.</p>
    <p>Liczą się tylko pomiary z ostatnich 2 minut. Jedno bycie razem to jedno spotkanie, kolejne najwcześniej po 6 godzinach. Pozycja jest kasowana po 15 minutach — nie ma historii tras.</p>
    <p><b>Ważne:</b> na iPhonie strona nie może sprawdzać lokalizacji w tle. Obie osoby muszą mieć Razem otwarte; gdy jedna sprawdza, druga dostaje powiadomienie (jeśli je włączyła).</p>
    <div class="row-btns"><button class="btn-soft" data-action="replay">Podgląd animacji</button><button class="btn-main" data-action="${geoOn ? 'check-now' : 'toggle-location'}">${geoOn ? 'Sprawdź teraz' : 'Włącz lokalizację'}</button></div>`;
  else if (sheet === 'radius') c = `<h2>Zasięg spotkania</h2><p>Jak blisko musicie być, żeby Razem uznało, że jesteście razem? Mniejszy zasięg wymaga dokładniejszego GPS.</p>
    <div class="radius-opts three">${[50, 100, 150].map(v => `<button aria-pressed="${(m?.pr.radius || 100) === v}" data-action="set-radius" data-r="${v}">${v} m</button>`).join('')}</div>
    <p>Do 50 m przy dokładnym GPS spotkanie liczy się samo. Do wybranej odległości, gdy GPS jest mniej dokładny, potwierdzacie je oboje. Wspólne ustawienie dla was obojga.</p>`;
  else if (sheet === 'nearby') c = `<h2>${m.pr.partnerConfirm ? `${h(otherName())} potwierdza spotkanie` : 'Wygląda na to, że jesteście razem!'}</h2><p>${h(myName())} i ${h(otherName())}: ok. ${fmtDist(m.pr.distance)} od siebie. ${m.pr.partnerConfirm ? 'Potwierdzasz, że jesteście razem?' : m.pr.needsBoth ? 'GPS jest mniej dokładny, więc potwierdźcie spotkanie oboje.' : 'Zaliczamy spotkanie?'}</p>
    <div class="row-btns"><button class="btn-soft" data-action="close">Nie teraz</button><button class="btn-main" data-action="confirm-meeting">${m.pr.myConfirm ? 'Potwierdzone' : 'Jesteśmy razem'} ${I.heart('', '#fff')}</button></div>`;
  else if (sheet === 'check') c = checkSheet(m);
  else if (sheet === 'map-share') c = `<h2>Pokazywanie na mapie</h2><p>Mapa zawsze pokazuje Tobie Twoją pozycję. ${h(otherName())} zobaczy Cię na mapie tylko wtedy, gdy to włączysz. To osobna zgoda od wykrywania spotkań.</p>
    <p>Pozycja jest widoczna tylko wtedy, gdy Razem jest otwarte, a starsza niż 2 minuty jest oznaczona jako nieaktualna. Po 15 minutach znika z serwera.</p>
    <div class="row-btns"><button class="btn-soft" data-action="close">Zamknij</button><button class="btn-main" data-action="map-share-toggle">${mapView?.me?.sharing ? 'Przestań mnie pokazywać' : `Pokazuj mnie ${h(otherName())}`}</button></div>`;
  else if (sheet === 'diag') c = diagSheet(m);
  else if (sheet === 'name') c = `<h2>Twoje imię</h2><p>Zobaczycie je oboje w nagłówku aplikacji.</p>
    <form id="name-form"><label class="field-l" for="myname">Imię</label><input class="field" id="myname" maxlength="28" minlength="2" required autocomplete="given-name" value="${h(myName())}"><button type="submit" class="btn-main">Zapisz ${I.heart('', '#fff')}</button></form>`;
  else if (sheet === 'push-help') c = `<h2>Powiadomienia na iPhonie</h2><p>iOS pozwala na powiadomienia tylko aplikacjom dodanym do ekranu początkowego (iOS 16.4 lub nowszy).</p>
    <p>W Safari dotknij <b>Udostępnij</b> → <b>Do ekranu początkowego</b>, otwórz Razem z ikony Puszystka i włącz powiadomienia jeszcze raz.</p><button class="btn-main" data-action="close">Rozumiem ${I.heart('', '#fff')}</button>`;
  else if (sheet === 'login') c = `<h2>Twój kod logowania</h2><p>Na nowym telefonie wybierz „Zaloguj się kodem” i wpisz:</p>
    <div class="login-code">${h(loginCode.replace(/(.{4})(?=.)/g, '$1 '))}</div>
    <p>Kod jest tylko Twój — nie wysyłaj go nikomu. Wygenerowanie nowego unieważnia poprzedni.</p>
    <button class="btn-main" data-action="copy-login">Kopiuj kod ${I.heart('', '#fff')}</button>`;
  else if (sheet.startsWith('item:')) c = itemSheet(BY_ID[sheet.slice(5)], m);
  const prevScroll = document.querySelector('#sheet .sheet-body')?.scrollTop || 0;
  document.getElementById('sheet')?.remove();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg' + (quiet ? ' static' : ''); bg.id = 'sheet';
  const label = sheet.startsWith('item:') ? BY_ID[sheet.slice(5)]?.name : { settings: 'Ustawienia', history: 'Historia spotkań' }[sheet] || 'Panel';
  bg.innerHTML = `<div class="sheet${quiet ? ' static' : ''}${sheet.startsWith('item:') ? ' item-sheet' : ''}" role="dialog" aria-modal="true" aria-label="${h(label)}">
    <div class="sheet-grab" aria-hidden="true"><span></span></div>
    <button class="sheet-x" data-action="close" aria-label="Zamknij">${I.close}</button>
    <div class="sheet-body">${c}</div></div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg);
  if (quiet) bg.querySelector('.sheet-body').scrollTop = prevScroll;
  attachSheetDrag(bg);
  justChanged = null;
  if (sheet.startsWith('item:')) { const p = bg.querySelector('.pusz'); if (p) pusz.mount(p); }
}

// ------------------------------------------------------------------ actions
function go(r) { const hsh = HASH[r]; if ((location.hash || '') === hsh) return render(r, true); if (hsh) location.hash = hsh; else history.pushState(null, '', location.pathname + location.search); if (!hsh) render('home', true); }

// One shared inventory: every change names the slot content this phone saw
// (`expect`), so a simultaneous change by the partner is never overwritten.
// The reward card confirms the new state in place (button -> status), then moves on.
function rewardDone(el, r, worn = model().outfit.includes(r.id)) {
  const box = el.closest('.ov-reward')?.querySelector('.rw-btns'); if (!box) return nextReward();
  box.innerHTML = `<div class="ri-status on state-in">${worn ? (r.slot === 'pin' ? I.pinIc : I.wear) : isBadge(r) ? I.shelf : I.check}<span>${worn ? (r.slot === 'pin' ? 'Przypięta na liczniku' : SET_SLOTS.includes(r.slot) ? 'Ustawione' : 'Puszystek ma to na sobie') : isBadge(r) ? 'W gablocie' : 'W waszym ekwipunku'}</span>${I.check}</div>`;
  setTimeout(() => overlay && nextReward(), reduced.matches ? 400 : 1300);
}
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
    if (r.slot && r.slot !== 'pin' && !model().outfit.some(x => BY_ID[x]?.slot === r.slot)) { demoOutfit = [...demoOutfit, id]; state.rewards.equipped = sanitizeOutfit(demoOutfit, state.count, demoOpened); }
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
    else if (['settings', 'history', 'first-date', 'location-info', 'meeting', 'radius', 'diag', 'name'].includes(action)) { if (!state && action !== 'location-info') return; openSheet(action); }
    else if (action === 'check-now') await checkNow();
    else if (action === 'map-share') { if (DEMO) return toast('To tylko podgląd'); openSheet('map-share'); }
    else if (action === 'map-share-toggle') { mapView = await request('/api/map-share', { on: !mapView?.me?.sharing }); closeSheet(); toast(mapView.me.sharing ? `${h(otherName())} widzi Cię na mapie ♡` : 'Nie pokazujesz się już na mapie'); refreshMap(); if (mapView.me.sharing && !geoOn) await enableGeo().catch(e => toast(h(e.message))); }
    else if (action === 'map-fit') pairMap.fit('both');
    else if (action === 'map-full') {
      // the full-screen map is its own layer over the app (the card sits in a transformed stage)
      const full = document.createElement('div'); full.id = 'mapfull'; full.className = 'map-full'; full.setAttribute('role', 'dialog'); full.setAttribute('aria-label', 'Mapa');
      full.innerHTML = `<div class="map-slot"></div><div class="mf-top"><button class="map-btn close" data-action="map-close" aria-label="Zamknij mapę">${I.close}</button><div class="mf-status">${h(detectCopy(model()).title)} <span>${h(mapChip(model()))}</span></div></div>
        <div class="mf-tools"><button class="map-btn" data-action="map-fit" aria-label="Pokaż nas oboje">${I.heart('', 'url(#hg2)')}</button><button class="map-btn" data-action="map-me" aria-label="Pokaż mnie">${I.locate}</button></div>`;
      document.body.appendChild(full); pairMap.attach(full.querySelector('.map-slot')); setTimeout(() => { pairMap.map?.resize(); pairMap.fit('both'); }, 80);
    }
    else if (action === 'map-close') { document.getElementById('mapfull')?.remove(); const slot = document.querySelector('.view:not(.leave) .map-slot'); if (slot) { pairMap.attach(slot); setTimeout(() => pairMap.fit('both'), 60); } }
    else if (action === 'map-me') pairMap.fit('me');
    else if (action === 'house') {
      closeSheet();
      const r = el.getBoundingClientRect(); houseOrigin = [r.left + r.width / 2, r.top + r.height / 2];
      if (!reduced.matches && pusz.el?.querySelector('.pz-paw')) { pusz.play('wave'); await new Promise(res => setTimeout(res, 650)); }
      go('house');
    }
    else if (action === 'house-back') go('home');
    else if (action === 'house-edit') { houseEditing = !houseEditing; if (!houseEditing) houseSel = ''; syncHouse(true); }
    else if (action === 'house-cat') { houseCat = el.dataset.cat; syncHouse(); document.querySelector('.hp-tabs [aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }); }
    else if (action === 'house-pick') {
      const r = BY_ID[el.dataset.id], st = itemStatus(r, model());
      if (!houseEditing && st !== 'locked') { houseEditing = true; syncHouse(true); }
      if (st === 'locked') return openSheet('item:' + r.id);
      if (st === 'worn' && movable(r.id)) { const hs = document.getElementById('house'); selectInRoom(hs, r.id); hs.querySelector(`.r-it[data-item="${r.id}"]`)?.animate?.([{ translate: '0 0' }, { translate: '0 -4px' }, { translate: '0 0' }], { duration: 320 }); return; }
      if (st === 'worn') return toast(`${h(r.name)} już jest w domku ♡`);
      await placeHouse(r.id);
    }
    else if (action === 'house-stow') { const id = houseSel; if (!id) return; houseSel = ''; if (await changeOutfit('unequip', id)) { saveState(); syncHouse(true); toast(`${h(BY_ID[id].name)} — w schowku`); } }
    else if (action === 'house-undo') { const mv = lastMove; if (!mv) return; lastMove = null; const cur = roomPos()[mv.id]; if (await moveItem(mv.id, mv.prev, cur)) { lastMove = null; syncHouse(); } }
    else if (action === 'house-done') { houseSel = ''; selectInRoom(document.getElementById('house'), ''); }
    else if (action === 'close') closeSheet();
    else if (action === 'cat') { if (route === 'house') life.stop(); const pick = await pusz.tap(); if (pick === 'hop' || pick === 'hug') burst(el, 4, 120); if (route === 'house') life.timer = setTimeout(() => life.next(), 5000); }
    else if (action === 'super') { burst(document.querySelector('.view:not(.leave) .pz-body'), 9); pusz.celebrate('reward'); el.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' }); }
    else if (action === 'item') { openSheet('item:' + el.dataset.id); }
    else if (action === 'equip' || action === 'unequip' || action === 'ov-wear') {
      const id = el.dataset.id, r = BY_ID[id], on = action !== 'unequip';
      if (!await changeOutfit(on ? 'equip' : 'unequip', id)) return;
      saveState();
      if (on) freshItem = id;
      justChanged = { id, kind: on ? 'worn' : 'off' };
      if (action === 'ov-wear') { render(route); overlayPusz(id); pusz.celebrate('reward'); return rewardDone(el, r); }
      render(route); renderSheet(true);
      if (on) { pusz.celebrate('reward'); burst(document.querySelector(`.view:not(.leave) .pz-item[data-item="${id}"]`) || document.querySelector('.view:not(.leave) .pz-body'), 6, 160); toast(`${h(r.name)} — ${SET_SLOTS.includes(r.slot) ? 'ustawione' : 'założone'} ♥`); }
      else toast(SET_SLOTS.includes(r.slot) ? 'Wyłączone' : 'Zdjęte');
    }
    else if (action === 'claim' || action === 'ov-claim' || action === 'open-gift' || action === 'ov-gift') {
      const id = el.dataset.id, r = BY_ID[id], before = model().outfit;
      const box = el.closest('.sheet, .ov-reward')?.querySelector('.ri-stage, .rw-stage');
      if (r.reveals) box?.classList.add('opened');
      burst(box || el, r.reveals ? 12 : 8, 240);
      await claim(id); saveState();
      const wornNow = model().outfit.includes(id) && !before.includes(id);
      if (wornNow) freshItem = id;
      justChanged = { id, kind: isBadge(r) && !wornNow ? 'cased' : 'claimed' };
      if (r.reveals) await new Promise(res => setTimeout(res, reduced.matches ? 0 : 650));
      render(route);
      if (overlay) { if (wornNow) overlayPusz(id); pusz.celebrate('reward'); if (r.reveals) { overlay.queue.unshift(BY_ID[r.reveals]); return nextReward(); } return rewardDone(el, r, wornNow); }
      if (r.reveals) return openSheet('item:' + r.reveals);
      if (isSpecial(r)) { closeSheet(); return showRewards([r], 'Wyjątkowa nagroda!'); }
      renderSheet(true); pusz.celebrate('reward');
      toast(wornNow ? `${h(r.name)} — w ekwipunku i ${SET_SLOTS.includes(r.slot) ? 'ustawione' : 'założone'} ♥` : isBadge(r) ? `${h(r.name)} — w gablocie ♥` : `${h(r.name)} — w ekwipunku ♥`);
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
    else if (action === 'coll-tab') { collTab = el.dataset.tab; render('collection'); document.querySelector('.app')?.scrollTo?.({ top: 0 }); }
    else if (action === 'house-open-edit') { houseEditing = true; go('house'); }
    else if (action === 'tile-prev' || action === 'tile-next') {
      const next = Math.max(0, Math.min(FEATURED.length - 4, tileStart + (action === 'tile-next' ? 1 : -1)));
      if (next === tileStart) { el.animate?.([{ transform: 'translateX(0)' }, { transform: `translateX(${action === 'tile-next' ? 4 : -4}px)` }, { transform: 'translateX(0)' }], { duration: 260 }); return; }
      tileStart = next; render('rewards');
    }
    else if (action === 'replay') { if (el.closest('.near-cta')) return; showCelebration({ n: state.count, preview: true }); }
    else if (action === 'ov-next') { if (overlay?.queue.length) nextReward(); else closeOverlay(); }
    else if (action === 'ov-collection') { const toHouse = isHouse(BY_ID[el.closest('.ov-reward')?.querySelector('[data-id]')?.dataset.id]); overlay && (overlay.queue = []); closeOverlay(); go(toHouse ? 'house' : 'collection'); }
    else if (action === 'locate') { const g = document.querySelector('.view:not(.leave) .chips'); g?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' }); if (!DEMO) await checkNow(); }
    else if (action === 'set-radius') {
      const r = +el.dataset.r;
      if (DEMO) { state.proximity.radius = r; } else state = await request('/api/settings', { radius: r });
      renderSheet(); render(route); toast(`Zasięg: ${r} m`);
    }
    else if (action === 'confirm-meeting') {
      if (DEMO) throw new Error('To tylko podgląd — nic nie zapisujemy ♡');
      const old = state.count;
      const res = await request('/api/meeting-confirm', {});
      state = res; saveState(); closeSheet(); render(route);
      if (res.waitingForPartner) toast(`Potwierdzone ♥ Czekamy jeszcze na ${h(otherName())}`);
      else afterCountChange(old);
    }
    else if (action === 'copy') { await navigator.clipboard.writeText(state.code); toast('Kod zaproszenia skopiowany ♡'); }
    else if (action === 'delete') { if (!confirm('Usunąć to spotkanie z waszego licznika?')) return; state = await request('/api/delete-meeting', { id: el.dataset.id }); render(route); renderSheet(); toast('Spotkanie usunięte'); }
    else if (action === 'toggle-location') {
      if (DEMO) { el.setAttribute?.('aria-checked', String(el.getAttribute('aria-checked') !== 'true')); toast('To tylko podgląd — lokalizacja nie jest używana'); return; }
      if (geoOn) { await disableGeo(); toast('Lokalizacja wyłączona — pozycja usunięta'); } else { await enableGeo(); toast('Wykrywanie działa, gdy Razem jest otwarte ♡'); }
      if (sheet !== 'diag') closeSheet(); else renderSheet(true);
      render(route);
    }
    else if (action === 'toggle-notify') {
      if (DEMO) { toast('To tylko podgląd'); return; }
      await togglePush(!state?.push?.subscribed); render(route); if (sheet === 'diag') renderSheet(true);
    }
    else if (action === 'toggle-sync') { syncOn = el.getAttribute('aria-checked') !== 'true'; if (!DEMO) setPref('sync', syncOn); el.setAttribute('aria-checked', String(syncOn)); if (syncOn) refresh(); }
    else if (action === 'logout') {
      if (!confirm('Odłączyć ten telefon? Wrócisz do pary tylko z kodem logowania (Ustawienia → Pokaż kod). Wasze dane zostają na serwerze.')) return;
      await disableGeo().catch(() => { }); signOut(); closeSheet(); render('onboarding');
    }
  } catch (err) { toast(h(err.message)); }
}

root.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) { e.stopPropagation(); act(b.dataset.action, b); } });
document.addEventListener('click', e => { if (!e.target.closest('#sheet, #ov, #house, #mapfull')) return; const b = e.target.closest('[data-action]'); if (b) act(b.dataset.action, b); });
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
    } else if (form.id === 'name-form') {
      state = await request('/api/name', { name: form.querySelector('#myname').value.trim() }); saveState(); closeSheet(); render(route); toast('Imię zapisane ♥');
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
  if (state.count > old) showCelebration({ n: state.count, rewards: newRewards() });
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
    // the partner's phone asked for a fresh reading ("Sprawdź"): answer right away
    if (next.proximity?.pingAt && next.proximity.pingAt > handledPing) { handledPing = next.proximity.pingAt; freshSend(); }
    // only the readings' ages changed: keep them, no re-render
    if (state && !cached && sig(next) === sig(state)) { state = next; if (sheet === 'diag') renderSheet(true); return; }
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
    promptMeeting();
  } catch (err) {
    if (err.status === 401) { signOut(); stopWatch(); render('onboarding'); }
    else console.warn('Synchronizacja:', err.message);
  } finally { syncing = false; }
}

// ------------------------------------------------------------------ geolocation
// Sharing is opt-in per person and remembered on this phone. While Razem is
// visible the phone watches its position and reports a reading every ~15 s
// (each with the time it was measured); hidden, everything stops: iOS gives
// web apps no background location. The server decides; coordinates are kept
// there for 15 minutes at most.
let geoOn = !DEMO && pref('geo', false), watchId = null, keepAlive = null, lastFix = null, lastSent = 0, sentFixTs = 0, geoError = '', handledPing = Date.now();
const GEO = { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sig = s => JSON.stringify({ ...s, proximity: s.proximity && { ...s.proximity, me: { ...s.proximity.me, age: 0 }, partner: { ...s.proximity.partner, age: 0 }, held: 0 } });
const fix = (opts = {}) => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { ...GEO, maximumAge: 0, timeout: 15000, ...opts }));
const geoErr = e => e?.code === 1 ? 'denied' : e?.code === 2 ? 'unavailable' : 'timeout';
const GEO_TEXT = { denied: 'Brak zgody na lokalizację. Na iPhonie: Ustawienia → Prywatność → Usługi lokalizacji → Razem/Safari → „Podczas używania”.', unavailable: 'Telefon nie może teraz ustalić pozycji. Sprawdź, czy usługi lokalizacji są włączone.', timeout: 'GPS odpowiada zbyt wolno. Spróbuj bliżej okna albo na zewnątrz.' };
// a fresh reading; if GPS is slow (indoors), the last one still counts when it is under a minute old
async function freshFix() {
  try { lastFix = await fix({ timeout: 12000 }); geoError = ''; return lastFix; }
  catch (e) { if (e?.code !== 1 && lastFix && Date.now() - lastFix.timestamp < 60000) return lastFix; geoError = geoErr(e); const err = new Error(GEO_TEXT[geoError]); err.geo = geoError; throw err; }
}
function onFix(pos) { lastFix = pos; if (geoError) { geoError = ''; render(route); } send(); }
function onGeoError(e) {
  const was = geoError; geoError = geoErr(e);
  if (geoError === 'denied') stopWatch();
  if (was !== geoError) { render(route); if (sheet === 'diag' || sheet === 'check') renderSheet(true); }
}
function startWatch() {
  if (!geoOn || DEMO || !token || watchId !== null || !navigator.geolocation || document.visibilityState !== 'visible') return;
  watchId = navigator.geolocation.watchPosition(onFix, onGeoError, GEO);
  // standing still, iOS may stay quiet: ask for a fresh reading when the last one gets old
  keepAlive = setInterval(() => { if (!lastFix || Date.now() - lastFix.timestamp > 14000) navigator.geolocation.getCurrentPosition(onFix, onGeoError, { ...GEO, maximumAge: 0 }); else send(); }, 15000);
}
function stopWatch() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; clearInterval(keepAlive); keepAlive = null; }
// report the last reading (throttled): every new reading after 10 s, or when forced
async function send(path = '/api/location', force = false) {
  if (!lastFix || !token || DEMO || !state) return;
  const now = Date.now();
  if (now - lastFix.timestamp > 110000) return; // too old to prove anything
  if (!force && (lastFix.timestamp === sentFixTs || now - lastSent < 10000)) return;
  sentFixTs = lastFix.timestamp; lastSent = now;
  const c = lastFix.coords, old = state.count, oldStage = state.proximity?.stage + state.proximity?.reason;
  try {
    const next = await request(path, { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, ts: lastFix.timestamp });
    state = next; saveState();
    if (route === 'detect') pairMap.update(mapData());
    if (next.count !== old) { render(route); afterCountChange(old); }
    else if (next.proximity?.stage + next.proximity?.reason !== oldStage && !overlay) { render(route); if (sheet === 'diag' || sheet === 'check') renderSheet(true); }
    promptMeeting();
  } catch (e) { console.warn('Lokalizacja:', e.message); }
}
// a fresh reading now (after a ping from the partner's phone, or coming back to the app)
async function freshSend(path = '/api/location') {
  if (!geoOn || DEMO || !navigator.geolocation) return;
  try { await freshFix(); await send(path, true); } catch (e) { if (e.geo) { render(route); if (sheet === 'diag') renderSheet(true); } }
}
async function enableGeo() {
  if (!navigator.geolocation) throw new Error('Ta przeglądarka nie udostępnia lokalizacji.');
  try { lastFix = await fix({ timeout: 20000 }); } catch (e) { geoError = geoErr(e); throw new Error(GEO_TEXT[geoError]); }
  geoOn = true; geoError = ''; setPref('geo', true);
  await send('/api/location', true); startWatch();
}
async function disableGeo() {
  geoOn = false; setPref('geo', false); stopWatch(); lastFix = null;
  if (token && !DEMO) { state = await request('/api/location-off', {}); saveState(); }
}
// Offer "Jesteśmy razem" once per proximity session (and again when the partner confirmed).
function promptMeeting() {
  const p = state?.proximity; if (!p || overlay || (sheet && sheet !== 'check')) return;
  if (p.stage !== 'together' || p.myConfirm) return;
  const key = `${p.since}:${p.partnerConfirm ? 'p' : ''}`;
  if (promptedSession === key) return;
  promptedSession = key; openSheet('nearby');
}

// "Sprawdź, czy jesteśmy razem": a fresh reading here, a ping to the other
// phone, up to ~20 s waiting for its answer, then a clear result.
let checkRun = null;
async function checkNow() {
  if (DEMO) return toast('To tylko podgląd — lokalizacja nie jest używana');
  if (!state?.connected) return toast('Najpierw połączcie się kodem.');
  checkRun = { phase: 'me' }; openSheet('check');
  try {
    if (!geoOn) await enableGeo();
    await freshFix();
    checkRun.phase = 'partner'; if (sheet === 'check') renderSheet(true);
    await send('/api/check', true);
    for (let i = 0; i < 8 && state.proximity?.stage === 'waiting' && sheet === 'check'; i++) { await sleep(2500); syncing = false; await refresh(); }
  } catch (e) { checkRun.error = e.message || 'Nie udało się sprawdzić.'; }
  checkRun.phase = 'done';
  if (sheet === 'check') renderSheet(true);
}
const ago = ms => ms == null ? '—' : ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} s temu` : ms < 3600000 ? `${Math.round(ms / 60000)} min temu` : 'dawno';
function checkSheet(m) {
  const p = m.pr || {};
  if (checkRun?.phase === 'me' || checkRun?.phase === 'partner') return `<div class="chk"><div class="chk-spin" aria-hidden="true">${I.heart('', 'url(#hg2)')}</div><h2>Sprawdzamy, czy jesteście razem…</h2><p>${checkRun.phase === 'me' ? 'Pobieramy lokalizację tego telefonu.' : `Pytamy telefon ${h(otherName())}…`}</p></div>`;
  if (checkRun?.error) return `<div class="chk"><h2>Nie udało się sprawdzić</h2><p>${h(checkRun.error)}</p><div class="row-btns"><button class="btn-soft" data-action="close">Zamknij</button><button class="btn-main" data-action="check-now">Spróbuj ponownie</button></div></div>`;
  const title = p.stage === 'together' ? 'Wygląda na to, że jesteście razem!' : p.stage === 'recorded' ? 'Jesteście razem ♥' : p.stage === 'near' ? 'Jesteście niedaleko siebie!' : p.stage === 'far' ? 'Jeszcze nie razem' : 'Nie da się tego teraz sprawdzić';
  const btn = p.stage === 'together' ? `<button class="btn-main" data-action="confirm-meeting">${p.needsBoth ? 'Potwierdzam, jesteśmy razem' : 'Zaliczamy spotkanie'} ${I.heart('', '#fff')}</button>`
    : `<div class="row-btns"><button class="btn-soft" data-action="close">Zamknij</button><button class="btn-main" data-action="check-now">Sprawdź ponownie</button></div>`;
  return `<div class="chk done ${p.stage}"><div class="chk-ic" aria-hidden="true">${I.heart('', p.stage === 'together' || p.stage === 'recorded' ? 'url(#hg2)' : 'url(#hg3)')}</div><h2>${title}</h2><p>${reasonText(p)}</p>${p.distance != null ? `<p class="chk-meta">Odległość ok. ${fmtDist(p.distance)} · dokładność ±${p.me?.acc} m / ±${p.partner?.acc} m</p>` : ''}${btn}</div>`;
}
function statusLine(m) {
  const p = m?.pr || {};
  if (!state?.connected) return 'Czekamy na drugą osobę';
  if (!geoOn) return 'Lokalizacja na tym telefonie wyłączona';
  if (geoError === 'denied') return 'Brak zgody na lokalizację';
  return reasonText(p).split('.')[0];
}
// "Status wykrywania spotkań": what works, what does not and why — no raw logs, no coordinates
function diagSheet(m) {
  const p = m.pr || {}, P = h(otherName());
  const row = (ok, label, value, extra = '') => `<div class="dg"><i class="dot ${ok}"></i><div><b>${label}</b><small>${value}</small></div>${extra}</div>`;
  const accTxt = a => a == null ? 'brak pomiaru' : a <= 50 ? `±${a} m — bardzo dobra` : a <= 100 ? `±${a} m — wystarczy z potwierdzeniem` : `±${a} m — za słaba`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<h2>Status wykrywania spotkań</h2><p>Na żywo, na podstawie ostatnich pomiarów obu telefonów.</p>
    ${row(state?.connected ? 'ok' : 'off', 'Para', state?.connected ? `${h(myName())} ♡ ${P} — połączeni` : 'Czekamy, aż druga osoba dołączy kodem')}
    ${row(geoOn && !geoError ? 'ok' : geoOn ? 'warn' : 'off', 'Lokalizacja na tym telefonie', geoError === 'denied' ? 'Brak zgody w ustawieniach iOS' : geoOn ? (geoError ? 'Włączona, ale brak pomiaru GPS' : 'Włączona — wysyłana, gdy Razem jest otwarte') : 'Wyłączona', `<button class="btn-soft sm" data-action="toggle-location">${geoOn ? 'Wyłącz' : 'Włącz'}</button>`)}
    ${row(p.me?.age != null && p.me.age < 120000 ? 'ok' : 'off', 'Ostatnia pozycja tego telefonu', p.me?.age != null ? `${ago(p.me.age)} · ${accTxt(p.me.acc)}` : 'jeszcze nie wysłano')}
    ${row(p.partner?.on && p.partner.age != null && p.partner.age < 120000 ? 'ok' : p.partner?.on ? 'warn' : 'off', `Lokalizacja: ${P}`, !state?.connected ? '—' : !p.partner?.on ? 'nie udostępnia' : p.partner.age != null ? `${ago(p.partner.age)} · ${accTxt(p.partner.acc)}` : 'brak świeżego pomiaru')}
    ${row(p.stage === 'together' ? 'ok' : p.stage === 'recorded' ? 'ok' : 'off', 'Weryfikacja bliskości', p.stage === 'together' ? `trwa${p.held ? ` od ${Math.round(p.held / 1000)} s` : ''}${p.needsBoth ? ' · potrzebne potwierdzenie obojga' : ''}` : p.stage === 'recorded' ? 'spotkanie zaliczone' : p.distance != null ? `odległość ok. ${fmtDist(p.distance)}` : 'nie trwa')}
    ${row(['together', 'recorded'].includes(p.stage) ? 'ok' : 'warn', 'Dlaczego nie zaliczono', reasonText(p))}
    ${row(state?.push?.subscribed ? 'ok' : 'off', 'Powiadomienia', state?.push?.subscribed ? 'włączone na tym telefonie' : !state?.push?.available ? 'niedostępne na serwerze' : !standalone && /iPhone|iPad/.test(navigator.userAgent) ? 'na iPhonie: dodaj Razem do ekranu początkowego' : 'wyłączone', `<button class="btn-soft sm" data-action="toggle-notify">${state?.push?.subscribed ? 'Wyłącz' : 'Włącz'}</button>`)}
    <button class="btn-main" data-action="check-now">Sprawdź, czy jesteśmy razem ${I.heart('', '#fff')}</button>`;
}
// ------------------------------------------------------------------ Web Push
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function togglePush(on) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!on) {
    const reg = await navigator.serviceWorker?.ready; const s = await reg?.pushManager?.getSubscription(); await s?.unsubscribe();
    state = await request('/api/push-unsubscribe', {}); return toast('Powiadomienia wyłączone');
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { if (/iPhone|iPad/.test(navigator.userAgent) && !standalone) return openSheet('push-help'); return toast('Ta przeglądarka nie obsługuje powiadomień push.'); }
  if (!state?.push?.available) return toast('Powiadomienia nie są jeszcze dostępne.');
  if (await Notification.requestPermission() !== 'granted') return toast('Brak zgody na powiadomienia');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(state.push.key) });
  state = await request('/api/push-subscribe', { ...sub.toJSON(), test: true });
  toast('Powiadomienia włączone ♥');
}

window.addEventListener('hashchange', () => { if (state) render(routeFromHash(), true); });
window.addEventListener('popstate', () => { if (state && !location.hash) render('home', true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (overlay) closeOverlay(); else if (sheet) closeSheet(); else if (route === 'house') go('home'); } });
// back to the app (unlock, app switcher, tab, network): sync right away
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (token && syncOn) refresh(); startWatch(); freshSend(); }
  else stopWatch();
});
['focus', 'pageshow', 'online'].forEach(e => addEventListener(e, () => { if (token && syncOn && document.visibilityState === 'visible') refresh(); }));
// no accidental pinch/double-tap zoom of the app shell (iOS ignores user-scalable=no)
['gesturestart', 'gesturechange'].forEach(e => document.addEventListener(e, ev => ev.preventDefault(), { passive: false }));

(async () => {
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('/sw.js').catch(() => { });
  // paint the last known state at once, then ask the server
  if (token && !DEMO) try { const c = JSON.parse(localStorage.getItem(stateKey)); if (c?.rewards) { state = c; cached = true; render(routeFromHash()); } } catch { }
  await refresh();
  // location sharing was switched on earlier on this phone: resume it
  if (geoOn && token) { startWatch(); freshSend(); }
  // demo: ?celebrate=1[&reward=id] plays the meeting animation as a preview
  if (DEMO && params.has('celebrate')) showCelebration({ n: state.count, preview: true, rewards: (params.get('reward') || '').split(',').map(id => BY_ID[id]).filter(Boolean) });
  // live sync while the app is open: the shared counter, rewards and Puszystek's outfit
  setInterval(() => { if (document.visibilityState === 'visible' && token && syncOn) refresh(); }, 6000);
})();
