// Domek Puszystka: the pair's shared pixel room. Layers (back to front): the
// view behind the window (clouds, a butterfly now and then), wall, floor,
// light from the window, then furniture sorted by where it stands, with soft
// shadows. Positions live in the shared inventory (D1) and follow room.js.
// Everything is placed in room pixels times --px, a whole number of device
// pixels, so the pixel art stays crisp.
import { BY_ID, isHouse } from './rewards.js';
import { puszystekHTML } from './puszystek.js';
import { ROOM, ITEMS, DEFAULTS, DEFAULT_NAMES, arrange, depth, check, clampTo, movable, onStand, standSpot } from './room.js';

export { ROOM, ITEMS, DEFAULTS, DEFAULT_NAMES };
export const ART = Object.fromEntries(Object.entries(ITEMS).map(([id, it]) => [id, { src: it.src || it.thumb, w: it.w, h: it.h }]));
const CAT_W = 33, CAT_H = 27.4; // Puszystek on the room grid
const px = v => `calc(${v} * var(--px))`;

export const placedIds = (outfit = []) => outfit.filter(id => isHouse(BY_ID[id]) && ITEMS[id] && ITEMS[id].zone !== 'bg');
export function backdrop(outfit = []) {
  const wall = outfit.includes('wallLavender') ? 'lavender' : outfit.includes('wallMint') ? 'mint' : 'pink';
  return { wall, floor: outfit.includes('floorHerring') ? 'herring' : 'planks', night: wall === 'lavender' };
}
export const positions = (outfit, room) => arrange(placedIds(outfit), room || {});
// the slot each placed thing occupies (basics stand in for an empty bed / rug place)
export const slotOf = id => BY_ID[id]?.slot || (id === 'bedBasic' ? 'hBed' : id === 'rugBasic' ? 'hRug' : null);

function itemHTML(id, [x, y], { sel, fresh, pos }) {
  const it = ITEMS[id];
  const lifted = id === 'lamp' && pos.nightstand && onStand([x, y], pos.nightstand);
  const shadow = it.shadow && !lifted ? `<img class="r-shadow px-art" src="/img/house/shadow-${it.shadow}.png" alt="" style="left:${px(x + (it.w - it.shadow) / 2)};top:${px(y + it.h - 3)};width:${px(it.shadow)};height:${px(5)};z-index:${depth(id, [x, y]) - 1}" data-for="${id}">` : '';
  const cls = ['r-it', 'px-art', movable(id) ? 'mv' : '', id === sel ? 'sel' : '', id === fresh ? 'fresh' : '', `it-${id}`].filter(Boolean).join(' ');
  return `${shadow}<img class="${cls}" data-item="${id}" src="/img/house/${it.src}.png" alt="${BY_ID[id]?.name || DEFAULT_NAMES[id] || ''}" draggable="false" style="left:${px(x)};top:${px(y)};width:${px(it.w)};height:${px(it.h)};z-index:${depth(id, [x, y])}">`
    + (id === 'lamp' ? `<span class="r-glow" style="left:${px(x - 10)};top:${px(y - 8)};width:${px(34)};height:${px(30)};z-index:${depth(id, [x, y]) + 1}"></span>` : '');
}

export function roomHTML({ outfit = [], room = {}, fresh = '', sel = '' } = {}) {
  const pos = positions(outfit, room), bg = backdrop(outfit);
  const [gx, gy] = ROOM.glass, gw = ROOM.win[2] - ROOM.win[0] - 4, gh = ROOM.win[3] - ROOM.win[1] - 4;
  const view = `<div class="r-view" style="left:${px(gx)};top:${px(gy)};width:${px(gw)};height:${px(gh)}">
      <img class="px-art" src="/img/house/view-${bg.night ? 'night' : 'day'}.png" alt="" style="width:100%;height:100%">
      ${bg.night ? '' : `<span class="r-cloud" style="top:${px(4)};width:${px(9)};height:${px(3)}"></span><span class="r-cloud c2" style="top:${px(10)};width:${px(7)};height:${px(2)}"></span>`}
      <img class="r-fly px-art" src="/img/items/butterfly.png" alt="" style="width:${px(9)};height:${px(8)}">
    </div>`;
  const items = Object.entries(pos).map(([id, p]) => itemHTML(id, p, { sel, fresh, pos })).join('');
  // the cat wears his outfit, minus things that belong outdoors
  const wear = outfit.filter(id => !['effect', 'decor', 'theme'].includes(BY_ID[id]?.slot) && !isHouse(BY_ID[id]));
  return `${view}
    <img class="r-bg px-art" src="/img/house/wall-${bg.wall}.png" alt="" style="left:0;top:0;width:100%;height:${px(ROOM.wallH)}">
    <img class="r-bg px-art" src="/img/house/floor-${bg.floor}.png" alt="" style="left:0;top:${px(ROOM.wallH)};width:100%;height:${px(ROOM.h - ROOM.wallH)}">
    <img class="r-rays px-art${bg.night ? ' night' : ''}" src="/img/house/rays.png" alt="" style="left:0;top:0;width:100%;height:100%">
    ${items}
    <div class="hcat" style="width:${px(CAT_W)};--x:84;--y:150">${puszystekHTML({ pose: 'home', box: [0, 0, 242], outfit: wear, label: 'Puszystek w domku — dotknij', stagePx: () => 'left:0;top:0;width:100%' })}</div>`;
}

