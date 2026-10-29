import { BY_ID, unlockedIds, sanitizeOutfit, claimable, ACHIEVEMENTS, isHouse } from '../public/rewards.js';
import { ITEMS as ROOM_ITEMS, arrange, check as checkPlacement, movable } from '../public/room.js';
import { RULES, RADII, verdict, transition, haversine } from './proximity.js';
import { pushReady, sendPush } from './push.js';

const bad=(message,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
const ok=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const id=()=>crypto.randomUUID();
const randomToken=()=>{const a=crypto.getRandomValues(new Uint8Array(32));return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')};
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n%alphabet.length]).join('');
async function sha(s){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('')}
const norm=s=>typeof s==='string'?s.trim().slice(0,28):'';
const body=async req=>{try{return await req.json()}catch{return null}};
const parse=(s,d)=>{try{const v=JSON.parse(s);return Array.isArray(v)?v:d}catch{return d}};

// Incremental, backwards compatible migrations: they only add tables, columns
// and indexes (migrations/0002..0004). Nothing is dropped or rewritten.
let schemaReady=false;
async function ensureSchema(env){
 if(schemaReady)return;
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pair_prefs (pair_id TEXT PRIMARY KEY REFERENCES pairs(id), radius INTEGER NOT NULL DEFAULT 150, equipped TEXT NOT NULL DEFAULT '[]', opened TEXT NOT NULL DEFAULT '[]', seen_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`).run();
 const addColumns=async(table,list)=>{
  const cols=new Set(((await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results||[]).map(c=>c.name));
  for(const [c,def] of list){if(cols.has(c))continue;try{await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${c} ${def}`).run()}catch(e){if(!/duplicate column/i.test(String(e?.message)))throw e}}
 };
 await addColumns('pair_prefs',[['claimed',"TEXT NOT NULL DEFAULT '[]'"],['version','INTEGER NOT NULL DEFAULT 0'],['last_change','TEXT'],['room',"TEXT NOT NULL DEFAULT '{}'"],['achieved',"TEXT NOT NULL DEFAULT '{}'"]]);
 await addColumns('members',[['geo_on','INTEGER NOT NULL DEFAULT 0'],['ping_at','INTEGER'],['map_on','INTEGER NOT NULL DEFAULT 0']]);
 await addColumns('pairs',[['confirm1_at','INTEGER'],['confirm2_at','INTEGER'],['notified_near_at','INTEGER']]);
 await addColumns('meetings',[['session_key','TEXT']]);
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS member_tokens (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), created_at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS member_recovery (member_id TEXT PRIMARY KEY REFERENCES members(id), code_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS ux_meetings_session ON meetings(session_key) WHERE session_key IS NOT NULL'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)'),
 ]);
 schemaReady=true;
}
const countOf=async(env,pairId)=>(await env.DB.prepare('SELECT COUNT(*) AS n FROM meetings WHERE pair_id=?').bind(pairId).first()).n;
const PREF_COLS='radius,equipped,opened,claimed,seen_count,version,last_change,room,achieved';
const obj=(s)=>{try{const v=JSON.parse(s||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}};
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
 return {radius:p.radius,equipped,opened,claimed,seenCount:p.seen_count,version:Number(p.version)||0,lastChange:last,room:obj(p.room),achieved:obj(p.achieved)};
}
// Inventory writes use optimistic concurrency: the row is written only if its
// version is still the one we read; otherwise we re-read and re-apply the
// change, so two phones changing different slots at the same moment both win.
async function mutate(env,pairId,fn){
 for(let i=0;i<5;i++){
  const p=await prefs(env,pairId),n=await countOf(env,pairId);
  const next=fn(p,n);if(!next)return;
  const r=await env.DB.prepare('UPDATE pair_prefs SET equipped=?,claimed=?,opened=?,room=?,last_change=?,version=version+1,updated_at=? WHERE pair_id=? AND version=?')
   .bind(JSON.stringify(next.equipped??p.equipped),JSON.stringify(next.claimed??p.claimed),JSON.stringify(next.opened??p.opened),JSON.stringify(next.room??p.room),JSON.stringify(next.change),Date.now(),pairId,p.version).run();
  if(r.meta?.changes===1)return;
 }
 throw new Error('busy');
}
// After the shared count changed: remember it and take off anything that is locked again.
async function syncRewards(env,pairId){
 const p=await prefs(env,pairId),n=await countOf(env,pairId);
 // remember when each achievement was reached (0 = before this was recorded)
 const reached=ACHIEVEMENTS.filter(a=>a.source==='meetings'&&n>=a.at&&!(a.id in p.achieved));
 if(reached.length){const ach={...p.achieved};for(const a of reached)ach[a.id]=n>p.seenCount&&a.at>p.seenCount?Date.now():0;await env.DB.prepare('UPDATE pair_prefs SET achieved=? WHERE pair_id=?').bind(JSON.stringify(ach),pairId).run()}
 if(n===p.seenCount)return;
 const outfit=sanitizeOutfit(p.equipped,n,p.opened);
 await env.DB.prepare('UPDATE pair_prefs SET seen_count=?,equipped=?,version=version+?,updated_at=? WHERE pair_id=?').bind(n,JSON.stringify(outfit),outfit.length!==p.equipped.length?1:0,Date.now(),pairId).run();
}
// Records a meeting atomically: one statement inserts only if there is no other
// meeting within 6 h, and a proximity session (session_key, unique index) can
// produce at most one row, so two phones confirming at the same moment cannot
// double count. Returns true if this call created the meeting.
async function recordMeeting(env,ctx,pairId,{when=Date.now(),source,by=null,sessionKey=null}){
 const r=await env.DB.prepare(`INSERT OR IGNORE INTO meetings (id,pair_id,occurred_at,source,created_by,created_at,session_key)
  SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM meetings WHERE pair_id=? AND occurred_at>? AND occurred_at<?)`)
  .bind(id(),pairId,when,source,by,Date.now(),sessionKey,pairId,when-RULES.COOLDOWN,when+RULES.COOLDOWN).run();
 const created=r.meta?.changes===1;
 if(created){
  await syncRewards(env,pairId);
  const n=await countOf(env,pairId);
  notify(env,ctx,pairId,by,{title:'Jesteście razem!',body:`Wasze ${n}. spotkanie zapisane ♥`,tag:'meeting'});
 }
 return created;
}

