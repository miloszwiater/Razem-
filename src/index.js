import { BY_ID, unlockedIds, sanitizeOutfit, claimable, earned, ACHIEVEMENTS, isHouse } from '../public/rewards.js';
import { ITEMS as ROOM_ITEMS, arrange, check as checkPlacement, movable, roomOpen, applyMove } from '../public/room.js';
import { RULES, RADII, verdict, transition, haversine } from './proximity.js';
import { pushReady, sendPush } from './push.js';
import { streakOf } from '../public/streak.js';
import { MODES as QUIZ_MODES, MAX_OPEN, pick as pickQuestions, aboutSlot, score as quizScore, validQuestion } from '../public/quiz-bank.js';

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
// and indexes (migrations/0002..0006). Nothing is dropped or rewritten.
let schemaReady=false;
const QUIZ_TABLE="CREATE TABLE IF NOT EXISTS quiz_sessions (id TEXT PRIMARY KEY, pair_id TEXT NOT NULL REFERENCES pairs(id), mode TEXT NOT NULL, questions TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'lobby', created_by INTEGER NOT NULL, created_at INTEGER NOT NULL, ready1 INTEGER NOT NULL DEFAULT 0, ready2 INTEGER NOT NULL DEFAULT 0, idx INTEGER NOT NULL DEFAULT 0, started_at INTEGER, finished_at INTEGER, day TEXT, hits INTEGER, rewarded INTEGER NOT NULL DEFAULT 0)";
const ANSWER_TABLE='CREATE TABLE IF NOT EXISTS quiz_answers (session_id TEXT NOT NULL REFERENCES quiz_sessions(id), idx INTEGER NOT NULL, slot INTEGER NOT NULL, answer TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (session_id, idx, slot))';
const ENERGY_TABLE='CREATE TABLE IF NOT EXISTS energy_events (pair_id TEXT NOT NULL REFERENCES pairs(id), key TEXT NOT NULL, delta INTEGER NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (pair_id, key))';
async function ensureSchema(env){
 if(schemaReady)return;
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS pair_prefs (pair_id TEXT PRIMARY KEY REFERENCES pairs(id), radius INTEGER NOT NULL DEFAULT 150, equipped TEXT NOT NULL DEFAULT '[]', opened TEXT NOT NULL DEFAULT '[]', seen_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`).run();
 const addColumns=async(table,list)=>{
  const cols=new Set(((await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results||[]).map(c=>c.name));
  for(const [c,def] of list){if(cols.has(c))continue;try{await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${c} ${def}`).run()}catch(e){if(!/duplicate column/i.test(String(e?.message)))throw e}}
 };
 await addColumns('pair_prefs',[['claimed',"TEXT NOT NULL DEFAULT '[]'"],['version','INTEGER NOT NULL DEFAULT 0'],['last_change','TEXT'],['room',"TEXT NOT NULL DEFAULT '{}'"],['achieved',"TEXT NOT NULL DEFAULT '{}'"]]);
 await addColumns('members',[['geo_on','INTEGER NOT NULL DEFAULT 0'],['ping_at','INTEGER'],['map_on','INTEGER NOT NULL DEFAULT 0']]);
 await addColumns('pairs',[['confirm1_at','INTEGER'],['confirm2_at','INTEGER'],['notified_near_at','INTEGER'],['tz','TEXT']]);
 await addColumns('pair_prefs',[['energy_rest','INTEGER NOT NULL DEFAULT 0'],['energy_since','TEXT'],['streak_best','INTEGER NOT NULL DEFAULT 0']]);
 await addColumns('meetings',[['session_key','TEXT']]);
 await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS member_tokens (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), created_at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS member_recovery (member_id TEXT PRIMARY KEY REFERENCES members(id), code_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)'),
  env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS ux_meetings_session ON meetings(session_key) WHERE session_key IS NOT NULL'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  env.DB.prepare(QUIZ_TABLE),env.DB.prepare(ANSWER_TABLE),env.DB.prepare(ENERGY_TABLE),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS ix_quiz_pair ON quiz_sessions(pair_id,created_at)'),
 ]);
 schemaReady=true;
}
const countOf=async(env,pairId)=>(await env.DB.prepare('SELECT COUNT(*) AS n FROM meetings WHERE pair_id=?').bind(pairId).first()).n;

