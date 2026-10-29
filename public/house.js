// Domek Puszystka: the pair's shared pixel room. The layout is simply the
// house items the pair has placed (one per place, stored with the rest of the
// shared inventory in D1); empty places show the basic bed and rug.
// Everything is positioned in room pixels (128 x 152) times --px, an integer
// number of device pixels, so the pixel art stays crisp.
import { BY_ID, isHouse } from './rewards.js';
import { puszystekHTML } from './puszystek.js';

export const ROOM = { w: 128, h: 152 };
// sprite, top-left (room px), size, layer
export const ART = {
  starlights: { src: 'starlights', x: 3, y: 3, w: 122, h: 16, z: 2 },
  curtains: { src: 'curtains', x: 38, y: 9, w: 52, h: 50, z: 2 },
  garland: { src: 'garland', x: 0, y: 28, w: 38, h: 12, z: 2 },
  shelf: { src: 'shelf', x: 89, y: 30, w: 36, h: 28, z: 2 },
  plant: { src: 'plant', x: 108, y: 80, w: 18, h: 30, z: 3 },
  monstera: { src: 'monstera', x: 102, y: 70, w: 26, h: 40, z: 3 },
  lamp: { src: 'lamp', x: 48, y: 86, w: 14, h: 26, z: 3 },
  rugBasic: { src: 'rug-basic', x: 43, y: 123, w: 58, h: 18, z: 3 },
  rugHeart: { src: 'rug-heart', x: 43, y: 121, w: 58, h: 22, z: 3 },
  rugCloud: { src: 'rug-cloud', x: 41, y: 122, w: 62, h: 20, z: 3 },
  bedBasic: { src: 'bed-basic', x: 5, y: 108, w: 42, h: 22, z: 4 },
  bedRoyal: { src: 'bed-royal', x: 2, y: 92, w: 48, h: 40, z: 4 },
  cushion: { src: 'cushion', x: 38, y: 133, w: 18, h: 13, z: 5 },
  toys: { src: 'toys', x: 96, y: 132, w: 28, h: 16, z: 5 },
  wallLavender: { src: 'wall-lavender', w: 52, h: 48 }, // swaps the room background; thumbnail only
};
export const DEFAULTS = { hBed: 'bedBasic', hRug: 'rugBasic' };
export const DEFAULT_NAMES = { bedBasic: 'Wiklinowe legowisko', rugBasic: 'Lawendowy dywanik' };
// where each place is, for the editor (room px: x, y, w, h)
export const PLACES = {
  hPaper: [6, 6, 30, 16], hLights: [42, 0, 44, 8], hWindow: [42, 12, 44, 46], hWall: [0, 26, 38, 15], hShelf: [89, 28, 36, 30],
  hPlant: [104, 74, 22, 36], hLamp: [46, 84, 16, 28], hBed: [3, 96, 46, 36], hRug: [44, 121, 56, 21], hCushion: [36, 131, 20, 16], hToy: [96, 130, 28, 18],
};
const CAT_W = 33; // Puszystek's sprite on the room grid

// the placed items (by place) from the shared outfit
export function layout(equipped = []) {
  const by = {};
  for (const id of equipped) { const r = BY_ID[id]; if (isHouse(r)) by[r.slot] = id; }
  return by;
}
export function roomHTML(equipped, { fresh = '', editing = false, outfit = [] } = {}) {
  const by = layout(equipped);
  const ids = Object.keys(PLACES).filter(s => s !== 'hPaper').map(s => by[s] || DEFAULTS[s]).filter(Boolean);
  const bg = by.hPaper === 'wallLavender' ? 'room-lavender' : 'room';
  const px = v => `calc(${v} * var(--px))`;
  const items = ids.map(id => { const a = ART[id]; return `<img class="room-it px-art${id === fresh ? ' fresh' : ''}" data-item="${id}" src="/img/house/${a.src}.png" alt="" style="left:${px(a.x)};top:${px(a.y)};width:${px(a.w)};height:${px(a.h)};z-index:${a.z}">`; }).join('');
  const hot = editing ? Object.entries(PLACES).map(([slot, [x, y, w, h]]) => `<button class="room-hot${by[slot] ? ' set' : ''}" data-action="house-slot" data-slot="${slot}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)}" aria-label="Miejsce: ${slot}"><i>+</i></button>`).join('') : '';
  // the cat wears his outfit, minus things that belong outdoors (effects, meadow decorations, themes)
  const wear = outfit.filter(id => !['effect', 'decor', 'theme'].includes(BY_ID[id]?.slot) && !isHouse(BY_ID[id]));
  return `<img class="room-bg px-art" src="/img/house/${bg}.png" alt="">${items}
    <div class="hcat" style="width:${px(CAT_W)};--x:72;--y:135">${puszystekHTML({ pose: 'home', box: [0, 0, 242], outfit: wear, label: 'Puszystek w domku — dotknij', stagePx: () => 'left:0;top:0;width:100%' })}</div>${hot}`;
}

