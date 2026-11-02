// Domek Puszystka: the pair's shared pixel house, five rooms. Layers (back to
// front): the view behind the window (clouds, a butterfly now and then), wall,
// floor, light from the window, then furniture sorted by where it stands, with
// soft shadows. Positions live in the shared inventory (D1) and follow room.js.
// Everything is placed in room pixels times --px, a whole number of device
// pixels, so the pixel art stays crisp.
import { BY_ID, isHouse } from './rewards.js';
import { puszystekHTML } from './puszystek.js';
import { ROOM, ROOMS, ROOM_ORDER, ITEMS, DEFAULTS, DEFAULT_NAMES, arrange, depth, check, clampTo, movable, hostOf, topSpot, inRoom, roomOf } from './room.js';

export { ROOM, ROOMS, ROOM_ORDER, ITEMS, DEFAULTS, DEFAULT_NAMES, roomOf };
export const ART = Object.fromEntries(Object.entries(ITEMS).map(([id, it]) => [id, { src: it.src || it.thumb, w: it.w, h: it.h }]));
const CAT_W = 33; // Puszystek on the room grid
const px = v => `calc(${v} * var(--px))`;

// the slot each placed thing occupies (basics stand in for an empty place)
export const slotOf = id => BY_ID[id]?.slot || ITEMS[id]?.basic || null;
export const placedIds = (outfit = []) => outfit.filter(id => isHouse(BY_ID[id]) && ITEMS[id] && ITEMS[id].zone !== 'bg');
export const positions = (outfit, saved) => arrange(placedIds(outfit), saved || {}, slotOf);

// wall, floor and window view of one room, from the wall papers in the outfit
export function backdrop(outfit = [], room = 'sypialnia') {
  const has = id => outfit.includes(id);
  switch (room) {
    case 'salon': return { wall: `salon-wall-${has('wallPeach') ? 'peach' : 'cream'}`, floor: 'floor-salon', view: 'view-wide' };
    case 'kuchnia': return { wall: `kitchen-wall-${has('wallButter') ? 'butter' : 'mint'}`, floor: has('floorCheckBlue') ? 'floor-checkBlue' : 'floor-check', view: 'view-kitchen' };
    case 'lazienka': return { wall: `bath-wall-${has('wallAqua') ? 'aqua' : 'lav'}`, floor: 'floor-bathtile', view: 'view-round' };
    case 'taras': return { wall: `terrace-sky-${has('skySunset') ? 'sunset' : 'day'}`, floor: 'floor-deck', view: null, sky: true };
    default: {
      const wall = has('wallLavender') ? 'lavender' : has('wallMint') ? 'mint' : 'pink';
      return { wall: `wall-${wall}`, floor: `floor-${has('floorHerring') ? 'herring' : 'planks'}`, view: wall === 'lavender' ? 'view-night' : 'view-day', night: wall === 'lavender', rays: true };
    }
  }
}

function itemHTML(id, [x, y], { sel, fresh, pos }) {
  const it = ITEMS[id];
  const lifted = !!hostOf(id, [x, y], pos);
  const z = depth(id, [x, y], pos);
  const shadow = it.shadow && !lifted ? `<img class="r-shadow px-art" src="/img/house/shadow-${it.shadow}.png" alt="" style="left:${px(x + (it.w - it.shadow) / 2)};top:${px(y + it.h - 3)};width:${px(it.shadow)};height:${px(5)};z-index:${z - 1}" data-for="${id}">` : '';
  const cls = ['r-it', 'px-art', movable(id) ? 'mv' : '', id === sel ? 'sel' : '', id === fresh ? 'fresh' : '', `it-${id}`].filter(Boolean).join(' ');
  const glow = { lamp: [-10, -8, 34, 30], nightLamp: [-10, -8, 32, 28], floorLamp: [-10, -6, 36, 30], fireplace: [4, 10, 36, 34] }[id];
  return `${shadow}<img class="${cls}" data-item="${id}" src="/img/house/${it.src}.png" alt="${BY_ID[id]?.name || DEFAULT_NAMES[id] || ''}" draggable="false" style="left:${px(x)};top:${px(y)};width:${px(it.w)};height:${px(it.h)};z-index:${z}">`
    + (glow ? `<span class="r-glow g-${id}" style="left:${px(x + glow[0])};top:${px(y + glow[1])};width:${px(glow[2])};height:${px(glow[3])};z-index:${z + 1}"></span>` : '');
}