// ------------------------------------------------------------------ Puszystek's energy
// One shared value 0..100, computed from an append-only list of events with
// idempotent keys (a retry or two phones at once can never count twice):
// the first meeting of a day +12, two more +3 each, the first quiz of a day +5,
// a day without a meeting -3. Days follow the pair's time zone. Energy never
// drops below 15, never takes rewards away, and "rest" turns the decay off.
const ENERGY={START:70,MEET_FIRST:12,MEET_MORE:3,MEET_EXTRA:2,QUIZ:5,DECAY:3,FLOOR:15,FULL:75,BACK:60};
const DEF_TZ='Europe/Warsaw';
const validTz=tz=>{if(typeof tz!=='string'||tz.length>64)return false;try{new Intl.DateTimeFormat('en-CA',{timeZone:tz});return true}catch{return false}};
const dayOf=(t,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:validTz(tz)?tz:DEF_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const prevDay=d=>new Date(Date.parse(d+'T12:00:00Z')-864e5).toISOString().slice(0,10);
const pairTz=async(env,pairId)=>(await env.DB.prepare('SELECT tz FROM pairs WHERE id=?').bind(pairId).first())?.tz||DEF_TZ;
const moodOf=v=>v>=75?'happy':v>=50?'calm':v>=30?'sleepy':'tired';
const addEnergy=(env,pairId,key,delta,kind,day,at)=>env.DB.prepare('INSERT OR IGNORE INTO energy_events(pair_id,key,delta,kind,day,at) VALUES (?,?,?,?,?,?)').bind(pairId,key,delta,kind,day,at);
async function energyEvent(env,pairId,kind,when=Date.now()){
 const day=dayOf(when,await pairTz(env,pairId));
 if(kind==='meeting'){
  // a meeting entered for a past day (before energy started) changes nothing
  const since=(await env.DB.prepare('SELECT energy_since FROM pair_prefs WHERE pair_id=?').bind(pairId).first())?.energy_since||dayOf(Date.now(),await pairTz(env,pairId));
  if(day<since)return;
  const n=(await env.DB.prepare("SELECT COUNT(*) AS n FROM energy_events WHERE pair_id=? AND day=? AND kind='meeting'").bind(pairId,day).first()).n;
  if(n>ENERGY.MEET_EXTRA)return;
  await addEnergy(env,pairId,`meeting:${day}:${n+1}`,n?ENERGY.MEET_MORE:ENERGY.MEET_FIRST,'meeting',day,when).run();
 }else if(kind==='quiz')await addEnergy(env,pairId,`quiz:${day}`,ENERGY.QUIZ,'quiz',day,when).run();
}
// Writes the missing "day without a meeting" events (since energy started for
// this pair, at most 60 days back), then folds all events into today's value.
async function energyCompute(env,pairId,generate=true){
 const tz=await pairTz(env,pairId),today=dayOf(Date.now(),tz);
 if(generate)await prefs(env,pairId); // a new pair: create its row first
 const pr=await env.DB.prepare('SELECT energy_rest,energy_since FROM pair_prefs WHERE pair_id=?').bind(pairId).first();
 let since=pr?.energy_since;
 if(generate&&pr&&!since){since=today;await env.DB.prepare('UPDATE pair_prefs SET energy_since=? WHERE pair_id=? AND energy_since IS NULL').bind(today,pairId).run()}
 if(generate&&since&&!pr.energy_rest){
  const met=new Set(((await env.DB.prepare("SELECT DISTINCT day FROM energy_events WHERE pair_id=? AND kind IN ('meeting','decay') AND day>=?").bind(pairId,since).all()).results||[]).map(r=>r.day));
  const missing=[];for(let d=prevDay(today),i=0;d>=since&&i<ENERGY.BACK;d=prevDay(d),i++)if(!met.has(d))missing.push(d);
  if(missing.length)await env.DB.batch(missing.map(d=>addEnergy(env,pairId,`decay:${d}`,-ENERGY.DECAY,'decay',d,Date.parse(d+'T23:59:00Z'))));
 }
 const ev=(await env.DB.prepare('SELECT delta,kind,day FROM energy_events WHERE pair_id=? ORDER BY day,at').bind(pairId).all()).results||[];
 let v=ENERGY.START,care=0,todayDelta=0;
 for(let i=0;i<ev.length;i++){
  const e=ev[i];v=e.delta<0?Math.max(Math.min(v,ENERGY.FLOOR),v+e.delta):Math.min(100,v+e.delta);
  if(e.day===today)todayDelta+=e.delta;
  if((ev[i+1]?.day!==e.day)&&v>=ENERGY.FULL)care++; // a day that ended full of energy
 }
 return {value:v,mood:moodOf(v),today:todayDelta,care,rest:!!pr?.energy_rest,last:ev.at(-1)?.kind||null};
}
const energyView=(env,pairId)=>energyCompute(env,pairId,true);
const careDays=async(env,pairId)=>(await energyCompute(env,pairId,false)).care;

// ------------------------------------------------------------------ couple quizzes
// The server is the referee: it picks the questions, stores each answer once,
// shows an answer to the partner only after both answered that question, moves
// on only when both answered, scores, and rewards at most two quizzes a day.
const QUIZ_TTL=3*3600e3,QUIZ_DAILY=2;
const quizCount=async(env,pairId)=>(await env.DB.prepare('SELECT COUNT(*) AS n FROM quiz_sessions WHERE pair_id=? AND rewarded=1').bind(pairId).first()).n;
async function quizRow(env,pairId,qid){
 if(qid)return await env.DB.prepare('SELECT * FROM quiz_sessions WHERE id=? AND pair_id=?').bind(qid,pairId).first();
 return await env.DB.prepare("SELECT * FROM quiz_sessions WHERE pair_id=? AND state IN ('lobby','playing') AND created_at>? ORDER BY created_at DESC LIMIT 1").bind(pairId,Date.now()-QUIZ_TTL).first();
}
async function quizView(env,m,s){
 if(!s)return null;
 const rows=await memberRows(env,m.pair_id),nameOf=slot=>rows.find(r=>r.slot===slot)?.display_name||'';
 const qs=JSON.parse(s.questions),ans=(await env.DB.prepare('SELECT idx,slot,answer FROM quiz_answers WHERE session_id=?').bind(s.id).all()).results||[];
 const at=(i,slot)=>{const a=ans.find(x=>x.idx===i&&x.slot===slot);return a?JSON.parse(a.answer):null};
 const me=m.slot,pt=3-me,last=s.state==='done'?qs.length-1:s.idx;
 const questions=qs.slice(0,last+1).map((q,i)=>{
  const mine=at(i,me),theirs=at(i,pt),both=mine!==null&&theirs!==null;
  const out={i,text:q.text,options:q.options||null,mine,partnerDone:theirs!==null,reveal:both?{me:mine,partner:theirs}:null};
  if(s.mode==='znasz'){const ab=aboutSlot({by:s.created_by},i);out.about=ab===me?'me':'partner';out.text=ab===me?(q.self||q.text):(q.guess||q.text).replace('{name}',nameOf(pt))}
  return out;
 });
 return {id:s.id,mode:s.mode,state:s.state,by:s.created_by,you:me,idx:s.idx,count:qs.length,ready:{me:!!s['ready'+me],partner:!!s['ready'+pt]},
  questions,hits:s.hits,rewarded:!!s.rewarded,partnerName:nameOf(pt),createdAt:s.created_at};
}
// both answered the last question: close the session, score it and (within
// the daily limit) count it toward rewards and energy, exactly once
async function finishQuiz(env,s){
 const qs=JSON.parse(s.questions),ans=(await env.DB.prepare('SELECT idx,slot,answer FROM quiz_answers WHERE session_id=?').bind(s.id).all()).results||[];
 const pairs=qs.map((q,i)=>[i,...[1,2].map(sl=>{const a=ans.find(x=>x.idx===i&&x.slot===sl);return a?JSON.parse(a.answer):null})]);
 const sc=quizScore(s.mode,pairs.map(([i,a,b])=>[i,a,b]));
 const now=Date.now(),day=dayOf(now,await pairTz(env,s.pair_id));
 const done=await env.DB.prepare("UPDATE quiz_sessions SET state='done',finished_at=?,day=?,hits=? WHERE id=? AND state='playing'").bind(now,day,sc?sc.hits:null,s.id).run();
 if(done.meta?.changes!==1)return;
 const today=(await env.DB.prepare('SELECT COUNT(*) AS n FROM quiz_sessions WHERE pair_id=? AND day=? AND rewarded=1').bind(s.pair_id,day).first()).n;
 if(today>=QUIZ_DAILY)return;
 const r=await env.DB.prepare('UPDATE quiz_sessions SET rewarded=1 WHERE id=? AND rewarded=0').bind(s.id).run();
 if(r.meta?.changes===1){await energyEvent(env,s.pair_id,'quiz',now);await syncRewards(env,s.pair_id)}
}
const validAnswer=(mode,q,a)=>QUIZ_MODES[mode].kind==='open'?typeof a==='string'&&a.trim().length>0&&a.length<=MAX_OPEN:Number.isInteger(a)&&a>=0&&a<(q.options||[]).length;
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
// The pair's progress in every reward currency: meetings, finished quizzes and
// days full of energy (see quizzes / energy below).
// Everything here counts recorded meetings only; the date the pair first met is
// a keepsake and never feeds progress, streaks, energy or rewards.
async function progressOf(env,pairId){
 const [n,q,c,st]=await Promise.all([countOf(env,pairId),quizCount(env,pairId),careDays(env,pairId),streakView(env,pairId)]);
 return {meetings:n,quizzes:q,care:c,streak:st.best};
}
// Days in a row with a recorded meeting, in the pair's time zone. The best run
// ever is kept (pair_prefs.streak_best only grows), so rewards for a streak
// stay even after the streak breaks or a meeting is deleted.
async function streakView(env,pairId){
 const tz=await pairTz(env,pairId);
 const times=((await env.DB.prepare('SELECT occurred_at FROM meetings WHERE pair_id=?').bind(pairId).all()).results||[]).map(r=>r.occurred_at);
 const st=streakOf(times,tz,dayOf(Date.now(),tz));
 const kept=(await env.DB.prepare('SELECT streak_best FROM pair_prefs WHERE pair_id=?').bind(pairId).first())?.streak_best||0;
 if(st.best>kept)await env.DB.prepare('UPDATE pair_prefs SET streak_best=? WHERE pair_id=? AND streak_best<?').bind(st.best,pairId,st.best).run();
 return {...st,best:Math.max(st.best,kept)};
}
const slotOfItem=id=>BY_ID[id]?.slot||ROOM_ITEMS[id]?.basic||null;
async function mutate(env,pairId,fn){
 for(let i=0;i<5;i++){
  const p=await prefs(env,pairId),n=await progressOf(env,pairId);
  const next=fn(p,n);if(!next)return;
  const r=await env.DB.prepare('UPDATE pair_prefs SET equipped=?,claimed=?,opened=?,room=?,last_change=?,version=version+1,updated_at=? WHERE pair_id=? AND version=?')
   .bind(JSON.stringify(next.equipped??p.equipped),JSON.stringify(next.claimed??p.claimed),JSON.stringify(next.opened??p.opened),JSON.stringify(next.room??p.room),JSON.stringify(next.change),Date.now(),pairId,p.version).run();
  if(r.meta?.changes===1)return;
 }
 throw new Error('busy');
}
// After the shared count changed: remember it and take off anything that is locked again.
async function syncRewards(env,pairId){
 const p=await prefs(env,pairId),prog=await progressOf(env,pairId),n=prog.meetings;
 // remember when each achievement was reached (0 = a meeting milestone from before this was recorded)
 const have=a=>a.source==='quiz'?prog.quizzes:a.source==='care'?prog.care:a.source==='streak'?prog.streak:n;
 const reached=ACHIEVEMENTS.filter(a=>have(a)>=a.at&&!(a.id in p.achieved));
 if(reached.length){const ach={...p.achieved};for(const a of reached)ach[a.id]=a.source!=='meetings'||(n>p.seenCount&&a.at>p.seenCount)?Date.now():0;await env.DB.prepare('UPDATE pair_prefs SET achieved=? WHERE pair_id=?').bind(JSON.stringify(ach),pairId).run()}
 const outfit=sanitizeOutfit(p.equipped,prog,p.opened);
 if(n===p.seenCount&&outfit.length===p.equipped.length)return;
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
  await energyEvent(env,pairId,'meeting',when).catch(()=>{});
  notify(env,ctx,pairId,by,{title:'Jesteście razem!',body:`Wasze ${n}. spotkanie zapisane ♥`,tag:'meeting'});
 }
 return created;
}

