import { after } from "next/server";
import { db,body,json,hash,sameOrigin } from "./server";
import { device } from "./player-session";
import { deliverWord,subscriptionSchema } from "./push-delivery";
import type { Game,Move } from "./game";

function keys(){
  const publicKey=process.env.ORD_PUSH_PUBLIC_KEY,privateKey=process.env.ORD_PUSH_PRIVATE_KEY;
  return publicKey && privateKey?{publicKey,privateKey,subject:"https://ord.voltura.se"}:null;
}
export async function pushRead(request:Request){
  sameOrigin(request);const d=await device(request);
  if(!d)return json({error:"Ladda om spelet och försök igen."},401);
  const existing=await db().prepare("SELECT id FROM ord_push_subscriptions WHERE device_id=? AND origin=?").bind(d.id,new URL(request.url).origin).first();
  return json({publicKey:keys()?.publicKey || null,enabled:!!existing});
}
export async function pushUpdate(request:Request){
  const input=await body(request),d=await device(request);
  if(!d)return json({error:"Ladda om spelet och försök igen."},401);
  const origin=new URL(request.url).origin;
  if(input.op==="disable"){
    await db().batch([
      db().prepare("DELETE FROM ord_push_deliveries WHERE subscription_id IN (SELECT id FROM ord_push_subscriptions WHERE device_id=? AND origin=?)").bind(d.id,origin),
      db().prepare("DELETE FROM ord_push_subscriptions WHERE device_id=? AND origin=?").bind(d.id,origin),
    ]);
    return json({enabled:false});
  }
  if(input.op!=="subscribe")return json({error:"Okänd förfrågan."},400);
  if(!keys())return json({error:"Notiser är inte tillgängliga ännu. Försök igen senare."},503);
  const subscription=subscriptionSchema.parse(input.subscription),id=await hash(subscription.endpoint);
  const owner=await db().prepare("SELECT device_id,origin FROM ord_push_subscriptions WHERE id=?").bind(id).first<{device_id:string;origin:string}>();
  if(owner && (owner.device_id!==d.id || owner.origin!==origin))return json({error:"Ladda om appen och försök igen."},409);
  const saved=await db().batch([
    db().prepare("DELETE FROM ord_push_deliveries WHERE subscription_id IN (SELECT id FROM ord_push_subscriptions WHERE device_id=? AND origin=? AND id<>?)").bind(d.id,origin,id),
    db().prepare("DELETE FROM ord_push_subscriptions WHERE device_id=? AND origin=? AND id<>?").bind(d.id,origin,id),
    db().prepare("INSERT INTO ord_push_subscriptions(id,device_id,origin,subscription) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription WHERE device_id=excluded.device_id AND origin=excluded.origin")
      .bind(id,d.id,origin,JSON.stringify(subscription)),
  ]);
  if(saved[2].meta.changes!==1)return json({error:"Ladda om appen och försök igen."},409);
  return json({enabled:true});
}
export function queueWordNotification(game:Game,move:Move,recipientSeat:string|null,actorSeat:string){
  const vapid=keys();if(!vapid || !recipientSeat || move.kind!=="play")return;
  after(async()=>{try{await deliverWord(db(),game,move,recipientSeat,actorSeat,vapid);}catch{console.warn("Word notification unavailable");}});
}
