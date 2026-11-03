// Personal avatars: a selfie becomes the person's own chibi in the app's style.
//
// Privacy: the selfie only lives in this request's memory. It is sent to the
// image model and dropped; it is never written to D1, R2 or the logs. Only the
// finished picture the person chooses is kept (table `avatars`), plus short-
// lived drafts (`avatar_drafts`, the pictures shown to choose from) that are
// removed once one is chosen, after an hour, on "Usuń mój awatar" and on unpair.
//
// Costs: Workers AI's free allocation is 10,000 neurons a day for the whole
// account (reset 00:00 UTC). Every picture is counted in `avatar_pool` and the
// Worker stops before the cap below, so the account never runs into paid usage
// on its own. Each person may draw a few pictures a day (`avatar_usage`).

// ---------------------------------------------------------------- configuration
// The one place to change the provider, the models, the limits and the style.
export const AVATAR = {
  provider: 'workers-ai',                                   // see PROVIDERS below
  drawModel: '@cf/black-forest-labs/flux-2-klein-4b',       // FLUX.2 [klein] 4B: up to 4 input images, each under 512x512
  describeModel: '@cf/meta/llama-4-scout-17b-16e-instruct', // reads hair, beard, eyes... from the photo
  size: 512,                                                // output: 512x512 JPEG
  styleRefs: ['/img/avatar-style-1.png', '/img/avatar-style-2.png'], // the app's own portraits, as the style reference
  perPersonDaily: 4,         // pictures per person per day (UTC)
  accountNeuronCap: 9000,    // stop for everyone at this many neurons a day (free allocation: 10,000)
  neurons: { draw: 120, describe: 26 }, // measured: one 512px picture with 3 inputs ~117, the description ~23-25
  timeoutMs: 45000,
  draftTtlMs: 3600000,
};

// Fixed style for everyone, so all avatars look like one series. The person's
// features (from describe) are the only part that changes.
export const stylePrompt = features => `A cute chibi anime avatar portrait of the adult person in image 0, drawn in the same art style as the reference avatars in images 1 and 2: soft pastel kawaii illustration, oversized round head, rosy pink blush on the cheeks, soft cel shading, clean thin warm-brown outlines, warm soft colours. Use the reference images only for the drawing style, never for the hair, face, accessories or clothes. Expression: a playful wink with a happy gentle smile; the eye on the right side of the image is closed as a curved line, the eye on the left side of the image is open, big and shiny, in the person's real eye colour. Head and shoulders, facing the viewer, centred. Keep the person's real age: a young adult drawn in chibi style, neither a child nor older than in the photo. Likeness is the most important thing: keep the real hairstyle, hair length and hair colour, using natural slightly muted colours (blond hair is a light natural beige blond with a slight warm tint: not grey, not silver, not bright yellow). If the person has a beard, moustache or stubble, draw it clearly and keep its own colour, which may be darker than the hair. Add glasses or earrings only if the person wears them. The person: ${features}. Plain soft cream background, no frame, no circle, no text.`;

const DESCRIBE_PROMPT = 'Describe only the visible appearance of the person for an illustrator, as one comma-separated line, no sentences, no names, no guesses about identity. Give exact colour shades. Include: approximate age group (e.g. adult in their twenties), hair length, hair style, hair colour shade (e.g. ash blond, golden blond, dark brown), facial hair type and its own colour shade (it may differ from the hair) or "clean-shaven", eye colour, glasses (or "no glasses"), earrings or piercings (or "no earrings"), skin tone, clothing colour and type. If there is no person or more than one face, answer exactly NO_FACE or MANY_FACES.';

