// The selfie for the personal avatar, prepared entirely on this phone:
// orientation, a face check and a square crop around the face. The face check
// (pico.js, MIT, ~6 KB + a 234 KB model) is loaded only when a photo is picked
// and runs locally; nothing about the photo is sent anywhere until the person
// asks Puszystek to draw. Only the small crop (under 512x512, as the image
// model requires) goes to the Worker, which never stores it.

const OUT = 496;          // the image model takes inputs under 512x512
const DETECT_SIDE = 480;  // the face check works on a small grey copy
const MIN_SCORE = 10;     // pico's confidence for "this is a face" (a real selfie scores ~35-60)

let picoLoad = null;
function loadPico() {
  return picoLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/pico.js';
    s.onload = async () => {
      try {
        const bytes = new Int8Array(await (await fetch('/vendor/facefinder.bin')).arrayBuffer());
        resolve({ pico: window.pico, cascade: window.pico.unpack_cascade(bytes) });
      } catch (e) { reject(e); }
    };
    s.onerror = reject;
    document.head.appendChild(s);
  }).catch(e => { picoLoad = null; throw e; });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie udało się otworzyć zdjęcia. Wybierz inne.')); };
    img.src = url; // browsers apply the photo's EXIF orientation to <img>
  });
}

// faces on the photo: [{x, y, size, score}] in the photo's pixels
async function findFaces(img) {
  const { pico, cascade } = await loadPico();
  const k = Math.min(1, DETECT_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), hgt = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, hgt);
  const rgba = g.getImageData(0, 0, w, hgt).data, gray = new Uint8Array(w * hgt);
  for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4] * 2 + rgba[i * 4 + 1] * 7 + rgba[i * 4 + 2]) / 10;
  const params = { shiftfactor: 0.1, minsize: Math.round(Math.min(w, hgt) * 0.15), maxsize: Math.max(w, hgt), scalefactor: 1.1 };
  const dets = pico.cluster_detections(pico.run_cascade({ pixels: gray, nrows: hgt, ncols: w, ldim: w }, cascade, params), 0.2);
  return dets.filter(d => d[3] >= MIN_SCORE).sort((a, b) => b[3] - a[3]).map(([r, col, s, score]) => ({ x: col / k, y: r / k, size: s / k, score }));
}

// Read a picked photo: {photo: JPEG data URL (496x496), preview, faces: n | null when the check could not run}
export async function readPhoto(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('To nie jest zdjęcie. Wybierz zdjęcie twarzy.');
  const img = await loadImage(file);
  const W = img.naturalWidth, H = img.naturalHeight;
  let faces = null;
  try { faces = await findFaces(img); } catch { faces = null; }
  // head and shoulders: a square about 2.4 faces wide, a little below the face's centre
  let side = Math.min(W, H), cx = W / 2, cy = H / 2;
  if (faces?.length) { const f = faces[0]; side = Math.min(W, H, f.size * 2.4); cx = f.x; cy = f.y + f.size * 0.2; }
  const x = Math.max(0, Math.min(W - side, cx - side / 2)), y = Math.max(0, Math.min(H - side, cy - side / 2));
  const c = document.createElement('canvas'); c.width = OUT; c.height = OUT;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, x, y, side, side, 0, 0, OUT, OUT);
  const photo = c.toDataURL('image/jpeg', 0.9);
  return { photo, faces: faces ? faces.length : null };
}
