// Puszystek: one pixel-art character built from layers (decorations and wings
// behind, tail, the body with ears as separate pivoting layers, a blink frame,
// worn items attached to body parts, a waving paw, Zzz, decorations in front
// and an effects layer) plus a small state machine that plays one
// micro-animation at a time.
import { BY_ID } from './rewards.js';

// Geometry in reference screen px inside each pose sprite (see tools/items.py).
export const POSES = {
  home: { img: 'cat-home', w: 242, h: 201, face: [133, 91], head: [126, 24], ear: [58, 30], neck: [132, 134], held: [128, 168], back: [121, 80], tail: [196, 150], paw: [206, 104], ears: { l: [40, 0, 104, 36], r: [142, 0, 212, 36] } },
  cheer: { img: 'cat-cheer', w: 241, h: 212, face: [133, 88], head: [124, 22], ear: [62, 28], neck: [138, 126], held: [138, 158], back: [121, 82], tail: [198, 168], ears: { l: [46, 0, 104, 34], r: [142, 0, 212, 34] } },
};

// How each wearable sits on the body: sprite, width (screen px), attach point,
// which edge of the item touches it and a nudge (dx/dy). `glint` = a light
// sweep across the item (crowns).
export const WEAR = {
  crown: { src: 'items/crown.png', w: 64, on: 'head', edge: 'bottom', dy: 10, glint: 1 },
  diamond: { src: 'items/diamond.png', w: 64, on: 'head', edge: 'bottom', dy: 10, glint: 1 },
  tiara: { src: 'items/tiara.png', w: 74, on: 'head', edge: 'bottom', dy: 12, px: 1, glint: 1 },
  beanie: { src: 'items/beanie.png', w: 99, on: 'head', edge: 'bottom', dy: 22, px: 1 },
  flowers: { src: 'items/flowers.png', w: 132, on: 'head', edge: 'bottom', dy: 16, px: 1 },
  bow: { src: 'items/bow.png', w: 90, on: 'neck', edge: 'top', dy: -6 },
  bowLav: { src: 'items/bow-lav.png', w: 90, on: 'neck', edge: 'top', dy: -6 },
  collar: { src: 'items/collar.png', w: 104, on: 'neck', edge: 'top', dy: -4, px: 1 },
  scarfMint: { src: 'items/scarf-mint.png', w: 120, on: 'neck', edge: 'top', dy: -8, px: 1 },
  scarf: { src: 'items/scarf.png', w: 120, on: 'neck', edge: 'top', dy: -8, px: 1 },
  medal: { src: 'items/medal.png', w: 74, on: 'neck', edge: 'top', dy: -10, px: 1 },
  plush: { src: 'items/plush.png', w: 56, on: 'held', edge: 'center', dy: 0, px: 1 },
  lollipop: { src: 'items/lollipop.png', w: 38, on: 'held', edge: 'center', dx: 62, dy: -18, px: 1 },
  earBow: { src: 'items/ear-bow.png', w: 46, on: 'ear', edge: 'center', dy: 0, px: 1 },
  earFlower: { src: 'items/ear-flower.png', w: 38, on: 'ear', edge: 'center', dy: 0, px: 1 },
  chefHat: { src: 'items/chef-hat.png', w: 96, on: 'head', edge: 'bottom', dy: 22, px: 1 },
  bunnyEars: { src: 'items/bunny-ears.png', w: 96, on: 'head', edge: 'bottom', dy: 14, px: 1 },
  sunglasses: { src: 'items/sunglasses.png', w: 128, on: 'face', edge: 'center', dy: 0, px: 1 },
  bowtie: { src: 'items/bowtie.png', w: 50, on: 'neck', edge: 'top', dy: -4, px: 1 },
  daisy: { src: 'items/daisy.png', w: 38, on: 'ear', edge: 'center', dy: 0, px: 1 },
  starWand: { src: 'items/star-wand.png', w: 40, on: 'held', edge: 'center', dx: 74, dy: -30, px: 1 },
  heartBalloon: { src: 'items/heart-balloon.png', w: 46, on: 'held', edge: 'center', dx: 104, dy: -74, px: 1 },
  wings: { src: 'items/wing.png', w: 64, on: 'back', pair: 'items/wing-r.png', px: 1 },
  rainbow: { src: 'items/rainbow.png', w: 64, on: 'back', pair: 'items/rainbow-r.png', px: 1 },
};
// Decorations around Puszystek, in pose px relative to the sprite box
// (`bottom` anchors to the feet); `front` ones are drawn over the body.
export const DECOR = {
  balloons: { src: 'items/balloons.png', x: -104, y: -62, w: 112 },
  lanterns: { src: 'items/lanterns.png', x: -52, y: -62, w: 346 },
  garden: { src: 'items/garden.png', x: -44, bottom: -12, w: 330, front: 1 },
};
// Effects: sprite pools for the particle layer.
const FX = {
  hearts: ['home-heart-0', 'home-heart-2', 'det-heart-2'],
  butterflies: ['items/butterfly'],
  stars: ['home-spark-5', 'home-spark-4', 'home-spark-8'],
  confetti: ['home-heart-2', 'items/butterfly', 'home-spark-6'],
  fireworks: ['items/firework', 'home-spark-5'],
};

