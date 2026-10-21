import { remember, resume, safely } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request:Request){return safely(()=>resume(request));}
export async function POST(request:Request){return safely(()=>remember(request));}
