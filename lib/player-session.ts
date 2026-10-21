import { db, hash, sameOrigin, type Row } from "./server";

export const DEVICE_COOKIE="voltura-ord-device";
export function cookieToken(request:Request){
  const value=request.headers.get("cookie")?.split(";").map(c=>c.trim()).find(c=>c.startsWith(`${DEVICE_COOKIE}=`))?.slice(DEVICE_COOKIE.length+1);
  return value && /^[a-f0-9]{64}$/.test(value)?value:null;
}
export function secret(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");}
export async function device(request:Request){
  const token=cookieToken(request);if(!token)return null;
  return db().prepare("SELECT id,player_id FROM ord_devices WHERE id=?").bind(await hash(token)).first<{id:string;player_id:string}>();
}
export async function profileSeat(request:Request,row:Row){
  sameOrigin(request);
  const d=await device(request);if(!d)return -1;
  const seat=await db().prepare("SELECT seat_hash FROM ord_seats WHERE player_id=? AND seat_hash IN (?,?) LIMIT 1").bind(d.player_id,row.player0,row.player1).first<{seat_hash:string}>();
  return seat?.seat_hash===row.player0?0:seat?.seat_hash===row.player1?1:-1;
}
export async function addSeat(request:Request,seat:string){
  const d=await device(request);if(d)await db().prepare("INSERT OR IGNORE INTO ord_seats(player_id,seat_hash) VALUES (?,?)").bind(d.player_id,seat).run();
}
