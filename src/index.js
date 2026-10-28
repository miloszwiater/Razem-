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
async function member(req,env){const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!/^[a-f0-9]{64}$/.test(token))return null;return await env.DB.prepare('SELECT m.id,m.pair_id,m.display_name,m.slot,p.invite_code,p.first_met_at,p.created_at FROM members m JOIN pairs p ON p.id=m.pair_id WHERE m.token_hash=?').bind(await sha(token)).first()}
async function state(env,m){const pair=await env.DB.prepare('SELECT first_met_at,created_at,invite_code,active_since,active_recorded FROM pairs WHERE id=?').bind(m.pair_id).first();if(!pair)return null;const ms=await env.DB.prepare('SELECT id,display_name,slot,location_at FROM members WHERE pair_id=? ORDER BY slot').bind(m.pair_id).all();const meets=await env.DB.prepare('SELECT id,occurred_at,source FROM meetings WHERE pair_id=? ORDER BY occurred_at DESC LIMIT 60').bind(m.pair_id).all();const total=await env.DB.prepare('SELECT COUNT(*) AS n FROM meetings WHERE pair_id=?').bind(m.pair_id).first();return {you:m.slot,members:(ms.results||[]).map(x=>({name:x.display_name,slot:x.slot,locationActive:Number(x.location_at||0)>Date.now()-180000})),code:ms.results.length<2?pair.invite_code:null,firstMetAt:pair.first_met_at,createdAt:pair.created_at,count:total.n,meetings:meets.results||[],together:!!pair.active_since&&Number(pair.active_since)>Date.now()-3600000,connected:ms.results.length===2};}
async function api(req,env,path){
 const method=req.method;
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
  await env.DB.prepare('INSERT INTO meetings (id,pair_id,occurred_at,source,created_by,created_at) VALUES (?,?,?,?,?,?)').bind(id(),m.pair_id,when,'manual',m.id,Date.now()).run();return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/delete-meeting'){
  const b=await body(req);if(typeof b?.id!=='string')return bad('Brak identyfikatora.');
  await env.DB.prepare('DELETE FROM meetings WHERE id=? AND pair_id=?').bind(b.id,m.pair_id).run();return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/location'){
  const b=await body(req);const lat=Number(b?.lat),lon=Number(b?.lon),accuracy=Number(b?.accuracy),now=Date.now();
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>1500)return bad('Nieprawidłowy pomiar.');
  // Positions are only transient, overwritten each time. No route or location history.
  await env.DB.prepare('UPDATE members SET latitude=?,longitude=?,accuracy=?,location_at=? WHERE id=?').bind(lat,lon,accuracy,now,m.id).run();
  const locations=await env.DB.prepare('SELECT latitude,longitude,accuracy,location_at FROM members WHERE pair_id=? ORDER BY slot').bind(m.pair_id).all();
  if(locations.results.length===2){
   const [a,b]=locations.results;const fresh=locations.results.every(x=>x.location_at>now-180000 && x.accuracy<=150);
   if(fresh){
    const near=distance(a.latitude,a.longitude,b.latitude,b.longitude)<=150;
    const p=await env.DB.prepare('SELECT active_since,active_recorded,apart_since FROM pairs WHERE id=?').bind(m.pair_id).first();
    if(near){
     if(p.apart_since){await env.DB.prepare('UPDATE pairs SET apart_since=NULL WHERE id=?').bind(m.pair_id).run()}
     if(!p.active_since){await env.DB.prepare('UPDATE pairs SET active_since=? WHERE id=?').bind(now,m.pair_id).run()}
     else if(now-p.active_since>=10*60000 && !p.active_recorded){
      const last=await env.DB.prepare('SELECT occurred_at FROM meetings WHERE pair_id=? ORDER BY occurred_at DESC LIMIT 1').bind(m.pair_id).first();
      if(!last||now-last.occurred_at>=12*3600000){await env.DB.prepare('INSERT INTO meetings(id,pair_id,occurred_at,source,created_by,created_at) VALUES (?,?,?,?,?,?)').bind(id(),m.pair_id,now,'auto',null,now).run()}
      await env.DB.prepare('UPDATE pairs SET active_recorded=1 WHERE id=?').bind(m.pair_id).run();
     }
    }else if(distance(a.latitude,a.longitude,b.latitude,b.longitude)>350){
     if(!p.apart_since){await env.DB.prepare('UPDATE pairs SET apart_since=? WHERE id=?').bind(now,m.pair_id).run()}
     else if(now-p.apart_since>=30*60000){await env.DB.prepare('UPDATE pairs SET active_since=NULL,active_recorded=0 WHERE id=?').bind(m.pair_id).run()}
    }
   }
  }
  return ok(await state(env,m));
 }
 if(method==='POST'&&path==='/api/location-off'){
  await env.DB.prepare('UPDATE members SET latitude=NULL,longitude=NULL,accuracy=NULL,location_at=NULL WHERE id=?').bind(m.id).run();return ok({ok:true});
 }
 return bad('Nie znaleziono adresu.',404);
}
export default {async fetch(request,env){const url=new URL(request.url),path=url.pathname;if(path.startsWith('/api/')){if(!env.DB)return bad('Brak połączenia z bazą.',503);if(request.method==='OPTIONS')return new Response(null,{status:405});try{return await api(request,env,path)}catch(e){console.error('Razem API error',e);return bad('Wystąpił problem. Spróbuj ponownie.',500)}}if(env.ASSETS)return env.ASSETS.fetch(request);return new Response('Brak zasobów strony',{status:404})}};
