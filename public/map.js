// Razem Pixel Map: a real, interactive map (MapLibre GL JS + OpenFreeMap
// vector tiles, our own style in /map-style.json). MapLibre is loaded only when
// the map is first shown. The map is drawn at 1 css px per map px and scaled
// with nearest-neighbour, so streets and parks read as pixel art.
const LIB = 'https://unpkg.com/maplibre-gl@4.7.1/dist/';
let libReady = null;
export function loadLib() {
  if (libReady) return libReady;
  libReady = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LIB + 'maplibre-gl.css'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = LIB + 'maplibre-gl.js'; js.onload = () => res(window.maplibregl); js.onerror = () => { libReady = null; rej(new Error('Nie udało się wczytać mapy.')); };
    document.head.appendChild(js);
  });
  return libReady;
}
const img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
// an accuracy circle as a small polygon (metres -> degrees)
function circle([lon, lat], m, n = 40) {
  const dLat = m / 111320, dLon = m / (111320 * Math.cos(lat * Math.PI / 180));
  return [Array.from({ length: n + 1 }, (_, i) => { const a = i / n * Math.PI * 2; return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]; })];
}
const ago = ms => ms < 90000 ? 'teraz' : ms < 3600000 ? `${Math.round(ms / 60000)} min temu` : 'dawno';

export class PairMap {
  constructor() { this.host = document.createElement('div'); this.host.className = 'pm-host'; this.map = null; this.marks = {}; this.data = null; this.fitted = false; }
  async start() {
    if (this.map || this.starting) return this.starting;
    this.starting = (async () => {
      const ml = await loadLib();
      this.map = new ml.Map({ container: this.host, style: '/map-style.json', center: [21.0122, 52.2297], zoom: 15.5, minZoom: 10, maxZoom: 19, pixelRatio: 1, antialias: false, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0 });
      this.map.touchZoomRotate.disableRotation();
      this.map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
      const [tree, heart] = await Promise.all([img('/img/ui/map-tree.png'), img('/img/ui/map-heart.png')]);
      this.map.on('styleimagemissing', () => { });
      await new Promise(r => this.map.once('load', r));
      this.map.addImage('razem-tree', tree, { pixelRatio: 2 }); this.map.addImage('razem-heart', heart, { pixelRatio: 2 });
      this.map.addSource('acc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      this.map.addLayer({ id: 'acc-fill', type: 'fill', source: 'acc', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': .16, 'fill-antialias': false } });
      this.map.addLayer({ id: 'acc-line', type: 'line', source: 'acc', paint: { 'line-color': ['get', 'c'], 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      this.ml = ml;
      // attribution stays one tap away (the (i) button), not over the controls
      this.host.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      if (this.data) this.update(this.data);
    })();
    return this.starting;
  }
  mark(key, html, offset = [0, 0]) {
    if (!this.marks[key]) { const el = document.createElement('div'); this.marks[key] = new this.ml.Marker({ element: el, anchor: 'bottom' }); }
    const m = this.marks[key]; m.getElement().className = `pm-mark ${key}`; m.getElement().innerHTML = html; m.setOffset(offset); return m;
  }
  drop(key) { this.marks[key]?.remove(); delete this.marks[key]; }
  // me / partner: {lat, lon, acc, age, stale} | null; together: both within meeting distance
  update(d) {
    this.data = d; if (!this.ml) return;
    const pts = [], feats = [];
    // side by side: nudge the two avatars apart so both stay visible
    let near = false;
    if (d.me && d.partner) { const a = this.map.project([d.me.lon, d.me.lat]), b = this.map.project([d.partner.lon, d.partner.lat]); near = Math.hypot(a.x - b.x, a.y - b.y) < 44; }
    for (const [key, p, label, avatar] of [['me', d.me, d.meName, d.meAvatar], ['partner', d.partner, d.partnerName, d.partnerAvatar]]) {
      if (!p) { this.drop(key); continue; }
      const ll = [p.lon, p.lat]; pts.push(ll);
      feats.push({ type: 'Feature', properties: { c: key === 'me' ? '#8a84e2' : '#f2588f' }, geometry: { type: 'Polygon', coordinates: circle(ll, Math.max(8, p.acc || 0)) } });
      this.mark(key, `<span class="pm-av${p.stale ? ' stale' : ''}"><img src="${avatar}" alt=""></span><span class="pm-tag">${label}${p.stale ? ` · ${ago(p.age)}` : ''}</span><i class="pm-tail"></i>`, near ? [key === 'me' ? -22 : 22, 0] : [0, 0]).setLngLat(ll).addTo(this.map);
    }
    if (d.together && pts.length === 2) {
      this.mark('heart', '<span class="pm-heart"></span>', [0, near ? -44 : -52]).setLngLat([(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]).addTo(this.map);
    } else this.drop('heart');
    this.map.getSource('acc')?.setData({ type: 'FeatureCollection', features: feats });
    this.host.classList.toggle('together', !!d.together);
    if (!this.fitted && pts.length) { this.fit(); this.fitted = true; }
  }
  fit(which = 'both') {
    if (!this.map) return;
    const d = this.data || {}, pts = [d.me, d.partner].filter(Boolean).map(p => [p.lon, p.lat]);
    const use = which === 'me' && d.me ? [[d.me.lon, d.me.lat]] : pts;
    if (!use.length) return;
    if (use.length === 1) this.map.easeTo({ center: use[0], zoom: Math.max(this.map.getZoom(), 16), duration: 600 });
    else this.map.fitBounds([[Math.min(use[0][0], use[1][0]), Math.min(use[0][1], use[1][1])], [Math.max(use[0][0], use[1][0]), Math.max(use[0][1], use[1][1])]], { padding: 60, maxZoom: 17.5, duration: 700 });
  }
  // re-project the nudged markers after the view moves
  watch() { if (this.watching || !this.map) return; this.watching = true; this.map.on('zoomend', () => this.data && this.update(this.data)); }
  attach(slot) { this.watch(); if (slot && this.host.parentElement !== slot) slot.appendChild(this.host); this.map?.resize(); }
}
