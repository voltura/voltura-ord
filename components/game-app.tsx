"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronRight, CircleHelp, Copy, Flag, History, Link2, LoaderCircle, Mail, RotateCcw, Share2, Shuffle, Sparkles, Trophy, Users, WifiOff, X } from "lucide-react";
import Board, { TileFace } from "./board";
import { reconcileDraft } from "@/lib/draft";
import Modal from "./modal";
import Notifications from "./notifications";
import PlayerTools,{playerRequest,type Hub,type SavedMatch} from "./player-tools";
import { ALPHABET, evaluate, POINTS, type Action, type BoardTile, type GameView, type Placement, type Tile, type Word } from "@/lib/game";

type Saved=SavedMatch;
type Preview={score:number;words:Word[];bonus:number;error?:string;cells?:number[];retryable?:boolean};
class RequestError extends Error {status:number;cells:number[];constructor(message:string,status=0,cells:number[]=[]){super(message);this.status=status;this.cells=cells;}}
const STORAGE="voltura-ord-matches-v1";
function token(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");}
function readSaved():Saved[]{try{return JSON.parse(localStorage.getItem(STORAGE)||"[]");}catch{return [];}}
function writeSaved(match:Saved){try{localStorage.setItem(STORAGE,JSON.stringify([match,...readSaved().filter(m=>m.id!==match.id)].slice(0,30)));}catch{/* Link still works without persistent storage. */}}
function localRead<T>(key:string):T|null{try{return JSON.parse(localStorage.getItem(key)||"null");}catch{return null;}}
function localWrite(key:string,value:unknown){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value));}catch{/* Storage may be disabled. */}}
function playerLink(match:Saved){return `${location.origin}/#game=${match.id}&play=${match.token}`;}
function inviteLink(match:Saved){return `${location.origin}/#game=${match.id}&invite=${match.invite}`;}
async function rememberMatch(match:Saved){
  writeSaved(match);
  await request("/api/resume",{id:match.id,invite:match.invite},match.token,AbortSignal.timeout(3500)).catch(()=>null);
}
async function request<T>(path:string,data?:unknown,credential?:string,signal?:AbortSignal):Promise<T>{
  let response:Response;
  try{response=await fetch(path,{method:data?"POST":"GET",headers:{...(data?{"Content-Type":"application/json"}:{}),...(credential?{Authorization:`Bearer ${credential}`}:{})},body:data?JSON.stringify(data):undefined,cache:"no-store",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(18000)]):AbortSignal.timeout(18000)});}
  catch{throw new RequestError("Anslutningen avbröts. Ditt drag finns kvar – försök igen.");}
  const result=await response.json().catch(()=>({error:"Servern kunde inte svara. Försök igen."}));
  if(!response.ok){const problem=result as {error?:string;cells?:number[]};throw new RequestError(problem.error || "Något gick fel. Försök igen.",response.status,problem.cells || []);}
  return result as T;
}
const DEMO:(BoardTile|null)[]=Array(225).fill(null);
for(const [word,start,step] of [["VÄNNER",108,1],["VÅR",108,15],["RAD",138,1],["DAG",140,15],["HEMMA",65,1],["MODE",67,15]] as const)
  [...word].forEach((letter,i)=>DEMO[start+i*step]={id:`demo-${start+i*step}`,letter,points:POINTS[letter]});
const DEMO_RACK:Tile[]=[..."SPELGLÄD"].map((letter,i)=>({id:`example-${i}`,letter,points:POINTS[letter]}));

