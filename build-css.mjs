// Compiles styles/app.css -> public/style.css.
// The only transform: `12.5dp` becomes `calc(12.5 * var(--u))`, where --u is one
// design pixel of the 390 px wide reference layout (see :root in app.css).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./styles/app.css', import.meta.url), 'utf8');
const out = src.replace(/(-?\d*\.?\d+)dp\b/g, (_, n) => `calc(${n} * var(--u))`);
writeFileSync(new URL('./public/style.css', import.meta.url), out);
console.log('style.css built', out.length, 'bytes');