const MEMBER_SQL='SELECT m.id,m.pair_id,m.display_name,m.slot,p.invite_code,p.first_met_at,p.created_at,p.tz FROM members m JOIN pairs p ON p.id=m.pair_id';
// a session is the token from create/join, or one issued later by a login code
async function member(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!/^[a-f0-9]{64}$/.test(token))return null;const hash=await sha(token);
 return await env.DB.prepare(MEMBER_SQL+' WHERE m.token_hash=?').bind(hash).first()||await env.DB.prepare(MEMBER_SQL+' JOIN member_tokens t ON t.member_id=m.id WHERE t.token_hash=?').bind(hash).first()}

// ------------------------------------------------------------------ proximity + push helpers
const PAIR_COLS='first_met_at,created_at,invite_code,active_since,active_recorded,apart_since,confirm1_at,confirm2_at,notified_near_at';
const MEMBER_COLS='id,display_name,slot,geo_on,ping_at,location_at,latitude,longitude,accuracy,map_on';
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
async function quizSummary(env,m){
 const s=await quizRow(env,m.pair_id);if(!s)return null;
 return {id:s.id,mode:s.mode,state:s.state,by:s.created_by,idx:s.idx,ready:{me:!!s['ready'+m.slot],partner:!!s['ready'+(3-m.slot)]}};
}
function proximityOut(v,me){
 return {...v,pingAt:Number(me?.ping_at)||null};
}

