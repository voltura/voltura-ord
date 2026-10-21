import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(){
 const handlers={},shown=[],opened=[],navigated=[];let focused=false;
 const client={url:'https://ord.voltura.se/#game=old',navigate:async url=>{navigated.push(url);return client;},focus:async()=>{focused=true;return client;}};
 vm.runInNewContext(source,{URL,self:{location:{origin:'https://ord.voltura.se'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[client],openWindow:async url=>opened.push(url)}}});
 return {handlers,shown,opened,navigated,get focused(){return focused;}};
}
test('push always shows a visible notification, including malformed payloads',async()=>{
 const w=worker();let task;
 w.handlers.push({data:{json:()=>({body:'Joakim har spelat RÅT – din tur!',url:'/#game=11111111-1111-4111-8111-111111111111',tag:'match'})},waitUntil:p=>task=p});await task;
 assert.equal(w.shown[0][0],'Voltura Ord');assert.equal(w.shown[0][1].body,'Joakim har spelat RÅT – din tur!');
 w.handlers.push({data:{json:()=>{throw new Error('bad JSON');}},waitUntil:p=>task=p});await task;assert.equal(w.shown[1][1].data.url,'/');
 w.handlers.push({data:{json:()=>({url:'https://evil.example/'})},waitUntil:p=>task=p});await task;assert.equal(w.shown[2][1].data.url,'/');
});
test('notification tap navigates an existing app to the correct match and focuses it',async()=>{
 const w=worker();let task,closed=false;
 w.handlers.notificationclick({notification:{data:{url:'/#game=11111111-1111-4111-8111-111111111111'},close:()=>closed=true},waitUntil:p=>task=p});await task;
 assert.ok(closed);assert.ok(w.focused);assert.deepEqual(w.navigated,['https://ord.voltura.se/#game=11111111-1111-4111-8111-111111111111']);assert.equal(w.opened.length,0);
});
test('notification clicks cannot navigate to a different origin and no private-data cache is installed',async()=>{
 const w=worker();let task;
 w.handlers.notificationclick({notification:{data:{url:'https://evil.example/'},close(){}},waitUntil:p=>task=p});await task;
 assert.equal(w.navigated.length,0);assert.equal(w.opened.length,0);assert.equal(w.handlers.fetch,undefined);
});
