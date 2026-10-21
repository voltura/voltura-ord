import { pushRead,pushUpdate } from "@/lib/push";
import { safely } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request){return safely(()=>pushRead(request));}
export async function POST(request:Request){return safely(()=>pushUpdate(request));}
