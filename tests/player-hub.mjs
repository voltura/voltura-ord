import assert from 'node:assert/strict';
import {randomBytes,randomUUID,randomInt} from 'node:crypto';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Local integration tests only.');
const token=()=>randomBytes(32).toString('hex');
function client(initialCookie=''){
 let cookie=initialCookie;const testIp=randomUUID();
 return {get cookie(){return cookie;},async call(path,data,expected=200,extra={}){
  const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie,'cf-connecting-ip':testIp,...extra},body:data?JSON.stringify(data):undefined});
  for(const item of r.headers.getSetCookie()){
   const pair=item.split(';')[0],key=pair.split('=')[0];cookie=[...cookie.split('; ').filter(c=>c && !c.startsWith(key+'=')),pair].join('; ');
  }
  const v=await r.json();assert.equal(r.status,expected,JSON.stringify(v));return v;
 }};
}
const a=client(),b=client(),phone=client(),stranger=client(),replacement=client();
for(const c of [a,b,phone,stranger,replacement])await c.call('/api/player',{op:'init'});
const code=String(randomInt(100000,999999)),id=randomUUID(),p0=token(),inv=token();
await a.call('/api/games',{id,name:'Anna',playerToken:p0,inviteToken:inv},201);
assert.equal((await a.call('/api/player')).matches[0].id,id);
assert.equal((await a.call('/api/player',{op:'code',code})).code,code);
assert.equal((await a.call('/api/player',{op:'code',code:'9999'})).code,code,'code never silently changes');
await b.call('/api/player',{op:'code',code},400);
await b.call('/api/player',{op:'connect',name:'Mamma',code});
await b.call('/api/player',{op:'connect',name:'Mamma',code});
let hub=await a.call('/api/player');assert.equal(hub.incoming.length,1,'double send has one request');
await b.call(`/api/games/${id}`,undefined,403);
await stranger.call('/api/player',{op:'approve',id:hub.incoming[0].id,kind:'device'},404);
await a.call('/api/player',{op:'approve',id:hub.incoming[0].id,kind:'opponent',gameId:id});
await a.call('/api/player',{op:'approve',id:hub.incoming[0].id,kind:'opponent',gameId:id});
let ga=await a.call(`/api/games/${id}`),gb=await b.call(`/api/games/${id}`);
assert.equal(ga.me,0);assert.equal(gb.me,1);assert.equal(gb.players[1],'Mamma');assert.notDeepEqual(ga.rack,gb.rack);
assert.equal((await b.call('/api/player')).matches[0].id,id);
const reopened=client(b.cookie);assert.equal((await reopened.call('/api/player')).matches[0].id,id,'cookie-only Home Screen recovery');
await phone.call('/api/player',{op:'connect',name:'Min telefon',code});
hub=await a.call('/api/player');await a.call('/api/player',{op:'approve',id:hub.incoming[0].id,kind:'device'});
assert.equal((await phone.call(`/api/games/${id}`)).me,0);
assert.equal((await phone.call('/api/player')).code,code);
assert.equal((await phone.call('/api/player')).outgoing.status,'approved');
await replacement.call('/api/player',{op:'connect',name:'Mammas nya telefon',code});
hub=await a.call('/api/player');await a.call('/api/player',{op:'approve',id:hub.incoming[0].id,kind:'partner',gameId:id});
assert.equal((await replacement.call(`/api/games/${id}`)).me,1);
const link=await phone.call('/api/player',{op:'link',id});
assert.equal((await stranger.call(`/api/games/${id}`,undefined,200,{Authorization:`Bearer ${link.token}`})).me,0);
await stranger.call(`/api/games/${id}`,undefined,403);
await stranger.call('/api/player',{op:'import',matches:[{id,token:token()}]});assert.equal((await stranger.call('/api/player')).matches.length,0);
await stranger.call('/api/player',{op:'approve',id:randomUUID(),kind:'device'},404);
const foreign=await fetch(base+'/api/player',{method:'POST',headers:{'Content-Type':'application/json',Cookie:a.cookie,Origin:'https://evil.example'},body:JSON.stringify({op:'code',code:'1111'})});assert.ok([400,403].includes(foreign.status));
const forged=await stranger.call('/api/player',undefined,200,{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged@example.com'});assert.equal(forged.signedIn,false);
let game=ga;
while(game.status!=='finished')game=await [a,b][game.turn].call(`/api/games/${id}`,{op:'action',action:{id:randomUUID(),version:game.version,kind:'pass'}});
const [next1,next2]=await Promise.all([a.call(`/api/games/${id}`,{op:'rematch'}),b.call(`/api/games/${id}`,{op:'rematch'})]);assert.equal(next1.id,next2.id);
for(const c of [a,b,phone,reopened,replacement]){const h=await c.call('/api/player');assert.equal(h.matches.length,1);assert.equal(h.matches[0].id,next1.id);}
assert.equal((await a.call('/api/player')).code,code);
assert.equal((await stranger.call(`/api/games/${next1.id}`,undefined,200,{Authorization:`Bearer ${link.token}`})).me,0);
// New export invitations work on synced devices, but cannot read private tiles.
const second=randomUUID();await a.call('/api/games',{id:second,name:'Anna',playerToken:token(),inviteToken:token()},201);
const exported=await phone.call('/api/player',{op:'link',id:second});assert.ok(exported.invite);
await stranger.call(`/api/games/${second}`,undefined,403,{Authorization:`Bearer ${exported.invite}`});
await stranger.call(`/api/games/${second}`,{op:'join',name:'Bo',playerToken:token(),inviteToken:exported.invite});
assert.equal((await replacement.call('/api/player')).matches.length,1,'replacement gets only this pair, not all host games');
const rateClient=client();await rateClient.call('/api/player',{op:'init'});
let limited=false;for(let i=0;i<15;i++){const r=await fetch(base+'/api/player',{method:'POST',headers:{'Content-Type':'application/json',Cookie:rateClient.cookie,'cf-connecting-ip':'rate-'+code},body:JSON.stringify({op:'connect',code:'00000000',name:'Test'})});const v=await r.json();if(v.error?.includes('Vänta en liten stund')){limited=true;break;}}
assert.ok(limited,'short codes have server-side throttling');
console.log('Player hub passed: persistent code, owner approval, separate seats, device transfer, partner recovery, root match list, cookie recovery, rematch sync, scoped links, CSRF, forged identity, throttling.');
