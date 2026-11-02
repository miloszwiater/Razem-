// Badge medallions (SVG): a ribbon, a beaded metal rim in the reward's rarity
// and an emblem that says what the badge is for. Shared gradients live in
// index.html (#m-*), so many medals on one screen cost nothing extra.
import { BY_ID } from './rewards.js';

// What each badge depicts.
const EMBLEM = { first: 'heart', week: 'sun', badge: 'wingheart', seventy5: 'star', hundred: 'laurel', legend: 'crown', streak3: 'flame', streak30: 'flame', streak100: 'flame' };

// Metal per rarity: rim gradient, inner disc, bead + outline colour, ribbon pair.
const METAL = {
  zwykla: { rim: 'm-rim-blush', disc: 'm-disc-blush', line: '#e58fb3', bead: '#fff5f9', ribbon: ['#f7b3cd', '#ec84ad'] },
  brazowa: { rim: 'm-rim-bronze', disc: 'm-disc-bronze', line: '#b97a52', bead: '#ffe9d6', ribbon: ['#f4b2a6', '#dd8579'] },
  srebrna: { rim: 'm-rim-silver', disc: 'm-disc-silver', line: '#9aa2c4', bead: '#ffffff', ribbon: ['#cdc4f5', '#a594e6'] },
  zlota: { rim: 'm-rim-gold', disc: 'm-disc-gold', line: '#c48f2c', bead: '#fff6d6', ribbon: ['#f8b2cc', '#eb6f9f'] },
  wyjatkowa: { rim: 'm-rim-special', disc: 'm-disc-special', line: '#c59a4a', bead: '#fffaf0', ribbon: ['#c3abf7', '#8f6ce0'] },
};

const heart = (cx, cy, s, fill) => `<path fill="${fill}" d="M${cx} ${cy + 7.6 * s}C${cx - 1.6 * s} ${cy + 6.4 * s} ${cx - 8.6 * s} ${cy + 1.8 * s} ${cx - 8.6 * s} ${cy - 2.6 * s}C${cx - 8.6 * s} ${cy - 5.4 * s} ${cx - 6.6 * s} ${cy - 7.4 * s} ${cx - 4.2 * s} ${cy - 7.4 * s}C${cx - 2.4 * s} ${cy - 7.4 * s} ${cx - 0.9 * s} ${cy - 6.4 * s} ${cx} ${cy - 4.9 * s}C${cx + 0.9 * s} ${cy - 6.4 * s} ${cx + 2.4 * s} ${cy - 7.4 * s} ${cx + 4.2 * s} ${cy - 7.4 * s}C${cx + 6.6 * s} ${cy - 7.4 * s} ${cx + 8.6 * s} ${cy - 5.4 * s} ${cx + 8.6 * s} ${cy - 2.6 * s}C${cx + 8.6 * s} ${cy + 1.8 * s} ${cx + 1.6 * s} ${cy + 6.4 * s} ${cx} ${cy + 7.6 * s}Z"/>`;
const shine = (cx, cy, s) => `<path fill="#fff" opacity=".55" d="M${cx - 5.6 * s} ${cy - 3.2 * s}c.4-1.6 1.9-2.6 3.3-2.3-.9.6-1.6 1.6-1.8 2.7-.2.8-1.6.7-1.5-.4z"/>`;

