"use client";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Maximize2, Minus, Plus, Star } from "lucide-react";
import { BONUSES, type BoardTile, type Placement, type Tile } from "@/lib/game";

export function TileFace({tile,letter}:{tile:Tile;letter?:string}) {
  return <><span className="tile-letter">{letter || tile.letter || <span className="blank-symbol">◇</span>}</span><span className="tile-points">{tile.points}</span></>;
}
type Props={board:(BoardTile|null)[];rack:Tile[];placements:Placement[];selected:string|null;last:number[];errors:number[];interactive:boolean;onCell:(index:number)=>void;onDropTile:(id:string,index:number)=>void;onTilePointer:(event:PointerEvent,id:string)=>void;demo?:boolean;remaining?:number};
export default function Board({board,rack,placements,selected,last,errors,interactive,onCell,onDropTile,onTilePointer,demo=false,remaining}:Props) {
  const viewport=useRef<HTMLDivElement>(null), [side,setSide]=useState(600),[zoom,setZoom]=useState(1),[focus,setFocus]=useState(112);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const gesture=useRef<{distance:number;zoom:number;panX:number;panY:number;scrollX:number;scrollY:number}|null>(null);
  const suppressed=useRef(false);
  useEffect(()=>{const clear=(e:globalThis.PointerEvent)=>{pointers.current.delete(e.pointerId);if(!pointers.current.size)gesture.current=null;};window.addEventListener("pointerup",clear);window.addEventListener("pointercancel",clear);return()=>{window.removeEventListener("pointerup",clear);window.removeEventListener("pointercancel",clear);};},[]);
  useEffect(()=>{const el=viewport.current;if(!el)return;const ro=new ResizeObserver(()=>setSide(el.clientWidth));ro.observe(el);return()=>ro.disconnect();},[]);
  function changeZoom(value:number){setZoom(Math.max(1,Math.min(2.8,value)));}
  useEffect(()=>{const el=viewport.current;if(!el || demo)return;const wheel=(e:WheelEvent)=>{e.preventDefault();setZoom(z=>Math.max(1,Math.min(2.8,z+(e.deltaY>0?-.15:.15))));};el.addEventListener("wheel",wheel,{passive:false});return()=>el.removeEventListener("wheel",wheel);},[demo]);
  function down(e:PointerEvent<HTMLDivElement>){
    if(demo)return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});suppressed.current=false;
    const ps=[...pointers.current.values()],el=viewport.current!;
    if(ps.length===2){gesture.current={distance:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),zoom,panX:e.clientX,panY:e.clientY,scrollX:el.scrollLeft,scrollY:el.scrollTop};suppressed.current=true;}
    else if(!(e.target as Element).closest("[data-draft]"))gesture.current={distance:0,zoom,panX:e.clientX,panY:e.clientY,scrollX:el.scrollLeft,scrollY:el.scrollTop};
  }
  function move(e:PointerEvent<HTMLDivElement>){
    if(!pointers.current.has(e.pointerId))return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current,el=viewport.current!;if(!g)return;
    const ps=[...pointers.current.values()];
    if(ps.length===2 && g.distance>0){changeZoom(g.zoom*Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)/g.distance);suppressed.current=true;}
    else if(zoom>1 && ps.length===1){const dx=e.clientX-g.panX,dy=e.clientY-g.panY;if(Math.hypot(dx,dy)>7){el.scrollLeft=g.scrollX-dx;el.scrollTop=g.scrollY-dy;suppressed.current=true;}}
  }
  function end(e:PointerEvent<HTMLDivElement>){pointers.current.delete(e.pointerId);gesture.current=null;}
  return <div className={`board-section ${demo?"demo-board":""}`}>
    {!demo && <div className="board-toolbar"><span><i className="tiny-dot"/><span className="board-title">SPELPLANEN</span><span className="mobile-bag">{remaining} brickor kvar</span></span><div className="zoom-tools"><button aria-label="Zooma ut" disabled={zoom<=1} onClick={()=>changeZoom(zoom-.3)}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zooma in" disabled={zoom>=2.8} onClick={()=>changeZoom(zoom+.3)}><Plus size={15}/></button><span className="toolbar-divider"/><button aria-label="Visa hela brädet" onClick={()=>{setZoom(1);viewport.current?.scrollTo(0,0);}}><Maximize2 size={15}/></button></div></div>}
    <div className={`board-viewport${zoom>1?" is-zoomed":""}`} ref={viewport} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="board-surface" style={{width:side*zoom} as CSSProperties}>
        <div className="board-grid" role="grid" aria-label={demo?"Exempel på spelplan":"Spelplan, 15 gånger 15 rutor"}>
          {board.map((placed,index)=>{
            const draft=placements.find(p=>p.index===index),tile=draft?rack.find(t=>t.id===draft.tileId):placed,bonus=BONUSES[index];
            const label=`${"ABCDEFGHIJKLMNO"[index%15]}${Math.floor(index/15)+1}`;
            return <button key={index} type="button" role="gridcell" data-cell={index} data-draft={draft?"true":undefined} tabIndex={!demo && focus===index?0:-1}
              className={`board-cell ${tile?"filled":"bonus-"+bonus} ${draft?"draft":""} ${draft && draft.tileId===selected?"selected":""} ${last.includes(index)?"last-played":""} ${errors.includes(index)?"invalid-cell":""}`}
              aria-label={`${label}${tile?`, ${draft?.letter || tile.letter || "joker"}, ${tile.points} poäng`:bonus?`, ${bonus}`:", tom ruta"}${draft?", preliminär bricka":""}`}
              onFocus={()=>setFocus(index)}
              onClick={()=>{if(!suppressed.current && !demo)onCell(index);}}
              onPointerDown={e=>{if(draft && interactive && e.isPrimary){e.stopPropagation();onTilePointer(e,draft.tileId);}}}
              onDragOver={e=>{if(interactive && !placed)e.preventDefault();}}
              onDrop={e=>{e.preventDefault();if(interactive)onDropTile(e.dataTransfer.getData("text/plain"),index);}}
              onKeyDown={e=>{const deltas:Record<string,number>={ArrowRight:1,ArrowLeft:-1,ArrowDown:15,ArrowUp:-15};if(e.key in deltas){e.preventDefault();const next=Math.max(0,Math.min(224,index+deltas[e.key]));setFocus(next);viewport.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus();}}}>
              {tile?<TileFace tile={tile} letter={draft?.letter}/>:index===112?<Star className="center-star" size={22} fill="currentColor"/>:bonus?<span className="bonus-label">{bonus}</span>:null}
            </button>;
          })}
        </div>
      </div>
    </div>
    <div className="board-legend">{[["DO","Dubbelt ord"],["TO","Trippelt ord"],["DB","Dubbel bokstav"],["TB","Trippel bokstav"]].map(([code,label])=><span key={code}><i className={`legend-swatch bonus-${code}`}>{code}</i>{label}</span>)}</div>
  </div>;
}