// ------------------------------------------------------------------ editor: drag to place
// Pointer events on the room: press an item to pick it up (lifted, half
// transparent), it follows the finger snapped to the grid, red where it cannot
// stand (zone, collisions), green where it fits; release to place. The lamp
// snaps onto the nightstand. Changes are committed through `onMove`.
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
    let p = clampTo(d.id, d.start[0] + dx, d.start[1] + dy);
    const pos = this.getPos();
    if (d.id === 'lamp' && pos.nightstand) { const s = standSpot(pos.nightstand); if (Math.abs(p[0] - s[0]) < 10 && Math.abs(p[1] - s[1]) < 12) p = s; }
    d.at = p;
    const ok = check(d.id, p, pos).ok;
    d.img.style.left = px(p[0]); d.img.style.top = px(p[1]);
    d.img.style.zIndex = 400; d.img.classList.toggle('bad', !ok); d.img.classList.toggle('good', ok);
    if (d.shadow) { const it = ITEMS[d.id]; d.shadow.style.left = px(p[0] + (it.w - it.shadow) / 2); d.shadow.style.top = px(p[1] + it.h - 3); }
  }
  up(e, cancel = false) {
    const d = this.drag; if (!d) return; this.drag = null;
    this.el.classList.remove('dragging'); d.img.classList.remove('lift', 'good', 'bad');
    if (!d.moved) return;
    const pos = this.getPos(), res = check(d.id, d.at, pos);
    if (cancel || !res.ok || (d.at[0] === d.start[0] && d.at[1] === d.start[1])) {
      // back where it was, with a little bounce
      d.img.style.left = px(d.start[0]); d.img.style.top = px(d.start[1]); d.img.style.zIndex = depth(d.id, d.start);
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
// The nearest free spot for a newly placed item, starting from its default.
export function freeSpot(id, pos) {
  const it = ITEMS[id], start = it.def;
  if (id === 'lamp' && pos.nightstand) return standSpot(pos.nightstand);
  for (let r = 0; r < 160; r += 4) for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
    const p = clampTo(id, start[0] + dx, start[1] + dy);
    if (check(id, p, { ...pos, [id]: p }).ok) return p;
  }
  return clampTo(id, ...start);
}

// ------------------------------------------------------------------ life in the house
// Puszystek wanders between spots that follow the furniture: naps in bed,
// sits on the rug or the beanbag, plays by the toys, looks out of the window.
export class HouseLife {
  constructor(pusz, reduced) { this.pusz = pusz; this.reduced = reduced; this.timer = 0; this.el = null; this.at = 'rug'; }
  spots(pos) {
    const c = (id, ox, oy) => pos[id] && [pos[id][0] + ox, pos[id][1] + oy];
    const bed = pos.bedRoyal ? c('bedRoyal', 30, 24) : c('bedBasic', 21, 14);
    const rug = Object.keys(pos).find(id => id.startsWith('rug'));
    const s = { window: [80, 126, 1], rug: [...c(rug, ITEMS[rug].w / 2, ITEMS[rug].h - 4), 3], bed: [...bed, 2] };
    if (pos.toys) s.toy = [pos.toys[0] - 4, pos.toys[1] + 16, 2];
    if (pos.beanbag) s.seat = [...c('beanbag', 15, 10), 2];
    if (pos.cushion) s.cushion = [...c('cushion', 9, 12), 1];
    for (const k of Object.keys(s)) { s[k][0] = Math.max(17, Math.min(ROOM.w - 17, s[k][0])); s[k][1] = Math.max(ROOM.wallH + 14, Math.min(ROOM.h - 1, s[k][1])); }
    return s;
  }
  mount(el, pos) {
    this.stop(); this.el = el; this.places = this.spots(pos);
    if (!el) return;
    this.place(this.places[this.at] ? this.at : 'rug', true);
    this.timer = setTimeout(() => this.next(), 4000);
  }
  place(name, instant = false) {
    const [x, y] = this.places[name] || this.places.rug;
    this.at = name;
    if (instant) this.el.classList.add('no-move');
    this.el.style.setProperty('--x', x); this.el.style.setProperty('--y', y);
    this.el.style.zIndex = 10 + Math.round(y) + 1;
    if (instant) requestAnimationFrame(() => this.el?.classList.remove('no-move'));
  }
  async next() {
    if (!this.el?.isConnected || document.hidden) return this.stop();
    if (this.reduced.matches || this.el.closest('.house.editing')) { this.timer = setTimeout(() => this.next(), 5000); return; }
    const opts = Object.entries(this.places).filter(([n]) => n !== this.at);
    let r = Math.random() * opts.reduce((s, [, v]) => s + v[2], 0);
    const [name] = opts.find(([, v]) => (r -= v[2]) < 0) || opts[0];
    if (this.pusz.state === 'sleepy') await this.pusz.wake();
    this.el.classList.add('walk'); this.el.classList.toggle('flip', this.places[name][0] < (this.places[this.at] || [84])[0]);
    this.place(name);
    await new Promise(r => setTimeout(r, 1600));
    if (!this.el?.isConnected) return;
    this.el.classList.remove('walk');
    if (name === 'bed') { this.pusz.set('sleepy'); this.timer = setTimeout(() => this.next(), 11000); return; }
    if (name === 'toy') { await this.pusz.play('hop'); await this.pusz.play('giggle'); }
    else if (name === 'window') await this.pusz.play('ears');
    else if (name === 'cushion' || name === 'seat') await this.pusz.play('hug');
    this.timer = setTimeout(() => this.next(), 7000 + Math.random() * 6000);
  }
  // a new or moved item: Puszystek comes closer and is happy
  async cheer() {
    clearTimeout(this.timer);
    if (this.pusz.state === 'sleepy') this.pusz.set('idle');
    await this.pusz.celebrate('reward');
    this.timer = setTimeout(() => this.next(), 6000);
  }
  stop() { clearTimeout(this.timer); this.timer = 0; }
}