// ------------------------------------------------------------------ life in the house
// Puszystek wanders between a few spots: naps in bed, sits on the rug, plays
// in the toy corner, looks out of the window. One thing at a time, calm pace.
export class HouseLife {
  constructor(pusz, reduced) { this.pusz = pusz; this.reduced = reduced; this.timer = 0; this.el = null; this.at = 'rug'; }
  spots(by) {
    const s = { rug: [72, 135, 3], window: [64, 108, 1] };
    s.bed = by.hBed === 'bedRoyal' ? [31, 117, 2] : [26, 122, 2];
    if (by.hToy) s.toy = [88, 147, 2];
    if (by.hCushion) s.cushion = [47, 143, 1];
    return s;
  }
  mount(el, by) {
    this.stop(); this.el = el; this.places = this.spots(by);
    if (!el) return;
    this.place(this.places[this.at] ? this.at : 'rug', true);
    this.timer = setTimeout(() => this.next(), 4000);
  }
  place(name, instant = false) {
    const [x, y] = this.places[name] || this.places.rug;
    this.at = name;
    if (instant) this.el.classList.add('no-move');
    this.el.style.setProperty('--x', x); this.el.style.setProperty('--y', y);
    if (instant) requestAnimationFrame(() => this.el?.classList.remove('no-move'));
  }
  async next() {
    if (!this.el?.isConnected || document.hidden) return this.stop();
    if (this.reduced.matches) return;
    const opts = Object.entries(this.places).filter(([n]) => n !== this.at);
    let r = Math.random() * opts.reduce((s, [, v]) => s + v[2], 0);
    const [name] = opts.find(([, v]) => (r -= v[2]) < 0) || opts[0];
    if (this.pusz.state === 'sleepy') await this.pusz.wake();
    this.el.classList.add('walk'); this.el.classList.toggle('flip', (this.places[name][0] < (this.places[this.at] || [72])[0]));
    this.place(name);
    await new Promise(r => setTimeout(r, 1600));
    if (!this.el?.isConnected) return;
    this.el.classList.remove('walk');
    if (name === 'bed') { this.pusz.set('sleepy'); this.timer = setTimeout(() => this.next(), 11000); return; }
    if (name === 'toy') { await this.pusz.play('hop'); await this.pusz.play('giggle'); }
    else if (name === 'window') await this.pusz.play('ears');
    else if (name === 'cushion') await this.pusz.play('hug');
    this.timer = setTimeout(() => this.next(), 7000 + Math.random() * 6000);
  }
  // a new item: Puszystek runs to it and is happy
  async cheer(slot) {
    clearTimeout(this.timer);
    const target = { hBed: 'bed', hToy: 'toy', hCushion: 'cushion', hWindow: 'window', hLights: 'window', hWall: 'bed', hLamp: 'bed' }[slot] || 'rug';
    if (this.places[target] && target !== 'bed') this.place(target);
    await new Promise(r => setTimeout(r, 900));
    if (this.pusz.state === 'sleepy') this.pusz.set('idle');
    await this.pusz.celebrate('reward');
    this.timer = setTimeout(() => this.next(), 6000);
  }
  stop() { clearTimeout(this.timer); this.timer = 0; }
}
