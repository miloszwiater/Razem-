// Domek Puszystka: room geometry and placement rules, shared by the browser
// (editor) and the Worker (validation), so both judge a placement the same way.
// Art pixels: room 160 x 168, wall 0..111, floor 112..167.
export const ROOM = { w: 160, h: 168, wallH: 112, glass: [63, 19], win: [60, 16, 99, 61], rail: 79 };
export const SNAP = 2;
// zone: floor (stands on the floor, has a footprint), rug (lies flat under
// everything), wall (hangs above the chair rail, not over the window),
// surface (on the nightstand, or on the floor), fixed (curtains, ceiling).
export const ITEMS = {
  bedBasic: { src: 'bed-basic', w: 42, h: 22, zone: 'floor', foot: 10, def: [8, 130], shadow: 44 },
  bedRoyal: { src: 'bed-royal', w: 48, h: 40, zone: 'floor', foot: 12, def: [6, 114], shadow: 44 },
  nightstand: { src: 'nightstand', w: 22, h: 20, zone: 'floor', foot: 6, def: [56, 118], shadow: 24 },
  beanbag: { src: 'beanbag', w: 30, h: 20, zone: 'floor', foot: 9, def: [104, 120], shadow: 32 },
  plant: { src: 'plant', w: 18, h: 30, zone: 'floor', foot: 5, def: [136, 100], shadow: 16 },
  monstera: { src: 'monstera', w: 26, h: 40, zone: 'floor', foot: 6, def: [130, 90], shadow: 24 },
  toys: { src: 'toys', w: 28, h: 16, zone: 'floor', foot: 7, def: [120, 146], shadow: 24 },
  cushion: { src: 'cushion', w: 18, h: 13, zone: 'floor', foot: 6, def: [42, 152], shadow: 16 },
  lamp: { src: 'lamp', w: 14, h: 26, zone: 'surface', foot: 4, def: [60, 94], shadow: 16 },
  rugBasic: { src: 'rug-basic', w: 58, h: 18, zone: 'rug', def: [54, 140] },
  rugHeart: { src: 'rug-heart', w: 58, h: 22, zone: 'rug', def: [54, 138] },
  rugCloud: { src: 'rug-cloud', w: 62, h: 20, zone: 'rug', def: [52, 140] },
  garland: { src: 'garland', w: 38, h: 12, zone: 'wall', def: [8, 30] },
  painting: { src: 'painting', w: 26, h: 22, zone: 'wall', def: [116, 20] },
  shelf: { src: 'shelf', w: 36, h: 28, zone: 'wall', def: [116, 48] },
  curtains: { src: 'curtains', w: 64, h: 54, zone: 'fixed', def: [48, 11] },
  starlights: { src: 'starlights', w: 156, h: 16, zone: 'fixed', def: [2, 3] },
  // backgrounds (no position): wall paper and floor
  wallLavender: { thumb: 'thumb-wall-lavender', w: 40, h: 30, zone: 'bg' },
  wallMint: { thumb: 'thumb-wall-mint', w: 40, h: 30, zone: 'bg' },
  floorHerring: { thumb: 'thumb-floor-herring', w: 40, h: 26, zone: 'bg' },
};
export const DEFAULTS = { hBed: 'bedBasic', hRug: 'rugBasic' };
export const DEFAULT_NAMES = { bedBasic: 'Wiklinowe legowisko', rugBasic: 'Lawendowy dywanik' };
export const movable = id => ['floor', 'rug', 'wall', 'surface'].includes(ITEMS[id]?.zone);