// ---------------------------------------------------------------- providers
// describe(env, photo: Uint8Array) -> {text, neurons}
// draw(env, {photo, refs: Uint8Array[], prompt, seed}) -> {bytes: Uint8Array, mime, neurons}
// To move to another provider (e.g. fal.ai Nano Banana), add an entry here
// with the same two functions, a secret for its key, and change AVATAR.provider.
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const PROVIDERS = {
  'workers-ai': {
    async describe(env, photo) {
      const r = await env.AI.run(AVATAR.describeModel, { messages: [{ role: 'user', content: [{ type: 'text', text: DESCRIBE_PROMPT }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64(photo) } }] }], max_tokens: 120 });
      return { text: String(r?.response || ''), neurons: Number(r?.usage?.neurons) || AVATAR.neurons.describe };
    },
    async draw(env, { photo, refs, prompt, seed }) {
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('input_image_0', new Blob([photo], { type: 'image/jpeg' }));
      refs.forEach((r, i) => form.append(`input_image_${i + 1}`, new Blob([r], { type: 'image/png' })));
      form.append('width', String(AVATAR.size)); form.append('height', String(AVATAR.size)); form.append('seed', String(seed));
      const body = new Response(form);
      const r = await env.AI.run(AVATAR.drawModel, { multipart: { body: body.body, contentType: body.headers.get('content-type') } });
      if (!r?.image) throw new Error('no image');
      const bytes = unb64(r.image);
      return { bytes, mime: bytes[0] === 0x89 ? 'image/png' : 'image/jpeg', neurons: AVATAR.neurons.draw };
    },
  },
  // Local tests only (AVATAR_MOCK=1 in .dev.vars): no model is called and nothing is paid.
  // Markers in the photo bytes simulate the cases the UI has to handle.
  mock: {
    async describe(env, photo) {
      const t = new TextDecoder().decode(photo.subarray(0, 64));
      return { text: t.includes('NOFACE') ? 'NO_FACE' : t.includes('MANY') ? 'MANY_FACES' : 'adult in their twenties, short hair, test features', neurons: 25 };
    },
    async draw(env, { photo, seed }) {
      const t = new TextDecoder().decode(photo.subarray(0, 64));
      if (t.includes('POOLOUT')) throw new Error('4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare\'s Workers Paid plan');
      if (t.includes('BOOM')) throw new Error('3043: Internal server error');
      await new Promise(r => setTimeout(r, t.includes('SLOW') ? timeoutOf(env) + 1000 : 2500)); // like a real drawing, so the waiting screen shows
      const res = await env.ASSETS.fetch(new Request(`https://assets.local/img/avatar-mock-${1 + (seed % 3)}.jpg`));
      return { bytes: new Uint8Array(await res.arrayBuffer()), mime: 'image/jpeg', neurons: AVATAR.neurons.draw };
    },
  },
};
// local tests only; wrangler may hand the .dev.vars value over as a number
const isMock = env => String(env.AVATAR_MOCK ?? '') === '1';
const provider = env => PROVIDERS[isMock(env) ? 'mock' : AVATAR.provider];
const timeoutOf = env => isMock(env) && Number(env.AVATAR_TIMEOUT_MS) || AVATAR.timeoutMs; // tests may shorten it

// ---------------------------------------------------------------- storage
export const AVATAR_TABLES = [
  'CREATE TABLE IF NOT EXISTS avatars (key TEXT PRIMARY KEY, member_id TEXT NOT NULL, img TEXT NOT NULL, mime TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS ix_avatars_member ON avatars(member_id)',
  'CREATE TABLE IF NOT EXISTS avatar_drafts (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, img TEXT NOT NULL, mime TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS ix_avatar_drafts_member ON avatar_drafts(member_id)',
  'CREATE TABLE IF NOT EXISTS avatar_usage (day TEXT NOT NULL, member_id TEXT NOT NULL, images INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, member_id))',
  'CREATE TABLE IF NOT EXISTS avatar_pool (day TEXT PRIMARY KEY, neurons REAL NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0)',
];
export const avatarUrl = key => key ? `/api/avatar-img/${key}` : null;
const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

// every statement that removes a member's avatar data (used by "Usuń mój awatar" and /api/unpair)
export const avatarDeletes = (env, whereMember, bind) => [
  env.DB.prepare(`DELETE FROM avatars WHERE member_id IN (${whereMember})`).bind(bind),
  env.DB.prepare(`DELETE FROM avatar_drafts WHERE member_id IN (${whereMember})`).bind(bind),
  env.DB.prepare(`DELETE FROM avatar_usage WHERE member_id IN (${whereMember})`).bind(bind),
];

