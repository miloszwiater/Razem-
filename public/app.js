// Razem — frontend. Three screens (home, rewards, detection) drawn on a 390x860
// design stage; positions come from the reference PNGs (screen px / 1.7615).
// ?demo=1 renders the mock-up data and never writes to the API.

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const cacheKey = 'razem-session-v1';
const S = 687 / 390; // reference screen px per design px
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let token = DEMO ? '' : localStorage.getItem(cacheKey) || '';
let state = null, mode = 'create', route = '', sheet = '', locTimer = null, geoEnabled = false, working = false, selTile = 0;
const pref = (k, d) => { try { const v = localStorage.getItem('razem-' + k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('razem-' + k, v ? '1' : '0'); } catch { } };
let notifyOn = DEMO || pref('notify', false), syncOn = DEMO || pref('sync', true);

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, a, b, c) => { const v = Math.abs(n); return v === 1 ? a : (v % 10 >= 2 && v % 10 <= 4 && (v % 100 < 12 || v % 100 > 14)) ? b : c; };
const dp = v => `calc(${(+v).toFixed(2)} * var(--u))`;
const at = (x, y, w) => `left:${dp(x / S)};top:${dp(y / S)};width:${dp(w / S)}`;
const dateText = ms => new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
const daysSince = date => Math.max(0, Math.floor((Date.now() - new Date(date + 'T12:00:00').getTime()) / 86400000));

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
const CATS = { home: [216, 1211, 242], crown: [95, 1312, 227], cheer: [213, 1273, 241] };
const deco = set => DECO[set].map(([n, x, y, w], i) => `<img class="px ${n.includes('spark') ? 'deco-spark' : 'deco-heart'}" src="/img/${n}.png" alt="" style="${at(x, y, w)};--d:${(-i * 0.73).toFixed(2)}s">`).join('');
const cat = (kind, label, pos = CATS[kind]) => { const [x, y, w] = pos; return `<button class="cat" data-action="cat" data-cat="${kind}" style="${at(x, y, w)}" aria-label="${h(label)}"><img src="/img/cat-${kind}.png" alt=""><img class="blink" src="/img/cat-${kind}-blink.png" alt="" onerror="this.remove()"></button>`; };

// ------------------------------------------------------------------ data
const LADDER = [5, 10, ...Array.from({ length: 200 }, (_, i) => 20 + i * 10)];
const REWARDS = [
  { id: 'crown', at: 20, img: 'tile-crown', label: '<b>Korona<br>dla Puszystka</b>', name: 'Korona dla Puszystka', line: 'Puszystek ma teraz koronę!', emo: 'crown' },
  { id: 'badge', at: 30, img: 'tile-heart', label: 'Nowa<br>odznaka', name: 'Nowa odznaka', line: 'Macie nową serduszkową odznakę!', emo: 'hearts2' },
  { id: 'theme', at: 40, img: 'tile-sky', label: '<b>Motyw tła</b><br>„Różowy zachód”', name: 'Motyw tła „Różowy zachód”', line: 'Odblokowaliście różowy zachód!', emo: 'hearts2' },
  { id: 'gift', at: 50, img: 'tile-gift', label: 'Niespodzianka', name: 'Niespodzianka', line: 'Puszystek ma dla was niespodziankę!', emo: 'hearts2' },
];
const DEMO_DAY = 86400000;
function demoState() {
  const now = Date.now();
  return {
    you: 1, connected: true, together: true, code: null, count: 27,
    members: [{ name: 'Miłosz', slot: 1 }, { name: 'Ola', slot: 2 }],
    firstMetAt: new Date(now - 214 * DEMO_DAY).toISOString().slice(0, 10),
    meetings: [{ id: 'd1', occurred_at: now - 3 * DEMO_DAY - 3600000, source: 'auto' }, { id: 'd2', occurred_at: now - 9 * DEMO_DAY, source: 'manual' }],
  };
}

