// Domek Puszystka: room geometry and placement rules, shared by the browser
// (editor) and the Worker (validation), so both judge a placement the same way.
// Art pixels: every room is 160 x 168, wall 0..111, floor 112..167.
// Five rooms; every item belongs to one of them, so positions stay a flat
// {id: [x, y]} map and collisions are checked inside the item's own room.
export const ROOM = { w: 160, h: 168, wallH: 112, glass: [63, 19], win: [60, 16, 99, 61], rail: 79 };
export const SNAP = 2;
// win: window frame (wall things must keep it clear), rail: lowest edge for
// things on the wall, at: shared meetings that open the room, view: the
// picture behind the glass ([x, y, w, h] in room px).
export const ROOMS = {
  salon: { name: 'Salon', at: 0, win: [52, 14, 107, 58], rail: 75, view: [55, 17, 50, 39], door: 'Salon z kominkiem' },
  sypialnia: { name: 'Sypialnia', at: 0, win: [60, 16, 99, 61], rail: 79, view: [63, 19, 36, 42], door: 'Sypialnia Puszystka' },
  kuchnia: { name: 'Kuchnia', at: 3, win: [104, 12, 141, 44], rail: 80, view: [107, 15, 32, 27], door: 'Kuchnia pełna zapachów' },
  lazienka: { name: 'Łazienka', at: 6, win: [67, 13, 93, 39], rail: 100, view: [70, 16, 20, 20], door: 'Łazienka z bąbelkami' },
  taras: { name: 'Taras', at: 10, win: null, rail: 104, view: null, door: 'Taras i ogródek' },
};
export const ROOM_ORDER = ['salon', 'sypialnia', 'kuchnia', 'lazienka', 'taras'];
export const roomOpen = (r, n) => (n ?? 0) >= (ROOMS[r]?.at ?? Infinity);
// zone: floor (stands on the floor, has a footprint), rug (lies flat under
// everything), wall (hangs above the room's rail, not over the window),
// surface (on one of its `on` furniture, or on the floor), fixed (curtains,
// ceiling), bg (wall paper / floor of a room). `top`: where things stand on
// a piece of furniture (px below its top edge). `basic`: there from the start,
// replaced by any placed item in the same slot (`for`).
const I = (room, o) => ({ room, ...o });
export const ITEMS = {
  // --- sypialnia (stage 5 / 6 items keep their ids and spots)
  bedBasic: I('sypialnia', { src: 'bed-basic', w: 42, h: 22, zone: 'floor', foot: 10, def: [8, 130], shadow: 44, basic: 'hBed' }),
  bedRoyal: I('sypialnia', { src: 'bed-royal', w: 48, h: 40, zone: 'floor', foot: 12, def: [6, 114], shadow: 44 }),
  nightstand: I('sypialnia', { src: 'nightstand', w: 22, h: 20, zone: 'floor', foot: 6, def: [56, 118], shadow: 24, top: 2 }),
  beanbag: I('sypialnia', { src: 'beanbag', w: 30, h: 20, zone: 'floor', foot: 9, def: [104, 120], shadow: 32 }),
  plant: I('sypialnia', { src: 'plant', w: 18, h: 30, zone: 'floor', foot: 5, def: [136, 100], shadow: 16 }),
  monstera: I('sypialnia', { src: 'monstera', w: 26, h: 40, zone: 'floor', foot: 6, def: [130, 90], shadow: 24 }),
  toys: I('sypialnia', { src: 'toys', w: 28, h: 16, zone: 'floor', foot: 7, def: [120, 146], shadow: 24 }),
  cushion: I('sypialnia', { src: 'cushion', w: 18, h: 13, zone: 'floor', foot: 6, def: [42, 152], shadow: 16 }),
  lamp: I('sypialnia', { src: 'lamp', w: 14, h: 26, zone: 'surface', on: ['nightstand'], foot: 4, def: [60, 94], shadow: 16 }),
  rugBasic: I('sypialnia', { src: 'rug-basic', w: 58, h: 18, zone: 'rug', def: [54, 140], basic: 'hRug' }),
  rugHeart: I('sypialnia', { src: 'rug-heart', w: 58, h: 22, zone: 'rug', def: [54, 138] }),
  rugCloud: I('sypialnia', { src: 'rug-cloud', w: 62, h: 20, zone: 'rug', def: [52, 140] }),
  garland: I('sypialnia', { src: 'garland', w: 38, h: 12, zone: 'wall', def: [8, 30] }),
  painting: I('sypialnia', { src: 'painting', w: 26, h: 22, zone: 'wall', def: [116, 20] }),
  shelf: I('sypialnia', { src: 'shelf', w: 36, h: 28, zone: 'wall', def: [116, 48] }),
  curtains: I('sypialnia', { src: 'curtains', w: 64, h: 54, zone: 'fixed', def: [48, 11] }),
  starlights: I('sypialnia', { src: 'starlights', w: 156, h: 16, zone: 'fixed', def: [2, 3] }),
  wardrobe: I('sypialnia', { src: 'wardrobe', w: 34, h: 56, zone: 'floor', foot: 8, def: [2, 62], shadow: 32 }),
  plushBear: I('sypialnia', { src: 'plush-bear', w: 16, h: 16, zone: 'floor', foot: 5, def: [96, 150], shadow: 16 }),
  nightLamp: I('sypialnia', { src: 'night-lamp', w: 12, h: 18, zone: 'surface', on: ['nightstand'], foot: 4, def: [82, 130], shadow: 16 }),
  wallLavender: I('sypialnia', { thumb: 'thumb-wall-lavender', w: 40, h: 30, zone: 'bg' }),
  wallMint: I('sypialnia', { thumb: 'thumb-wall-mint', w: 40, h: 30, zone: 'bg' }),
  floorHerring: I('sypialnia', { thumb: 'thumb-floor-herring', w: 40, h: 26, zone: 'bg' }),
  // --- salon
  sofaBasic: I('salon', { src: 'sofa-basic', w: 44, h: 30, zone: 'floor', foot: 10, def: [6, 100], shadow: 44, basic: 'hSofa' }),
  sofa: I('salon', { src: 'sofa', w: 54, h: 30, zone: 'floor', foot: 10, def: [4, 100], shadow: 44 }),
  armchair: I('salon', { src: 'armchair', w: 28, h: 28, zone: 'floor', foot: 9, def: [124, 104], shadow: 32 }),
  coffeeTable: I('salon', { src: 'coffee-table', w: 34, h: 16, zone: 'floor', foot: 5, def: [62, 132], shadow: 32, top: 1 }),
  bookcase: I('salon', { src: 'bookcase', w: 30, h: 50, zone: 'floor', foot: 6, def: [128, 68], shadow: 32 }),
  floorLamp: I('salon', { src: 'floor-lamp', w: 16, h: 46, zone: 'floor', foot: 4, def: [108, 72], shadow: 16 }),
  fireplace: I('salon', { src: 'fireplace', w: 44, h: 40, zone: 'floor', foot: 6, def: [58, 78], shadow: 44 }),
  wallClock: I('salon', { src: 'wall-clock', w: 18, h: 18, zone: 'wall', def: [22, 12] }),
  paintingSea: I('salon', { src: 'painting-sea', w: 30, h: 22, zone: 'wall', def: [12, 40] }),
  paintingFlowers: I('salon', { src: 'painting-flowers', w: 22, h: 26, zone: 'wall', def: [124, 18] }),
  ficus: I('salon', { src: 'ficus', w: 24, h: 48, zone: 'floor', foot: 6, def: [34, 70], shadow: 24 }),
  catTree: I('salon', { src: 'cat-tree', w: 30, h: 56, zone: 'floor', foot: 6, def: [2, 108], shadow: 32 }),
  rugSalon: I('salon', { src: 'rug-salon', w: 70, h: 22, zone: 'rug', def: [44, 138] }),
  toyMouse: I('salon', { src: 'toy-mouse', w: 14, h: 9, zone: 'floor', foot: 4, def: [112, 152], shadow: 16 }),
  pillowHeart: I('salon', { src: 'pillow-heart', w: 22, h: 16, zone: 'floor', foot: 6, def: [30, 148], shadow: 24 }),
  wallPeach: I('salon', { thumb: 'thumb-salon-peach', w: 40, h: 30, zone: 'bg' }),
  // --- kuchnia
  counterBasic: I('kuchnia', { src: 'counter-basic', w: 40, h: 34, zone: 'floor', foot: 8, def: [0, 84], shadow: 44, top: 2, basic: 'hCounter' }),
  counterSink: I('kuchnia', { src: 'counter-sink', w: 44, h: 34, zone: 'floor', foot: 8, def: [102, 84], shadow: 44, top: 2 }),
  stove: I('kuchnia', { src: 'stove', w: 30, h: 34, zone: 'floor', foot: 8, def: [42, 84], shadow: 32, top: 1 }),
  fridge: I('kuchnia', { src: 'fridge', w: 26, h: 56, zone: 'floor', foot: 8, def: [74, 62], shadow: 32 }),
  diningTable: I('kuchnia', { src: 'dining-table', w: 40, h: 24, zone: 'floor', foot: 6, def: [56, 128], shadow: 44, top: 2 }),
  chairs: I('kuchnia', { src: 'chairs', w: 40, h: 26, zone: 'floor', foot: 4, def: [56, 140], shadow: 44 }),
  bowl: I('kuchnia', { src: 'bowl', w: 16, h: 8, zone: 'floor', foot: 4, def: [130, 152], shadow: 16 }),
  jarShelf: I('kuchnia', { src: 'jar-shelf', w: 40, h: 22, zone: 'wall', def: [4, 30] }),
  pans: I('kuchnia', { src: 'pans', w: 40, h: 26, zone: 'wall', def: [52, 22] }),
  herbs: I('kuchnia', { src: 'herbs', w: 34, h: 16, zone: 'surface', on: ['counterSink', 'counterBasic'], foot: 4, def: [4, 70], shadow: 32 }),
  cake: I('kuchnia', { src: 'cake', w: 18, h: 18, zone: 'surface', on: ['diningTable', 'counterBasic', 'counterSink'], foot: 4, def: [66, 112], shadow: 16 }),
  rugKitchen: I('kuchnia', { src: 'rug-kitchen', w: 50, h: 16, zone: 'rug', def: [100, 144] }),
  wallButter: I('kuchnia', { thumb: 'thumb-kitchen-butter', w: 40, h: 30, zone: 'bg' }),
  floorCheckBlue: I('kuchnia', { thumb: 'thumb-floor-checkBlue', w: 40, h: 26, zone: 'bg' }),
  // --- łazienka
  tubBasic: I('lazienka', { src: 'tub-basic', w: 56, h: 32, zone: 'floor', foot: 10, def: [4, 96], shadow: 44, top: 6, basic: 'hTub' }),
  sink: I('lazienka', { src: 'sink-basic', w: 30, h: 40, zone: 'floor', foot: 8, def: [104, 78], shadow: 32, top: 1 }),
  mirror: I('lazienka', { src: 'mirror', w: 22, h: 30, zone: 'wall', def: [108, 40] }),
  towels: I('lazienka', { src: 'towels', w: 30, h: 24, zone: 'wall', def: [22, 30] }),
  cosmetics: I('lazienka', { src: 'cosmetics', w: 32, h: 22, zone: 'wall', def: [104, 12] }),
  duck: I('lazienka', { src: 'duck', w: 14, h: 11, zone: 'surface', on: ['tubBasic'], foot: 4, def: [30, 91], shadow: 16 }),
  basket: I('lazienka', { src: 'basket', w: 22, h: 22, zone: 'floor', foot: 6, def: [70, 120], shadow: 24 }),
  bathMat: I('lazienka', { src: 'bath-mat', w: 40, h: 12, zone: 'rug', def: [14, 142] }),
  fern: I('lazienka', { src: 'fern', w: 20, h: 30, zone: 'floor', foot: 5, def: [138, 128], shadow: 16 }),
  wallAqua: I('lazienka', { thumb: 'thumb-bath-aqua', w: 40, h: 30, zone: 'bg' }),
  // --- taras
  benchBasic: I('taras', { src: 'bench-basic', w: 50, h: 26, zone: 'floor', foot: 8, def: [8, 100], shadow: 44, basic: 'hBench' }),
  pots: I('taras', { src: 'pots', w: 46, h: 22, zone: 'floor', foot: 6, def: [64, 96], shadow: 44 }),
  lemonTree: I('taras', { src: 'lemon-tree', w: 30, h: 50, zone: 'floor', foot: 6, def: [126, 74], shadow: 32 }),
  gardenTable: I('taras', { src: 'garden-table', w: 36, h: 30, zone: 'floor', foot: 4, def: [62, 124], shadow: 32, top: 2 }),
  birdhouse: I('taras', { src: 'birdhouse', w: 18, h: 24, zone: 'wall', def: [112, 54] }),
  wateringCan: I('taras', { src: 'watering-can', w: 22, h: 14, zone: 'floor', foot: 5, def: [36, 150], shadow: 24 }),
  sunbed: I('taras', { src: 'sunbed', w: 52, h: 22, zone: 'floor', foot: 6, def: [104, 140], shadow: 44 }),
  flowerBed: I('taras', { src: 'flower-bed', w: 60, h: 16, zone: 'floor', foot: 6, def: [2, 126], shadow: 44 }),
  pumpkins: I('taras', { src: 'pumpkins', w: 30, h: 16, zone: 'floor', foot: 6, def: [4, 150], shadow: 32 }),
  lanternsTerrace: I('taras', { src: 'lanterns-terrace', w: 120, h: 16, zone: 'fixed', def: [20, 4] }),
  rugDeck: I('taras', { src: 'rug-deck', w: 64, h: 18, zone: 'rug', def: [48, 142] }),
  skySunset: I('taras', { thumb: 'thumb-sky-sunset', w: 40, h: 30, zone: 'bg' }),
};
// the basic piece each room starts with (it stays until something takes its slot)
export const BASICS = Object.fromEntries(Object.entries(ITEMS).filter(([, it]) => it.basic).map(([id, it]) => [id, it.basic]));
export const DEFAULTS = { hBed: 'bedBasic', hRug: 'rugBasic', hSofa: 'sofaBasic', hCounter: 'counterBasic', hTub: 'tubBasic', hBench: 'benchBasic' };
export const DEFAULT_NAMES = { bedBasic: 'Wiklinowe legowisko', rugBasic: 'Lawendowy dywanik', sofaBasic: 'Lawendowa kanapa', counterBasic: 'Kuchenny blat', tubBasic: 'Wanna z bąbelkami', benchBasic: 'Ławeczka' };
export const roomOf = id => ITEMS[id]?.room || 'sypialnia';
export const movable = id => ['floor', 'rug', 'wall', 'surface'].includes(ITEMS[id]?.zone);