const MEMBER_SQL='SELECT m.id,m.pair_id,m.display_name,m.slot,p.invite_code,p.first_met_at,p.created_at FROM members m JOIN pairs p ON p.id=m.pair_id';
// a session is the token from create/join, or one issued later by a login code
async function member(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!/^[a-f0-9]{64}$/.test(token))return null;const hash=await sha(token);
 return await env.DB.prepare(MEMBER_SQL+' WHERE m.token_hash=?').bind(hash).first()||await env.DB.prepare(MEMBER_SQL+' JOIN member_tokens t ON t.member_id=m.id WHERE t.token_hash=?').bind(hash).first()}

// ------------------------------------------------------------------ proximity + push helpers
const PAIR_COLS='first_met_at,created_at,invite_code,active_since,active_recorded,apart_since,confirm1_at,confirm2_at,notified_near_at';
const MEMBER_COLS='id,display_name,slot,geo_on,ping_at,location_at,latitude,longitude,accuracy';
const pairRow=(env,pairId)=>env.DB.prepare(`SELECT ${PAIR_COLS} FROM pairs WHERE id=?`).bind(pairId).first();
async function memberRows(env,pairId,now=Date.now()){
 // coordinates are erased 15 minutes after the reading: no location history is kept
 await env.DB.prepare('UPDATE members SET latitude=NULL,longitude=NULL,accuracy=NULL WHERE pair_id=? AND latitude IS NOT NULL AND location_at<?').bind(pairId,now-RULES.KEEP).run();
 return (await env.DB.prepare(`SELECT ${MEMBER_COLS} FROM members WHERE pair_id=? ORDER BY slot`).bind(pairId).all()).results||[];
}
const lastMeeting=async(env,pairId)=>(await env.DB.prepare('SELECT occurred_at FROM meetings WHERE pair_id=? ORDER BY occurred_at DESC LIMIT 1').bind(pairId).first())?.occurred_at??null;
async function judge(env,pairId,you,now=Date.now()){
 const [pair,rows,p,last]=await Promise.all([pairRow(env,pairId),memberRows(env,pairId,now),prefs(env,pairId),lastMeeting(env,pairId)]);
 const me=rows.find(r=>r.slot===you),partner=rows.find(r=>r.slot!==you);
 return {pair,rows,me,partner,v:verdict({me,partner,pair,radius:p.radius,you,now,lastMeetingAt:last})};
}
const setPair=(env,pairId,set)=>{const k=Object.keys(set);return k.length?env.DB.prepare(`UPDATE pairs SET ${k.map(c=>c+'=?').join(',')} WHERE id=?`).bind(...k.map(c=>set[c]),pairId).run():null};
// operational log without coordinates (wrangler tail)
const trace=(pairId,v,what)=>console.log(JSON.stringify({t:'proximity',pair:pairId.slice(0,6),what,stage:v.stage,reason:v.reason,d:v.distance,acc:[v.me.acc,v.partner.acc],age:[v.me.age,v.partner.age]}));
// Push to the pair's phones (all, or all except `except` member id); never delays the response.
function notify(env,ctx,pairId,except,message){
 if(!pushReady(env))return;
 const job=(async()=>{
  const subs=(await env.DB.prepare('SELECT s.endpoint,s.p256dh,s.auth,s.member_id FROM push_subs s JOIN members m ON m.id=s.member_id WHERE m.pair_id=?').bind(pairId).all()).results||[];
  for(const sub of subs.filter(x=>x.member_id!==except)){
   try{const st=await sendPush(env,sub,message,{topic:message.tag});if(st===404||st===410)await env.DB.prepare('DELETE FROM push_subs WHERE endpoint=?').bind(sub.endpoint).run();console.log(JSON.stringify({t:'push',tag:message.tag,status:st}))}
   catch(e){console.error('push failed',e?.message)}
  }
 })();
 if(ctx?.waitUntil)ctx.waitUntil(job);
}
// After a fresh position from member `m`: update the session, record if earned, nudge the partner if useful.
async function afterPosition(env,ctx,m,now=Date.now()){
 const {pair,partner,v}=await judge(env,m.pair_id,m.slot,now);
 const t=transition(v,pair,now);
 await setPair(env,m.pair_id,t.set);
 trace(m.pair_id,v,'position');
 if(t.record){
  const since=t.set.active_since??pair.active_since;
  await recordMeeting(env,ctx,m.pair_id,{source:'auto',sessionKey:`${m.pair_id}:${since}`});
  await env.DB.prepare('UPDATE pairs SET active_recorded=1,confirm1_at=NULL,confirm2_at=NULL WHERE id=?').bind(m.pair_id).run();
 }
 // partner's app is not sending (closed / background) but their last position (<15 min) is near: invite them once per 2 h
 if(partner?.latitude!=null&&v.stage==='waiting'&&v.reason==='partner_stale'){
  const me=(await env.DB.prepare('SELECT latitude,longitude,accuracy FROM members WHERE id=?').bind(m.id).first());
  const d=haversine(me.latitude,me.longitude,partner.latitude,partner.longitude);
  if(d<=RULES.NEAR&&(!pair.notified_near_at||now-pair.notified_near_at>2*3600000)){
   await setPair(env,m.pair_id,{notified_near_at:now});
   notify(env,ctx,m.pair_id,m.id,{title:'Jesteście niedaleko siebie!',body:'Otwórz Razem 💗 Puszystek czeka na wasze spotkanie.',tag:'near'});
  }
 }
}
// The map: my own last position, and my partner's only if they chose to show
// it. Positions older than 2 min are marked stale; they disappear after 15 min.
async function mapView(env,m){
 const rows=await memberRows(env,m.pair_id),now=Date.now();
 const me=rows.find(r=>r.slot===m.slot),pt=rows.find(r=>r.slot!==m.slot);
 const pos=r=>r&&r.latitude!=null?{lat:r.latitude,lon:r.longitude,acc:Math.round(r.accuracy),age:now-r.location_at,stale:now-r.location_at>RULES.FRESH}:null;
 return {me:{name:me.display_name,sharing:!!me.map_on,pos:pos(me)},partner:pt?{name:pt.display_name,sharing:!!pt.map_on,pos:pt.map_on?pos(pt):null}:null};
}
function proximityOut(v,me){
 return {...v,pingAt:Number(me?.ping_at)||null};
}