function model() {
  const n = Number(state?.count) || 0;
  const gi = LADDER.findIndex(v => v > n);
  const goal = LADDER[gi], next = LADDER[gi + 1];
  const level = gi + 1;
  const start = Math.max(0, gi + 1 - 5);
  const nodes = LADDER.slice(start, start + 6);
  const last = state?.meetings?.[0];
  const d = last ? Math.max(0, Math.floor((Date.now() - last.occurred_at) / 86400000)) : null;
  const m = {
    n, goal, next, level, levelGoal: goal, nodes, together: !!state?.together, d,
    left: goal - n,
    days: state?.firstMetAt ? daysSince(state.firstMetAt) : null,
    unlocked: REWARDS.filter(r => n >= r.at),
  };
  if (DEMO) Object.assign(m, { goal: 50, next: 60, level: 4, levelGoal: 50, left: 23, nodes: [10, 20, 30, 40, 50, 60], reachedAll: 5 });
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
  if (!res.ok) throw new Error(json.error || 'Wystąpił błąd.');
  return json;
}

// ------------------------------------------------------------------ shell
function shell() {
  root.innerHTML = `<div class="app" data-route="${route}">
    <div class="stage">
      <div class="plates"><img class="plate-home" src="/img/header-home.webp" alt=""><img class="plate-rewards" src="/img/header-rewards.webp" alt=""><img class="plate-detect" src="/img/header-detect.webp" alt=""></div>
      <div class="views" id="views"></div>
      <header class="hdr">
        <button class="back" data-action="home" aria-label="Wróć">${I.back}</button>
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

function viewHome(m) {
  const pct = DEMO ? 61 : Math.min(100, Math.max(0, (m.n / m.levelGoal) * 100));
  return `
  <section class="card hero tap rise" style="--i:0" data-action="meeting" aria-label="Licznik spotkań">
    <img class="plate" src="/img/hero-home.webp" alt="">
    ${I.heart('hero-heart')}
    <svg class="count" viewBox="0 0 365 92" role="img" aria-label="${m.n}" data-count="${m.n}"><text x="182.5" y="68.5" text-anchor="middle">${m.n}</text></svg>
    <p class="count-label">${plural(m.n, 'spotkanie na żywo', 'spotkania na żywo', 'spotkań na żywo')}</p>
    <p class="count-sub">${I.heart()}liczone wspólnie</p>
    <div class="panel" data-action="rewards">
      <p class="panel-title">Pasek spotkań</p>
      <p class="ratio"><b>${m.n}</b> / ${m.levelGoal}</p>
      <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${m.levelGoal}" aria-valuenow="${m.n}"><div class="fill" data-w="${pct}">${hearts4()}</div></div>
      <button class="gift ${m.left <= 3 ? 'ready' : ''}" data-action="rewards" aria-label="Nagrody">${I.gift}</button>
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
  ${deco('home')}
  ${cat('home', 'Puszystek — pogłaszcz')}
  <div class="bubble" ${!DEMO && state && !state.connected ? 'data-action="copy"' : ''}>${phrase(m)}</div>`;
}
const hearts4 = () => [8.6, 15.8, 34, 64.6].map((l, i) => `<span class="wh" style="left:${dp(l + 22)};animation-delay:${i * .4}s">${I.heart('', '#fff')}</span>`).join('');

function viewRewards(m) {
  const pctLevel = DEMO ? 63 : Math.min(100, (m.n / m.levelGoal) * 100);
  const xs = [49.4, 105.6, 162.4, 219.1, 275.9, 336.6];
  const barFill = m.reached <= 0 ? 0 : Math.min(1, (xs[Math.min(m.reached, 5) - 1] - 49.4) / (xs[5] - 49.4));
  const lastUnlocked = m.unlocked.at(-1);
  const nextReward = REWARDS.find(r => m.n < r.at);
  return `
  <section class="card wide goal rise" style="--i:0">
    <img class="plate" src="/img/goal-rewards.webp" alt="">
    <h2>Cel rośnie razem z wami</h2>
    <p class="sub">Im więcej czasu razem, tym większe cele<br>i jeszcze więcej nagród!</p>
    <p class="big-num cur">${m.goal}</p><p class="big-lbl cur">Aktualny cel</p>
    <p class="big-num new">${m.next}</p><p class="big-lbl new">Nowy cel</p>
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
    <button class="see-all" data-action="all-rewards">Zobacz wszystkie ${I.chev('')}</button>
    <button class="nav-arrow l" data-action="tile-prev" aria-label="Poprzednia nagroda">${I.chevL}</button>
    <div class="tiles">${REWARDS.map((r, i) => `<button class="tile ${m.n >= r.at ? '' : 'locked'} ${selTile === i && selTile !== -1 && document.body.dataset.tiles ? 'sel' : ''}" data-action="tile" data-i="${i}" style="left:${dp([-1.4, 85.6, 172.4, 254.2][i])}"><span class="art"><img src="/img/${r.img}.webp" alt="">${m.n >= r.at ? `<span class="ok">${I.check}</span>` : ''}</span><p>${r.label}</p></button>`).join('')}</div>
    <button class="nav-arrow r" data-action="tile-next" aria-label="Następna nagroda">${I.chev('')}</button>
  </section>
  <section class="unlock">
    <img class="plate" src="/img/unlock-rewards.webp" alt="" style="width:100%">
    ${lastUnlocked
      ? `<h3>Kolejny odblokowany prezent</h3><p>${h(lastUnlocked.line)} ${I[lastUnlocked.emo]}<br>Jeszcze więcej radości razem! ${I.hearts2}</p>`
      : `<h3>Pierwszy prezent już blisko</h3><p>Jeszcze ${nextReward.at - m.n} ${plural(nextReward.at - m.n, 'spotkanie', 'spotkania', 'spotkań')} do korony! ${I.crown}<br>Puszystek już nie może się doczekać ${I.hearts2}</p>`}
    <button class="btn-super" data-action="super">Super! ${I.heart('', '#fff')}</button>
  </section>
  ${deco('rew')}
  ${m.unlocked.some(r => r.id === 'crown') ? cat('crown', 'Puszystek w koronie') : cat('home', 'Puszystek', [110, 1318, 220])}`;
}
const hearts3 = () => [27, 52, 74].map((l, i) => `<span class="wh" style="left:${dp(l)};animation-delay:${i * .5}s">${I.heart('', '#fff')}</span>`).join('');

function viewDetect(m) {
  const together = DEMO || m.together;
  const title = together ? 'Spotkanie wykryte!' : geoEnabled ? 'Szukamy siebie…' : 'Wykrywanie spotkań';
  const sub = together ? `Jesteście razem ${I.sparkHeart}` : geoEnabled ? 'Lokalizacja działa, gdy aplikacja jest otwarta' : 'Włączcie lokalizację na obu telefonach';
  return `
  <section class="card det rise" style="--i:0">
    <img class="plate" src="/img/detect-top.webp" alt="" style="height:auto">
    <div class="burst">${I.heart('bh')}<i></i><i></i><i></i><i></i></div>
    <h2>${title}</h2>
    <p class="sub">${sub}</p>
    <div class="map">
      <img class="bg" src="/img/map.webp" alt="Poglądowa mapa okolicy">
      <span class="glow"></span>
      ${I.heart('map-heart')}
      <div class="chips"><img class="boy" src="/img/chip-boy.png" alt="${h(state?.members?.[0]?.name || '')}"><img class="girl" src="/img/chip-girl.png" alt="${h(state?.members?.[1]?.name || '')}"></div>
      <div class="map-bubble">${together ? `Jesteście razem! ${I.hearts2}` : 'Jeszcze osobno'}</div>
      <button class="locate" data-action="locate" aria-label="Wyśrodkuj">${I.locate}</button>
      <div class="acc">${I.pin()}Dokładność: w przybliżeniu${I.info()}</div>
      ${DEMO ? '<span class="preview-tag">Podgląd</span>' : ''}
    </div>
    <div class="caption">${I.heart()}<p>Gdy obie osoby są blisko siebie,<br>spotkanie zapisuje się <em>automatycznie.</em></p></div>
  </section>
  <section class="card row rise" style="--i:1;top:${dp(525.1)}"><span class="ic loc">${I.pin('')}</span><h4>Lokalizacja</h4><p>Pozwala wykrywać, kiedy jesteście razem.</p><button class="switch" role="switch" aria-checked="${DEMO || geoEnabled}" data-action="toggle-location" aria-label="Lokalizacja"></button></section>
  <section class="card row rise" style="--i:2;top:${dp(583.2)}"><span class="ic bell">${I.bell}</span><h4>Powiadomienia</h4><p>Otrzymujecie informację, gdy się spotkacie.</p><button class="switch" role="switch" aria-checked="${notifyOn}" data-action="toggle-notify" aria-label="Powiadomienia"></button></section>
  <section class="card row rise" style="--i:3;top:${dp(641.6)};height:${dp(64.4)}"><span class="ic sync" style="top:${dp(11.6)}">${I.sync}</span><h4>Wspólna synchronizacja</h4><p>Spotkania zapisują się automatycznie<br>w Waszym pasku.</p><button class="switch" role="switch" aria-checked="${syncOn}" data-action="toggle-sync" aria-label="Wspólna synchronizacja" style="top:${dp(14.2)}"></button></section>
  <img class="meadow-bg" src="/img/meadow-detect.webp" alt="" style="position:absolute;left:0;width:100%;top:${dp(1245 / S)}">
  ${deco('det')}
  ${together ? cat('cheer', 'Puszystek cieszy się') : cat('home', 'Puszystek', [225, 1280, 230])}
  <div class="hurra">${together ? `<b>Hurra!</b><span>Jesteście razem! ${I.hearts2}</span>` : `<b>Hej!</b><span>Czekam na was ${I.hearts2}</span>`}</div>`;
}

function viewOnboarding() {
  return `
  <section class="card welcome rise">
    <h2>Wasz mały świat</h2>
    <p class="sub">Liczcie wspólne spotkania i zbierajcie nagrody z Puszystkiem.</p>
    <div class="seg" role="group"><button aria-pressed="${mode === 'create'}" data-action="mode-create">Stwórz parę</button><button aria-pressed="${mode === 'join'}" data-action="mode-join">Dołącz z kodem</button></div>
    <form id="start-form">
      <label class="field-l" for="name">Jak masz na imię?</label>
      <input id="name" class="field" maxlength="28" minlength="2" placeholder="Twoje imię" required autocomplete="given-name">
      ${mode === 'join' ? '<label class="field-l" for="code">Kod od drugiej osoby</label><input id="code" class="field" maxlength="11" placeholder="Np. ABCD1234" required autocapitalize="characters" autocomplete="off">' : ''}
      <button class="btn-main" type="submit">${mode === 'create' ? 'Stwórz nasz świat' : 'Połącz nasze światy'} ${I.heart('', '#fff')}</button>
    </form>
    <p class="note">Bez konta i bez reklam. Działa na dwóch telefonach.</p>
  </section>
  <img class="meadow-bg" src="/img/meadow-home.webp" alt="" style="position:absolute;left:0;width:100%;top:${dp(1150 / S)}">
  ${deco('home')}
  ${cat('home', 'Puszystek')}
  <div class="bubble">Puszystek czeka na waszą historię ${I.hearts2}</div>`;
}

// ------------------------------------------------------------------ render + transitions
const ROUTES = { '': 'home', '#/nagrody': 'rewards', '#/spotkanie': 'detect' };
const HASH = { home: '', rewards: '#/nagrody', detect: '#/spotkanie' };
const ORDER = { onboarding: 0, home: 0, rewards: 1, detect: 2 };
const routeFromHash = () => ROUTES[location.hash] || 'home';

function render(next, animate = false) {
  const prev = route;
  route = state ? next : 'onboarding';
  if (!root.querySelector('.app')) shell();
  const app = root.querySelector('.app');
  app.dataset.route = route;
  const views = document.getElementById('views');
  const m = state ? model() : null;
  const html = route === 'onboarding' ? viewOnboarding() : route === 'rewards' ? viewRewards(m) : route === 'detect' ? viewDetect(m) : viewHome(m);
  const v = document.createElement('div');
  v.className = 'view';
  v.dataset.route = route;
  v.innerHTML = html;
  const old = [...views.children];
  if (animate && old.length && prev !== route) {
    const backNav = ORDER[route] < ORDER[prev];
    v.classList.add('enter'); if (backNav) v.classList.add('back-nav');
    old.forEach(o => { o.classList.remove('enter'); o.classList.add('leave'); if (backNav) o.classList.add('back-nav'); setTimeout(() => o.remove(), 340); });
    window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
  } else {
    old.forEach(o => o.remove());
    if (!animate) v.querySelectorAll('.rise').forEach(e => e.classList.remove('rise'));
  }
  views.appendChild(v);
  settle(v, animate || !old.length);
}

// After a view is in the DOM: grow progress bars, count up numbers.
function settle(v, fresh) {
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

// ------------------------------------------------------------------ Puszystek
function hop(catEl, n = 5) {
  if (!catEl) return;
  catEl.classList.remove('hop'); void catEl.offsetWidth; catEl.classList.add('hop');
  setTimeout(() => catEl.classList.remove('hop'), 800);
  if (reduced.matches) return;
  const r = catEl.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const img = document.createElement('img');
    img.className = 'burst-heart'; img.src = i % 3 === 2 ? '/img/home-spark-5.png' : '/img/home-heart-' + (i % 3) + '.png'; img.alt = '';
    img.style.left = r.left + r.width / 2 - 8 + 'px'; img.style.top = r.top + r.height * .25 + 'px';
    img.style.setProperty('--dx', ((Math.random() - .5) * 180).toFixed(0) + 'px');
    img.style.setProperty('--dy', (-60 - Math.random() * 90).toFixed(0) + 'px');
    img.style.setProperty('--r', ((Math.random() - .5) * 50).toFixed(0) + 'deg');
    img.style.animationDelay = i * 60 + 'ms';
    document.body.appendChild(img); setTimeout(() => img.remove(), 1700 + i * 60);
  }
}
// a small heart drifts up from Puszystek every few seconds
setInterval(() => {
  if (document.hidden || reduced.matches || DEMO && params.has('still')) return;
  const c = document.querySelector('.view:not(.leave) .cat'); if (!c) return;
  const v = c.closest('.view');
  const img = document.createElement('img');
  img.className = 'rise-heart'; img.src = '/img/home-heart-2.png'; img.alt = '';
  img.style.left = `calc(${c.style.left} + ${c.style.width} * ${(.3 + Math.random() * .4).toFixed(2)})`;
  img.style.top = c.style.top;
  img.style.setProperty('--dx', ((Math.random() - .5) * 30).toFixed(0) + 'px');
  v.appendChild(img); setTimeout(() => img.remove(), 2700);
}, 4200);

// ------------------------------------------------------------------ sheets
function openSheet(name) { sheet = name; renderSheet(); }
function closeSheet() {
  const bg = document.getElementById('sheet'); sheet = '';
  if (!bg) return; bg.classList.add('out'); setTimeout(() => bg.remove(), 240);
}
function renderSheet() {
  document.getElementById('sheet')?.remove();
  if (!sheet) return;
  const m = state ? model() : null;
  let c = '';
  if (sheet === 'settings') c = `<h2>Ustawienia</h2><p>Wszystko, czego potrzebujecie, w jednym miejscu.</p>
    <div class="set"><div><b>Wasza para</b><small>${h(myName())} + ${h(otherName())}</small></div>${I.heart('emo')}</div>
    <div class="set"><div><b>Data pierwszego spotkania</b><small>Od niej liczymy dni razem.</small></div><button class="btn-soft" data-action="first-date">${h(state?.firstMetAt || 'Ustaw')}</button></div>
    <div class="set"><div><b>Zapisz spotkanie</b><small>Dodajcie spotkanie ręcznie.</small></div><button class="btn-soft" data-action="meeting">Dodaj</button></div>
    ${state && !state.connected ? `<div class="set"><div><b>Kod zaproszenia</b><small>Druga osoba wybiera „Dołącz z kodem”.</small><div class="code">${h(state.code || '')}</div></div><button class="btn-soft" data-action="copy">Kopiuj</button></div>` : ''}
    <p>Imiona i licznik są na wspólnym serwerze. Pozycja jest tymczasowa — nie tworzymy historii lokalizacji.</p>
    <button class="btn-soft wide" data-action="history">Historia spotkań</button><div style="height:8px"></div>
    <button class="btn-soft wide btn-danger" data-action="logout">Odłącz ten telefon</button>`;
  else if (sheet === 'history') c = `<h2>Wasze spotkania</h2><p>Ta sama historia na obu telefonach. Pomyłki można usunąć.</p>
    ${state.meetings.length ? state.meetings.map(e => `<div class="hist"><div><b>${dateText(e.occurred_at)}</b><small>${e.source === 'auto' ? 'Wykryte automatycznie' : 'Dodane ręcznie'}</small></div><button data-action="delete" data-id="${h(e.id)}">Usuń</button></div>`).join('') : '<div class="empty">Jeszcze nie zapisaliście żadnego spotkania.</div>'}`;
  else if (sheet === 'first-date') c = `<h2>Wasz pierwszy dzień</h2><p>Ustawcie datę pierwszego spotkania — oboje zobaczycie ten sam licznik dni.</p>
    <form id="date-form"><label class="field-l" for="startdate">Data</label><input class="field" id="startdate" required type="date" max="${new Date().toISOString().slice(0, 10)}" value="${h(state?.firstMetAt || '')}"><button type="submit" class="btn-main">Zapisz datę ${I.heart('', '#fff')}</button></form>`;
  else if (sheet === 'meeting') c = `<h2>Zapisać spotkanie?</h2><p>Licznik jest wspólny — druga osoba od razu zobaczy nowe spotkanie.</p>
    <form id="meeting-form"><label class="field-l" for="mdate">Kiedy?</label><input class="field" id="mdate" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}"><button type="submit" class="btn-main">Zapisz spotkanie ${I.heart('', '#fff')}</button></form>`;
  else if (sheet === 'location-info') c = `<h2>Auto-zliczanie</h2><p>Gdy oboje włączycie lokalizację i macie otwartą aplikację, wykryjemy, że jesteście blisko siebie.</p>
    <p>Przy odległości do ok. 150 m przez 10 minut dodamy jedno spotkanie. Kolejne zostanie wykryte, gdy aplikacje zauważą, że byliście osobno przez 30 minut.</p>
    <p><b>Ważne:</b> PWA na iPhonie nie lokalizuje niezawodnie w tle. Jeśli automatyka nie zadziała, dotknijcie licznika, by zapisać spotkanie ręcznie.</p>
    <button class="btn-main" data-action="toggle-location">${geoEnabled ? 'Wyłącz lokalizację' : 'Włącz, gdy korzystam z aplikacji'}</button>`;
  else if (sheet === 'all-rewards') c = `<h2>Wszystkie nagrody</h2><p>Każdy próg odblokowuje coś nowego, a cel rośnie razem z wami.</p>
    ${REWARDS.map(r => `<div class="set"><div><b>${h(r.name)}</b><small>${r.at} ${plural(r.at, 'spotkanie', 'spotkania', 'spotkań')}</small></div><span class="tag ${m.n >= r.at ? '' : 'off'}">${m.n >= r.at ? 'Odblokowane' : 'Jeszcze ' + (r.at - m.n)}</span></div>`).join('')}`;
  else if (sheet.startsWith('tile-')) { const r = REWARDS[+sheet.slice(5)]; c = `<h2>${h(r.name)}</h2><p>${m.n >= r.at ? 'Odblokowane — ' + h(r.line) : `Odblokujecie po ${r.at} spotkaniach. Zostało jeszcze ${r.at - m.n}.`}</p><button class="btn-main" data-action="close">Dobrze ${I.heart('', '#fff')}</button>`; }
  const bg = document.createElement('div');
  bg.className = 'sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${h(sheet)}">${c}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg);
}

