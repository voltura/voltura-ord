import assert from 'node:assert/strict';
import { createECDH,randomBytes } from 'node:crypto';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Local tests only.');
function client(){
 let cookie='';return {async call(path,data,status=200,headers={}){
  const r=await fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});
  for(const item of r.headers.getSetCookie())cookie=item.split(';')[0];
  const v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;
 }};
}
const a=client(),b=client(),anonymous=client();
await anonymous.call('/api/push',undefined,401);
for(const c of [a,b])await c.call('/api/player',{op:'init'});
const config=await a.call('/api/push');assert.equal(config.publicKey.length,87);assert.equal(config.enabled,false);
const key=createECDH('prime256v1');key.generateKeys();
const subscription={endpoint:`https://fcm.googleapis.com/fcm/send/${randomBytes(16).toString('hex')}`,expirationTime:null,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
await a.call('/api/push',{op:'subscribe',subscription});
await a.call('/api/push',{op:'subscribe',subscription});
assert.equal((await a.call('/api/push')).enabled,true);assert.equal((await b.call('/api/push')).enabled,false);
await b.call('/api/push',{op:'subscribe',subscription},409);
await a.call('/api/push',{op:'subscribe',subscription:{...subscription,endpoint:'https://127.0.0.1/private'}},400);
await a.call('/api/push',{op:'disable'},400,{'sec-fetch-site':'cross-site'});
assert.equal((await a.call('/api/push')).enabled,true);
await b.call('/api/push',{op:'disable'});assert.equal((await a.call('/api/push')).enabled,true);
await a.call('/api/push',{op:'disable'});assert.equal((await a.call('/api/push')).enabled,false);
await a.call('/api/push',{op:'subscribe',subscription});await a.call('/api/player',{op:'logout'});await a.call('/api/push',undefined,401);
console.log('Push API passed: device authorization, subscription persistence, ownership, SSRF rejection, CSRF, disable and logout. No notification was sent.');
