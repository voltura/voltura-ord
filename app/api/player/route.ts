import { hubRead,hubUpdate } from "@/lib/player-hub";
import { safely } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request){return safely(()=>hubRead(request));}
export async function POST(request:Request){return safely(()=>hubUpdate(request));}
