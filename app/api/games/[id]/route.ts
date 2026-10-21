import { read, update, safely } from "@/lib/server";
export const dynamic = "force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){const {id}=await params;return safely(()=>read(request,id));}
export async function POST(request:Request,{params}:Context){const {id}=await params;return safely(()=>update(request,id));}