const EMBLEMS = {
  heart: () => heart(32, 31, 1.15, 'url(#m-heart)') + shine(32, 31, 1.15) +
    // tiny engraved flourishes either side
    `<path d="M17.5 31.5q2.5-2.4 4.6-.6M46.5 31.5q-2.5-2.4-4.6-.6" fill="none" stroke="#e58fb3" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`,
  // a flame with the number of days in a row
  flame: r => `<path fill="url(#m-sun)" stroke="#e8962e" stroke-width="1" stroke-linejoin="round" d="M32 17.5c1.8 4.6 8.6 7.6 8.6 14.4 0 5.2-3.9 8.6-8.6 8.6s-8.6-3.4-8.6-8.6c0-3.8 2.2-5.8 3.6-7.8.4 2.4 1.4 3.6 2.6 4.2-.6-4.4.2-7.8 2.4-10.8z"/>` +
    `<text x="32" y="36.6" text-anchor="middle" font-family="DM Sans, sans-serif" font-weight="800" font-size="${r?.at >= 100 ? 7.4 : 9}" fill="#8a3d12">${r?.at ?? ''}</text>`,
  sun: () => {
    const rays = Array.from({ length: 7 }, (_, i) => { const a = (-90 + i * 360 / 7) * Math.PI / 180; return `<line x1="${(32 + Math.cos(a) * 9).toFixed(1)}" y1="${(31 + Math.sin(a) * 9).toFixed(1)}" x2="${(32 + Math.cos(a) * 13).toFixed(1)}" y2="${(31 + Math.sin(a) * 13).toFixed(1)}"/>`; }).join('');
    return `<g stroke="#f2a531" stroke-width="2.4" stroke-linecap="round">${rays}</g><circle cx="32" cy="31" r="7.4" fill="url(#m-sun)"/>` +
      `<path d="M29 30.2h.01M35 30.2h.01" stroke="#7a4a1a" stroke-width="1.9" stroke-linecap="round"/><path d="M29.4 33q2.6 2.4 5.2 0" fill="none" stroke="#7a4a1a" stroke-width="1.3" stroke-linecap="round"/>`;
  },
  wingheart: () => `<path fill="#fff" stroke="#a594e6" stroke-width="1" d="M23 29c-4.4-.6-7.4-3.4-7.8-6.6 2.6 1 4.6.6 6.6 1.6-1.8-1.6-2.4-3-2.2-4.6 2.4 1.8 4.4 2.6 6.4 4.4z"/>` +
    `<path fill="#fff" stroke="#a594e6" stroke-width="1" d="M41 29c4.4-.6 7.4-3.4 7.8-6.6-2.6 1-4.6.6-6.6 1.6 1.8-1.6 2.4-3 2.2-4.6-2.4 1.8-4.4 2.6-6.4 4.4z"/>` +
    heart(32, 31.5, .95, 'url(#m-heart)') + shine(32, 31.5, .95),
  star: () => `<path fill="url(#m-sun)" stroke="#d9952a" stroke-width="1" stroke-linejoin="round" d="M32 19.6l3.3 6.8 7.5 1-5.4 5.2 1.3 7.4L32 36.5 25.3 40l1.3-7.4-5.4-5.2 7.5-1z"/>` +
    `<path fill="#fff" opacity=".6" d="M30.4 24.6l1.6-3.2.9 1.9z"/>` + heart(32, 30.6, .32, '#f2588f'),
  laurel: () => {
    const leaf = (x, y, r, flip) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="3.2" transform="rotate(${flip ? -r : r} ${x} ${y})"/>`;
    const L = [[21.5, 36, -40], [19.6, 31, -20], [20, 25.6, 5], [22.6, 21.2, 30]];
    return `<g fill="#6fbf86">${L.map(([x, y, r]) => leaf(x, y, r)).join('')}${L.map(([x, y, r]) => leaf(64 - x, y, r, 1)).join('')}</g>` +
      `<path d="M23.6 39.4q8.4 4.4 16.8 0" fill="none" stroke="#4f9a62" stroke-width="1.2" stroke-linecap="round"/>` + heart(32, 30.6, .82, 'url(#m-heart)') + shine(32, 30.6, .82);
  },
  crown: () => `<path fill="url(#m-sun)" stroke="#c48f2c" stroke-width="1" stroke-linejoin="round" d="M21.6 36.4l-1.8-12 6.4 4.8L32 20l5.8 9.2 6.4-4.8-1.8 12z"/>` +
    `<rect x="21.6" y="36" width="20.8" height="3.6" rx="1.2" fill="#e9b444" stroke="#c48f2c" stroke-width=".8"/>` +
    `<circle cx="19.8" cy="24.2" r="1.5" fill="#fff4c9"/><circle cx="44.2" cy="24.2" r="1.5" fill="#fff4c9"/><circle cx="32" cy="19.8" r="1.6" fill="#fff4c9"/>` +
    heart(32, 31.6, .4, '#f2588f'),
};

// A medal for reward `r` with rarity `rar` (from rewards.js rarityOf).
export function medalSVG(r, rar, cls = '') {
  const m = METAL[rar] || METAL.zwykla;
  const em = EMBLEMS[EMBLEM[r.id]] || EMBLEMS.heart;
  const beads = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return `<circle cx="${(32 + Math.cos(a) * 19.2).toFixed(2)}" cy="${(31 + Math.sin(a) * 19.2).toFixed(2)}" r=".95"/>`; }).join('');
  const sparkles = rar === 'wyjatkowa' ? `<g class="m-spark" fill="#fff"><path d="M52 9l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"/><path d="M10 17l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></g>` : '';
  return `<svg class="medal ${cls}" data-rarity="${rar}" viewBox="0 0 64 72" role="img" aria-label="${r.name}">
    <path d="M22 44l-6 24 7.6-4.4L28 70l5-23z" fill="${m.ribbon[0]}"/><path d="M42 44l6 24-7.6-4.4L36 70l-5-23z" fill="${m.ribbon[1]}"/>
    <circle cx="32" cy="31" r="23.6" fill="url(#${m.rim})" stroke="${m.line}" stroke-width="1.2"/>
    <g fill="${m.bead}" opacity=".9">${beads}</g>
    <circle cx="32" cy="31" r="16.6" fill="url(#${m.disc})" stroke="${m.line}" stroke-width=".9"/>
    ${em(r)}
    <path d="M14.8 22.4A19 19 0 0 1 41.6 13" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
    ${sparkles}
  </svg>`;
}
export const isMedal = r => !!EMBLEM[r?.id] || r?.slot === 'pin';
export const medalFor = (id, rar) => medalSVG(BY_ID[id], rar);
