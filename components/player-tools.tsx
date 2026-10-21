"use client";
import { useState } from "react";
import { Check, Link2, LoaderCircle } from "lucide-react";
import Modal from "./modal";
import Notifications from "./notifications";

export type SavedMatch={id:string;token:string;name:string;me?:number;invite?:string;opponent?:string;status?:"waiting"|"playing"|"finished";myTurn?:boolean};
export type Hub={matches:SavedMatch[];code:string|null;ownsCode?:boolean;signedIn:boolean;incoming:{id:string;name:string}[];outgoing:{id:string;status:string}|null};
export async function playerRequest<T>(data?:unknown):Promise<T>{
  const response=await fetch("/api/player",{method:data?"POST":"GET",headers:data?{"Content-Type":"application/json"}:{},body:data?JSON.stringify(data):undefined,cache:"no-store",signal:AbortSignal.timeout(18000)});
  const value=await response.json();if(!response.ok)throw new Error((value as {error?:string}).error || "Försök igen om en liten stund.");return value as T;
}
export default function PlayerTools({mode,hub,onClose,refresh}:{mode:"settings"|"connect";hub:Hub;onClose:()=>void;refresh:()=>Promise<void>}){
  const [code,setCode]=useState(""),[name,setName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[sent,setSent]=useState(false);
  async function submit(op:"code"|"connect"){
    if(busy)return;setBusy(true);setError("");
    try{await playerRequest({op,code,name});await refresh();setSent(op==="connect");}catch(e){setError(e instanceof Error?e.message:"Kontakten avbröts. Försök igen.");}finally{setBusy(false);}
  }
  async function logout(){
    setBusy(true);setError("");
    try{await playerRequest({op:"logout"});localStorage.removeItem("voltura-ord-matches-v1");location.assign("/signout-with-chatgpt?return_to=%2F");}catch{setError("Utloggningen kunde inte genomföras. Försök igen.");setBusy(false);}
  }
  const approved=sent && hub.outgoing?.status==="approved";
  return <Modal title={mode==="connect"?"Spela med kod":"Konto och enheter"} onClose={onClose}>
    <div className="player-tools">
      {mode==="connect"?<>{approved?<div className="connection-success"><Check size={32}/><h3>Nu är du ansluten!</h3><p>Din plats är sparad på den här enheten.</p><button className="primary-button" onClick={onClose}>Visa mina matcher</button></div>:sent && hub.outgoing?.status!=="rejected"?<div className="connection-success"><LoaderCircle className="spin" size={28}/><h3>Väntar på godkännande</h3><p>Be din medspelare trycka på <strong>Släpp in</strong> i sin app. Du behöver bara göra detta en gång.</p><button className="secondary-button" onClick={()=>setSent(false)}>Tillbaka</button></div>:<form onSubmit={e=>{e.preventDefault();void submit("connect");}}><p>Ange koden du har fått. Nästa gång finns matchen här automatiskt.</p><label htmlFor="connect-name">Ditt förnamn</label><input id="connect-name" autoComplete="given-name" maxLength={24} value={name} onChange={e=>setName(e.target.value)} required/><label htmlFor="connect-code">Spelkod</label><input id="connect-code" className="code-input" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="Till exempel 1234" required/>{hub.outgoing?.status==="rejected" && <p>Din medspelare avböjde. Kontrollera koden tillsammans.</p>}<button className="primary-button" disabled={busy || code.length<4 || !name.trim()}>{busy?<LoaderCircle className="spin" size={20}/>:<Link2 size={20}/>} Anslut</button></form>}</>:<>
        <p>Din plats sparas automatiskt. Bokmärk bara <strong>ord.voltura.se</strong>.</p>
        <Notifications settings/>
        <section><h3>Er fasta spelkod</h3>{hub.code?<><div className="fixed-code">{hub.code}</div><p>{hub.ownsCode?"Ge koden till din medspelare, eller ange den på din andra enhet. Du godkänner anslutningen här.":"Det här är koden ni anslöt med. Din medspelare godkänner om du behöver ansluta en ny telefon."} Koden ändras inte mellan matcherna.</p></>:<form onSubmit={e=>{e.preventDefault();void submit("code");}}><label htmlFor="choose-code">Välj 4–8 siffror som är lätta att minnas</label><input id="choose-code" className="code-input" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="Till exempel 1234" required/><button className="primary-button" disabled={busy || code.length<4}>{busy?<LoaderCircle className="spin" size={20}/>:null} Spara spelkoden</button></form>}</section>
        <details><summary>Inloggning (valfritt)</summary><p>Logga in med samma ChatGPT-konto på dina enheter för att se dina matcher där.</p>{hub.signedIn?<><p className="signed-in"><Check size={18}/> Du är inloggad</p><button className="secondary-button" disabled={busy} onClick={()=>void logout()}>Logga ut på denna enhet</button></>:<a className="secondary-button" href="/signin-with-chatgpt?return_to=%2F%3Faccount%3D1" target="_top">Logga in med ChatGPT</a>}</details>
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  </Modal>;
}