const snap = v => Math.round(v / SNAP) * SNAP;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// keep a position inside the item's zone (snapped to the grid)
export function clampTo(id, x, y) {
  const it = ITEMS[id]; if (!it) return null;
  x = clamp(snap(x), 0, ROOM.w - it.w);
  if (it.zone === 'wall') y = clamp(snap(y), 6, ROOM.rail - it.h - 1);
  else if (it.zone === 'rug') y = clamp(snap(y), ROOM.wallH + 8, ROOM.h - it.h);
  else if (it.zone === 'floor' || it.zone === 'surface') y = clamp(snap(y), ROOM.wallH + 6 - it.h, ROOM.h - it.h);
  else return [...(it.def || [0, 0])];
  return [x, y];
}
const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const footprint = (id, [x, y]) => { const it = ITEMS[id]; return [x + 2, y + it.h - it.foot, it.w - 4, it.foot]; };
// where the lamp stands when it is on the nightstand: its base sinks 2 px into
// the top board, which keeps the spot on the 2 px grid
export function onStand(lampPos, standPos) {
  if (!lampPos || !standPos) return false;
  const L = ITEMS.lamp, S = ITEMS.nightstand;
  return lampPos[1] + L.h === standPos[1] + 2 && lampPos[0] >= standPos[0] - 2 && lampPos[0] + L.w <= standPos[0] + S.w + 2;
}
export const standSpot = standPos => [standPos[0] + 4, standPos[1] + 2 - ITEMS.lamp.h];

// Can `id` stand at [x, y] given the other placed items ({id: [x, y]})?
export function check(id, pos, placed) {
  const it = ITEMS[id]; if (!it || !movable(id)) return { ok: false, reason: 'Tego nie da się przesunąć.' };
  const c = clampTo(id, pos[0], pos[1]);
  if (!c || c[0] !== pos[0] || c[1] !== pos[1]) return { ok: false, reason: it.zone === 'wall' ? 'To wisi na ścianie, nad boazerią.' : 'To stoi na podłodze.' };
  const others = Object.entries(placed).filter(([o]) => o !== id && ITEMS[o]);
  if (it.zone === 'wall') {
    const r = [pos[0], pos[1], it.w, it.h], w = ROOM.win;
    if (overlap(r, [w[0] - 3, w[1] - 3, w[2] - w[0] + 7, w[3] - w[1] + 10])) return { ok: false, reason: 'Okno musi zostać odsłonięte.' };
    for (const [o, p] of others) if (ITEMS[o].zone === 'wall' && overlap(r, [p[0], p[1], ITEMS[o].w, ITEMS[o].h])) return { ok: false, reason: 'Tu już coś wisi.' };
    return { ok: true };
  }
  if (it.zone === 'rug') return { ok: true };
  if (id === 'lamp' && placed.nightstand && onStand(pos, placed.nightstand)) return { ok: true };
  const f = footprint(id, pos);
  for (const [o, p] of others) {
    const z = ITEMS[o].zone;
    if (z !== 'floor' && !(z === 'surface' && !(placed.nightstand && onStand(p, placed.nightstand)))) continue;
    if (overlap(f, footprint(o, p))) return { ok: false, reason: 'Tu już coś stoi.' };
  }
  return { ok: true };
}
// The arrangement to draw: placed items (from the shared outfit) at their saved
// positions, or their default spots; empty bed / rug places get the basics.
export function arrange(placedIds, saved = {}) {
  const ids = [...placedIds];
  if (!ids.some(id => ITEMS[id] && id.startsWith('bed'))) ids.push('bedBasic');
  if (!ids.some(id => ITEMS[id] && id.startsWith('rug'))) ids.push('rugBasic');
  const pos = {};
  for (const id of ids) { const it = ITEMS[id]; if (!it || it.zone === 'bg') continue; pos[id] = (saved[id] && clampTo(id, ...saved[id])) || [...it.def]; }
  return pos;
}
// draw order: wall things, then rugs, then floor things by how low they stand
export function depth(id, [, y]) {
  const it = ITEMS[id];
  if (it.zone === 'fixed' || it.zone === 'wall') return 2;
  if (it.zone === 'rug') return 3;
  return 10 + y + it.h; // lower on screen = closer = in front
}
