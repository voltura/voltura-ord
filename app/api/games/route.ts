import { create, safely } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request:Request){return safely(()=>create(request));}
