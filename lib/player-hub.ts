import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db, hash, json, body, sameOrigin, rowFor, authenticate } from "./server";
import { device, secret, DEVICE_COOKIE } from "./player-session";
import { GameError, randomInt, type Game } from "./game";

const codeSchema=z.string().regex(/^\d{4,8}$/,"Ange fyra till åtta siffror.");
const nameSchema=z.string().trim().min(1).max(24).regex(/^[^\p{Cc}\p{Cf}<>]+$/u);
type Connection={id:string;owner:string;requester:string;device_id:string;name:string;status:string;created:number};
async function nativeUser(request:Request){
  // Only the hosted Sites gateway supplies trusted identity. Local headers are untrusted.
  const url=new URL(request.url);
  return url.protocol==="https:" && ["ord.voltura.se","voltura-ord.volturaab.chatgpt.site"].includes(url.hostname)?getChatGPTUser():null;
}
async function rate(request:Request,scope:string,max=12){
  const now=Math.floor(Date.now()/1000),id=await hash(`${scope}:${request.headers.get("cf-connecting-ip") || "local"}:${Math.floor(now/600)}`);
  const result=await db().prepare("INSERT INTO ord_limits(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count").bind(id,now+1200).first<{count:number}>();
  if((result?.count || 0)>max)throw new GameError("Vänta en liten stund innan du försöker igen.");
  await db().prepare("DELETE FROM ord_limits WHERE expires<?").bind(now).run();
}
async function initialize(request:Request,linkAccount:boolean){
  let d=await device(request),freshToken:string|null=null;
  if(!d){
    await rate(request,"device",60);
    freshToken=secret();d={id:await hash(freshToken),player_id:crypto.randomUUID()};
    await db().batch([
      db().prepare("INSERT INTO ord_players(id) VALUES (?)").bind(d.player_id),
      db().prepare("INSERT INTO ord_devices(id,player_id) VALUES (?,?)").bind(d.id,d.player_id),
    ]);
  }
  const user=await nativeUser(request);
  if(user){
    const account=await db().prepare("SELECT player_id FROM ord_accounts WHERE id=?").bind(user.userId).first<{player_id:string}>();
    if(account && account.player_id!==d.player_id){
      const previous=await db().prepare("SELECT id FROM ord_accounts WHERE player_id=? LIMIT 1").bind(d.player_id).first();
      // An explicit sign-in may import this browser's anonymous games, never another account's.
      if(linkAccount && !previous)await db().batch([
        db().prepare("INSERT OR IGNORE INTO ord_seats(player_id,seat_hash) SELECT ?,seat_hash FROM ord_seats WHERE player_id=?").bind(account.player_id,d.player_id),
        db().prepare("UPDATE ord_code_routes SET player_id=? WHERE player_id=?").bind(account.player_id,d.player_id),
        db().prepare("UPDATE ord_connections SET owner=? WHERE owner=? AND status='pending'").bind(account.player_id,d.player_id),
        db().prepare("UPDATE ord_devices SET player_id=? WHERE player_id=?").bind(account.player_id,d.player_id),
      ]);
      await db().prepare("UPDATE ord_devices SET player_id=? WHERE id=?").bind(account.player_id,d.id).run();
      d.player_id=account.player_id;
    }else if(!account){
      const previous=await db().prepare("SELECT id FROM ord_accounts WHERE player_id=? LIMIT 1").bind(d.player_id).first();
      if(previous)throw new GameError("Den här enheten är kopplad till ett annat konto.");
      await db().prepare("INSERT OR IGNORE INTO ord_accounts(id,player_id) VALUES (?,?)").bind(user.userId,d.player_id).run();
    }
  }
  const response=json({ready:true});
  if(freshToken)response.headers.set("Set-Cookie",`${DEVICE_COOKIE}=${freshToken}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${new URL(request.url).protocol==="https:"?"; Secure":""}`);
  return response;
}
export async function hubRead(request:Request){
  sameOrigin(request);const d=await device(request);if(!d)return json({matches:[],incoming:[],outgoing:null,code:null,signedIn:false});
  const player=await db().prepare("SELECT code FROM ord_code_routes WHERE player_id=? ORDER BY rowid LIMIT 1").bind(d.player_id).first<{code:string|null}>();
  const sharedCode=player?.code?null:await db().prepare("SELECT c.code FROM ord_code_routes c JOIN ord_connections x ON x.owner=c.player_id WHERE x.requester=? AND x.status='approved' ORDER BY x.created DESC LIMIT 1").bind(d.player_id).first<{code:string}>();
  const rows=await db().prepare("SELECT g.id,g.state,g.player0,g.player1,s.seat_hash FROM games g JOIN ord_seats s ON (s.seat_hash=g.player0 OR s.seat_hash=g.player1) WHERE s.player_id=? AND json_extract(g.state,'$.rematchId') IS NULL ORDER BY g.updated_at DESC LIMIT 30").bind(d.player_id).all<{id:string;state:string;player0:string;player1:string;seat_hash:string}>();
  const matches=rows.results.map(row=>{const g:Game=JSON.parse(row.state),me=row.seat_hash===row.player0?0:1;return {id:g.id,token:"",me,name:g.players[me],opponent:g.players[1-me],status:g.status,myTurn:g.turn===me};});
  const now=Math.floor(Date.now()/1000);
  const incoming=await db().prepare("SELECT id,name FROM ord_connections WHERE owner=? AND status='pending' AND created>? ORDER BY created DESC LIMIT 10").bind(d.player_id,now-1800).all<{id:string;name:string}>();
  const outgoing=await db().prepare("SELECT id,status FROM ord_connections WHERE device_id=? AND created>? ORDER BY created DESC LIMIT 1").bind(d.id,now-1800).first<{id:string;status:string}>();
  const user=await nativeUser(request);
  return json({matches,incoming:incoming.results,outgoing,code:player?.code || sharedCode?.code || null,ownsCode:!!player?.code,signedIn:!!user});
}
export async function hubUpdate(request:Request){
  const input=await body(request);
  if(input.op==="init")return initialize(request,input.linkAccount===true);
  const d=await device(request);if(!d)return json({error:"Ladda om sidan och försök igen."},401);
  if(input.op==="logout"){
    await db().batch([
      db().prepare("DELETE FROM ord_push_deliveries WHERE subscription_id IN (SELECT id FROM ord_push_subscriptions WHERE device_id=?)").bind(d.id),
      db().prepare("DELETE FROM ord_push_subscriptions WHERE device_id=?").bind(d.id),
      db().prepare("DELETE FROM ord_devices WHERE id=?").bind(d.id),
    ]);
    const response=json({done:true});
    for(const name of [DEVICE_COOKIE,"voltura-ord-resume"])response.headers.append("Set-Cookie",`${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${new URL(request.url).protocol==="https:"?"; Secure":""}`);
    return response;
  }
  if(input.op==="import"){
    const matches=z.array(z.object({id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)})).max(30).parse(input.matches);
    const statements=[];
    for(const match of matches){
      const row=await rowFor(match.id);if(!row)continue;
      const me=await authenticate(new Request(request.url,{headers:{Authorization:`Bearer ${match.token}`}}),row);
      if(me>=0){
        const seat=me===0?row.player0:row.player1!;
        // Silent legacy migration must not mix two signed-in accounts on a shared browser.
        statements.push(db().prepare("INSERT OR IGNORE INTO ord_seats(player_id,seat_hash) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM ord_seats s JOIN ord_accounts a ON a.player_id=s.player_id WHERE s.seat_hash=? AND s.player_id<>?)").bind(d.player_id,seat,seat,d.player_id));
      }
    }
    if(statements.length)await db().batch(statements);return json({saved:true});
  }
  if(input.op==="code"){
    await rate(request,"choose-code");const code=codeSchema.parse(input.code);
    const current=await db().prepare("SELECT code FROM ord_code_routes WHERE player_id=? ORDER BY rowid LIMIT 1").bind(d.player_id).first<{code:string|null}>();
    if(current?.code)return json({code:current.code});
    await db().batch([
      db().prepare("UPDATE OR IGNORE ord_players SET code=? WHERE id=? AND code IS NULL").bind(code,d.player_id),
      db().prepare("INSERT OR IGNORE INTO ord_code_routes(code,player_id) SELECT code,id FROM ord_players WHERE id=? AND code=?").bind(d.player_id,code),
    ]);
    const chosen=await db().prepare("SELECT code FROM ord_code_routes WHERE player_id=? ORDER BY rowid LIMIT 1").bind(d.player_id).first<{code:string}>();
    if(!chosen)throw new GameError("Den koden är upptagen. Välj några andra siffror.");
    return json({code:chosen.code});
  }
  if(input.op==="connect"){
    await rate(request,"connect");const code=codeSchema.parse(input.code),name=nameSchema.parse(input.name);
    const target=await db().prepare("SELECT player_id id FROM ord_code_routes WHERE code=?").bind(code).first<{id:string}>();
    if(!target || target.id===d.player_id)throw new GameError("Kontrollera koden med den du ska spela med.");
    const now=Math.floor(Date.now()/1000);
    const pending=await db().prepare("SELECT id FROM ord_connections WHERE device_id=? AND owner=? AND status='pending' AND created>?").bind(d.id,target.id,now-1800).first<{id:string}>();
    if(pending)return json({requested:true});
    const count=await db().prepare("SELECT count(*) n FROM ord_connections WHERE owner=? AND status='pending' AND created>?").bind(target.id,now-1800).first<{n:number}>();
    if((count?.n || 0)>=10)throw new GameError("Be din medspelare öppna appen och godkänna anslutningen först.");
    await db().prepare("INSERT INTO ord_connections(id,owner,requester,device_id,name,status,created) VALUES (?,?,?,?,?,'pending',?)").bind(crypto.randomUUID(),target.id,d.player_id,d.id,name,now).run();
    return json({requested:true});
  }
  if(input.op==="approve" || input.op==="reject"){
    const id=z.string().uuid().parse(input.id);
    const connection=await db().prepare("SELECT * FROM ord_connections WHERE id=? AND owner=?").bind(id,d.player_id).first<Connection>();
    if(!connection) return json({error:"Anslutningen hittades inte."},404);
    if(connection.status!=="pending")return json({done:true});
    if(connection.created<Math.floor(Date.now()/1000)-1800)throw new GameError("Be din medspelare ange samma kod igen.");
    if(input.op==="reject"){
      await db().prepare("UPDATE ord_connections SET status='rejected' WHERE id=? AND status='pending'").bind(id).run();return json({done:true});
    }
    if(input.kind==="device"){
      // Explicit approval transfers only this requesting device, not every device of another user.
      await db().batch([
        db().prepare("UPDATE ord_devices SET player_id=? WHERE id=? AND EXISTS(SELECT 1 FROM ord_connections WHERE id=? AND status='pending')").bind(d.player_id,connection.device_id,id),
        db().prepare("UPDATE ord_connections SET status='approved' WHERE id=? AND status='pending'").bind(id),
      ]);
    }else if(input.kind==="partner"){
      const gameId=z.string().uuid().parse(input.gameId),row=await rowFor(gameId),me=row?await authenticate(request,row):-1;
      if(!row || me<0 || !row.player1)throw new GameError("Välj er gemensamma match.");
      const seat=me===0?row.player1:row.player0;
      // The existing participant explicitly approves a replacement device for their partner.
      // This grants only that pair's seat and rematches, not the partner's other games.
      await db().batch([
        db().prepare("INSERT OR IGNORE INTO ord_seats(player_id,seat_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM ord_connections WHERE id=? AND status='pending')").bind(connection.requester,seat,id),
        db().prepare("UPDATE ord_connections SET status='approved' WHERE id=? AND status='pending'").bind(id),
      ]);
    }else if(input.kind==="opponent"){
      const gameId=z.string().uuid().parse(input.gameId),row=await rowFor(gameId);
      if(!row || await authenticate(request,row)!==0)throw new GameError("Välj en match du har skapat.");
      const game:Game=JSON.parse(row.state);
      if(game.status!=="waiting" || row.player1)throw new GameError("Den matchen har redan två spelare.");
      const p1=await hash(secret());game.players[1]=connection.name;game.status="playing";game.turn=randomInt(2);game.version++;
      await db().batch([
        db().prepare("UPDATE games SET player1=?,state=?,version=?,updated_at=? WHERE id=? AND version=? AND player1 IS NULL AND EXISTS(SELECT 1 FROM ord_connections WHERE id=? AND status='pending')").bind(p1,JSON.stringify(game),game.version,new Date().toISOString(),gameId,row.version,id),
        db().prepare("INSERT OR IGNORE INTO ord_seats(player_id,seat_hash) SELECT ?,player1 FROM games WHERE id=? AND player1=?").bind(connection.requester,gameId,p1),
        db().prepare("UPDATE ord_connections SET status='approved' WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM games WHERE id=? AND player1=?)").bind(id,gameId,p1),
      ]);
      const result=await db().prepare("SELECT status FROM ord_connections WHERE id=?").bind(id).first<{status:string}>();
      if(result?.status!=="approved")throw new GameError("Matchen ändrades. Uppdatera och försök igen.");
    }else throw new GameError("Välj hur enheten ska anslutas.");
    return json({done:true});
  }
  if(input.op==="link"){
    const id=z.string().uuid().parse(input.id),row=await rowFor(id),me=row?await authenticate(request,row):-1;
    if(!row || me<0)return json({error:"Du har inte tillgång till matchen."},403);
    const token=secret(),invite=me===0 && JSON.parse(row.state).status==="waiting"?secret():undefined;
    const seat=me===0?row.player0:row.player1!;
    const statements=[db().prepare("INSERT INTO ord_links(id,seat_hash,kind,game_id) VALUES (?,?,'play',?)").bind(await hash(token),seat,id)];
    if(invite)statements.push(db().prepare("INSERT INTO ord_links(id,seat_hash,kind,game_id) VALUES (?,?,'invite',?)").bind(await hash(invite),seat,id));
    await db().batch(statements);return json({token,invite});
  }
  throw new GameError("Okänd förfrågan.");
}