const pct = (v, t) => `${(v / t * 100).toFixed(2)}%`;

// Each worn item is a <span> sized by its sprite, so overlays (the crown
// glint) and the "new item" pop can be layered on it.
function placeWear(pose, id, fresh) {
  const it = WEAR[id]; if (!it) return '';
  const P = POSES[pose], [ax, ay] = P[it.on];
  const cls = `pz-item pz-${it.on}${it.px ? ' px-art' : ''}${id === fresh ? ' pz-new' : ''}`;
  const img = src => `<img${it.px ? ' class="px-art"' : ''} src="/img/${src}" alt="">`;
  if (it.on === 'back') {
    // wings stick out of the silhouette on both sides, overlapping the body by ~26 px
    const y = ay - it.w * 0.62;
    return `<span class="${cls} l" data-item="${id}" style="left:${pct(26 - it.w, P.w)};top:${pct(y, P.h)};width:${pct(it.w, P.w)}">${img(it.src)}</span>` +
      `<span class="${cls} r" data-item="${id}" style="left:${pct(P.w - 26, P.w)};top:${pct(y, P.h)};width:${pct(it.w, P.w)}">${img(it.pair)}</span>`;
  }
  // height is unknown until the image loads, so anchor with a transform
  const ty = it.edge === 'bottom' ? '-100%' : it.edge === 'center' ? '-50%' : '0%';
  const glint = it.glint ? `<i class="pz-glint" style="-webkit-mask-image:url(/img/${it.src});mask-image:url(/img/${it.src})"></i>` : '';
  return `<span class="${cls}" data-item="${id}" style="left:${pct(ax + (it.dx || 0) - it.w / 2, P.w)};top:${pct(ay + it.dy, P.h)};width:${pct(it.w, P.w)};--ty:${ty}">${img(it.src)}${glint}</span>`;
}
function placeDecor(pose, id, fresh) {
  const d = DECOR[id]; if (!d) return '';
  const P = POSES[pose];
  const v = d.bottom !== undefined ? `bottom:${pct(d.bottom, P.h)}` : `top:${pct(d.y, P.h)}`;
  return `<span class="pz-item pz-decor px-art${id === fresh ? ' pz-new' : ''}" data-item="${id}" style="left:${pct(d.x, P.w)};${v};width:${pct(d.w, P.w)}"><img class="px-art" src="/img/${d.src}" alt=""></span>`;
}

function effectLayer(id) {
  const pool = FX[id]; if (!pool) return '';
  const n = id === 'confetti' ? 9 : id === 'fireworks' ? 4 : 6;
  return `<div class="pz-fx fx-${id}" aria-hidden="true">${Array.from({ length: n }, (_, i) => {
    const src = pool[i % pool.length];
    const x = (8 + (i * 83) % 84).toFixed(0), y = (6 + (i * 37) % 58).toFixed(0);
    return `<img class="px-art" src="/img/${src}.png" alt="" style="left:${x}%;top:${y}%;--d:${(i * 0.61).toFixed(2)}s;--hue:${(i * 47) % 360}deg">`;
  }).join('')}</div>`;
}