export async function quota(env, memberId) {
  const day = utcDay();
  const mine = (await env.DB.prepare('SELECT images FROM avatar_usage WHERE day=? AND member_id=?').bind(day, memberId).first())?.images || 0;
  const pool = (await env.DB.prepare('SELECT neurons FROM avatar_pool WHERE day=?').bind(day).first())?.neurons || 0;
  return { left: Math.max(0, AVATAR.perPersonDaily - mine), perDay: AVATAR.perPersonDaily, poolOpen: pool + AVATAR.neurons.draw <= AVATAR.accountNeuronCap, ...(isMock(env) ? { mock: true } : {}) };
}

const fail = (status, error, code) => Object.assign(new Error(error), { status, code });
const MSG = {
  me: 'Na dziś to już wszystkie rysunki — spróbuj jutro ♡',
  pool: 'Puszystek dziś już dużo rysował — spróbuj jutro',
  noface: 'Nie widzę twarzy na zdjęciu. Zrób selfie z bliska, na wprost, w dobrym świetle.',
  many: 'Na zdjęciu jest kilka twarzy. Wybierz zdjęcie, na którym jesteś tylko Ty.',
  slow: 'Puszystek rysuje dziś wolniej niż zwykle. Spróbuj jeszcze raz za chwilę.',
  error: 'Nie udało się narysować postaci. Spróbuj jeszcze raz za chwilę.',
  photo: 'Nie udało się odczytać zdjęcia. Wybierz inne.',
};
const isPoolError = e => /4006|daily free allocation|neurons/i.test(String(e?.message || e));
const withTimeout = (p, env) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(fail(504, MSG.slow, 'slow')), timeoutOf(env)))]);

let refsCache = null;
async function styleRefs(env) {
  if (refsCache) return refsCache;
  const list = await Promise.all(AVATAR.styleRefs.map(async p => new Uint8Array(await (await env.ASSETS.fetch(new Request('https://assets.local' + p))).arrayBuffer())));
  return refsCache = list;
}