export function roomHTML({ outfit = [], room = {}, fresh = '', sel = '', at = 'sypialnia' } = {}) {
  const all = positions(outfit, room), pos = inRoom(all, at), bg = backdrop(outfit, at), R = ROOMS[at];
  const clouds = (k = 1) => `<span class="r-cloud" style="top:${px(4 * k)};width:${px(9 * k)};height:${px(3 * k)}"></span><span class="r-cloud c2" style="top:${px(10 * k)};width:${px(7 * k)};height:${px(2 * k)}"></span>`;
  const view = R.view ? (() => {
    const [vx, vy, vw, vh] = R.view;
    return `<div class="r-view${at === 'lazienka' ? ' round' : ''}" style="left:${px(vx)};top:${px(vy)};width:${px(vw)};height:${px(vh)}">
      <img class="px-art" src="/img/house/${bg.view}.png" alt="" style="width:100%;height:100%">
      ${bg.night ? '' : clouds()}
      <img class="r-fly px-art" src="/img/items/butterfly.png" alt="" style="width:${px(9)};height:${px(8)}">
    </div>`;
  })() : '';
  const items = Object.entries(pos).map(([id, p]) => itemHTML(id, p, { sel, fresh, pos })).join('');
  // the cat wears his outfit, minus things that belong outdoors
  const wear = outfit.filter(id => !['effect', 'decor', 'theme'].includes(BY_ID[id]?.slot) && !isHouse(BY_ID[id]));
  return `${view}
    <img class="r-bg px-art" src="/img/house/${bg.wall}.png" alt="" style="left:0;top:0;width:100%;height:${px(ROOM.wallH)}">
    ${bg.sky ? `<div class="r-sky" style="left:0;top:0;width:100%;height:${px(60)}">${clouds(2)}<img class="r-fly px-art" src="/img/items/butterfly.png" alt="" style="width:${px(9)};height:${px(8)}"></div>` : ''}
    <img class="r-bg px-art" src="/img/house/${bg.floor}.png" alt="" style="left:0;top:${px(ROOM.wallH)};width:100%;height:${px(ROOM.h - ROOM.wallH)}">
    ${bg.rays ? `<img class="r-rays px-art${bg.night ? ' night' : ''}" src="/img/house/rays.png" alt="" style="left:0;top:0;width:100%;height:100%">` : ''}
    ${items}
    <div class="hcat" style="width:${px(CAT_W)};--x:84;--y:150">${puszystekHTML({ pose: 'home', box: [0, 0, 242], outfit: wear, label: 'Puszystek w domku — dotknij', stagePx: () => 'left:0;top:0;width:100%' })}</div>`;
}