// HTML for the character. `box` = [x, y, w] in reference screen px on the stage.
// `fresh` = id of an item that was just put on (plays its entrance).
export function puszystekHTML({ pose = 'home', box, outfit = [], label = 'Puszystek', stagePx, fresh = '' }) {
  const P = POSES[pose];
  const [x, y, w] = box;
  const eff = outfit.map(id => BY_ID[id]).find(r => r?.slot === 'effect');
  const theme = outfit.find(id => BY_ID[id]?.slot === 'theme');
  const decorBack = outfit.filter(id => DECOR[id] && !DECOR[id].front).map(id => placeDecor(pose, id, fresh)).join('');
  const decorFront = outfit.filter(id => DECOR[id]?.front).map(id => placeDecor(pose, id, fresh)).join('');
  const back = outfit.filter(id => WEAR[id]?.on === 'back').map(id => placeWear(pose, id, fresh)).join('');
  const front = outfit.filter(id => WEAR[id] && !['back', 'ear'].includes(WEAR[id].on)).map(id => placeWear(pose, id, fresh)).join('');
  const earItem = outfit.filter(id => WEAR[id]?.on === 'ear').map(id => placeWear(pose, id, fresh)).join('');
  const ear = (side) => { const [x0, y0, x1, y1] = P.ears[side]; return `<img class="pz-ear ${side}" src="/img/${P.img}.png" alt="" style="clip-path:inset(${pct(y0, P.h)} ${pct(P.w - x1, P.w)} ${pct(P.h - y1, P.h)} ${pct(x0, P.w)});transform-origin:${pct((x0 + x1) / 2, P.w)} ${pct(y1, P.h)}">`; };
  const { l, r } = P.ears;
  // body without the two ear rectangles (the ear layers draw them)
  const clip = `polygon(${pct(l[2], P.w)} 0, ${pct(r[0], P.w)} 0, ${pct(r[0], P.w)} ${pct(r[3], P.h)}, 100% ${pct(r[3], P.h)}, 100% 100%, 0 100%, 0 ${pct(l[3], P.h)}, ${pct(l[2], P.w)} ${pct(l[3], P.h)})`;
  // an ear decoration lives in a full-size layer that pivots exactly like the left ear
  const [ex0, , ex1, ey1] = P.ears.l;
  const earWrap = earItem ? `<span class="pz-earwrap" style="transform-origin:${pct((ex0 + ex1) / 2, P.w)} ${pct(ey1, P.h)}">${earItem}</span>` : '';
  return `<div class="pusz${theme ? ' theme-' + theme : ''}" data-pose="${pose}" data-state="idle" style="${stagePx(x, y, w)};aspect-ratio:${P.w}/${P.h}">
    ${eff ? effectLayer(eff.id) : ''}
    <div class="pz-back">${decorBack}${back}${pose === 'home' ? `<img class="pz-tail px-art" src="/img/items/tail.png" alt="" style="left:${pct(P.tail[0], P.w)};top:${pct(P.tail[1] - 50, P.h)};width:${pct(50, P.w)}">` : ''}</div>
    <button class="pz-body" data-action="cat" aria-label="${label}">
      <img class="pz-base" src="/img/${P.img}.png" alt="" style="clip-path:${clip}">
      ${ear('l')}${ear('r')}
      <img class="pz-blink" src="/img/${P.img}-blink.png" alt="">
      ${earWrap}
      ${front}
      <img class="pz-hug px-art" src="/img/items/plush.png" alt="" style="left:${pct(P.held[0] - 28, P.w)};top:${pct(P.held[1] - 25, P.h)};width:${pct(56, P.w)}">
      ${P.paw ? `<img class="pz-paw px-art" src="/img/items/paw.png" alt="" style="left:${pct(P.paw[0], P.w)};top:${pct(P.paw[1], P.h)};width:${pct(43, P.w)}">` : ''}
    </button>
    ${decorFront}
    <span class="pz-zzz" aria-hidden="true"><img class="px-art" src="/img/items/zzz.png" alt=""><img class="px-art" src="/img/items/zzz.png" alt=""><img class="px-art" src="/img/items/zzz.png" alt=""></span>
  </div>`;
}

