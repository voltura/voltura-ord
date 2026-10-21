import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH,createDecipheriv,hkdfSync,randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { deliverWord,isPushEndpoint,notificationFor,sendPush } from '../lib/push-delivery.ts';

const vapidKey=createECDH('prime256v1');vapidKey.generateKeys();
const vapid={publicKey:vapidKey.getPublicKey().toString('base64url'),privateKey:vapidKey.getPrivateKey().toString('base64url'),subject:'https://ord.voltura.se'};
function subscription(path='test'){
 const key=createECDH('prime256v1');key.generateKeys();
 return {key,subscription:{endpoint:`https://fcm.googleapis.com/fcm/send/${path}`,expirationTime:null,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}};
}
const move={id:'move-1',player:0,kind:'play',words:[{text:'RÅT',score:9,cells:[112,113,114]}],score:9,bonus:0,cells:[112,113,114],at:new Date().toISOString()};
const game={id:'11111111-1111-4111-8111-111111111111',players:['Joakim','Berit'],turn:1,status:'playing'};
function storage(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE ord_devices(id TEXT PRIMARY KEY,player_id TEXT);CREATE TABLE ord_seats(player_id TEXT,seat_hash TEXT);');
 sql.exec(readFileSync(new URL('../drizzle/0003_regular_goliath.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO ord_devices VALUES ('anna-phone','anna'),('berit-phone','berit'),('stranger-phone','stranger');INSERT INTO ord_seats VALUES ('anna','actor-seat'),('berit','recipient-seat'),('stranger','unrelated-seat');");
 const database={prepare(query){const statement={args:[],bind(...args){this.args=args;return this;},async all(){return {results:sql.prepare(query).all(...this.args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...this.args).changes)}};}};return statement;},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 for(const id of ['anna-phone','berit-phone','stranger-phone']){
  sql.prepare('INSERT INTO ord_push_subscriptions VALUES (?,?,?,?)').run(id,id,'https://ord.voltura.se',JSON.stringify(subscription(id).subscription));
 }
 return {sql,database};
}
test('only browser push service HTTPS endpoints are allowed',()=>{
 for(const url of ['https://web.push.apple.com/Q','https://x.push.apple.com/Q','https://fcm.googleapis.com/fcm/send/Q','https://updates.push.services.mozilla.com/wpush/v2/Q','https://wns2.notify.windows.com/Q'])assert.ok(isPushEndpoint(url));
 for(const url of ['http://fcm.googleapis.com/Q','https://127.0.0.1/Q','https://fcm.googleapis.com.evil.test/Q','https://evilpush.apple.com/Q','https://user@web.push.apple.com/Q','https://web.push.apple.com:444/Q','https://web.push.apple.com/Q#fragment'])assert.equal(isPushEndpoint(url),false,url);
});
test('encrypted RFC 8291 payload decrypts on the recipient and carries no private player link',async()=>{
 const {subscription:sub,key}=subscription();let captured;
 await sendPush(sub,notificationFor(game,move),vapid,async(url,init)=>{captured=init;assert.equal(url,sub.endpoint);return new Response(null,{status:201});});
 assert.equal(captured.headers['content-encoding'],'aes128gcm');assert.equal(captured.redirect,'error');assert.ok(captured.headers.authorization.startsWith('vapid '));
 const body=Buffer.from(captured.body),salt=body.subarray(0,16),senderPublic=body.subarray(21,21+body[20]);
 const shared=key.computeSecret(senderPublic),receiverPublic=key.getPublicKey();
 const ikm=Buffer.from(hkdfSync('sha256',shared,Buffer.from(sub.keys.auth,'base64url'),Buffer.concat([Buffer.from('WebPush: info\0'),receiverPublic,senderPublic]),32));
 const cek=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16));
 const nonce=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
 const ciphertext=body.subarray(21+body[20]),decipher=createDecipheriv('aes-128-gcm',cek,nonce);decipher.setAuthTag(ciphertext.subarray(-16));
 const plain=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);let end=plain.length-1;while(plain[end]===0)end--;assert.equal(plain[end],2);
 const decoded=JSON.parse(plain.subarray(0,end).toString());assert.equal(decoded.body,'Joakim har spelat RÅT – din tur!');assert.equal(decoded.url,`/#game=${game.id}`);assert.ok(!JSON.stringify(decoded).includes('play='));
});
test('only the opponent receives the word, including under concurrent duplicate delivery',async()=>{
 const {sql,database}=storage();const sent=[];
 const transport=async url=>{sent.push(url);return new Response(null,{status:201});};
 await Promise.all([deliverWord(database,game,move,'recipient-seat','actor-seat',vapid,transport),deliverWord(database,game,move,'recipient-seat','actor-seat',vapid,transport)]);
 assert.equal(sent.length,1);assert.ok(sent[0].endsWith('/berit-phone'));
 await deliverWord(database,game,move,'recipient-seat','actor-seat',vapid,transport);assert.equal(sent.length,1);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM ord_push_deliveries').get().n,1);sql.close();
});
test('expired subscriptions are removed; transient failures retry and do not fail the turn',async()=>{
 const {sql,database}=storage();let sent=0;
 await deliverWord(database,game,move,'recipient-seat','actor-seat',vapid,async()=>{sent++;return new Response(null,{status:410});});
 assert.equal(sent,1);assert.equal(sql.prepare("SELECT count(*) AS n FROM ord_push_subscriptions WHERE device_id='berit-phone'").get().n,0);sql.close();
 const retry=storage();sent=0;
 await deliverWord(retry.database,game,move,'recipient-seat','actor-seat',vapid,async()=>new Response(null,{status:++sent===1?503:201}));assert.equal(sent,2);
 retry.sql.close();
});
test('passes, exchanges and a profile owning both seats do not generate word alerts',async()=>{
 const {sql,database}=storage();let sent=0;const transport=async()=>{sent++;return new Response(null,{status:201});};
 await deliverWord(database,game,{...move,kind:'pass'},'recipient-seat','actor-seat',vapid,transport);
 await deliverWord(database,game,{...move,kind:'exchange'},'recipient-seat','actor-seat',vapid,transport);
 sql.exec("INSERT INTO ord_seats VALUES ('berit','actor-seat')");
 await deliverWord(database,game,move,'recipient-seat','actor-seat',vapid,transport);assert.equal(sent,0);sql.close();
});