// ------------------------------------------------------------------ editor: drag to place
// Pointer events on the room: press an item to pick it up (lifted, half
// transparent), it follows the finger snapped to the grid, red where it cannot
// stand (zone, collisions), green where it fits; release to place. Small
// things snap onto the furniture they can stand on (the lamp on the
// nightstand, the cake on the table, the duck in the tub). Changes are
// committed through `onMove`.
export class RoomEditor {
  constructor({ onSelect, onMove, onInvalid }) { this.onSelect = onSelect; this.onMove = onMove; this.onInvalid = onInvalid; this.drag = null; }
  attach(roomEl, getPos) {
    this.el = roomEl; this.getPos = getPos;
    roomEl.addEventListener('pointerdown', e => this.down(e));
    roomEl.addEventListener('pointermove', e => this.move(e));
    roomEl.addEventListener('pointerup', e => this.up(e));
    roomEl.addEventListener('pointercancel', e => this.up(e, true));
  }
  scale() { return this.el.getBoundingClientRect().width / ROOM.w; }
  down(e) {
    if (!this.el.closest('.house.editing')) return;
    const img = e.target.closest('.r-it.mv'); if (!img) { if (!e.target.closest('.r-tools')) this.onSelect(''); return; }
    e.preventDefault();
    const id = img.dataset.item, pos = this.getPos(), start = pos[id];
    this.drag = { id, img, start, at: start, sx: e.clientX, sy: e.clientY, moved: false, shadow: this.el.querySelector(`.r-shadow[data-for="${id}"]`) };
    this.el.setPointerCapture?.(e.pointerId);
    this.onSelect(id, true);
  }
  move(e) {
    const d = this.drag; if (!d) return;
    const k = this.scale(), dx = (e.clientX - d.sx) / k, dy = (e.clientY - d.sy) / k;
    if (!d.moved && Math.hypot(dx, dy) < 2) return;
    if (!d.moved) { d.moved = true; d.img.classList.add('lift'); this.el.classList.add('dragging'); }
    const it = ITEMS[d.id], pos = this.getPos();
    let p = clampTo(d.id, d.start[0] + dx, d.start[1] + dy);
    if (it.zone === 'surface') {
      // near a piece of furniture it can stand on: snap onto its top
      const raw = [d.start[0] + dx, d.start[1] + dy];
      for (const h of it.on) if (pos[h]) { const s = topSpot(d.id, h, pos[h]); if (Math.abs(raw[0] - s[0]) < ITEMS[h].w / 2 && Math.abs(raw[1] - s[1]) < 12) { p = [Math.abs(raw[0] - s[0]) <= 4 ? s[0] : Math.max(pos[h][0] - 2, Math.min(pos[h][0] + ITEMS[h].w + 2 - it.w, Math.round(raw[0] / 2) * 2)), s[1]]; break; } }
      if (p[1] < ROOM.wallH + 6 - it.h && !hostOf(d.id, p, pos)) p = clampTo(d.id, p[0], ROOM.wallH + 6 - it.h);
    }
    d.at = p;
    const ok = check(d.id, p, pos).ok;
    d.img.style.left = px(p[0]); d.img.style.top = px(p[1]);
    d.img.style.zIndex = 400; d.img.classList.toggle('bad', !ok); d.img.classList.toggle('good', ok);
    if (d.shadow) { d.shadow.style.left = px(p[0] + (it.w - it.shadow) / 2); d.shadow.style.top = px(p[1] + it.h - 3); }
  }
  up(e, cancel = false) {
    const d = this.drag; if (!d) return; this.drag = null;
    this.el.classList.remove('dragging'); d.img.classList.remove('lift', 'good', 'bad');
    if (!d.moved) return;
    const pos = this.getPos(), res = check(d.id, d.at, pos);
    if (cancel || !res.ok || (d.at[0] === d.start[0] && d.at[1] === d.start[1])) {
      // back where it was, with a little bounce
      d.img.style.left = px(d.start[0]); d.img.style.top = px(d.start[1]); d.img.style.zIndex = depth(d.id, d.start, pos);
      if (d.shadow) { const it = ITEMS[d.id]; d.shadow.style.left = px(d.start[0] + (it.w - it.shadow) / 2); d.shadow.style.top = px(d.start[1] + it.h - 3); }
      d.img.animate?.([{ translate: '0 0' }, { translate: '0 -3px' }, { translate: '0 0' }], { duration: 260 });
      if (!cancel && !res.ok) this.onInvalid?.(res.reason);
      return;
    }
    d.img.classList.add('drop');
    setTimeout(() => d.img.classList.remove('drop'), 400);
    this.onMove(d.id, d.at, d.start);
  }
}
// The nearest free spot for a newly placed item, starting from its default
// (on its furniture when that stands in the room).
export function freeSpot(id, pos) {
  const it = ITEMS[id], start = it.def;
  if (it.zone === 'surface') for (const h of it.on) if (pos[h]) { const s = topSpot(id, h, pos[h]); if (check(id, s, { ...pos, [id]: s }).ok) return s; }
  for (let r = 0; r < 160; r += 4) for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
    const p = clampTo(id, start[0] + dx, Math.max(start[1] + dy, it.zone === 'surface' ? ROOM.wallH + 6 - it.h : -99));
    if (check(id, p, { ...pos, [id]: p }).ok) return p;
  }
  return clampTo(id, ...start);
}

