"use client";
import { useEffect,useState } from "react";
import { Bell,Check,LoaderCircle } from "lucide-react";

type State="loading"|"ready"|"enabled"|"denied"|"install"|"unsupported"|"unavailable";
type Setup={registration:ServiceWorkerRegistration;publicKey:string};
async function pushRequest(data?:unknown){
  const response=await fetch("/api/push",{method:data?"POST":"GET",headers:data?{"Content-Type":"application/json"}:{},body:data?JSON.stringify(data):undefined,cache:"no-store",signal:AbortSignal.timeout(10000)});
  const result=await response.json() as {error?:string;publicKey?:string;enabled?:boolean};if(!response.ok)throw new Error(result.error || "Försök igen.");
  return result as {publicKey?:string;enabled?:boolean};
}
function applicationKey(key:string){
  const value=atob(key.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-key.length%4)%4));
  return Uint8Array.from(value,c=>c.charCodeAt(0));
}
export default function Notifications({settings=false}:{settings?:boolean}){
  const [state,setState]=useState<State>("loading"),[setup,setSetup]=useState<Setup|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let stopped=false;
    const initialize=async()=>{
      const ios=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
      const standalone=matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone===true);
      if(ios && !standalone){setState("install");return;}
      if(!isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)){setState("unsupported");return;}
      try{
        const config=await pushRequest();if(stopped)return;
        if(!config.publicKey){setState("unavailable");return;}
        await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});
        let timeout:ReturnType<typeof setTimeout>|undefined;
        const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error("Öppna appen igen och försök en gång till.")),10000);})]).finally(()=>clearTimeout(timeout));
        if(stopped)return;
        setSetup({registration,publicKey:config.publicKey});
        if(Notification.permission==="denied"){setState("denied");return;}
        const existing=await registration.pushManager.getSubscription();
        if(existing && Notification.permission==="granted"){
          await pushRequest({op:"subscribe",subscription:existing.toJSON()});if(!stopped)setState("enabled");
        }else if(!stopped)setState("ready");
      }catch(e){if(!stopped){setState("ready");setError(e instanceof Error?e.message:"Anslut till internet och försök igen.");}}
    };
    void initialize();const refresh=()=>void initialize();window.addEventListener("ord-notifications",refresh);
    return()=>{stopped=true;window.removeEventListener("ord-notifications",refresh);};
  },[retry]);
  async function enable(){
    if(busy)return;if(!setup){setState("loading");setError("");setRetry(n=>n+1);return;}setBusy(true);setError("");
    // Ask immediately inside the tap handler: iOS requires a direct user gesture.
    try{
      const permission=Notification.permission==="granted"?Promise.resolve("granted"):Notification.requestPermission();
      const allowed=await permission;if(allowed!=="granted"){setState(allowed==="denied"?"denied":"ready");return;}
      const subscription=await setup.registration.pushManager.getSubscription() || await setup.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(setup.publicKey)});
      await pushRequest({op:"subscribe",subscription:subscription.toJSON()});setState("enabled");window.dispatchEvent(new Event("ord-notifications"));
    }catch(e){setError(e instanceof Error?e.message:"Notiser kunde inte aktiveras. Försök igen.");}finally{setBusy(false);}
  }
  async function disable(){
    if(busy || !setup)return;setBusy(true);setError("");
    try{
      await pushRequest({op:"disable"});const subscription=await setup.registration.pushManager.getSubscription();
      if(subscription && !await subscription.unsubscribe())throw new Error("Notiser stängdes av. Öppna appen igen om statusen inte uppdateras.");
      setState("ready");window.dispatchEvent(new Event("ord-notifications"));
    }catch(e){setError(e instanceof Error?e.message:"Försök igen.");}finally{setBusy(false);}
  }
  if(state==="loading" || (!settings && ["unsupported","unavailable"].includes(state)))return null;
  return <div className="notification-control" aria-label="Notiser">
    {state==="enabled"?<><p className="notification-enabled"><Check size={18}/> Notiser är på</p>{settings && <button className="secondary-button" disabled={busy} onClick={()=>void disable()}>Stäng av notiser på denna enhet</button>}</>:
      state==="install"?<p>Öppna Voltura Ord från symbolen på hemskärmen för att aktivera notiser.</p>:
      state==="unsupported"?<p>Den här webbläsaren stöder inte notiser.</p>:
      state==="unavailable"?<p>Notiser blir tillgängliga snart.</p>:
      state==="denied"?<p>Notiser är avstängda i telefonen. Slå på dem i Inställningar → Notiser → Voltura Ord.</p>:
      <><p>Få en notis när din medspelare har spelat ett ord.</p><button className="primary-button" disabled={busy} onClick={()=>void enable()}>{busy?<LoaderCircle className="spin" size={20}/>:<Bell size={20}/>} Aktivera notiser</button></>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