async function state(env,m){
 await syncRewards(env,m.pair_id);
 const {pair,rows,me,v}=await judge(env,m.pair_id,m.slot);if(!pair)return null;
 const meets=await env.DB.prepare('SELECT id,occurred_at,source FROM meetings WHERE pair_id=? ORDER BY occurred_at DESC LIMIT 60').bind(m.pair_id).all();
 const n=await countOf(env,m.pair_id);
 const p=await prefs(env,m.pair_id);
 const subs=(await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE member_id=?').bind(m.id).first()).n;
 return {you:m.slot,members:rows.map(x=>({name:x.display_name,slot:x.slot,locationActive:!!x.geo_on&&Number(x.location_at||0)>Date.now()-RULES.FRESH})),code:rows.length<2?pair.invite_code:null,firstMetAt:pair.first_met_at,createdAt:pair.created_at,count:n,meetings:meets.results||[],together:v.stage==='together'||v.stage==='recorded',connected:rows.length===2,
  rewards:{unlocked:unlockedIds(n),claimed:p.claimed.filter(x=>claimable(BY_ID[x],n,p.opened)),equipped:sanitizeOutfit(p.equipped,n,p.opened,p.claimed),opened:p.opened,version:p.version,lastChange:p.lastChange,room:p.room,achieved:p.achieved},
  proximity:proximityOut(v,me),push:{available:pushReady(env),key:env.VAPID_PUBLIC||null,subscribed:subs>0}};
}

async function api(req,env,path,ctx){
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
  // No duplicate meeting within 6 hours, from either device (checked atomically on insert).
  if(!await recordMeeting(env,ctx,m.pair_id,{when,source:'manual',by:m.id}))return bad('To spotkanie jest już zapisane (odstęp 6 godzin).',409);
  // a manual entry also closes an ongoing proximity session, so it is not counted twice
  if(when>Date.now()-6*3600000)await env.DB.prepare('UPDATE pairs SET active_recorded=1 WHERE id=? AND active_since IS NOT NULL').bind(m.pair_id).run();
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/delete-meeting'){
  const b=await body(req);if(typeof b?.id!=='string')return bad('Brak identyfikatora.');
  await env.DB.prepare('DELETE FROM meetings WHERE id=? AND pair_id=?').bind(b.id,m.pair_id).run();await syncRewards(env,m.pair_id);return ok(await state(env,m));
 }
 if(method==='POST'&&(path==='/api/location'||path==='/api/check')){
  // A position from this phone (watchPosition / "Sprawdź"). `ts` is when the
  // phone measured it: old readings are not stored as fresh. Only the last
  // position is kept, and only for 15 minutes.
  const b=await body(req);const lat=Number(b?.lat),lon=Number(b?.lon),accuracy=Number(b?.accuracy),now=Date.now();
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>5000)return bad('Nieprawidłowy pomiar.');
  const ts=Number.isFinite(Number(b?.ts))?Math.min(now,Number(b.ts)):now;
  if(now-ts>RULES.FRESH)return bad('Ten pomiar jest już nieaktualny.',422);
  await env.DB.prepare('UPDATE members SET latitude=?,longitude=?,accuracy=?,location_at=?,geo_on=1 WHERE id=?').bind(lat,lon,accuracy,ts,m.id).run();
  if(path==='/api/check'){
   // ask the partner's phone for a fresh reading right now (if the app is open it answers within seconds)
   const partner=await env.DB.prepare('SELECT id,ping_at,location_at,geo_on FROM members WHERE pair_id=? AND id<>?').bind(m.pair_id,m.id).first();
   if(partner&&(!partner.ping_at||now-partner.ping_at>15000)){
    await env.DB.prepare('UPDATE members SET ping_at=? WHERE id=?').bind(now,partner.id).run();
    if(!partner.location_at||now-partner.location_at>RULES.FRESH)notify(env,ctx,m.pair_id,m.id,{title:`${m.display_name} sprawdza, czy jesteście razem`,body:'Otwórz Razem, żeby Puszystek mógł to sprawdzić 💗',tag:'check'});
   }
  }
  await afterPosition(env,ctx,m,now);
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/meeting-confirm'){
  // "Jesteśmy razem": decided on the server from both phones' fresh positions.
  // Precise readings: one confirmation records the meeting. Weaker GPS: both people confirm.
  const now=Date.now();const {pair,v}=await judge(env,m.pair_id,m.slot,now);
  trace(m.pair_id,v,'confirm');
  if(v.stage==='recorded')return bad(v.reason==='cooldown'?'Spotkanie z ostatnich godzin jest już zapisane.':'To spotkanie jest już zaliczone.',409);
  if(v.stage!=='together')return bad(REASON_TEXT[v.reason]||'Nie widzimy, że jesteście razem.',409);
  const since=pair.active_since||now;
  if(!pair.active_since)await setPair(env,m.pair_id,{active_since:now,active_recorded:0,apart_since:null});
  const partnerOk=v.partnerConfirm;
  if(v.strong||partnerOk){
   const created=await recordMeeting(env,ctx,m.pair_id,{source:'auto',by:m.id,sessionKey:`${m.pair_id}:${since}`});
   await env.DB.prepare('UPDATE pairs SET active_recorded=1,confirm1_at=NULL,confirm2_at=NULL WHERE id=?').bind(m.pair_id).run();
   if(!created)return bad('To spotkanie jest już zaliczone.',409);
   return ok(await state(env,m));
  }
  await setPair(env,m.pair_id,{[`confirm${m.slot}_at`]:now});
  notify(env,ctx,m.pair_id,m.id,{title:`${m.display_name} potwierdza wasze spotkanie`,body:'Otwórz Razem i potwierdź, że jesteście razem 💕',tag:'confirm'});
  return ok({...await state(env,m),waitingForPartner:true});
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
 if(method==='POST'&&path==='/api/room-move'){
  // Move a placed house item. Validated with the same rules as the editor (zone,
  // collisions); `expect` is where this phone saw it, so a partner's move at the
  // same moment is never overwritten silently.
  const b=await body(req),idm=b?.id,x=Number(b?.x),y=Number(b?.y);
  if(!ROOM_ITEMS[idm]||!movable(idm)||!Number.isInteger(x)||!Number.isInteger(y))return bad('Nieprawidłowe miejsce.');
  let err=null;
  await mutate(env,m.pair_id,(p,n)=>{
   const placed=p.equipped.filter(i=>isHouse(BY_ID[i])||ROOM_ITEMS[i]);
   const isBasic=idm==='bedBasic'||idm==='rugBasic';
   if(!isBasic&&!placed.includes(idm)){err=bad('Najpierw ustaw ten przedmiot w domku.',403);return null}
   const pos=arrange(placed.filter(i=>sanitizeOutfit([i],n,p.opened,p.claimed).length),p.room);
   if(!pos[idm]){err=bad('Tego przedmiotu nie ma teraz w pokoju.',409);return null}
   if(Array.isArray(b.expect)&&(b.expect[0]!==pos[idm][0]||b.expect[1]!==pos[idm][1])){err='conflict';return null}
   const c=checkPlacement(idm,[x,y],pos);if(!c.ok){err=bad(c.reason,422);return null}
   if(pos[idm][0]===x&&pos[idm][1]===y)return null;
   return {room:{...p.room,[idm]:[x,y]},change:{op:'move',id:idm,by:m.slot,at:Date.now()}};
  });
  if(err==='conflict')return Response.json({error:'Druga osoba właśnie przestawiła ten przedmiot.',conflict:true,state:await state(env,m)},{status:409,headers:{'Cache-Control':'no-store'}});
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
 if(method==='POST'&&path==='/api/map-share'){
  // showing my position to my partner on the map is a separate, explicit choice
  const b=await body(req);await env.DB.prepare('UPDATE members SET map_on=? WHERE id=?').bind(b?.on?1:0,m.id).run();
  return ok(await mapView(env,m));
 }
 if(method==='GET'&&path==='/api/map')return ok(await mapView(env,m));
 if(method==='POST'&&path==='/api/name'){
  // each person's own name, shown to both phones
  const b=await body(req),name=norm(b?.name);if(name.length<2)return bad('Podaj imię (minimum 2 znaki).');
  await env.DB.prepare('UPDATE members SET display_name=? WHERE id=?').bind(name,m.id).run();
  return ok(await state(env,{...m,display_name:name}));
 }
 if(method==='POST'&&path==='/api/push-subscribe'){
  const b=await body(req),ep=b?.endpoint,k=b?.keys;
  if(typeof ep!=='string'||!/^https:\/\//.test(ep)||ep.length>1000||typeof k?.p256dh!=='string'||typeof k?.auth!=='string')return bad('Nieprawidłowa subskrypcja.');
  await env.DB.prepare('INSERT INTO push_subs(endpoint,member_id,p256dh,auth,created_at) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET member_id=excluded.member_id,p256dh=excluded.p256dh,auth=excluded.auth').bind(ep,m.id,k.p256dh,k.auth,Date.now()).run();
  if(b.test)notify(env,ctx,m.pair_id,null,{title:'Powiadomienia włączone',body:'Puszystek da znać, gdy będziecie blisko 💗',tag:'hello'});
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/push-unsubscribe'){
  await env.DB.prepare('DELETE FROM push_subs WHERE member_id=?').bind(m.id).run();return ok(await state(env,m));
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
  // this person stops sharing: position erased at once
  await env.DB.prepare('UPDATE members SET latitude=NULL,longitude=NULL,accuracy=NULL,location_at=NULL,geo_on=0 WHERE id=?').bind(m.id).run();return ok(await state(env,m));
 }
 return bad('Nie znaleziono adresu.',404);
}
const REASON_TEXT={not_connected:'Najpierw połączcie się kodem.',me_off:'Włącz lokalizację na tym telefonie.',me_stale:'Czekamy na lokalizację tego telefonu.',me_inaccurate:'Lokalizacja tego telefonu jest za mało dokładna.',partner_off:'Druga osoba nie udostępnia lokalizacji.',partner_stale:'Druga osoba musi mieć otwarte Razem.',partner_inaccurate:'Lokalizacja drugiej osoby jest za mało dokładna.',near:'Jesteście blisko, ale jeszcze nie razem.',far:'Jesteście teraz daleko od siebie.'};
export default {async fetch(request,env,ctx){const url=new URL(request.url),path=url.pathname;if(path.startsWith('/api/')){if(!env.DB)return bad('Brak połączenia z bazą.',503);if(request.method==='OPTIONS')return new Response(null,{status:405});try{return await api(request,env,path,ctx)}catch(e){if(e?.message==='busy')return bad('Druga osoba właśnie coś zmienia — spróbujcie za chwilę.',409);console.error('Razem API error',e);return bad('Wystąpił problem. Spróbuj ponownie.',500)}}if(env.ASSETS)return env.ASSETS.fetch(request);return new Response('Brak zasobów strony',{status:404})}};