// ------------------------------------------------------------------ actions
function go(r) { const hsh = HASH[r]; if ((location.hash || '') === hsh) return render(r, true); if (hsh) location.hash = hsh; else history.pushState(null, '', location.pathname + location.search); if (!hsh) render('home', true); }

async function act(action, el) {
  try {
    if (action === 'home') go('home');
    else if (action === 'rewards') go('rewards');
    else if (action === 'detect') go('detect');
    else if (action === 'mode-create' || action === 'mode-join') { mode = action.split('-')[1]; render('onboarding'); }
    else if (['settings', 'history', 'first-date', 'location-info', 'all-rewards', 'meeting'].includes(action)) { if (!state && action !== 'location-info') return; openSheet(action); }
    else if (action === 'close') closeSheet();
    else if (action === 'cat') hop(el, 6);
    else if (action === 'super') { hop(document.querySelector('.view:not(.leave) .cat'), 9); el.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'ease-out' }); }
    else if (action === 'tile' || action === 'tile-prev' || action === 'tile-next') {
      if (action === 'tile') { openSheet('tile-' + el.dataset.i); return; }
      selTile = (selTile + (action === 'tile-next' ? 1 : REWARDS.length - 1)) % REWARDS.length;
      document.querySelectorAll('.view:not(.leave) .tile').forEach((t, i) => t.classList.toggle('sel', i === selTile));
    }
    else if (action === 'locate') { const g = document.querySelector('.view:not(.leave) .chips'); g?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' }); }
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
      if (!confirm('Odłączyć ten telefon? Bez kodu odzyskiwania utracisz dostęp do tej pary.')) return;
      stopGeo(); localStorage.removeItem(cacheKey); token = ''; state = null; closeSheet(); render('onboarding');
    }
  } catch (err) { toast(h(err.message)); }
}

