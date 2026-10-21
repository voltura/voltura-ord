import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Integration tests create disposable matches: use a local server.');
const tokens=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')],invite=randomBytes(32).toString('hex'),id=randomUUID();
async function api(path,body,player,expected=200){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(player!==undefined?{Authorization:`Bearer ${tokens[player]}`}:{})},body:body?JSON.stringify(body):undefined});
 const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));return value;
}
const create={id,name:'API Anna',playerToken:tokens[0],inviteToken:invite};
const a=await api('/api/games',create,undefined,201);
assert.equal(a.rack.length,8);assert.equal(a.remaining,84);assert.equal('bag' in a,false);assert.equal('racks' in a,false);
const retried=await api('/api/games',create,undefined,201);assert.deepEqual(retried.rack,a.rack);
await api(`/api/games/${id}`,undefined,undefined,403);
await api(`/api/games/${id}`,{op:'join',name:'Intruder',inviteToken:randomBytes(32).toString('hex'),playerToken:tokens[1]},undefined,409);
let view=await api(`/api/games/${id}`,{op:'join',name:'API Bo',inviteToken:invite,playerToken:tokens[1]});
const joined=await api(`/api/games/${id}`,{op:'join',name:'API Bo',inviteToken:invite,playerToken:tokens[1]});assert.equal(joined.version,view.version);
await api(`/api/games/${id}`,{op:'join',name:'Intruder',inviteToken:invite,playerToken:randomBytes(32).toString('hex')},undefined,409);
await api(`/api/games/${id}`,{op:'action',action:{id:randomUUID(),version:view.version,kind:'pass'}},1-view.turn,400);
let active=await api(`/api/games/${id}`,undefined,view.turn);
const before=active.version;
await api(`/api/games/${id}`,{op:'rematch'},0,400);
await api(`/api/games/${id}`,{op:'action',action:{id:randomUUID(),version:before,kind:'play',placements:[{tileId:'forged',index:112}]}},active.me,400);
assert.equal((await api(`/api/games/${id}`,undefined,active.me)).version,before);
const buckets=JSON.parse(readFileSync(new URL('../data/words.json',import.meta.url),'utf8'));
const valid=w=>buckets[w.slice(0,2)]?.includes(`\n${w}\n`);
function findWord(rack,prefix='',chosen=[]){
 if(prefix.length>=2 && valid(prefix))return chosen;
 if(prefix.length>=5)return null;
 for(const tile of rack){if(chosen.some(c=>c.tileId===tile.id))continue;for(const letter of tile.letter?[tile.letter]:[...'AEINORST']){
   const found=findWord(rack,prefix+letter,[...chosen,{tileId:tile.id,index:111+chosen.length,...(!tile.letter?{letter}:{})}]);if(found)return found;
 }}return null;
}
let placements=findWord(active.rack);
// No forced tile bags: an unlucky rack is exchanged through the public API.
for(let tries=0;!placements && tries<10;tries++){
 await api(`/api/games/${id}`,{op:'action',action:{id:randomUUID(),version:active.version,kind:'exchange',tileIds:active.rack.map(t=>t.id)}},active.me);
 view=await api(`/api/games/${id}`,undefined,1-active.me);active=view;placements=findWord(active.rack);
}
assert.ok(placements,'found an actual dictionary word');
const preview=await api(`/api/games/${id}`,{op:'preview',version:active.version,placements},active.me);
const move={op:'action',action:{id:randomUUID(),version:active.version,kind:'play',placements}};
const responses=await Promise.all([api(`/api/games/${id}`,move,active.me),api(`/api/games/${id}`,move,active.me)]);
assert.equal(responses[0].version,responses[1].version);assert.equal(responses[0].history.at(-1).score,preview.score);
assert.equal(responses[0].history.filter(h=>h.id===move.action.id).length,1);
view=responses[0];const replay=await api(`/api/games/${id}`,move,active.me);assert.equal(replay.version,view.version);
const opponent=await api(`/api/games/${id}`,undefined,1-active.me);assert.deepEqual(opponent.board,view.board);assert.notDeepEqual(opponent.rack,view.rack);
const stale={op:'action',action:{id:randomUUID(),version:0,kind:'pass'}};
await api(`/api/games/${id}`,stale,opponent.me,400);
// An exchange followed by passes exercises saved end-game state.
view=await api(`/api/games/${id}`,{op:'action',action:{id:randomUUID(),version:opponent.version,kind:'exchange',tileIds:[opponent.rack[0].id]}},opponent.me);
while(view.status!=='finished')view=await api(`/api/games/${id}`,{op:'action',action:{id:randomUUID(),version:view.version,kind:'pass'}},view.turn);
const finalA=await api(`/api/games/${id}`,undefined,0),finalB=await api(`/api/games/${id}`,undefined,1);
assert.deepEqual(finalA.scores,finalB.scores);assert.equal(finalA.finishReason,'passes');assert.equal(finalA.adjustments.length,2);
// Both players can start the same rematch; retries never reset it.
const [againA,againB]=await Promise.all([api(`/api/games/${id}`,{op:'rematch'},0),api(`/api/games/${id}`,{op:'rematch'},1)]);
assert.equal(againA.id,againB.id);assert.notEqual(againA.id,id);
assert.deepEqual(againA.players,finalA.players);assert.deepEqual(againA.scores,[0,0]);
assert.equal(againA.status,'playing');assert.equal(againA.remaining,84);assert.equal(againA.rack.length,8);assert.equal(againB.rack.length,8);
assert.notDeepEqual(againA.rack,againB.rack);assert.equal(againA.board.filter(Boolean).length,0);assert.equal(againA.history.length,0);
assert.equal('bag' in againA,false);assert.equal('racks' in againA,false);
assert.deepEqual((await api(`/api/games/${id}`,{op:'rematch'},0)).rack,againA.rack);
await api(`/api/games/${id}`,{op:'rematch'},undefined,403);
const parent=await api(`/api/games/${id}`,undefined,0);
assert.equal(parent.rematchId,againA.id);assert.deepEqual(parent.history,finalA.history);assert.deepEqual(parent.scores,finalA.scores);
assert.equal((await api(`/api/games/${id}?latest=1`,undefined,1)).id,againA.id);
// Complete another match and check that an original bookmark reaches the newest one.
view=againA;
while(view.status!=='finished')view=await api(`/api/games/${view.id}`,{op:'action',action:{id:randomUUID(),version:view.version,kind:'pass'}},view.turn);
const third=await api(`/api/games/${againA.id}`,{op:'rematch'},1);
assert.equal((await api(`/api/games/${id}?latest=1`,undefined,0)).id,third.id);
// Cookie-only restoration models the fresh storage of an installed Home Screen app.
assert.equal((await api('/api/resume')).match,null);
await api('/api/resume',{id},undefined,403);
for(const player of [0,1]){
 const response=await fetch(base+'/api/resume',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tokens[player]}`},body:JSON.stringify({id,invite})});
 assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Lax'));assert.ok(cookie.includes('Max-Age=31536000'));
 const restoredResponse=await fetch(base+'/api/resume',{headers:{Cookie:cookie.split(';')[0]}});
 assert.ok(restoredResponse.headers.get('cache-control').includes('no-store'));
 const {match}=await restoredResponse.json();assert.equal(match.token,tokens[player]);assert.equal(match.name,finalA.players[player]);
 assert.equal(match.invite,player===0?invite:undefined);
 assert.equal((await api(`/api/games/${match.id}?latest=1`,undefined,player)).id,third.id);
 const cross=await fetch(base+'/api/resume',{headers:{Cookie:cookie.split(';')[0],'Sec-Fetch-Site':'cross-site'}});assert.equal(cross.status,400);
 const sibling=await fetch(base+'/api/resume',{headers:{Cookie:cookie.split(';')[0],'Sec-Fetch-Site':'same-site'}});assert.equal(sibling.status,400);
 const forged=encodeURIComponent(JSON.stringify({id,token:randomBytes(32).toString('hex')}));
 assert.equal((await (await fetch(base+'/api/resume',{headers:{Cookie:`voltura-ord-resume=${forged}`}})).json()).match,null);
}
const foreign=await fetch(base+'/api/resume',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tokens[0]}`,Origin:'https://elsewhere.example'},body:JSON.stringify({id})});assert.ok([400,403].includes(foreign.status));
const html=await (await fetch(base)).text();assert.match(html,/rel="manifest"/);assert.match(html,/apple-mobile-web-app-capable/);assert.match(html,/viewport-fit=cover/);
assert.ok(html.includes('Så spelar ni'),'Swedish characters survive the production build');
assert.ok(html.includes('Små brickor. Stora möjligheter.'));
const manifest=await (await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.id,'/');
for(const icon of manifest.icons){const response=await fetch(base+icon.src);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes('image/png'));}
console.log(JSON.stringify({passed:true,word:preview.words.map(w=>w.text),score:preview.score,turns:finalA.history.length,checks:['create retry','private racks','single-use invite','join retry','forged tile','wrong turn','preview','concurrent duplicate','stale version','refill','exchange','complete match','resume final state','concurrent rematch','rematch retry','same players private racks','preserved final score','original link across two rematches','cookie-only restoration both players','forged and cross-site cookie requests','home screen manifest and icons']}));