export default function GameApp(){
  const [game,setGame]=useState<GameView|null>(null),[credentials,setCredentials]=useState<Saved|null>(null),[saved,setSaved]=useState<Saved[]>([]);
  const [joining,setJoining]=useState<{id:string;invite:string}|null>(null),[name,setName]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[ready,setReady]=useState(false);
  const [modal,setModal]=useState<"rules"|"links"|"pass"|"exchange"|"history"|null>(null),[toast,setToast]=useState(""),[error,setError]=useState(""),[offline,setOffline]=useState(false);
  const [draft,setDraft]=useState<Placement[]>([]),[selected,setSelected]=useState<string|null>(null),[order,setOrder]=useState<string[]>([]),[exchange,setExchange]=useState<string[]>([]);
  const [preview,setPreview]=useState<Preview|null>(null),[previewRetry,setPreviewRetry]=useState(0),[checking,setChecking]=useState(false),[joker,setJoker]=useState<{tileId:string;index:number}|null>(null),[float,setFloat]=useState<{tile:Tile;letter?:string;x:number;y:number}|null>(null);
  const [pending,setPending]=useState<Action|null>(null),[manualLink,setManualLink]=useState<string|null>(null),[copied,setCopied]=useState(false);
  const [sharing,setSharing]=useState(false),[shareError,setShareError]=useState<{kind:"invite"|"player";text:string}|null>(null);
  const [hub,setHub]=useState<Hub>({matches:[],incoming:[],outgoing:null,code:null,signedIn:false}),[toolsMode,setToolsMode]=useState<"settings"|"connect"|null>(null),[showCreate,setShowCreate]=useState(false),[hubReady,setHubReady]=useState(false);
  const initializing=useRef(false);
  const seenConnection=useRef<string|null>(null);
  const newMatch=useRef<{id:string;playerToken:string;inviteToken:string}|null>(null), joinToken=useRef<string|null>(null),dragging=useRef(false),cleanupDrag=useRef<(()=>void)|null>(null);
  const gameRef=useRef<GameView|null>(null), draftRestored=useRef<string|null>(null);
  const notice=useCallback((text:string)=>setToast(text),[]);
  const refreshHub=useCallback(async()=>{
    const next=await playerRequest<Hub>();setHub(next);
    const local=readSaved();setSaved(next.matches.map(m=>({...local.find(s=>s.id===m.id),...m,token:local.find(s=>s.id===m.id && s.me===m.me)?.token || m.token})));
  },[]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),6000);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>()=>cleanupDrag.current?.(),[]);
  useEffect(()=>{
    const incoming=hub.incoming[0]?.id;
    if(incoming && incoming!==seenConnection.current){
      seenConnection.current=incoming;
      if(toolsMode==="settings")setToolsMode(null);
      if(modal==="links")setModal(null);
      window.scrollTo({top:0,behavior:"instant"});
    }
  },[hub.incoming,toolsMode,modal]);
  const accept=useCallback((next:GameView)=>{
    if(gameRef.current?.id===next.id && gameRef.current.version>next.version)return;
    if(gameRef.current?.id===next.id && gameRef.current.version===next.version){setOffline(false);return;}
    const old=gameRef.current;
    gameRef.current=next;setGame(next);setOffline(false);
    if(draftRestored.current!==next.id){
      setSelected(null);setPreview(null);setExchange([]);setOrder([]);
      const stored=localRead<{version:number;placements:Placement[]}>(`ord-draft-${next.id}`);
      setDraft(stored && Array.isArray(stored.placements)?reconcileDraft(stored.placements,next):[]);
      setPending(localRead<Action>(`ord-pending-${next.id}`));draftRestored.current=next.id;
    }else if(old && old.version!==next.version){
      cleanupDrag.current?.();setJoker(null);
      setDraft(current=>reconcileDraft(current,next));setSelected(null);setPreview(null);setError("");
      if(next.status==="playing" && next.turn===next.me)notice("Din tur. Hitta nästa ord!");
    }
    const storedPending=localRead<Action>(`ord-pending-${next.id}`);
    if(storedPending && next.history.some(h=>h.id===storedPending.id && h.player===next.me)){
      setPending(null);localWrite(`ord-pending-${next.id}`,null);setDraft([]);setError("");
    } else if(storedPending && next.version!==storedPending.version){
      setPending(null);localWrite(`ord-pending-${next.id}`,null);
    }
  },[notice]);
  const openMatch=useCallback(async(match:Saved)=>{
    setLoading(true);setError("");setJoining(null);
    try{if(!match.token)match={...match,...await playerRequest<{token:string;invite?:string}>({op:"link",id:match.id})};
      const next=await request<GameView>(`/api/games/${match.id}?latest=1`,undefined,match.token);
      const updated={...match,id:next.id,invite:next.id===match.id?match.invite:undefined,me:next.me,name:next.players[next.me],opponent:next.players[1-next.me]};
      setCredentials(updated);writeSaved(updated);setSaved(readSaved());accept(next);
      history.replaceState(null,"",`/#game=${next.id}`);
      await rememberMatch(updated);
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  },[accept]);
  useEffect(()=>{
    if(initializing.current)return;initializing.current=true;setSaved(readSaved());setLoading(true);
    void (async()=>{
      let remote:Saved[]=[];
      try{
        await playerRequest({op:"init",linkAccount:new URLSearchParams(location.search).get("account")==="1"});
        const restored=await request<{match:Saved|null}>("/api/resume");if(restored.match)writeSaved(restored.match);
        await playerRequest({op:"import",matches:readSaved().filter(m=>!!m.token).map(({id,token})=>({id,token}))});
        const result=await playerRequest<Hub>();setHub(result);remote=result.matches;
        const local=readSaved();setSaved(remote.map(m=>({...local.find(s=>s.id===m.id),...m,token:local.find(s=>s.id===m.id && s.me===m.me)?.token || m.token})));setHubReady(true);
      }catch{setError("Dina sparade matcher finns kvar. Anslut till internet och ladda om för att synka.");}
      setReady(true);setLoading(false);
      const p=new URLSearchParams(location.hash.slice(1)),id=p.get("game"),play=p.get("play"),invite=p.get("invite");
      if(id && /^[0-9a-f-]{36}$/i.test(id)){
        const existing=remote.find(m=>m.id===id) || readSaved().find(m=>m.id===id);
        if(play && /^[a-f0-9]{64}$/.test(play))await openMatch({...existing,id,token:play,name:existing?.name || ""});
        else if(existing)await openMatch(existing);
        else if(invite && /^[a-f0-9]{64}$/.test(invite)){setJoining({id,invite});joinToken.current=localRead<string>(`ord-join-${id}`) || token();localWrite(`ord-join-${id}`,joinToken.current);}
        else{setToolsMode("connect");setError("Anslut med er spelkod så hittar du din match här.");}
      }else history.replaceState(null,"","/");
    })();
  },[openMatch]);
  useEffect(()=>{
    if(!hubReady)return;let stopped=false,fetching=false;
    const refresh=async()=>{if(stopped || fetching || document.hidden)return;fetching=true;try{await refreshHub();}catch{/* Keep the saved list during a network interruption. */}finally{fetching=false;}};
    const timer=setInterval(()=>void refresh(),3000);window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{stopped=true;clearInterval(timer);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[hubReady,refreshHub]);
  async function approveConnection(id:string,kind:"device"|"opponent"|"partner"|"reject",gameId?:string){
    if(busy)return;setBusy(true);setError("");
    try{await playerRequest({op:kind==="reject"?"reject":"approve",id,kind,gameId});await refreshHub();notice(kind==="reject"?"Anslutningen avböjdes.":"Klart! Enheten är ansluten.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  useEffect(()=>{
    if(!credentials)return;let stopped=false,fetching=false;
    const refresh=async()=>{if(stopped || fetching || document.hidden)return;fetching=true;try{const next=await request<GameView>(`/api/games/${credentials.id}`,undefined,credentials.token);if(!stopped && gameRef.current?.id===credentials.id)accept(next);}catch{if(!stopped)setOffline(true);}finally{fetching=false;}};
    const timer=setInterval(()=>void refresh(),3000);document.addEventListener("visibilitychange",refresh);window.addEventListener("online",refresh);window.addEventListener("focus",refresh);
    return()=>{stopped=true;clearInterval(timer);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);};
  },[credentials,accept]);
  useEffect(()=>{if(game && draftRestored.current===game.id)localWrite(`ord-draft-${game.id}`,{version:game.version,placements:draft});},[draft,game]);
  const myTurn=!!game && game.status==="playing" && game.turn===game.me;
  const canEdit=game?.status==="playing" && !busy && !pending;
  const localPreview=useMemo(()=>{
    if(!game || !draft.length)return null;
    try{return evaluate(game.board,game.rack,draft);}catch(e){return {error:(e as Error).message};}
  },[game,draft]);
  useEffect(()=>{
    setPreview(null);setChecking(false);
    if(!game || !credentials || !draft.length || !myTurn || !localPreview || "error" in localPreview)return;
    let cancelled=false;const abort=new AbortController();
    setChecking(true);const timer=setTimeout(async()=>{
      try{const result=await request<Preview>(`/api/games/${game.id}`,{op:"preview",version:game.version,placements:draft},credentials.token,abort.signal);if(!cancelled)setPreview(result);}
      catch(e){if(!cancelled){const err=e as RequestError;setPreview({score:0,words:[],bonus:0,error:err.status===0?"Ordlistan kunde inte nås. Försök igen.":err.message,cells:err.cells,retryable:err.status===0 || err.status>=500});}}
      finally{if(!cancelled)setChecking(false);}
    },350);
    return()=>{cancelled=true;clearTimeout(timer);abort.abort();};
  },[game,credentials,draft,myTurn,localPreview,previewRetry]);
  async function start(){
    if(!name.trim() || busy)return;setBusy(true);setError("");
    try{
      let next:GameView,match:Saved;
      if(joining){
        const t=joinToken.current || token();joinToken.current=t;localWrite(`ord-join-${joining.id}`,t);
        next=await request<GameView>(`/api/games/${joining.id}`,{op:"join",name:name.trim(),inviteToken:joining.invite,playerToken:t});
        match={id:joining.id,token:t,name:name.trim(),opponent:next.players[0]};
      }else{
        newMatch.current ||= localRead<typeof newMatch.current>("ord-creating") || {id:crypto.randomUUID(),playerToken:token(),inviteToken:token()};
        localWrite("ord-creating",newMatch.current);
        next=await request<GameView>("/api/games",{...newMatch.current,name:name.trim()});
        match={id:next.id,token:newMatch.current.playerToken,invite:newMatch.current.inviteToken,name:name.trim()};
        newMatch.current=null;localWrite("ord-creating",null);
      }
      match={...match,me:next.me};writeSaved(match);setSaved(readSaved());setCredentials(match);setJoining(null);accept(next);setName("");history.replaceState(null,"",`/#game=${next.id}`);
      await rememberMatch(match);
      if(next.status==="waiting")setModal("links");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function playAgain(){
    if(!game || !credentials || busy || loading || game.status!=="finished")return;
    setBusy(true);setError("");
    try{
      const next=await request<GameView>(`/api/games/${game.id}`,{op:"rematch"},credentials.token);
      await openMatch({...credentials,id:next.id,invite:undefined});
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function home(){setGame(null);gameRef.current=null;setCredentials(null);setJoining(null);setDraft([]);setPending(null);setError("");setOffline(false);draftRestored.current=null;setShowCreate(false);void refreshHub().catch(()=>null);history.replaceState(null,"","/");}
  function put(id:string,index:number,letter?:string){
    if(!canEdit || !game || game.board[index])return;
    const tile=game.rack.find(t=>t.id===id);if(!tile)return;
    const existing=draft.find(p=>p.tileId===id);
    if(!tile.letter && !letter && !existing?.letter){setJoker({tileId:id,index});return;}
    setDraft(current=>[...current.filter(p=>p.tileId!==id && p.index!==index),{tileId:id,index,...(!tile.letter?{letter:letter || existing?.letter}:{})}]);
    setSelected(null);setError("");setPreview(null);
  }
  function onCell(index:number){
    if(!canEdit)return;const current=draft.find(p=>p.index===index);
    if(selected){if(current?.tileId===selected){setDraft(d=>d.filter(p=>p.index!==index));setSelected(null);}else put(selected,index);}
    else if(current)setSelected(current.tileId);
    else notice("Välj en bricka i stället och tryck på en ruta.");
  }
  function beginDrag(e:PointerEvent,id:string){
    if(!canEdit || !game || e.button!==0)return;
    const tile=game.rack.find(t=>t.id===id);if(!tile)return;
    const x=e.clientX,y=e.clientY;let moved=false,cancelled=false;
    const move=(event:globalThis.PointerEvent)=>{if(event.pointerId!==e.pointerId)return;if(Math.hypot(event.clientX-x,event.clientY-y)>7)moved=true;if(moved){event.preventDefault();dragging.current=true;setFloat({tile,letter:draft.find(p=>p.tileId===id)?.letter,x:event.clientX,y:event.clientY});}};
    const second=(event:globalThis.PointerEvent)=>{if(event.pointerId!==e.pointerId){cancelled=true;finish();}};
    const up=(event:globalThis.PointerEvent)=>{if(event.pointerId!==e.pointerId)return;if(moved && !cancelled){const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("[data-cell]");if(target)put(id,Number(target.dataset.cell));else if(document.elementFromPoint(event.clientX,event.clientY)?.closest(".rack"))setDraft(d=>d.filter(p=>p.tileId!==id));}finish();};
    const finish=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",finish);window.removeEventListener("pointerdown",second);setFloat(null);setTimeout(()=>{dragging.current=false;},0);};
    cleanupDrag.current?.();cleanupDrag.current=finish;
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",up);window.addEventListener("pointercancel",finish);window.addEventListener("pointerdown",second);
  }
  async function play(kind:Action["kind"]){
    if(!game || !credentials || busy || !myTurn)return;setBusy(true);setError("");setModal(null);
    const action=pending || {id:crypto.randomUUID(),version:game.version,kind,placements:kind==="play"?draft:undefined,tileIds:kind==="exchange"?exchange:undefined};
    setPending(action);localWrite(`ord-pending-${game.id}`,action);
    try{
      const next=await request<GameView>(`/api/games/${game.id}`,{op:"action",action},credentials.token);
      accept(next);setDraft([]);setSelected(null);setPending(null);setExchange([]);setPreview(null);localWrite(`ord-pending-${game.id}`,null);
      const move=next.history.find(m=>m.id===action.id);
      notice(action.kind==="play"?`${move?.words.map(w=>w.text).join(" + ")} · +${move?.score} poäng${move?.bonus?" · Alla åtta!":""}`:action.kind==="exchange"?"Brickorna är bytta. Turen går vidare.":"Du står över. Turen går vidare.");
    }catch(e){const err=e as RequestError;setError(err.message);if(err.status>=400 && err.status<500){setPending(null);localWrite(`ord-pending-${game.id}`,null);if(err.status===409){const next=await request<GameView>(`/api/games/${game.id}`,undefined,credentials.token).catch(()=>null);if(next)accept(next);}}else setOffline(true);}
    finally{setBusy(false);}
  }
  async function copy(value:string){try{await navigator.clipboard.writeText(value);setCopied(true);notice("Länken är kopierad.");}catch{setManualLink(value);}}
  const canInvite=game?.status==="waiting" && !!credentials?.invite;
  async function shareLink(kind:"invite"|"player"){
    if(!credentials || sharing || (kind==="invite" && !canInvite))return;
    setShareError(null);setCopied(false);
    const data=kind==="invite"
      ?{title:"Spela Voltura Ord med mig",text:"Vill du spela ett ordspel med mig? Öppna länken och ta plats!",url:inviteLink(credentials)}
      :{title:"Min match i Voltura Ord",text:"Min privata spelarlänk. Öppna den för att fortsätta samma match.",url:playerLink(credentials)};
    if(typeof navigator.share!=="function"){setModal("links");return;}
    setSharing(true);
    try{
      // Same native-first flow as Voltura Music; preserve the click's activation.
      if(navigator.canShare && !navigator.canShare(data)){setModal("links");return;}
      await navigator.share(data);
    }catch(error){
      if(!(error instanceof Error && error.name==="AbortError")){
        setShareError({kind,text:kind==="invite"
          ?"Delningsmenyn kunde inte öppnas. Kopiera inbjudan och klistra in den i ett sms."
          :"Delningsmenyn kunde inte öppnas. Kopiera spelarlänken eller mejla den till dig själv."});
        setModal("links");
      }
    }finally{setSharing(false);}
  }
  const playerEmail=credentials?`mailto:?subject=${encodeURIComponent("Min match i Voltura Ord")}&body=${encodeURIComponent(`Min privata spelarlänk. Öppna den för att fortsätta samma match.\n\n${playerLink(credentials)}`)}`:"";
  const rack=game?game.rack.filter(t=>!draft.some(p=>p.tileId===t.id)).sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);}):[];
  const last=game?.history.at(-1),previewError=preview?.error || (localPreview && "error" in localPreview?localPreview.error:"");
  const winner=game?.status==="finished"?(game.scores[0]===game.scores[1]?"Oavgjort!":`${game.players[game.scores[0]>game.scores[1]?0:1]} vann!`):"";
  function historyList(){return <div className="move-list">{game?.history.length?[...game.history].reverse().map((move,i)=><div className="move-item" key={move.id}><span className={`move-avatar player-${move.player}`}>{game.players[move.player].slice(0,1).toUpperCase()}</span><div><strong>{move.kind==="play"?move.words.map(w=>w.text).join(" · "):move.kind==="exchange"?"Bytte brickor":"Stod över"}</strong><small>{game.players[move.player]} <span>· drag {game.history.length-i}</span>{move.bonus>0?" · Alla åtta!":""}</small></div><b className={move.score?"move-score":"muted"}>{move.score?`+${move.score}`:"–"}</b></div>):<div className="empty-history"><Sparkles size={23}/><p>En tom spelplan.<br/>Alla möjligheter.</p></div>}</div>;}
  return <div className={`app-shell ${game?"has-game":""}`}>
    <header className="site-header"><button className="wordmark" disabled={busy || loading} onClick={home} aria-label={game?"Mina matcher":"Voltura Ord, startsida"}>{game?<><ArrowLeft size={18}/><span>Mina matcher</span></>:<><span className="brand-icon">V<span>2</span></span><span>voltura<span className="brand-ord">ord</span></span></>}</button><nav>{!game && <button className="quiet-button" aria-label="Konto och enheter" onClick={()=>setToolsMode("settings")}><Users size={18}/><span>Konto</span></button>}<span className="header-caption">ETT ORD. EN STUND TILLSAMMANS.</span><button className="quiet-button" aria-label="Så spelar ni" onClick={()=>setModal("rules")}><CircleHelp size={18}/><span>Så spelar ni</span></button>{game && <button className="quiet-button" onClick={()=>setModal("links")} aria-label="Spelarlänk och inbjudan"><Link2 size={18}/><span>Länkar</span></button>}{game && <button className="quiet-button mobile-history-header" aria-label="Matchens drag" onClick={()=>setModal("history")}><History size={18}/></button>}</nav></header>
    {!!hub.incoming.length && <section className="connection-requests" aria-label="Godkänn anslutning">{hub.incoming.map(connection=><div className="connection-request" key={connection.id}><h2>{connection.name} vill ansluta</h2><p>Godkänn bara om ni kom överens om detta.</p>{hub.matches.filter(m=>m.status==="waiting").map(match=><button className="primary-button" key={match.id} disabled={busy} onClick={()=>void approveConnection(connection.id,"opponent",match.id)}>Släpp in i {match.name}s match</button>)}<details><summary>Anslut en ny telefon</summary><p>Detta ger enheten tillgång till alla dina matcher och dina brickor.</p><button className="secondary-button" disabled={busy} onClick={()=>void approveConnection(connection.id,"device")}>Ja, det är min enhet</button>{hub.matches.filter(m=>m.opponent).map(match=><button className="secondary-button" key={match.id} disabled={busy} onClick={()=>void approveConnection(connection.id,"partner",match.id)}>Anslut som {match.opponent} i vår match</button>)}</details>{!hub.matches.some(m=>m.status==="waiting") && <p>Skapa en ny match om du vill bjuda in en medspelare.</p>}<button className="quiet-button" disabled={busy} onClick={()=>void approveConnection(connection.id,"reject")}>Avböj</button></div>)}</section>}
    {!game?<main className={`welcome ${saved.length && !joining?"returning-player":""}`}>
      <section className="welcome-copy"><span className="eyebrow"><span className="tiny-dot"/> SVENSKT ORDSPEL FÖR TVÅ</span><h1>{joining?<>En plats<br/>väntar på <em>dig.</em></>:saved.length?<>Välkommen{saved[0].name.trim()?",":""}<br/><em>{saved[0].name.trim() || "tillbaka"}.</em></>:<>Bara ett<br/><em>ord till.</em></>}</h1><p className="hero-description">{joining?"Du är inbjuden. Slå dig ner, hitta dina ord och låt spelet börja.":saved.length?(saved.length===1?"Vill du fortsätta matchen?":"Vilken match vill du fortsätta?"):"Små brickor. Stora möjligheter. Bjud in någon du tycker om och gör plats för en stund tillsammans."}</p>
        {hubReady && !!saved.length && !joining && <Notifications/>}
        {!!saved.length && !joining && <section className="match-hub" aria-label="Mina matcher"><h2>Mina matcher</h2>{saved.map((match,i)=><button className={`match-card ${i===0?"main-match":""}`} key={match.id} onClick={()=>void openMatch(match)} disabled={loading || busy}><span className="match-people">{match.name}{match.opponent?` & ${match.opponent}`:"s match"}</span><span className="match-state">{match.status==="waiting"?"Väntar på din medspelare":match.status==="finished"?"Matchen är klar":match.myTurn?"Din tur":match.status==="playing"?`${match.opponent}s tur`:"Din plats är sparad"}</span><span className="match-continue">{loading?<LoaderCircle className="spin" size={21}/>:<>{match.status==="finished"?"Visa matchen":"Fortsätt spela"}<ArrowRight size={22}/></>}</span></button>)}</section>}
        {!joining && <div className="home-options"><button className="secondary-button" disabled={!hubReady} onClick={()=>setToolsMode("connect")}><Link2 size={19}/> Spela med kod</button>{!!saved.length && <button className="quiet-button" onClick={()=>setShowCreate(!showCreate)}>{showCreate?"Stäng":"Ny match"}</button>}</div>}
        {(joining || !saved.length || showCreate) && <form className="start-form" onSubmit={e=>{e.preventDefault();void start();}}><label htmlFor="player-name">Vad heter du?</label><div className="name-input-wrap"><Users size={19}/><input id="player-name" name="name" autoComplete="given-name" placeholder="Ditt förnamn" maxLength={24} value={name} onChange={e=>setName(e.target.value)} required disabled={busy || loading}/></div><button className="primary-button start-button" disabled={!name.trim() || busy || loading || !ready}>{busy || loading?<LoaderCircle className="spin" size={20}/>:<>{joining?"Ta plats i matchen":"Skapa en match"}<ArrowRight size={20}/></>}</button></form>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {!saved.length && <div className="welcome-benefits"><span><Check size={14}/> Inget konto behövs</span><span><Check size={14}/> Ingen tidspress</span></div>}
      </section>
      <section className="welcome-art" aria-label="Så ser spelet ut"><div className="art-caption"><span className="little-line"/> GOTT SÄLLSKAP BÖRJAR MED ETT ORD</div><Board board={DEMO} rack={[]} placements={[]} selected={null} last={[]} errors={[]} interactive={false} onCell={()=>{}} onDropTile={()=>{}} onTilePointer={()=>{}} demo/><div className="example-rack" aria-hidden="true">{DEMO_RACK.map(t=><div className="rack-tile" key={t.id}><TileFace tile={t}/></div>)}</div><div className="art-footnote"><span>8 brickor i handen.</span><span>Vad hittar du på?</span><Sparkles size={17}/></div></section>
    </main>:<main className="game-layout">
      <section className="game-main">
        {offline && <div className="connection-warning" role="status"><WifiOff size={16}/> Anslutningen avbröts. Matchen är sparad.</div>}
        <div className="mobile-scores">{game.players.map((player,i)=><div key={i} className={game.status==="playing" && game.turn===i?"active":""}><span className={`mini-avatar player-${i}`}>{player?player[0].toUpperCase():"?"}</span><span>{player || "Väntar…"}{i===game.me?" (du)":""}</span><b>{game.scores[i]}</b></div>)}</div>
        <Board remaining={game.remaining} board={game.board} rack={game.rack} placements={draft} selected={selected} last={last?.kind==="play"?last.cells:[]} errors={preview?.cells || []} interactive={canEdit} onCell={onCell} onDropTile={put} onTilePointer={beginDrag}/>
        <section className="rack-panel" aria-label="Dina bokstäver"><div className="rack-topline"><span className={`turn-indicator ${myTurn?"is-your-turn":""}`}><i/>{game.status==="waiting"?"Väntar på din medspelare":game.status==="finished"?winner:myTurn?"Din tur":`${game.players[game.turn]}s tur`}</span><div><button className="icon-button" title="Blanda brickorna" aria-label="Blanda brickorna" disabled={busy || !!pending} onClick={()=>{setOrder(game.rack.map(t=>({id:t.id,r:Math.random()})).sort((a,b)=>a.r-b.r).map(t=>t.id));}}><Shuffle size={17}/></button><button className="icon-button" title="Ta tillbaka alla brickor" aria-label="Ta tillbaka alla brickor" disabled={!draft.length || !canEdit} onClick={()=>{setDraft([]);setSelected(null);setError("");}}><RotateCcw size={17}/></button></div></div>
          <div className={`rack ${!canEdit?"rack-waiting":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();setDraft(d=>d.filter(p=>p.tileId!==e.dataTransfer.getData("text/plain")));}}>{rack.map(t=><button key={t.id} className={`rack-tile ${selected===t.id?"selected":""}`} aria-label={`${t.letter || "Joker"}, ${t.points} poäng`} aria-pressed={selected===t.id} disabled={!canEdit} onClick={()=>{if(!dragging.current)setSelected(selected===t.id?null:t.id);}} onPointerDown={e=>beginDrag(e,t.id)}><TileFace tile={t}/></button>)}{Array.from({length:8-rack.length},(_,i)=><span key={`slot-${i}`} className="rack-slot"/>)}</div>
          <div className="draft-info" aria-live="polite">{draft.length && !myTurn?"Förberett drag. Du kan spela när det blir din tur.":draft.length?(checking?<><LoaderCircle className="spin" size={14}/> Kontrollerar orden…</>:previewError?<span className="draft-error">{previewError}{preview?.retryable && <button className="retry-preview" onClick={()=>setPreviewRetry(n=>n+1)}>Kontrollera igen</button>}</span>:preview?<><Check size={16}/><strong>{preview.words.map(w=>w.text).join(" + ")}</strong><span className="preview-points">+{preview.score} poäng{preview.bonus?" · Alla åtta!":""}</span></>:"Kontrollerar draget…"):game.status==="finished"?"Tack för en fin stund tillsammans.":myTurn?"Välj en bricka och en ruta, eller dra brickan till brädet.":game.status==="waiting"?"Bjud in via sms så kan ni börja.":"Förbered ditt nästa drag medan du väntar."}</div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className={`game-actions ${canInvite || game.status==="finished"?"invite-actions":""}`}>{game.status==="finished"?<button className="primary-button invite-button" disabled={busy || loading} onClick={()=>void playAgain()}>{busy || loading?<LoaderCircle className="spin" size={18}/>:<RotateCcw size={18}/>} {game.rematchId?"Öppna nästa match":"Spela igen"}</button>:canInvite?<button className="primary-button invite-button" disabled={sharing} onClick={()=>void shareLink("invite")}>{sharing?<LoaderCircle className="spin" size={18}/>:<Share2 size={18}/>} Bjud in</button>:<><button className="secondary-button" disabled={!myTurn || !canEdit || !game.remaining} onClick={()=>{setExchange([]);setModal("exchange");}}><Shuffle size={16}/><span>Byt brickor</span></button><button className="secondary-button" disabled={!myTurn || !canEdit} onClick={()=>setModal("pass")}><Flag size={16}/><span>Stå över</span></button><button className="primary-button" disabled={!myTurn || busy || (!pending && (!draft.length || checking || !preview || !!preview.error))} onClick={()=>void play(pending?.kind || "play")}>{busy?<LoaderCircle className="spin" size={18}/>:pending?<>Försök igen<RotateCcw size={16}/></>:<>Spela ord{preview && !preview.error?<span className="button-score">+{preview.score}</span>:<ArrowRight size={17}/>}</>}</button></>}</div>
        </section>
      </section>
      <aside className="game-sidebar"><div className="scoreboard"><span className="eyebrow">VID SPELBORDET</span>{game.players.map((player,i)=><div key={i} className={`player-card ${game.status==="playing" && game.turn===i?"current-player":""}`}><span className={`player-avatar player-${i}`}>{player?player[0].toUpperCase():<Users size={23}/>}</span><div><strong>{player || "Din medspelare"}{i===game.me && <small>DU</small>}</strong><span>{!player?"En plats väntar":game.status==="finished"?"Matchen är avslutad":game.status==="playing" && game.turn===i?"Funderar på nästa ord":`${game.rackCounts[i]} brickor i stället`}</span></div><b>{game.scores[i]}</b></div>)}<div className="scoreboard-footer"><span className="tiny-dot"/> {game.status==="finished"?"Färdigspelat":game.status==="waiting"?"Snart är ni igång":"Ingen brådska. Spela i er takt."}</div></div>
        {game.status==="waiting" && <div className="invite-card"><div className="invite-icon"><Link2 size={24}/></div><h2>Det blir roligare med två.</h2><p>Bjud in någon via sms eller där ni brukar höras.</p><button className="primary-button" disabled={!canInvite || sharing} onClick={()=>void shareLink("invite")}><Share2 size={16}/> Bjud in</button></div>}
        {game.status==="finished" && <div className="finish-card"><Trophy size={36}/><h2>{winner}</h2><p>{game.finishReason==="empty"?"Alla brickor är spelade.":"Sex turer utan nya ord."}</p><div className="final-adjustments">{game.players.map((p,i)=><span key={i}>{p}: {game.adjustments?.[i] || 0} i sluträkning</span>)}</div><p className="rematch-note">En match till? Tryck {game.rematchId?"Öppna nästa match":"Spela igen"} under dina brickor.</p></div>}
        <section className="history-panel"><div className="section-heading"><h2><History size={17}/> Matchens ord</h2><span>{game.history.length} drag</span></div>{historyList()}</section>
        <div className="sidebar-note"><span className="note-star">✳</span><p>Åtta brickor, ett riktigt bra ord.<br/><strong>Alla åtta ger 50 bonuspoäng.</strong></p></div>
      </aside>
      {game.status==="finished" && <div className="mobile-finish"><Trophy size={25}/><h2>{winner}</h2><p>{game.finishReason==="empty"?"Alla brickor är spelade.":"Sex turer utan nya ord."}</p><p>{game.players.map((p,i)=>`${p}: ${game.adjustments?.[i] || 0} i sluträkning`).join(" · ")}</p><p className="rematch-note">En match till? Tryck {game.rematchId?"Öppna nästa match":"Spela igen"} under dina brickor.</p></div>}<button className="mobile-history-button quiet-button" onClick={()=>setModal("history")}><History size={17}/> Visa matchens drag</button>
    </main>}
    {toolsMode && <PlayerTools mode={toolsMode} hub={hub} onClose={()=>setToolsMode(null)} refresh={refreshHub}/>}
    <footer className="site-footer"><span>VOLTURA ORD</span><span>Lite ordlek. Mycket sällskap.</span><button onClick={()=>setModal("rules")}>Regler & ordlista</button></footer>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}<button aria-label="Stäng meddelande" onClick={()=>setToast("")}><X size={15}/></button></div>}
    {float && <div className="drag-tile rack-tile" style={{left:float.x,top:float.y}}><TileFace tile={float.tile} letter={float.letter}/></div>}
    {joker && <Modal title="Vilken bokstav blir jokern?" onClose={()=>setJoker(null)}><p>Jokern ger 0 poäng. Bokstaven ligger fast när draget spelats.</p><div className="joker-grid">{[...ALPHABET].map(letter=><button key={letter} className="rack-tile" onClick={()=>{put(joker.tileId,joker.index,letter);setJoker(null);}}>{letter}</button>)}</div></Modal>}
    {modal==="links" && credentials && <Modal title={game?.status==="waiting"?"Bjud in till spelbordet":"Dina spellänkar"} onClose={()=>{setModal(null);setCopied(false);}}>{copied && <p className="copy-success" role="status">Länken är kopierad.</p>}<p>{game?.status==="waiting"?"Tryck Bjud in och välj Meddelanden i mobilens delningsmeny. Du kan också kopiera länken och klistra in den i ett sms.":"Öppna din sparade spelarlänk för att återvända till matchen, även på en annan enhet."}</p>{game?.status==="waiting" && credentials.invite && <div className="link-block"><button className="secondary-button" onClick={()=>{setModal(null);setToolsMode("settings");}}>Bjud in med fast spelkod</button><strong>Inbjudan till din medspelare</strong><p>Kan användas av en person.</p><div className="invite-link-actions"><button className="primary-button" disabled={sharing} onClick={()=>void shareLink("invite")}>{sharing?<LoaderCircle className="spin" size={17}/>:<Share2 size={17}/>} Bjud in</button><button className="secondary-button" onClick={()=>void copy(inviteLink(credentials))}><Copy size={17}/> Kopiera inbjudan</button></div>{shareError?.kind==="invite" && <p className="share-error" role="status">{shareError.text}</p>}</div>}<div className="link-block personal-link"><strong>Fortsätt samma match en annan dag</strong><p>Öppna ord.voltura.se och tryck Fortsätt spela. Du kan också spara en privat reservlänk här.</p><button className="primary-button save-player-link" disabled={sharing} onClick={()=>void shareLink("player")}>{sharing?<LoaderCircle className="spin" size={17}/>:<Bookmark size={17}/>} Spara min spelarlänk</button><div className="player-link-alternatives"><button className="secondary-button" onClick={()=>void copy(playerLink(credentials))}><Copy size={16}/> Kopiera min spelarlänk</button><a className="secondary-button" href={playerEmail}><Mail size={16}/> Mejla till mig själv</a></div><p className="private-link-note">Länken är privat och ger tillgång till dina brickor. Behåll den för dig själv.</p>{shareError?.kind==="player" && <p className="share-error" role="status">{shareError.text}</p>}</div></Modal>}
    {manualLink && <Modal title="Kopiera länken" onClose={()=>setManualLink(null)}><p>Markera och kopiera länken nedan.</p><input className="copy-input" value={manualLink} readOnly onFocus={e=>e.target.select()} autoFocus/></Modal>}
    {modal==="pass" && <Modal title="Vill du stå över?" onClose={()=>setModal(null)}><p>Turen går till din medspelare. Dina brickor blir kvar i stället.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Fortsätt fundera</button><button className="primary-button" onClick={()=>void play("pass")}>Stå över<ArrowRight size={17}/></button></div></Modal>}
    {modal==="exchange" && game && <Modal title="Nya bokstäver, nya möjligheter." onClose={()=>setModal(null)}><p>Välj brickorna du vill byta. Bytet tar din tur. Det finns {game.remaining} brickor kvar i påsen.</p><div className="exchange-rack">{game.rack.map(t=><button key={t.id} aria-pressed={exchange.includes(t.id)} aria-label={`Byt ${t.letter || "joker"}`} className={`rack-tile ${exchange.includes(t.id)?"selected":""}`} onClick={()=>setExchange(s=>s.includes(t.id)?s.filter(id=>id!==t.id):[...s,t.id])}><TileFace tile={t}/></button>)}</div><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Avbryt</button><button className="primary-button" disabled={!exchange.length || exchange.length>game.remaining} onClick={()=>void play("exchange")}>Byt {exchange.length || ""} {exchange.length===1?"bricka":"brickor"}<Shuffle size={17}/></button></div></Modal>}
    {modal==="history" && <Modal title="Matchens drag" onClose={()=>setModal(null)}>{historyList()}</Modal>}
    {modal==="rules" && <Modal title="En liten guide till stora ord." onClose={()=>setModal(null)}><div className="rules-content"><p className="rules-intro">Åtta brickor var. Ett bräde tillsammans. Flest poäng vinner.</p><h3>Hitta din plats</h3><p>Första ordet ska täcka stjärnan. Lägg sedan brickor i en sammanhängande rad eller kolumn som ansluter till det som redan finns. Ord läses åt höger och nedåt. Alla nya ord måste finnas i ordlistan.</p><h3>Hela ordet räknas</h3><p>Ligger BOK redan på brädet och du lägger EN, får du poäng för hela BOKEN. Bildar du flera ord samtidigt får du poäng för allihop.</p><div className="rules-bonuses">{[["DB","Dubbel bokstav"],["TB","Trippel bokstav"],["DO","Dubbelt ord"],["TO","Trippelt ord"]].map(([code,text])=><span key={code}><i className={`legend-swatch bonus-${code}`}>{code}</i>{text}</span>)}</div><p>Bonusrutor gäller bara när en ny bricka läggs där. Bokstavsbonus räknas före ordbonus. Flera ordbonusar multipliceras. Lägg alla åtta brickorna och få <strong>50 extra poäng</strong>.</p><h3>Din tur, ditt val</h3><p>Spela ett ord, byt brickor eller stå över. Vid byte måste det finnas minst lika många brickor i påsen som du vill byta. De gamla blandas tillbaka efter att du fått nya.</p><p>Välj en bricka och tryck på en ruta, eller dra den dit. Du kan flytta dina preliminära brickor och ta tillbaka dem innan du trycker Spela ord. Med tangentbord väljer du brickor med Tab och Enter, flyttar mellan rutor med piltangenterna och placerar med Enter. Zooma med +/−, mushjul eller två fingrar.</p><h3>Jokrar & sluträkning</h3><p>Två blanka jokrar kan bli valfri bokstav och ger 0 bokstavspoäng. Matchen slutar när påsen är tom och någon tömt sitt ställ, eller efter sex turer utan utlägg. Kvarvarande brickpoäng dras av; den som går ut får också motståndarens kvarvarande poäng.</p><h3>Svenska ord och böjningar</h3><p>Spelet använder 709 193 ordformer ur SALDOs morfologi, inklusive singular, plural och andra böjningar. Exempel: BOK, BOKEN, BÖCKER och BÖCKERNA. Egennamn, förkortningar, flerordsuttryck och rena sammansättningsled har filtrerats bort. Ordlistan avgör vilka ord som är spelbara och ändras inte under en match.</p><p className="dictionary-credit">Språkbanken (2017), SALDOs morfologi, Göteborgs universitet. Bearbetat urval för Voltura Ord. <a href="https://spraakbanken.gu.se/resurser/saldom" target="_blank" rel="noreferrer">Källa</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p></div></Modal>}
  </div>;
}