const snap = v => Math.round(v / SNAP) * SNAP;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// keep a position inside the item's zone (snapped to the grid)
export function clampTo(id, x, y) {
  const it = ITEMS[id]; if (!it) return null;
  const R = ROOMS[it.room];
  x = clamp(snap(x), 0, ROOM.w - it.w);
  if (it.zone === 'wall') y = clamp(snap(y), 6, R.rail - it.h - 1);
  else if (it.zone === 'rug') y = clamp(snap(y), ROOM.wallH + 8, ROOM.h - it.h);
  else if (it.zone === 'floor' || it.zone === 'surface') y = clamp(snap(y), Math.min(ROOM.wallH + 6 - it.h, surfaceMin(id)), ROOM.h - it.h);
  else return [...(it.def || [0, 0])];
  return [x, y];
}
// a surface item may stand higher than the floor: on top of its furniture
function surfaceMin(id) {
  const it = ITEMS[id]; if (it.zone !== 'surface') return Infinity;
  return Math.min(...it.on.map(h => ROOM.wallH + 6 - ITEMS[h].h + (ITEMS[h].top ?? 2) - it.h));
}
const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const footprint = (id, [x, y]) => { const it = ITEMS[id]; return [x + 2, y + it.h - it.foot, it.w - 4, it.foot]; };
// Is a surface item standing on top of `host`? Its base sinks `top` px into
// the host's top board, which keeps the spot on the 2 px grid.
export function onTop(id, p, host, hp) {
  if (!p || !hp) return false;
  const it = ITEMS[id], H = ITEMS[host];
  return p[1] + it.h === hp[1] + (H.top ?? 2) && p[0] >= hp[0] - 2 && p[0] + it.w <= hp[0] + H.w + 2;
}
// the furniture a surface item stands on right now (or null: on the floor)
export function hostOf(id, p, placed) {
  const it = ITEMS[id]; if (it?.zone !== 'surface') return null;
  return it.on.find(h => placed[h] && onTop(id, p, h, placed[h])) || null;
}
export const topSpot = (id, host, hp) => { const it = ITEMS[id], H = ITEMS[host]; return [snap(hp[0] + (H.w - it.w) / 2), hp[1] + (H.top ?? 2) - it.h]; };
// kept for older callers: the lamp on the nightstand
export const onStand = (lampPos, standPos) => onTop('lamp', lampPos, 'nightstand', standPos);
export const standSpot = standPos => topSpot('lamp', 'nightstand', standPos);

