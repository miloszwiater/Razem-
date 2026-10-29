import { REWARDS, BY_ID, unlockedIds, sanitizeOutfit } from '../public/rewards.js';

const bad=(message,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
const ok=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const id=()=>crypto.randomUUID();
const randomToken=()=>{const a=crypto.getRandomValues(new Uint8Array(32));return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')};
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n%alphabet.length]).join('');
async function sha(s){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('')}
const norm=s=>typeof s==='string'?s.trim().slice(0,28):'';
const body=async req=>{try{return await req.json()}catch{return null}};
const distance=(a,b,c,d)=>{const R=6371000;const r=x=>x*Math.PI/180;const t=r(c-a),u=r(d-b);const z=Math.sin(t/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(u/2)**2;return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z))};
const parse=(s,d)=>{try{const v=JSON.parse(s);return Array.isArray(v)?v:d}catch{return d}};

// Proximity rules. A position is usable for 3 minutes; its reported accuracy
// must not be worse than the chosen radius (capped at 150 m). Being "near"
// starts a session; it has to hold for MIN_CONFIRM before the pair may confirm
// a meeting and for MIN_AUTO before one is recorded automatically. A session
// counts once; it ends only after the pair has been clearly apart (radius +
// 200 m hysteresis) for 30 minutes.
const RADII=[100,150,300,500];
const FRESH=180000, MIN_CONFIRM=60000, MIN_AUTO=10*60000, APART_RESET=30*60000;
const maxAccuracy=radius=>Math.min(150,Math.max(50,radius));

