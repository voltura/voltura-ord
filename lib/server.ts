import { env } from "cloudflare:workers";
import { z } from "zod";
import { applyAction, evaluate, GameError, newGame, publicView, randomInt, type Game } from "./game.ts";
import { DICTIONARY, isWord } from "./dictionary";
import { profileSeat, addSeat } from "./player-session";
import { queueWordNotification } from "./push";

export type Row = {id:string; version:number; state:string; player0:string; player1:string|null; invitation:string};
const tokenSchema=z.string().regex(/^[a-f0-9]{64}$/);
const nameSchema=z.string().trim().min(1).max(24).regex(/^[^\p{Cc}\p{Cf}<>]+$/u);
const idSchema=z.string().uuid();
const placementSchema=z.object({tileId:z.string().min(1).max(20),index:z.number().int().min(0).max(224),letter:z.string().max(2).optional()});
const actionSchema=z.object({
  id:idSchema,version:z.number().int().min(0),kind:z.enum(["play","exchange","pass"]),
  placements:z.array(placementSchema).max(8).optional(),tileIds:z.array(z.string().max(20)).max(8).optional(),
});
export function db() { if(!env.DB) throw new Error("Database unavailable"); return env.DB; }
export function json(data:unknown,status=200) {
  return Response.json(data,{status,headers:{"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
}
export async function hash(token:string) {
  const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return Array.from(new Uint8Array(data),v=>v.toString(16).padStart(2,"0")).join("");
}
export function sameOrigin(request:Request) {
  const site=request.headers.get("sec-fetch-site"),origin=request.headers.get("origin");
  if((site && site!=="same-origin" && site!=="none") || (origin && origin!==new URL(request.url).origin))
    throw new GameError("Öppna spelet och försök igen.");
}
export async function body(request:Request):Promise<Record<string,unknown>> {
  const reader=request.body?.getReader(); if(!reader) throw new GameError("Förfrågan saknar innehåll.");
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>16384) { await reader.cancel(); throw new GameError("Förfrågan är för stor."); } chunks.push(value); }
    // Finish the bounded stream before responding, including rejected requests.
    sameOrigin(request);
    if(!request.headers.get("content-type")?.includes("application/json")) throw new GameError("Felaktig förfrågan.");
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const data:unknown=JSON.parse(new TextDecoder().decode(bytes));
    if(!data || typeof data!=="object" || Array.isArray(data)) throw new GameError("Felaktig förfrågan.");
    return data as Record<string,unknown>;
  } catch(error) { if(error instanceof GameError)throw error; throw new GameError("Förfrågan kunde inte läsas."); }
}
export async function rowFor(id:string):Promise<Row|null> {
  idSchema.parse(id);
  return db().prepare("SELECT id,version,state,player0,player1,invitation FROM games WHERE id = ?").bind(id).first<Row>();
}
export async function authenticate(request:Request,row:Row):Promise<number> {
  const token=tokenSchema.safeParse(request.headers.get("authorization")?.replace(/^Bearer /,""));
  if(token.success){
    const digest=await hash(token.data);
    if(digest===row.player0)return 0;if(digest===row.player1)return 1;
    const link=await db().prepare("SELECT seat_hash FROM ord_links WHERE id=? AND kind='play'").bind(digest).first<{seat_hash:string}>();
    if(link?.seat_hash===row.player0)return 0;if(link?.seat_hash===row.player1)return 1;
    return -1;
  }
  return profileSeat(request,row);
}
export async function safely(fn:()=>Promise<Response>):Promise<Response> {
  try{return await fn();}catch(error){
    if(error instanceof GameError) return json({error:error.message,cells:error.cells},400);
    if(error instanceof z.ZodError) return json({error:"Kontrollera namnet och draget och försök igen."},400);
    console.error("Game request failed",error instanceof Error?error.name:"UnknownError");
    return json({error:"Spelet kunde inte nå servern. Försök igen om en liten stund."},503);
  }
}
export async function create(request:Request) {
  const input=z.object({id:idSchema,name:nameSchema,playerToken:tokenSchema,inviteToken:tokenSchema}).parse(await body(request));
  const p0=await hash(input.playerToken), invitation=await hash(input.inviteToken);
  if(p0===invitation) throw new GameError("Skapa en ny inbjudan och försök igen.");
  const game=newGame(input.id,input.name,DICTIONARY.version), now=new Date().toISOString();
  await db().prepare("INSERT OR IGNORE INTO games (id,version,state,player0,invitation,created_at,updated_at) VALUES (?,0,?,?,?,?,?)")
    .bind(game.id,JSON.stringify(game),p0,invitation,now,now).run();
  const row=await rowFor(game.id);
  if(!row || row.player0!==p0) return json({error:"Matchen kunde inte skapas. Försök igen."},409);
  await addSeat(request,p0);
  return json(publicView(JSON.parse(row.state),0),201);
}
export async function read(request:Request,id:string) {
  let row=await rowFor(id); if(!row)return json({error:"Matchen hittades inte. Kontrollera länken."},404);
  const me=await authenticate(request,row); if(me<0)return json({error:"Öppna din privata spelarlänk för att fortsätta."},403);
  if(new URL(request.url).searchParams.get("latest")==="1"){
    // Resolve old bookmarks in one database query, even after many rematches.
    const latest=await db().prepare("WITH RECURSIVE chain AS (SELECT id,version,state,player0,player1,invitation FROM games WHERE id=? UNION SELECT g.id,g.version,g.state,g.player0,g.player1,g.invitation FROM games g JOIN chain c ON g.id=json_extract(c.state,'$.rematchId')) SELECT * FROM chain WHERE json_extract(state,'$.rematchId') IS NULL LIMIT 1")
      .bind(id).first<Row>();
    if(!latest || await authenticate(request,latest)!==me)throw new Error("Latest match unavailable");
    row=latest;
  }
  return json(publicView(JSON.parse(row.state),me));
}
const resumeSchema=z.object({id:idSchema,token:tokenSchema,invite:tokenSchema.optional()});
const resumeCookie="voltura-ord-resume";
async function validInvite(token:string,row:Row){
  const digest=await hash(token);
  return digest===row.invitation || !!await db().prepare("SELECT id FROM ord_links WHERE id=? AND game_id=? AND kind='invite'").bind(digest,row.id).first();
}
// Cookies transfer to an iOS Home Screen app even when localStorage does not.
// This cookie only restores a capability; game actions still require Bearer auth.
export async function remember(request:Request) {
  const input=z.object({id:idSchema,invite:tokenSchema.optional()}).parse(await body(request));
  const row=await rowFor(input.id),me=row?await authenticate(request,row):-1;
  if(!row || me<0)return json({error:"Öppna din privata spelarlänk för att fortsätta."},403);
  await addSeat(request,me===0?row.player0:row.player1!);
  const supplied=tokenSchema.safeParse(request.headers.get("authorization")?.replace(/^Bearer /,""));
  if(!supplied.success)return json({saved:true});
  const token=supplied.data;
  const invite=me===0 && input.invite && await validInvite(input.invite,row)?input.invite:undefined;
  const response=json({saved:true});
  response.headers.set("Set-Cookie",`${resumeCookie}=${encodeURIComponent(JSON.stringify({id:row.id,token,invite}))}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${new URL(request.url).protocol==="https:"?"; Secure":""}`);
  return response;
}
export async function resume(request:Request) {
  sameOrigin(request);
  const value=request.headers.get("cookie")?.split(";").map(c=>c.trim()).find(c=>c.startsWith(`${resumeCookie}=`))?.slice(resumeCookie.length+1);
  if(!value || value.length>1024)return json({match:null});
  let parsed:ReturnType<typeof resumeSchema.safeParse>;
  try{parsed=resumeSchema.safeParse(JSON.parse(decodeURIComponent(value)));}catch{return json({match:null});}
  if(!parsed.success)return json({match:null});
  const {id,token,invite}=parsed.data,row=await rowFor(id);
  if(!row)return json({match:null});
  const proof=new Request(request.url,{headers:{Authorization:`Bearer ${token}`}}),me=await authenticate(proof,row);
  if(me===-1)return json({match:null});
  const game:Game=JSON.parse(row.state);
  return json({match:{id,token,name:game.players[me],opponent:game.players[1-me],
    ...(me===0 && invite && await validInvite(invite,row)?{invite}:{})}});
}
async function rematch(row:Row,game:Game,me:number) {
  if(game.status!=="finished" || !row.player1)throw new GameError("Spela färdigt matchen först.");
  if(!game.rematchId){
    const next=newGame(crypto.randomUUID(),game.players[0],DICTIONARY.version);
    next.players=[...game.players];next.status="playing";next.turn=randomInt(2);
    const parent={...game,rematchId:next.id,version:game.version+1},now=new Date().toISOString();
    // The child and parent link commit together. Concurrent presses create one match.
    await db().batch([
      db().prepare("INSERT INTO games (id,version,state,player0,player1,invitation,created_at,updated_at) SELECT ?,0,?,player0,player1,?,?,? FROM games WHERE id=? AND version=? AND json_extract(state,'$.rematchId') IS NULL")
        .bind(next.id,JSON.stringify(next),await hash(crypto.randomUUID()),now,now,row.id,row.version),
      db().prepare("UPDATE games SET state=?,version=?,updated_at=? WHERE id=? AND version=? AND json_extract(state,'$.rematchId') IS NULL")
        .bind(JSON.stringify(parent),parent.version,now,row.id,row.version),
    ]);
    const latest=await rowFor(row.id);
    game=JSON.parse(latest!.state);
  }
  const next=game.rematchId?await rowFor(game.rematchId):null;
  if(!next)throw new Error("Rematch unavailable");
  return json(publicView(JSON.parse(next.state),me));
}
export async function update(request:Request,id:string) {
  const input=await body(request), row=await rowFor(id);
  if(!row)return json({error:"Matchen hittades inte. Kontrollera länken."},404);
  if(input.op==="join") {
    const join=z.object({name:nameSchema,inviteToken:tokenSchema,playerToken:tokenSchema}).parse(input);
    const p1=await hash(join.playerToken);
    if(row.player1===p1){await addSeat(request,p1);return json(publicView(JSON.parse(row.state),1));}
    if(row.player1 || !await validInvite(join.inviteToken,row) || p1===row.player0) return json({error:"Inbjudan har redan använts eller är ogiltig. Använd din egen spelarlänk om du redan har anslutit."},409);
    const game:Game=JSON.parse(row.state);
    game.players[1]=join.name;game.status="playing";game.turn=randomInt(2);game.version++;
    const result=await db().prepare("UPDATE games SET player1=?,state=?,version=?,updated_at=? WHERE id=? AND version=? AND player1 IS NULL")
      .bind(p1,JSON.stringify(game),game.version,new Date().toISOString(),id,row.version).run();
    if(result.meta.changes!==1)return json({error:"Inbjudan användes just. Försök igen med din spelarlänk."},409);
    await addSeat(request,p1);
    return json(publicView(game,1));
  }
  const me=await authenticate(request,row); if(me<0)return json({error:"Öppna din privata spelarlänk för att fortsätta."},403);
  const game:Game=JSON.parse(row.state);
  if(input.op==="rematch")return rematch(row,game,me);
  if(input.op==="preview") {
    const preview=z.object({version:z.number().int(),placements:z.array(placementSchema).min(1).max(8)}).parse(input);
    if(game.status!=="playing" || game.turn!==me || preview.version!==game.version) return json({error:"Vänta på din tur eller uppdatera brädet."},409);
    const result=evaluate(game.board,game.racks[me],preview.placements,w=>isWord(w,game.dictionaryVersion));
    return json({words:result.words,score:result.score,bonus:result.bonus});
  }
  if(input.op!=="action")throw new GameError("Okänd förfrågan.");
  const action=actionSchema.parse(input.action);
  const next=applyAction(game,me,action,w=>isWord(w,game.dictionaryVersion));
  if(next===game){
    const move=game.history.at(-1);
    if(move?.id===action.id)queueWordNotification(game,move,me===0?row.player1:row.player0,me===0?row.player0:row.player1!);
    return json(publicView(game,me));
  }
  const result=await db().prepare("UPDATE games SET state=?,version=?,updated_at=? WHERE id=? AND version=?")
    .bind(JSON.stringify(next),next.version,new Date().toISOString(),id,row.version).run();
  if(result.meta.changes!==1) {
    const latest=await rowFor(id); const state:Game=JSON.parse(latest!.state);
    if(state.history.some(m=>m.id===action.id && m.player===me))return json(publicView(state,me));
    return json({error:"Brädet har uppdaterats. Ditt drag har inte spelats; hämta senaste läget."},409);
  }
  queueWordNotification(next,next.history.at(-1)!,me===0?row.player1:row.player0,me===0?row.player0:row.player1!);
  return json(publicView(next,me));
}