// ------------------------------------------------------------------ life in the house
// Puszystek's spots follow the furniture of the room he is in: [dx, dy] from
// the item's corner (his feet), a weight and what he does there.
const SPOTS = {
  bedBasic: [21, 14, 2, 'sleep'], bedRoyal: [30, 24, 2, 'sleep'], beanbag: [15, 10, 2, 'sit'], cushion: [9, 12, 1, 'sit'],
  toys: [-4, 16, 2, 'play'], plushBear: [-6, 15, 1, 'hug'], wardrobe: [17, 58, 1, 'look'],
  sofaBasic: [22, 22, 3, 'lie'], sofa: [27, 22, 3, 'lie'], armchair: [14, 22, 2, 'sit'], fireplace: [22, 46, 2, 'warm'], catTree: [15, 28, 2, 'perch'],
  toyMouse: [-6, 8, 2, 'play'], pillowHeart: [11, 15, 1, 'sit'], bookcase: [15, 52, 1, 'look'], paintingSea: [15, 80, 1, 'look'],
  bowl: [-8, 8, 3, 'eat'], fridge: [13, 58, 1, 'look'], stove: [15, 36, 1, 'look'], chairs: [8, 26, 1, 'sit'], counterBasic: [20, 36, 1, 'look'],
  tubBasic: [28, 22, 2, 'bath'], mirror: [11, 76, 1, 'look'], bathMat: [20, 8, 2, 'sit'], basket: [-6, 22, 1, 'play'],
  benchBasic: [25, 18, 2, 'sit'], sunbed: [20, 12, 3, 'lie'], flowerBed: [30, 18, 2, 'look'], wateringCan: [-6, 14, 1, 'play'], lemonTree: [8, 52, 1, 'look'], pots: [23, 24, 1, 'look'],
};
const RUGS = id => ITEMS[id]?.zone === 'rug';
export class HouseLife {
  constructor(pusz, reduced) { this.pusz = pusz; this.reduced = reduced; this.timer = 0; this.el = null; this.at = 'mid'; this.mood = () => 'happy'; }
  spots(pos, room) {
    const s = {};
    if (ROOMS[room].win) { const w = ROOMS[room].win; s.window = [(w[0] + w[2]) / 2, 126, 1, 'look']; }
    s.mid = [80, 146, 1, 'sit'];
    for (const [id, p] of Object.entries(pos)) {
      if (SPOTS[id]) { const [dx, dy, wt, act] = SPOTS[id]; s[id] = [p[0] + dx, p[1] + dy, wt, act]; }
      else if (RUGS(id)) s[id] = [p[0] + ITEMS[id].w / 2, p[1] + ITEMS[id].h - 4, 3, 'sit'];
    }
    for (const k of Object.keys(s)) { s[k][0] = Math.max(17, Math.min(ROOM.w - 17, s[k][0])); s[k][1] = Math.max(ROOM.wallH + 14, Math.min(ROOM.h - 1, s[k][1])); }
    return s;
  }
  // `enter`: 'l' / 'r' when he just came in through a side door
  mount(el, pos, room = 'sypialnia', enter = '') {
    this.stop(); this.el = el; this.room = room; this.places = this.spots(pos, room);
    if (!el) return;
    if (enter) {
      this.el.classList.add('no-move'); this.el.style.setProperty('--x', enter === 'l' ? -10 : ROOM.w + 10); this.el.style.setProperty('--y', 150);
      requestAnimationFrame(() => requestAnimationFrame(() => { this.el?.classList.remove('no-move'); this.go('mid', true); }));
      return;
    }
    this.place(this.places[this.at] ? this.at : 'mid', true);
    this.timer = setTimeout(() => this.next(), 4000);
  }
  place(name, instant = false) {
    const [x, y] = this.places[name] || this.places.mid;
    this.at = name;
    if (instant) this.el.classList.add('no-move');
    this.el.style.setProperty('--x', x); this.el.style.setProperty('--y', y);
    this.el.style.zIndex = 10 + Math.round(y) + 1;
    if (instant) requestAnimationFrame(() => this.el?.classList.remove('no-move'));
  }
  pose(p = '') { if (this.el) this.el.dataset.pose = p; }
  async go(name, arriving = false) {
    if (this.pusz.state === 'sleepy') await this.pusz.wake();
    this.pose('');
    const from = parseFloat(this.el.style.getPropertyValue('--x')) || 84;
    this.el.classList.add('walk'); this.el.classList.toggle('flip', (this.places[name] || this.places.mid)[0] < from);
    this.place(name);
    await new Promise(r => setTimeout(r, 1600));
    if (!this.el?.isConnected) return;
    this.el.classList.remove('walk');
    if (arriving) { await this.pusz.play('ears'); await this.pusz.play('hop'); this.timer = setTimeout(() => this.next(), 5000); return; }
    await this.act((this.places[name] || [])[3]);
  }
  // what he does at a spot; how long he stays depends on his mood (energy)
  async act(what) {
    const mood = this.mood(), slow = mood === 'tired' || mood === 'sleepy';
    let stay = 7000 + Math.random() * 6000;
    switch (what) {
      case 'sleep': this.pose('lie'); this.pusz.set('sleepy'); stay = 12000; break;
      case 'lie': this.pose('lie'); if (slow) { this.pusz.set('sleepy'); stay = 11000; } else await this.pusz.play('blink'); break;
      case 'sit': case 'warm': this.pose('sit'); await this.pusz.play(slow ? 'yawn' : 'tail'); break;
      case 'perch': this.pose('perch'); await this.pusz.play('ears'); break;
      case 'play': if (slow) { this.pose('sit'); await this.pusz.play('yawn'); } else { await this.pusz.play('pounce'); await this.pusz.play('giggle'); } break;
      case 'hug': await this.pusz.play('hug'); break;
      case 'eat': this.pose('sit'); await this.pusz.play('eat'); break;
      case 'bath': this.pose('sit'); await this.pusz.play('giggle'); break;
      default: await this.pusz.play('look'); await this.pusz.play('ears');
    }
    if (mood === 'happy' && Math.random() < .3) await this.pusz.play('stretch');
    this.timer = setTimeout(() => this.next(), stay * (slow ? 1.4 : 1));
  }
  async next() {
    if (!this.el?.isConnected || document.hidden) return this.stop();
    if (this.reduced.matches || this.el.closest('.house.editing')) { this.timer = setTimeout(() => this.next(), 5000); return; }
    const opts = Object.entries(this.places).filter(([n]) => n !== this.at);
    let r = Math.random() * opts.reduce((s, [, v]) => s + v[2], 0);
    const [name] = opts.find(([, v]) => (r -= v[2]) < 0) || opts[0];
    await this.go(name);
  }
  // a new or moved item: Puszystek is happy about it
  async cheer() {
    clearTimeout(this.timer);
    if (this.pusz.state === 'sleepy') this.pusz.set('idle');
    this.pose('');
    await this.pusz.celebrate('reward');
    this.timer = setTimeout(() => this.next(), 6000);
  }
  stop() { clearTimeout(this.timer); this.timer = 0; }
}