root.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) { e.stopPropagation(); act(b.dataset.action, b); } });
document.addEventListener('click', e => { if (!e.target.closest('#sheet')) return; const b = e.target.closest('[data-action]'); if (b) act(b.dataset.action, b); });
document.addEventListener('submit', async e => {
  e.preventDefault(); const form = e.target; if (working) return; working = true;
  const btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (form.id === 'start-form') {
      const name = form.querySelector('#name').value.trim();
      if (DEMO) throw new Error('To tylko podgląd — nic nie zapisujemy ♡');
      const res = mode === 'create' ? await request('/api/create', { name }) : await request('/api/join', { name, code: form.querySelector('#code').value });
      token = res.token; localStorage.setItem(cacheKey, token); state = null;
      await refresh(); toast(mode === 'create' ? 'Wasz świat jest gotowy ♥' : 'Jesteście połączeni! ♥');
    } else if (form.id === 'date-form') {
      state = await request('/api/first-date', { date: form.querySelector('#startdate').value }); closeSheet(); render(route); toast('Data zapisana ♥');
    } else if (form.id === 'meeting-form') {
      const d = form.querySelector('#mdate').value, today = new Date().toISOString().slice(0, 10);
      const old = state.count;
      state = await request('/api/meeting', d && d !== today ? { at: d + 'T12:00:00' } : {});
      closeSheet(); render(route); celebrate(old); toast('Wasze spotkanie zostało zapisane ♥');
    }
  } catch (err) { toast(h(err.message)); } finally { working = false; if (btn) btn.disabled = false; }
});

