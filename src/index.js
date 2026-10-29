import { BY_ID, unlockedIds, sanitizeOutfit, claimable } from '../public/rewards.js';

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

// Incremental, backwards compatible migrations: they only add tables and
// columns (see migrations/0002_rewards.sql, 0003_inventory.sql). Nothing is dropped.
let schemaReady=false;
async function ensureSchema(env){
 if(schemaReady)return;
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pair_prefs (pair_id TEXT PRIMARY KEY REFERENCES pairs(id), radius INTEGER NOT NULL DEFAULT 150, equipped TEXT NOT NULL DEFAULT '[]', opened TEXT NOT NULL DEFAULT '[]', seen_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`).run();
 const cols=new Set(((await env.DB.prepare('PRAGMA table_info(pair_prefs)').all()).results||[]).map(c=>c.name));
 for(const [c,def] of [['claimed',"TEXT NOT NULL DEFAULT '[]'"],['version','INTEGER NOT NULL DEFAULT 0'],['last_change','TEXT']]){
  if(cols.has(c))continue;
  try{await env.DB.prepare(`ALTER TABLE pair_prefs ADD COLUMN ${c} ${def}`).run()}catch(e){if(!/duplicate column/i.test(String(e?.message)))throw e}
 }
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS member_tokens (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), created_at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS member_recovery (member_id TEXT PRIMARY KEY REFERENCES members(id), code_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)'),
 ]);
 schemaReady=true;
}
const countOf=async(env,pairId)=>(await env.DB.prepare('SELECT COUNT(*) AS n FROM meetings WHERE pair_id=?').bind(pairId).first()).n;
const PREF_COLS='radius,equipped,opened,claimed,seen_count,version,last_change';
async function prefs(env,pairId){
 let p=await env.DB.prepare(`SELECT ${PREF_COLS} FROM pair_prefs WHERE pair_id=?`).bind(pairId).first();
 if(!p){
  await env.DB.prepare('INSERT OR IGNORE INTO pair_prefs(pair_id,seen_count,updated_at) VALUES (?,?,?)').bind(pairId,await countOf(env,pairId),Date.now()).run();
  p=await env.DB.prepare(`SELECT ${PREF_COLS} FROM pair_prefs WHERE pair_id=?`).bind(pairId).first();
 }
 const equipped=parse(p.equipped,[]),opened=parse(p.opened,[]);
 // rows from before the inventory existed: whatever was worn or opened counts as claimed
 const claimed=[...new Set([...parse(p.claimed,[]),...equipped,...opened,...opened.map(g=>BY_ID[g]?.reveals).filter(Boolean)])];
 let last=null;try{last=p.last_change?JSON.parse(p.last_change):null}catch{}
 return {radius:p.radius,equipped,opened,claimed,seenCount:p.seen_count,version:Number(p.version)||0,lastChange:last};
}
// Inventory writes use optimistic concurrency: the row is written only if its
// version is still the one we read; otherwise we re-read and re-apply the
// change, so two phones changing different slots at the same moment both win.
async function mutate(env,pairId,fn){
 for(let i=0;i<5;i++){
  const p=await prefs(env,pairId),n=await countOf(env,pairId);
  const next=fn(p,n);if(!next)return;
  const r=await env.DB.prepare('UPDATE pair_prefs SET equipped=?,claimed=?,opened=?,last_change=?,version=version+1,updated_at=? WHERE pair_id=? AND version=?')
   .bind(JSON.stringify(next.equipped??p.equipped),JSON.stringify(next.claimed??p.claimed),JSON.stringify(next.opened??p.opened),JSON.stringify(next.change),Date.now(),pairId,p.version).run();
  if(r.meta?.changes===1)return;
 }
 throw new Error('busy');
}
// After the shared count changed: remember it and take off anything that is locked again.
async function syncRewards(env,pairId){
 const p=await prefs(env,pairId),n=await countOf(env,pairId);
 if(n===p.seenCount)return;
 const outfit=sanitizeOutfit(p.equipped,n,p.opened);
 await env.DB.prepare('UPDATE pair_prefs SET seen_count=?,equipped=?,version=version+?,updated_at=? WHERE pair_id=?').bind(n,JSON.stringify(outfit),outfit.length!==p.equipped.length?1:0,Date.now(),pairId).run();
}
async function insertMeeting(env,pairId,when,source,by){
 await env.DB.prepare('INSERT INTO meetings (id,pair_id,occurred_at,source,created_by,created_at) VALUES (?,?,?,?,?,?)').bind(id(),pairId,when,source,by,Date.now()).run();
 await syncRewards(env,pairId);
}

const MEMBER_SQL='SELECT m.id,m.pair_id,m.display_name,m.slot,p.invite_code,p.first_met_at,p.created_at FROM members m JOIN pairs p ON p.id=m.pair_id';
// a session is the token from create/join, or one issued later by a login code
async function member(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!/^[a-f0-9]{64}$/.test(token))return null;const hash=await sha(token);
 return await env.DB.prepare(MEMBER_SQL+' WHERE m.token_hash=?').bind(hash).first()||await env.DB.prepare(MEMBER_SQL+' JOIN member_tokens t ON t.member_id=m.id WHERE t.token_hash=?').bind(hash).first()}

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
  rewards:{unlocked:unlockedIds(n),claimed:p.claimed.filter(x=>claimable(BY_ID[x],n,p.opened)),equipped:sanitizeOutfit(p.equipped,n,p.opened,p.claimed),opened:p.opened,version:p.version,lastChange:p.lastChange},
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
 if(method==='POST'&&path==='/api/restore'){
  // Sign in again (new phone, cleared storage) with the personal login code from settings.
  const b=await body(req),c=typeof b?.code==='string'?b.code.toUpperCase().replace(/[^A-Z0-9]/g,''):'';
  if(c.length!==12)return bad('Kod logowania ma 12 znaków.');
  const r=await env.DB.prepare('SELECT member_id FROM member_recovery WHERE code_hash=?').bind(await sha('login:'+c)).first();
  if(!r)return bad('Nie znaleziono konta dla tego kodu.',404);
  const t=randomToken();await env.DB.prepare('INSERT INTO member_tokens(token_hash,member_id,created_at) VALUES (?,?,?)').bind(await sha(t),r.member_id,Date.now()).run();
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
 if(method==='POST'&&path==='/api/claim'){
  // Claim an earned reward into the pair's one shared inventory; a wearable goes on if its slot is free.
  const b=await body(req),r=BY_ID[b?.id];if(!r)return bad('Nie ma takiej nagrody.');
  let err=null;
  await mutate(env,m.pair_id,(p,n)=>{
   if(!claimable(r,n,p.opened)){err=bad('Ta nagroda jest jeszcze zablokowana.',403);return null}
   if(p.claimed.includes(r.id))return null;
   const claimed=[...p.claimed,r.id],opened=[...p.opened];
   if(r.reveals){opened.push(r.id);claimed.push(r.reveals)}
   // a free slot is filled right away; badges go to the trophy case (pinning is a separate choice)
   const free=!!r.slot&&r.slot!=='pin'&&!p.equipped.some(x=>BY_ID[x]?.slot===r.slot);
   return {claimed,opened,equipped:free?[...p.equipped,r.id]:p.equipped,change:{op:'claim',id:r.id,worn:free,by:m.slot,at:Date.now()}};
  });
  return err||ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/equip'){
  const b=await body(req);
  // stage-2 clients send the whole outfit
  if(Array.isArray(b?.items)){
   if(b.items.length>12)return bad('Nieprawidłowe wyposażenie.');
   await mutate(env,m.pair_id,(p,n)=>({equipped:sanitizeOutfit(b.items.filter(x=>typeof x==='string'),n,p.opened,p.claimed),change:{op:'outfit',by:m.slot,at:Date.now()}}));
   return ok(await state(env,m));
  }
  // One change at a time: {op:'equip'|'unequip', id, expect}. `expect` is what this phone
  // believed was in that slot; if the partner changed the same slot in the meantime nothing
  // is overwritten: 409 with the fresh state, so the phone can show the partner's choice.
  const r=BY_ID[b?.id],op=b?.op;
  if(!r||!r.slot||!['equip','unequip'].includes(op))return bad('Nieprawidłowe wyposażenie.');
  let err=null;
  await mutate(env,m.pair_id,(p,n)=>{
   if(!claimable(r,n,p.opened)||!p.claimed.includes(r.id)){err=bad('Najpierw odbierzcie tę nagrodę.',403);return null}
   const cur=p.equipped.find(x=>BY_ID[x]?.slot===r.slot)||null;
   if(b.expect!==undefined&&(b.expect||null)!==cur){err='conflict';return null}
   if(op==='equip'){if(cur===r.id)return null;return {equipped:[...p.equipped.filter(x=>x!==cur),r.id],change:{op,id:r.id,prev:cur,by:m.slot,at:Date.now()}}}
   if(cur!==r.id)return null;
   return {equipped:p.equipped.filter(x=>x!==r.id),change:{op,id:r.id,by:m.slot,at:Date.now()}};
  });
  if(err==='conflict')return Response.json({error:'Druga osoba właśnie to zmieniła — zobaczcie, co wybrała.',conflict:true,state:await state(env,m)},{status:409,headers:{'Cache-Control':'no-store'}});
  return err||ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/open-gift'){
  // kept for stage-2 clients: opening a gift is claiming it
  const b=await body(req),r=BY_ID[b?.id];
  if(!r||!r.reveals)return bad('To nie jest prezent.');
  let err=null;
  await mutate(env,m.pair_id,(p,n)=>{
   if(n<r.at){err=bad('Ten prezent jest jeszcze zamknięty.',403);return null}
   if(p.opened.includes(r.id))return null;
   return {opened:[...p.opened,r.id],claimed:[...new Set([...p.claimed,r.id,r.reveals])],change:{op:'claim',id:r.id,by:m.slot,at:Date.now()}};
  });
  return err||ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/login-code'){
  // personal code for signing in on another phone; a new code replaces the previous one
  const c=Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>alphabet[x%alphabet.length]).join('');
  await env.DB.prepare('INSERT INTO member_recovery(member_id,code_hash,created_at) VALUES (?,?,?) ON CONFLICT(member_id) DO UPDATE SET code_hash=excluded.code_hash,created_at=excluded.created_at').bind(m.id,await sha('login:'+c),Date.now()).run();
  return ok({code:c});
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
export default {async fetch(request,env){const url=new URL(request.url),path=url.pathname;if(path.startsWith('/api/')){if(!env.DB)return bad('Brak połączenia z bazą.',503);if(request.method==='OPTIONS')return new Response(null,{status:405});try{return await api(request,env,path)}catch(e){if(e?.message==='busy')return bad('Druga osoba właśnie coś zmienia — spróbujcie za chwilę.',409);console.error('Razem API error',e);return bad('Wystąpił problem. Spróbuj ponownie.',500)}}if(env.ASSETS)return env.ASSETS.fetch(request);return new Response('Brak zasobów strony',{status:404})}};