// POST /api/avatar/generate {photo: data URL (JPEG, under 512x512), features?}
// -> {draft:{id,src}, features, quota}. The photo is used here and forgotten.
export async function generate(env, m, b) {
  const m64 = typeof b?.photo === 'string' ? /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.photo) : null;
  if (!m64 || m64[2].length > 700000) throw fail(400, MSG.photo, 'photo');
  let photo; try { photo = unb64(m64[2]); } catch { throw fail(400, MSG.photo, 'photo'); }
  let features = typeof b?.features === 'string' ? b.features.replace(/[\r\n<>{}]/g, ' ').trim().slice(0, 300) : '';

  // limits: this person's pictures today, then the account's neurons today (both counted before calling)
  const day = utcDay(), cost = AVATAR.neurons.draw + (features ? 0 : AVATAR.neurons.describe);
  const q = await quota(env, m.id);
  if (!q.left) throw fail(429, MSG.me, 'me');
  if (!q.poolOpen) throw fail(429, MSG.pool, 'pool');
  const pooled = await env.DB.prepare('INSERT INTO avatar_pool(day,neurons,images) VALUES (?,?,1) ON CONFLICT(day) DO UPDATE SET neurons=neurons+excluded.neurons,images=images+1 WHERE neurons+excluded.neurons<=? RETURNING neurons').bind(day, cost, AVATAR.accountNeuronCap).first();
  if (!pooled) throw fail(429, MSG.pool, 'pool');
  const mine = await env.DB.prepare('INSERT INTO avatar_usage(day,member_id,images) VALUES (?,?,1) ON CONFLICT(day,member_id) DO UPDATE SET images=images+1 WHERE images<? RETURNING images').bind(day, m.id, AVATAR.perPersonDaily).first();
  // nothing drawn: the person gets the picture back; neurons already spent stay counted
  let spent = 0;
  const refund = async (person = true) => {
    await env.DB.prepare('UPDATE avatar_pool SET neurons=MAX(0,neurons-?),images=MAX(0,images-1) WHERE day=?').bind(cost - spent, day).run();
    if (person) await env.DB.prepare('UPDATE avatar_usage SET images=MAX(0,images-1) WHERE day=? AND member_id=?').bind(day, m.id).run();
  };
  if (!mine) { await refund(false); throw fail(429, MSG.me, 'me'); }

  const p = provider(env);
  try {
    if (!features) {
      const d = await withTimeout(p.describe(env, photo), env);
      spent = Math.min(cost, d.neurons);
      if (/NO_FACE/.test(d.text)) { await refund(); throw fail(422, MSG.noface, 'noface'); }
      if (/MANY_FACES/.test(d.text)) { await refund(); throw fail(422, MSG.many, 'many'); }
      features = d.text.replace(/[\r\n<>{}]/g, ' ').trim().slice(0, 300) || 'adult';
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    const out = await withTimeout(p.draw(env, { photo, refs: await styleRefs(env), prompt: stylePrompt(features), seed }), env);
    photo = null; // the selfie is not kept anywhere
    // drafts: drop stale ones, keep a few for choosing
    await env.DB.prepare('DELETE FROM avatar_drafts WHERE member_id=? AND (created_at<? OR id NOT IN (SELECT id FROM avatar_drafts WHERE member_id=? ORDER BY created_at DESC LIMIT 5))').bind(m.id, Date.now() - AVATAR.draftTtlMs, m.id).run();
    const id = hex(16), img = b64(out.bytes);
    await env.DB.prepare('INSERT INTO avatar_drafts(id,member_id,img,mime,created_at) VALUES (?,?,?,?,?)').bind(id, m.id, img, out.mime, Date.now()).run();
    return { draft: { id, src: `data:${out.mime};base64,${img}` }, features, quota: await quota(env, m.id) };
  } catch (e) {
    if (e?.code === 'slow') { spent = cost; await refund(); } // it may still have been drawn (and paid): keep the neurons
    if (e?.status) throw e;
    // the model said no: nothing was drawn, so nothing is counted against the person
    await refund();
    if (isPoolError(e)) {
      // Workers AI's own daily allocation is used up: close the pool for today too
      await env.DB.prepare('UPDATE avatar_pool SET neurons=? WHERE day=?').bind(AVATAR.accountNeuronCap, day).run();
      throw fail(429, MSG.pool, 'pool');
    }
    console.log(JSON.stringify({ t: 'avatar_error', code: String(e?.message || '').slice(0, 5) })); // no photo, no prompt
    throw fail(502, MSG.error, 'error');
  }
}

// POST /api/avatar/choose {draft} -> the draft becomes this person's avatar (new key = cache busting)
export async function choose(env, m, b) {
  const id = typeof b?.draft === 'string' ? b.draft : '';
  const d = await env.DB.prepare('SELECT img,mime FROM avatar_drafts WHERE id=? AND member_id=?').bind(id, m.id).first();
  if (!d) throw fail(404, 'Ten rysunek już wygasł. Narysuj postać jeszcze raz.', 'gone');
  const key = hex(16);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM avatars WHERE member_id=?').bind(m.id),
    env.DB.prepare('INSERT INTO avatars(key,member_id,img,mime,created_at) VALUES (?,?,?,?,?)').bind(key, m.id, d.img, d.mime, Date.now()),
    env.DB.prepare('UPDATE members SET avatar_key=? WHERE id=?').bind(key, m.id),
    env.DB.prepare('DELETE FROM avatar_drafts WHERE member_id=?').bind(m.id),
  ]);
  return key;
}

// POST /api/avatar/delete -> back to the default picture
export async function remove(env, m) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM avatars WHERE member_id=?').bind(m.id),
    env.DB.prepare('DELETE FROM avatar_drafts WHERE member_id=?').bind(m.id),
    env.DB.prepare('UPDATE members SET avatar_key=NULL WHERE id=?').bind(m.id),
  ]);
}

// GET /api/avatar-img/<key>: the chosen picture. The key is random and changes
// with every new avatar, so the response can be cached for good.
export async function serve(env, key) {
  if (!/^[a-f0-9]{32}$/.test(key)) return null;
  const r = await env.DB.prepare('SELECT img,mime FROM avatars WHERE key=?').bind(key).first();
  if (!r) return null;
  return new Response(unb64(r.img), { headers: { 'Content-Type': r.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