function celebrate(old) {
  const c = document.querySelector('.view:not(.leave) .count');
  if (c && !reduced.matches) { countUp(c, old, state.count, 700); c.classList.add('pop'); setTimeout(() => c.classList.remove('pop'), 700); }
  hop(document.querySelector('.view:not(.leave) .cat'), 8);
}

async function refresh() {
  if (DEMO) { state = state || demoState(); return render(routeFromHash()); }
  if (!token) return render('onboarding');
  try {
    const next = await request('/api/state');
    const old = state?.count;
    if (state && JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    if (!sheet || old === undefined) render(route === 'onboarding' || !route ? routeFromHash() : route);
    if (old !== undefined && next.count > old) { celebrate(old); toast('Nowe spotkanie! Puszystek skacze z radości ♥'); notify('Nowe spotkanie!', 'Puszystek skacze z radości ♥'); }
  } catch (err) {
    if (err.message.includes('Sesja wygasła')) { localStorage.removeItem(cacheKey); token = ''; state = null; stopGeo(); render('onboarding'); }
    else console.warn('Synchronizacja:', err.message);
  }
}
function notify(title, body) { try { if (notifyOn && document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon.svg' }); } catch { } }

// ------------------------------------------------------------------ geolocation (unchanged behaviour)
async function startGeo() {
  if (!navigator.geolocation) throw new Error('Ta przeglądarka nie udostępnia lokalizacji.');
  await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(async pos => { try { await sendGeo(pos); resolve(); } catch (err) { reject(err); } }, () => reject(new Error('Brak zgody na lokalizację. Sprawdź ustawienia telefonu.')), { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 }));
  geoEnabled = true;
  const send = () => { if (document.visibilityState !== 'visible') return; navigator.geolocation.getCurrentPosition(pos => sendGeo(pos).catch(() => { }), () => { }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 12000 }); };
  locTimer = setInterval(send, 90000);
  toast('Wykrywanie jest aktywne, gdy aplikacja jest otwarta ♡');
}
async function sendGeo(pos) {
  const c = pos.coords; if (!c || c.accuracy > 1500) return;
  const next = await request('/api/location', { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy });
  if (next?.count !== state?.count) { const old = state.count; state = next; render(route); celebrate(old); toast('Spotkanie wykryte automatycznie ♥'); notify('Spotkanie wykryte!', 'Jesteście razem ♥'); }
  else if (next?.together !== state?.together) { state = next; render(route); }
}
function stopGeo() { geoEnabled = false; clearInterval(locTimer); locTimer = null; if (token && !DEMO) request('/api/location-off', {}).catch(() => { }); }

window.addEventListener('hashchange', () => { if (state) render(routeFromHash(), true); });
window.addEventListener('popstate', () => { if (state && !location.hash) render('home', true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) closeSheet(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && token && syncOn) { refresh(); if (geoEnabled) navigator.geolocation.getCurrentPosition(pos => sendGeo(pos).catch(() => { }), () => { }, { maximumAge: 60000, timeout: 12000 }); }
});

(async () => {
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('/sw.js').catch(() => { });
  await refresh();
  setInterval(() => { if (document.visibilityState === 'visible' && token && syncOn && !sheet) refresh(); }, 15000);
})();