// Incremental, backwards compatible migration: only adds a table (see migrations/0002_rewards.sql).
let schemaReady=false;
async function ensureSchema(env){
 if(schemaReady)return;
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pair_prefs (pair_id TEXT PRIMARY KEY REFERENCES pairs(id), radius INTEGER NOT NULL DEFAULT 150, equipped TEXT NOT NULL DEFAULT '[]', opened TEXT NOT NULL DEFAULT '[]', seen_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`).run();
 schemaReady=true;
}
const countOf=async(env,pairId)=>(await env.DB.prepare('SELECT COUNT(*) AS n FROM meetings WHERE pair_id=?').bind(pairId).first()).n;
async function prefs(env,pairId){
 let p=await env.DB.prepare('SELECT radius,equipped,opened,seen_count FROM pair_prefs WHERE pair_id=?').bind(pairId).first();
 if(!p){
  // First visit after the update: dress Puszystek in the best head and neck item the pair already earned.
  const n=await countOf(env,pairId);
  const best=['head','neck'].map(s=>REWARDS.filter(r=>r.slot===s&&n>=r.at).at(-1)?.id).filter(Boolean);
  await env.DB.prepare('INSERT OR IGNORE INTO pair_prefs(pair_id,equipped,seen_count,updated_at) VALUES (?,?,?,?)').bind(pairId,JSON.stringify(best),n,Date.now()).run();
  p=await env.DB.prepare('SELECT radius,equipped,opened,seen_count FROM pair_prefs WHERE pair_id=?').bind(pairId).first();
 }
 return {radius:p.radius,equipped:parse(p.equipped,[]),opened:parse(p.opened,[]),seenCount:p.seen_count};
}
// After the shared count changed: newly unlocked wearables are put on automatically (one per slot).
async function syncRewards(env,pairId){
 const p=await prefs(env,pairId),n=await countOf(env,pairId);
 if(n<=p.seenCount){if(n<p.seenCount)await env.DB.prepare('UPDATE pair_prefs SET seen_count=? WHERE pair_id=?').bind(n,pairId).run();return}
 const fresh=REWARDS.filter(r=>r.slot&&!r.hidden&&r.at>p.seenCount&&r.at<=n).map(r=>r.id);
 const outfit=sanitizeOutfit([...p.equipped,...fresh],n,p.opened);
 await env.DB.prepare('UPDATE pair_prefs SET equipped=?,seen_count=?,updated_at=? WHERE pair_id=?').bind(JSON.stringify(outfit),n,Date.now(),pairId).run();
}
async function insertMeeting(env,pairId,when,source,by){
 await env.DB.prepare('INSERT INTO meetings (id,pair_id,occurred_at,source,created_by,created_at) VALUES (?,?,?,?,?,?)').bind(id(),pairId,when,source,by,Date.now()).run();
 await syncRewards(env,pairId);
}

async function member(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!/^[a-f0-9]{64}$/.test(token))return null;return await env.DB.prepare('SELECT m.id,m.pair_id,m.display_name,m.slot,p.invite_code,p.first_met_at,p.created_at FROM members m JOIN pairs p ON p.id=m.pair_id WHERE m.token_hash=?').bind(await sha(token)).first()}

function proximity(rows,pair,radius,you,now=Date.now()){
 const mine=rows.find(r=>r.slot===you),other=rows.find(r=>r.slot!==you);
 const live=r=>!!r&&r.location_at>now-FRESH;
 const out={radius,mine:live(mine),partner:live(other),fresh:false,near:false,distance:null,since:null,recorded:!!pair.active_recorded,canConfirm:false};
 if(rows.length===2&&rows.every(r=>live(r)&&r.accuracy<=maxAccuracy(radius))){
  const d=distance(rows[0].latitude,rows[0].longitude,rows[1].latitude,rows[1].longitude);
  out.fresh=true;out.distance=Math.round(d/10)*10;out.near=d<=radius;
  if(out.near&&pair.active_since){out.since=Number(pair.active_since);out.canConfirm=!pair.active_recorded&&now-out.since>=MIN_CONFIRM}
 }
 return out;
}

async function state(env,m){
 const pair=await env.DB.prepare('SELECT first_met_at,created_at,invite_code,active_since,active_recorded FROM pairs WHERE id=?').bind(m.pair_id).first();if(!pair)return null;
 const ms=await env.DB.prepare('SELECT id,display_name,slot,location_at,latitude,longitude,accuracy FROM members WHERE pair_id=? ORDER BY slot').bind(m.pair_id).all();
 const meets=await env.DB.prepare('SELECT id,occurred_at,source FROM meetings WHERE pair_id=? ORDER BY occurred_at DESC LIMIT 60').bind(m.pair_id).all();
 const n=await countOf(env,m.pair_id);
 const p=await prefs(env,m.pair_id);
 const rows=ms.results||[];
 return {you:m.slot,members:rows.map(x=>({name:x.display_name,slot:x.slot,locationActive:Number(x.location_at||0)>Date.now()-FRESH})),code:rows.length<2?pair.invite_code:null,firstMetAt:pair.first_met_at,createdAt:pair.created_at,count:n,meetings:meets.results||[],together:!!pair.active_since&&Number(pair.active_since)>Date.now()-3600000,connected:rows.length===2,
  rewards:{unlocked:unlockedIds(n),equipped:sanitizeOutfit(p.equipped,n,p.opened),opened:p.opened},
  proximity:proximity(rows,pair,p.radius,m.slot)};
}

async function api(req,env,path){
 const method=req.method;
 await ensureSchema(env);
 if(method==='POST'&&path==='/api/create'){
  const b=await body(req);const name=norm(b?.name);if(name.length<2)return bad('Podaj imię (minimum 2 znaki).');
  const pairId=id(),memberId=id(),t=randomToken(),now=Date.now(),join=code();
  await env.DB.batch([env.DB.prepare('INSERT INTO pairs(id,invite_code,created_at) VALUES (?,?,?)').bind(pairId,join,now),env.DB.prepare('INSERT INTO members(id,pair_id,display_name,token_hash,slot,joined_at) VALUES (?,?,?,?,1,?)').bind(memberId,pairId,name,await sha(t),now)]);
  return ok({token:t,code:join},201);
 }
 if(method==='POST'&&path==='/api/join'){
  const b=await body(req),name=norm(b?.name),join=typeof b?.code==='string'?b.code.toUpperCase().replace(/[^A-Z0-9]/g,''):'';
  if(name.length<2||join.length!==8)return bad('Podaj imię i 8-znakowy kod.');
  const p=await env.DB.prepare('SELECT id FROM pairs WHERE invite_code=?').bind(join).first();if(!p)return bad('Nie znaleziono pary dla tego kodu.',404);
  const t=randomToken(),memberId=id(),now=Date.now();
  try{await env.DB.prepare('INSERT INTO members(id,pair_id,display_name,token_hash,slot,joined_at) VALUES (?,?,?,?,2,?)').bind(memberId,p.id,name,await sha(t),now).run()}catch{return bad('Ta para ma już dwie osoby.',409)}
  return ok({token:t},201);
 }
 const m=await member(req,env);if(!m)return bad('Sesja wygasła lub nie została znaleziona.',401);
 if(method==='GET'&&path==='/api/state')return ok(await state(env,m));
 if(method==='POST'&&path==='/api/first-date'){
  const b=await body(req),date=b?.date;
  if(typeof date!=='string'||!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||Date.parse(date)>Date.now()+86400000)return bad('Wybierz prawidłową datę.');
  await env.DB.prepare('UPDATE pairs SET first_met_at=? WHERE id=?').bind(date,m.pair_id).run();return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/meeting'){
  const b=await body(req);const when=b?.at?Date.parse(b.at):Date.now();if(!Number.isFinite(when)||when>Date.now()+60000||when<Date.now()-10*365*86400000)return bad('Nieprawidłowa data.');
  // No duplicate meeting within 6 hours, from either device.
  const recent=await env.DB.prepare('SELECT id FROM meetings WHERE pair_id=? AND occurred_at BETWEEN ? AND ? LIMIT 1').bind(m.pair_id,when-6*3600000,when+6*3600000).first();if(recent)return bad('To spotkanie jest już zapisane (odstęp 6 godzin).',409);
  await insertMeeting(env,m.pair_id,when,'manual',m.id);
  // a manual entry also closes an ongoing proximity session, so it is not counted twice
  if(when>Date.now()-6*3600000)await env.DB.prepare('UPDATE pairs SET active_recorded=1 WHERE id=? AND active_since IS NOT NULL').bind(m.pair_id).run();
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/delete-meeting'){
  const b=await body(req);if(typeof b?.id!=='string')return bad('Brak identyfikatora.');
  await env.DB.prepare('DELETE FROM meetings WHERE id=? AND pair_id=?').bind(b.id,m.pair_id).run();await syncRewards(env,m.pair_id);return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/location'){
  const b=await body(req);const lat=Number(b?.lat),lon=Number(b?.lon),accuracy=Number(b?.accuracy),now=Date.now();
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>1500)return bad('Nieprawidłowy pomiar.');
  // Positions are only transient, overwritten each time. No route or location history.
  await env.DB.prepare('UPDATE members SET latitude=?,longitude=?,accuracy=?,location_at=? WHERE id=?').bind(lat,lon,accuracy,now,m.id).run();
  const {radius}=await prefs(env,m.pair_id);
  const locations=await env.DB.prepare('SELECT latitude,longitude,accuracy,location_at FROM members WHERE pair_id=? ORDER BY slot').bind(m.pair_id).all();
  if(locations.results.length===2){
   const [a,c]=locations.results;const fresh=locations.results.every(x=>x.location_at>now-FRESH && x.accuracy<=maxAccuracy(radius));
   if(fresh){
    const d=distance(a.latitude,a.longitude,c.latitude,c.longitude);
    const p=await env.DB.prepare('SELECT active_since,active_recorded,apart_since FROM pairs WHERE id=?').bind(m.pair_id).first();
    if(d<=radius){
     if(p.apart_since){await env.DB.prepare('UPDATE pairs SET apart_since=NULL WHERE id=?').bind(m.pair_id).run()}
     if(!p.active_since){await env.DB.prepare('UPDATE pairs SET active_since=?,active_recorded=0 WHERE id=?').bind(now,m.pair_id).run()}
     else if(now-p.active_since>=MIN_AUTO && !p.active_recorded){
      const last=await env.DB.prepare('SELECT occurred_at FROM meetings WHERE pair_id=? ORDER BY occurred_at DESC LIMIT 1').bind(m.pair_id).first();
      if(!last||now-last.occurred_at>=12*3600000){await insertMeeting(env,m.pair_id,now,'auto',null)}
      await env.DB.prepare('UPDATE pairs SET active_recorded=1 WHERE id=?').bind(m.pair_id).run();
     }
    }else if(d>radius+200){
     if(!p.apart_since){await env.DB.prepare('UPDATE pairs SET apart_since=? WHERE id=?').bind(now,m.pair_id).run()}
     else if(now-p.apart_since>=APART_RESET){await env.DB.prepare('UPDATE pairs SET active_since=NULL,active_recorded=0 WHERE id=?').bind(m.pair_id).run()}
    }
   }
  }
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/meeting-confirm'){
  // Confirmed proximity meeting: re-checked on the server from fresh, accurate positions only.
  const s=await state(env,m),pr=s.proximity;
  if(!pr.fresh)return bad('Brak świeżej lokalizacji obu osób.',409);
  if(!pr.near)return bad('Nie jesteście teraz blisko siebie.',409);
  if(pr.recorded)return bad('To spotkanie jest już zaliczone.',409);
  if(!pr.canConfirm)return bad('Jeszcze chwilka — sprawdzamy, czy na pewno jesteście razem.',409);
  const now=Date.now();
  const recent=await env.DB.prepare('SELECT id FROM meetings WHERE pair_id=? AND occurred_at>? LIMIT 1').bind(m.pair_id,now-6*3600000).first();
  await env.DB.prepare('UPDATE pairs SET active_recorded=1 WHERE id=?').bind(m.pair_id).run();
  if(recent)return bad('Spotkanie z ostatnich godzin jest już zapisane.',409);
  await insertMeeting(env,m.pair_id,now,'auto',m.id);
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/equip'){
  const b=await body(req);if(!Array.isArray(b?.items)||b.items.length>12)return bad('Nieprawidłowe wyposażenie.');
  const p=await prefs(env,m.pair_id),n=await countOf(env,m.pair_id);
  const outfit=sanitizeOutfit(b.items.filter(x=>typeof x==='string'),n,p.opened);
  await env.DB.prepare('UPDATE pair_prefs SET equipped=?,updated_at=? WHERE pair_id=?').bind(JSON.stringify(outfit),Date.now(),m.pair_id).run();
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/open-gift'){
  const b=await body(req),r=BY_ID[b?.id];
  if(!r||!r.reveals)return bad('To nie jest prezent.');
  const p=await prefs(env,m.pair_id),n=await countOf(env,m.pair_id);
  if(n<r.at)return bad('Ten prezent jest jeszcze zamknięty.',403);
  if(!p.opened.includes(r.id))await env.DB.prepare('UPDATE pair_prefs SET opened=?,updated_at=? WHERE pair_id=?').bind(JSON.stringify([...p.opened,r.id]),Date.now(),m.pair_id).run();
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/settings'){
  const b=await body(req),radius=Number(b?.radius);
  if(!RADII.includes(radius))return bad('Wybierz zasięg: '+RADII.join(', ')+' m.');
  await prefs(env,m.pair_id);
  // a new radius starts a fresh proximity session
  await env.DB.batch([env.DB.prepare('UPDATE pair_prefs SET radius=?,updated_at=? WHERE pair_id=?').bind(radius,Date.now(),m.pair_id),env.DB.prepare('UPDATE pairs SET active_since=NULL,apart_since=NULL WHERE id=? AND active_recorded=0').bind(m.pair_id)]);
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/location-off'){
  await env.DB.prepare('UPDATE members SET latitude=NULL,longitude=NULL,accuracy=NULL,location_at=NULL WHERE id=?').bind(m.id).run();return ok({ok:true});
 }
 return bad('Nie znaleziono adresu.',404);
}
export default {async fetch(request,env){const url=new URL(request.url),path=url.pathname;if(path.startsWith('/api/')){if(!env.DB)return bad('Brak połączenia z bazą.',503);if(request.method==='OPTIONS')return new Response(null,{status:405});try{return await api(request,env,path)}catch(e){console.error('Razem API error',e);return bad('Wystąpił problem. Spróbuj ponownie.',500)}}if(env.ASSETS)return env.ASSETS.fetch(request);return new Response('Brak zasobów strony',{status:404})}};