// Can `id` stand at [x, y] given the other placed items ({id: [x, y]})?
// Only items in the same room count.
export function check(id, pos, placed) {
  const it = ITEMS[id]; if (!it || !movable(id)) return { ok: false, reason: 'Tego nie da się przesunąć.' };
  const others = Object.entries(placed).filter(([o]) => o !== id && ITEMS[o] && ITEMS[o].room === it.room);
  const mine = Object.fromEntries(others);
  if (it.zone === 'surface' && hostOf(id, pos, mine) && pos[0] >= 0 && pos[0] <= ROOM.w - it.w && pos[0] % SNAP === 0) {
    // on a piece of furniture: one thing per spot on its top
    for (const [o, p] of others) if (ITEMS[o].zone === 'surface' && hostOf(o, p, mine) && overlap([pos[0], pos[1], it.w, it.h], [p[0], p[1], ITEMS[o].w, ITEMS[o].h])) return { ok: false, reason: 'Tu już coś stoi.' };
    return { ok: true };
  }
  const c = clampTo(id, pos[0], pos[1]);
  if (!c || c[0] !== pos[0] || c[1] !== pos[1] || (it.zone === 'surface' && pos[1] < ROOM.wallH + 6 - it.h)) return { ok: false, reason: it.zone === 'wall' ? 'To wisi na ścianie.' : 'To stoi na podłodze.' };
  if (it.zone === 'wall') {
    const r = [pos[0], pos[1], it.w, it.h], w = ROOMS[it.room].win;
    if (w && overlap(r, [w[0] - 3, w[1] - 3, w[2] - w[0] + 7, w[3] - w[1] + 10])) return { ok: false, reason: 'Okno musi zostać odsłonięte.' };
    for (const [o, p] of others) if (ITEMS[o].zone === 'wall' && overlap(r, [p[0], p[1], ITEMS[o].w, ITEMS[o].h])) return { ok: false, reason: 'Tu już coś wisi.' };
    return { ok: true };
  }
  if (it.zone === 'rug') return { ok: true };
  const f = footprint(id, pos);
  for (const [o, p] of others) {
    const z = ITEMS[o].zone;
    if (z !== 'floor' && !(z === 'surface' && !hostOf(o, p, mine))) continue;
    if (overlap(f, footprint(o, p))) return { ok: false, reason: 'Tu już coś stoi.' };
  }
  return { ok: true };
}
// The arrangement to draw: placed items (from the shared outfit) at their saved
// positions, or their default spots; an empty basic place gets its basic piece.
// `slotOf` maps an id to its slot (rewards.js), so this file needs no catalogue.
export function arrange(placedIds, saved = {}, slotOf = () => null) {
  const ids = [...placedIds];
  for (const [b, slot] of Object.entries(BASICS)) if (!ids.some(id => ITEMS[id] && slotOf(id) === slot)) ids.push(b);
  const pos = {};
  for (const id of ids) { const it = ITEMS[id]; if (!it || it.zone === 'bg' || it.zone === 'surface') continue; pos[id] = (saved[id] && clampTo(id, ...saved[id])) || [...it.def]; }
  // things that stand on furniture: a saved spot remembers its furniture as a
  // third value ([x, y, host], set by the server). They stay on it, are carried
  // along when it moves, and are put down on the floor when it is gone.
  for (const id of ids) {
    const it = ITEMS[id]; if (it?.zone !== 'surface') continue;
    const sv = saved[id], p = sv || it.def, floor = (x, y) => clampTo(id, x, Math.max(y, ROOM.wallH + 6 - it.h));
    const on = it.on.find(h => pos[h] && onTop(id, p, h, pos[h]));
    const host = sv?.[2] && it.on.includes(sv[2]) ? sv[2] : on;
    if (host && pos[host]) pos[id] = onTop(id, p, host, pos[host]) ? [p[0], p[1]] : topSpot(id, host, pos[host]);
    else pos[id] = floor(p[0], p[1]);
  }
  return pos;
}
// The saved positions after moving `id` to p (pos = the arrangement before):
// a thing put on furniture remembers it, things on moved furniture go along.
export function applyMove(saved, id, [x, y], pos) {
  const room = { ...saved }, host = hostOf(id, [x, y], pos);
  room[id] = host ? [x, y, host] : [x, y];
  for (const [o, op] of Object.entries(pos)) if (ITEMS[o].zone === 'surface' && ITEMS[o].on.includes(id) && onTop(o, op, id, pos[id])) room[o] = [op[0], op[1], id];
  return room;
}
export const inRoom = (pos, room) => Object.fromEntries(Object.entries(pos).filter(([id]) => ITEMS[id]?.room === room));
// draw order: wall things, then rugs, then floor things by how low they stand;
// a thing on top of furniture is drawn just in front of it
export function depth(id, [, y], placed) {
  const it = ITEMS[id];
  if (it.zone === 'fixed' || it.zone === 'wall') return 2;
  if (it.zone === 'rug') return 3;
  const host = placed && it.zone === 'surface' && hostOf(id, [placed[id]?.[0] ?? 0, y], placed);
  if (host) return 10 + placed[host][1] + ITEMS[host].h + 1;
  return 10 + y + it.h; // lower on screen = closer = in front
}