async function state(env,m){
 const energy=await energyView(env,m.pair_id).catch(()=>null);
 await syncRewards(env,m.pair_id);
 const {pair,rows,me,v}=await judge(env,m.pair_id,m.slot);if(!pair)return null;
 const meets=await env.DB.prepare('SELECT id,occurred_at,source FROM meetings WHERE pair_id=? ORDER BY occurred_at DESC LIMIT 60').bind(m.pair_id).all();
 const prog=await progressOf(env,m.pair_id),n=prog.meetings;
 const p=await prefs(env,m.pair_id);
 const subs=(await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE member_id=?').bind(m.id).first()).n;
 return {you:m.slot,members:rows.map(x=>({name:x.display_name,slot:x.slot,locationActive:!!x.geo_on&&Number(x.location_at||0)>Date.now()-RULES.FRESH})),code:rows.length<2?pair.invite_code:null,firstMetAt:pair.first_met_at,createdAt:pair.created_at,count:n,meetings:meets.results||[],together:v.stage==='together'||v.stage==='recorded',connected:rows.length===2,
  progress:prog,energy,quiz:await quizSummary(env,m),streak:await streakView(env,m.pair_id),
  rewards:{unlocked:unlockedIds(prog),claimed:p.claimed.filter(x=>claimable(BY_ID[x],prog,p.opened)),equipped:sanitizeOutfit(p.equipped,prog,p.opened,p.claimed),opened:p.opened,version:p.version,lastChange:p.lastChange,room:p.room,achieved:p.achieved},
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
 // the pair's day boundaries follow the phones' time zone (sent with every request)
 const tz=req.headers.get('X-Razem-TZ');if(tz&&tz!==m.tz&&validTz(tz))await env.DB.prepare('UPDATE pairs SET tz=? WHERE id=?').bind(tz,m.pair_id).run();
 if(method==='GET'&&path==='/api/state')return ok(await state(env,m));
 if(method==='POST'&&path==='/api/first-date'){
  // the date the pair first met: an optional keepsake (null clears it)
  const b=await body(req),date=b?.date===null||b?.date===''?null:b?.date;
  if(date===null){await env.DB.prepare('UPDATE pairs SET first_met_at=NULL WHERE id=?').bind(m.pair_id).run();return ok(await state(env,m))}
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
   const isBasic=!!ROOM_ITEMS[idm].basic;
   if(!isBasic&&!placed.includes(idm)){err=bad('Najpierw ustaw ten przedmiot w domku.',403);return null}
   if(!roomOpen(ROOM_ITEMS[idm].room,n.meetings)){err=bad('Ten pokój jest jeszcze zamknięty.',403);return null}
   const pos=arrange(placed.filter(i=>sanitizeOutfit([i],n,p.opened,p.claimed).length),p.room,slotOfItem);
   if(!pos[idm]){err=bad('Tego przedmiotu nie ma teraz w pokoju.',409);return null}
   if(Array.isArray(b.expect)&&(b.expect[0]!==pos[idm][0]||b.expect[1]!==pos[idm][1])){err='conflict';return null}
   const c=checkPlacement(idm,[x,y],pos);if(!c.ok){err=bad(c.reason,422);return null}
   if(pos[idm][0]===x&&pos[idm][1]===y)return null;
   // a thing put on furniture remembers it; things standing on moved furniture go along
   return {room:applyMove(p.room,idm,[x,y],pos),change:{op:'move',id:idm,by:m.slot,at:Date.now()}};
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
   if(!earned(r,n)){err=bad('Ten prezent jest jeszcze zamknięty.',403);return null}
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
 if(method==='POST'&&path==='/api/energy-rest'){
  // rest mode: no decay while it is on; switching it starts a fresh decay window
  const b=await body(req),tz=await pairTz(env,m.pair_id);await prefs(env,m.pair_id);
  await env.DB.prepare('UPDATE pair_prefs SET energy_rest=?,energy_since=? WHERE pair_id=?').bind(b?.on?1:0,dayOf(Date.now(),tz),m.pair_id).run();
  return ok(await state(env,m));
 }
 if(path.startsWith('/api/quiz')){
  const b=method==='POST'?await body(req):null,url=new URL(req.url),qid=b?.id||url.searchParams.get('id')||null;
  if(method==='GET'&&path==='/api/quiz')return ok({quiz:await quizView(env,m,await quizRow(env,m.pair_id,qid))});
  if(method==='POST'&&path==='/api/quiz/create'){
   if(!QUIZ_MODES[b?.mode])return bad('Nie ma takiego quizu.');
   if((await memberRows(env,m.pair_id)).length<2)return bad('Najpierw połączcie się kodem.',409);
   const cur=await quizRow(env,m.pair_id);if(cur)return ok({quiz:await quizView(env,m,cur),existing:true});
   const recent=((await env.DB.prepare('SELECT questions FROM quiz_sessions WHERE pair_id=? AND mode=? ORDER BY created_at DESC LIMIT 4').bind(m.pair_id,b.mode).all()).results||[]).flatMap(r=>JSON.parse(r.questions).map(q=>q.id));
   const qs=pickQuestions(b.mode,recent).filter(q=>validQuestion(q,b.mode)),sid=id(),now=Date.now();
   await env.DB.prepare(`INSERT INTO quiz_sessions(id,pair_id,mode,questions,state,created_by,created_at,ready${m.slot}) VALUES (?,?,?,?,'lobby',?,?,1)`).bind(sid,m.pair_id,b.mode,JSON.stringify(qs),m.slot,now).run();
   notify(env,ctx,m.pair_id,m.slot,{title:'Quiz we dwoje',body:`${m.display_name} zaprasza Cię do quizu „${QUIZ_MODES[b.mode].name}” ♥`,tag:'quiz'});
   return ok({quiz:await quizView(env,m,await quizRow(env,m.pair_id,sid))});
  }
  const s=await quizRow(env,m.pair_id,qid);if(!s)return bad('Ten quiz już się skończył.',404);
  if(method==='POST'&&path==='/api/quiz/ready'){
   if(s.state!=='lobby')return ok({quiz:await quizView(env,m,s)});
   await env.DB.prepare(`UPDATE quiz_sessions SET ready${m.slot}=1 WHERE id=?`).bind(s.id).run();
   await env.DB.prepare("UPDATE quiz_sessions SET state='playing',started_at=? WHERE id=? AND state='lobby' AND ready1=1 AND ready2=1").bind(Date.now(),s.id).run();
   return ok({quiz:await quizView(env,m,await quizRow(env,m.pair_id,s.id))});
  }
  if(method==='POST'&&path==='/api/quiz/answer'){
   const qs=JSON.parse(s.questions),i=Number(b?.idx);
   if(s.state!=='playing')return bad('Quiz jeszcze się nie zaczął albo już się skończył.',409);
   if(i!==s.idx)return Response.json({error:'To pytanie już minęło.',conflict:true,quiz:await quizView(env,m,s)},{status:409,headers:{'Cache-Control':'no-store'}});
   if(!validAnswer(s.mode,qs[i],b?.answer))return bad('Wybierz odpowiedź.');
   const a=typeof b.answer==='string'?b.answer.trim():b.answer;
   await env.DB.prepare('INSERT OR IGNORE INTO quiz_answers(session_id,idx,slot,answer,at) VALUES (?,?,?,?,?)').bind(s.id,i,m.slot,JSON.stringify(a),Date.now()).run();
   const both=(await env.DB.prepare('SELECT COUNT(*) AS n FROM quiz_answers WHERE session_id=? AND idx=?').bind(s.id,i).first()).n===2;
   if(both&&i===qs.length-1)await finishQuiz(env,s);
   return ok({quiz:await quizView(env,m,await quizRow(env,m.pair_id,s.id))});
  }
  if(method==='POST'&&path==='/api/quiz/next'){
   // either phone may move on, once both answered; `idx` makes it idempotent
   const i=Number(b?.idx);
   if(s.state==='playing'&&i===s.idx&&(await env.DB.prepare('SELECT COUNT(*) AS n FROM quiz_answers WHERE session_id=? AND idx=?').bind(s.id,i).first()).n===2&&i<JSON.parse(s.questions).length-1)
    await env.DB.prepare('UPDATE quiz_sessions SET idx=idx+1 WHERE id=? AND idx=?').bind(s.id,i).run();
   return ok({quiz:await quizView(env,m,await quizRow(env,m.pair_id,s.id))});
  }
  if(method==='POST'&&path==='/api/quiz/leave'){
   await env.DB.prepare("UPDATE quiz_sessions SET state='cancelled',finished_at=? WHERE id=? AND state IN ('lobby','playing')").bind(Date.now(),s.id).run();
   return ok({quiz:await quizView(env,m,await quizRow(env,m.pair_id,s.id))});
  }
  return bad('Nieznane polecenie quizu.',404);
 }
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
