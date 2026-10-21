import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { z } from "zod";
import type { Game, Move } from "./game.ts";

// Endpoints are supplied by browsers. Only contact known push services, never arbitrary URLs.
export function isPushEndpoint(value:string) {
  try {
    const u=new URL(value);
    return u.protocol==="https:" && !u.username && !u.password && !u.port && !u.hash && (
      u.hostname==="fcm.googleapis.com" || u.hostname==="updates.push.services.mozilla.com" ||
      u.hostname==="web.push.apple.com" || u.hostname.endsWith(".push.apple.com") ||
      u.hostname.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}
export const subscriptionSchema=z.object({
  endpoint:z.string().max(2048).refine(isPushEndpoint),
  expirationTime:z.number().nullable().optional().default(null),
  keys:z.object({p256dh:z.string().regex(/^B[A-Za-z0-9_-]{86}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)}),
});
export function notificationFor(game:Game,move:Move) {
  return {
    title:"Voltura Ord",
    body:`${game.players[move.player]} har spelat ${move.words.map(w=>w.text).join(" + ")} – ${game.status==="finished"?"matchen är klar!":"din tur!"}`,
    url:`/#game=${game.id}`,tag:`ord-${game.id}`,eventId:move.id,
  };
}
export async function sendPush(subscription:PushSubscription,data:ReturnType<typeof notificationFor>,vapid:VapidKeys,transport:typeof fetch=fetch) {
  if(!isPushEndpoint(subscription.endpoint))throw new Error("Invalid push endpoint");
  const payload=await buildPushPayload({data,options:{ttl:86400,urgency:"normal"}},subscription,vapid);
  // Do not follow a redirect from a push service to an untrusted host.
  const response=await transport(subscription.endpoint,{...payload,redirect:"error",signal:AbortSignal.timeout(8000)});
  await response.body?.cancel();
  return response.status;
}

type StoredSubscription={id:string;subscription:string};
export async function deliverWord(database:D1Database,game:Game,move:Move,recipientSeat:string,actorSeat:string,vapid:VapidKeys,transport:typeof fetch=fetch) {
  if(move.kind!=="play")return;
  const eventId=`${game.id}:${move.id}`;
  const rows=await database.prepare("SELECT DISTINCT p.id,p.subscription FROM ord_push_subscriptions p JOIN ord_devices d ON d.id=p.device_id JOIN ord_seats s ON s.player_id=d.player_id WHERE s.seat_hash=? AND NOT EXISTS (SELECT 1 FROM ord_seats own WHERE own.player_id=d.player_id AND own.seat_hash=?)")
    .bind(recipientSeat,actorSeat).all<StoredSubscription>();
  // Delivery is independent of the saved turn. One broken phone cannot fail the move.
  await Promise.allSettled(rows.results.map(async row=>{
    const claim=await database.prepare("INSERT OR IGNORE INTO ord_push_deliveries(event_id,subscription_id) VALUES (?,?)").bind(eventId,row.id).run();
    if(claim.meta.changes!==1)return;
    for(let attempt=0;attempt<2;attempt++){
      try {
        const status=await sendPush(subscriptionSchema.parse(JSON.parse(row.subscription)),notificationFor(game,move),vapid,transport);
        if(status===404 || status===410){await database.batch([
          database.prepare("DELETE FROM ord_push_subscriptions WHERE id=?").bind(row.id),
          database.prepare("DELETE FROM ord_push_deliveries WHERE subscription_id=?").bind(row.id),
        ]);return;}
        if(status>=200 && status<300)return;
        if(status<500)break;
      } catch { /* A transient transport failure gets one bounded retry. */ }
      if(attempt===0)await new Promise(resolve=>setTimeout(resolve,250));
    }
    // A retried move may retry a failed delivery, but never resend an accepted one.
    await database.prepare("DELETE FROM ord_push_deliveries WHERE event_id=? AND subscription_id=?").bind(eventId,row.id).run();
    console.warn("Word notification delivery failed");
  }));
}