// ------------------------------------------------------------------ behaviour
const IDLE_ACTS = [['blink', 30], ['ears', 18], ['tail', 18], ['sway', 12], ['wave', 9], ['hug', 8], ['hop', 5]];
const DUR = { blink: 260, ears: 700, tail: 1300, sway: 1800, wave: 1500, hug: 1500, hop: 800, stretch: 1100, spin: 1100, celebrate: 2600, reward: 2200, giggle: 700, yawn: 1500, pounce: 950, eat: 1800, look: 1400 };
const SLEEP_AFTER = 45000;
// mood follows the pair's shared energy: livelier when happy, more yawns and
// earlier naps when sleepy or tired (never sad)
const MOOD_ACTS = { happy: { hop: 3, wave: 1.5, tail: 1.3 }, calm: {}, sleepy: { yawn: 14, hop: .3, sway: 1.5 }, tired: { yawn: 18, hop: 0, wave: .3, blink: 1.6 } };
const MOOD_SLEEP = { happy: 60000, calm: 45000, sleepy: 25000, tired: 14000 };

export class Puszystek {
  constructor({ reduced, onState, still = false } = {}) {
    this.reduced = reduced; this.onState = onState; this.still = still;
    this.el = null; this.state = 'idle'; this.busy = false; this.timer = 0; this.lastInput = Date.now(); this.mood = 'happy';
    const wake = () => { this.lastInput = Date.now(); if (this.state === 'sleepy') this.wake(); };
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(e => addEventListener(e, wake, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.schedule(); });
  }
  mount(el) {
    this.el = el; this.busy = false;
    if (!el) return;
    el.dataset.mood = this.mood;
    this.set(this.state === 'sleepy' ? 'sleepy' : el.dataset.pose === 'cheer' ? 'happy' : 'idle');
    this.schedule();
  }
  setMood(mood) { this.mood = MOOD_ACTS[mood] ? mood : 'happy'; if (this.el) this.el.dataset.mood = this.mood; }
  set(s) { this.state = s; if (this.el) this.el.dataset.state = s; this.onState?.(s); }
  play(act, ms = DUR[act]) {
    const el = this.el; if (!el) return Promise.resolve();
    if (this.reduced.matches && !['blink'].includes(act)) return Promise.resolve();
    el.classList.remove('act-' + act); void el.offsetWidth; el.classList.add('act-' + act);
    this.busy = true;
    return new Promise(res => setTimeout(() => { el.classList.remove('act-' + act); this.busy = false; res(); }, ms));
  }
  schedule() {
    clearTimeout(this.timer);
    if (!this.el || document.hidden || this.still) return;
    const wait = 2200 + Math.random() * 3800;
    this.timer = setTimeout(() => this.tick(), wait);
  }
  tick() {
    if (!this.el?.isConnected) return;
    if (this.state === 'sleepy') return this.schedule();
    if (Date.now() - this.lastInput > (MOOD_SLEEP[this.mood] || SLEEP_AFTER) && ['idle', 'happy'].includes(this.state)) { this.sleep(); return this.schedule(); }
    if (!this.busy && ['idle', 'happy'].includes(this.state)) {
      const k = MOOD_ACTS[this.mood] || {};
      const pool = [...IDLE_ACTS, ['yawn', 0]].map(([a, w]) => [a, w * (k[a] ?? 1) + (a === 'yawn' ? (k.yawn || 0) : 0)]).filter(([a, w]) => w > 0 && !(a === 'wave' && !this.el.querySelector('.pz-paw')) && !(a === 'tail' && !this.el.querySelector('.pz-tail')));
      let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
      const act = pool.find(([, w]) => (r -= w) < 0)?.[0] || 'blink';
      this.play(act);
    }
    this.schedule();
  }
  sleep() { this.set('sleepy'); }
  async wake() { this.set('idle'); await this.play('stretch'); }
  // reactions -------------------------------------------------------------
  async tap() {
    this.lastInput = Date.now();
    if (this.state === 'sleepy') return this.wake();
    const pick = ['hop', 'giggle', this.el?.querySelector('.pz-paw') ? 'wave' : 'hop', 'hug'][Math.floor(Math.random() * 4)];
    this.set('happy'); await this.play(pick); this.set(this.el?.dataset.pose === 'cheer' ? 'happy' : 'idle');
    return pick;
  }
  async celebrate(kind = 'meeting') {
    this.lastInput = Date.now();
    this.set(kind === 'reward' ? 'reward-unlocked' : 'celebrating');
    if (kind === 'milestone') { await this.play('spin'); await this.play('celebrate'); }
    else await this.play(kind === 'reward' ? 'reward' : 'celebrate');
    this.set('idle');
  }
}
