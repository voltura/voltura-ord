import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction, BONUSES, DISTRIBUTION, evaluate, newGame, POINTS, publicView, type BoardTile, type Game, type Placement, type Tile } from "../lib/game.ts";
const buckets:Record<string,string>=JSON.parse(readFileSync(new URL("../data/words.json",import.meta.url),"utf8"));
const valid=(w:string)=>buckets[w.slice(0,2)]?.includes(`\n${w}\n`) || false;
const tiles=(letters:string):Tile[]=>[...letters].map((letter,i)=>({id:`t${i}`,letter:letter==="?"?"":letter,points:POINTS[letter] || 0}));
const empty=()=>Array<BoardTile|null>(225).fill(null);
function place(board:(BoardTile|null)[],word:string,start:number,step=1){tiles(word).forEach((t,i)=>board[start+i*step]={...t,id:`old${start+i*step}`});return board;}
function placements(rack:Tile[],start:number,step=1):Placement[]{return rack.map((t,i)=>({tileId:t.id,index:start+i*step}));}
function running():Game{const g=newGame("test","Anna","test");g.status="playing";g.players[1]="Bo";return g;}

test("100 unique tiles, 8 each, 84 remaining; public view does not expose other rack or bag",()=>{
  assert.equal(Object.values(DISTRIBUTION).reduce((a,b)=>a+b,0),100);
  const g=running();assert.deepEqual(g.racks.map(r=>r.length),[8,8]);assert.equal(g.bag.length,84);
  assert.equal(new Set([...g.bag,...g.racks.flat()].map(t=>t.id)).size,100);
  const v=publicView(g,0);assert.equal("racks" in v,false);assert.equal("bag" in v,false);assert.deepEqual(v.rack,g.racks[0]);
});
test("opening must cover center and have two letters; center doubles word",()=>{
  const r=tiles("BOK");assert.equal(evaluate(empty(),r,placements(r,111),valid).score,10);
  assert.throws(()=>evaluate(empty(),r,placements(r,0),valid),/mitten/);
  assert.throws(()=>evaluate(empty(),r,[{tileId:r[0].id,index:112}],valid),/minst två/);
});
test("BOK plus EN pays for BOKEN, without reusing center double word",()=>{
  const board=place(empty(),"BOK",111),r=tiles("EN");const result=evaluate(board,r,placements(r,114),valid);
  assert.deepEqual(result.words.map(w=>w.text),["BOKEN"]);assert.equal(result.score,7);
});
test("reject diagonal, disconnected, gaps, duplicate tiles, occupied cells and invalid cross words",()=>{
  const r=tiles("BOK"),board=place(empty(),"BOK",111);
  assert.throws(()=>evaluate(empty(),r,[{tileId:r[0].id,index:112},{tileId:r[1].id,index:128}],valid),/samma rad/);
  assert.throws(()=>evaluate(board,r,placements(r,0),valid),/Anslut/);
  assert.throws(()=>evaluate(empty(),r,[{tileId:r[0].id,index:112},{tileId:r[1].id,index:114}],valid),/tomma/);
  assert.throws(()=>evaluate(board,r,[{tileId:r[0].id,index:112}],valid),/upptagen/);
  assert.throws(()=>evaluate(empty(),r,[{tileId:r[0].id,index:112},{tileId:r[0].id,index:113}],valid),/ställ/);
  const rr=tiles("ÖL");assert.throws(()=>evaluate(board,rr,placements(rr,126),valid),/ordlista/);
});
test("crossing one tile forms and scores two complete words once each",()=>{
  const b=empty();place(b,"BO",110);place(b,"KO",82,15);const r=tiles("K");
  const result=evaluate(b,r,[{tileId:r[0].id,index:112}],valid);
  assert.deepEqual(result.words.map(w=>w.text).sort(),["BOK","KOK"]);
  assert.equal(result.score,20); // both words 5, center doubles both
});
test("side contact works; every new side word must be valid",()=>{
  const b=place(empty(),"AT",111),r=tiles("TA");
  const result=evaluate(b,r,placements(r,126),w=>["TA","AT"].includes(w));
  assert.equal(result.words.length,3);
  assert.throws(()=>evaluate(b,r,placements(r,126),w=>w==="TA"),/AT/);
});
test("bridges through existing tiles, downwards extension and used letter bonus",()=>{
  const b=place(empty(),"O",112);const r=tiles("BK");
  assert.equal(evaluate(b,r,[{tileId:r[0].id,index:111},{tileId:r[1].id,index:113}],valid).words[0].text,"BOK");
  const vertical=place(empty(),"BOK",97,15),en=tiles("EN");
  assert.equal(evaluate(vertical,en,placements(en,142,15),valid).words[0].text,"BOKEN");
  const bonus=place(empty(),"BOK",105);assert.equal(BONUSES[108],"DB");
  const first=evaluate(bonus,en,placements(en,108),valid);assert.equal(first.score,8);
  const s=tiles("S");assert.equal(evaluate(first.board,s,placements(s,110),valid).score,8);
});
test("multiple word bonuses multiply, letter multiplier happens first",()=>{
  const b=place(empty(),"A",7),r=tiles("ABCDEFG");
  const result=evaluate(b,r,placements(r,0),()=>true);
  assert.equal(result.score,15*3); // D on DB; existing A on TO is already consumed
  const first=evaluate(empty(),tiles("ABCDEFGH"),placements(tiles("ABCDEFGH"),105),()=>true);
  assert.equal(first.score,(1+2+4+1*2+1+2+2+2)*6+50); // A at TO, D at DB, H at center DO
});
test("joker has zero points but triggers word bonus, and eight tiles give exactly 50",()=>{
  const r=tiles("?OK"),p=placements(r,111);p[0].letter="B";
  const result=evaluate(empty(),r,p,valid);assert.equal(result.score,6);assert.equal(result.board[111]?.blank,true);
  const b=tiles("BOKSTÄVE"),v=evaluate(empty(),b,placements(b,108),()=>true);assert.equal(v.bonus,50);
  assert.equal(evaluate(empty(),r,p,valid).bonus,0);
  assert.throws(()=>evaluate(empty(),r,placements(r,111),valid),/jokern/);
});
test("real dictionary includes inflections, rejects names, fragments, nonsense",()=>{
  for(const w of ["BOK","BOKEN","BÖCKER","BÖCKERNA","SPELA","SPELADE","VÄNNER","HEMMA"])assert.ok(valid(w),w);
  for(const w of ["STOCKHOLM","JOAKIM","ABCXYZ","HÄLSO-"])assert.equal(valid(w),false,w);
});
test("play refills rack, scores atomically, respects turn and version, retries idempotently",()=>{
  const g=running();g.racks[0]=tiles("BOKENABC");
  const action={id:"move1",version:0,kind:"play" as const,placements:placements(g.racks[0].slice(0,3),111)};
  const next=applyAction(g,0,action,valid);assert.equal(next.scores[0],10);assert.equal(next.racks[0].length,8);assert.equal(next.bag.length,81);assert.equal(next.turn,1);assert.equal(g.scores[0],0);
  assert.equal(applyAction(next,0,action,valid),next);
  assert.throws(()=>applyAction(next,0,{id:"new",version:1,kind:"pass"},valid),/medspelares/);
  assert.throws(()=>applyAction(next,1,{id:"new",version:0,kind:"pass"},valid),/uppdaterats/);
});
test("exchange draws before returning tiles and consumes a turn",()=>{
  const g=running(),old=g.racks[0].slice(0,2),expected=g.bag.slice(0,2).map(t=>t.id);
  const next=applyAction(g,0,{id:"x",version:0,kind:"exchange",tileIds:old.map(t=>t.id)},valid);
  assert.ok(expected.every(id=>next.racks[0].some(t=>t.id===id)));assert.ok(old.every(t=>next.bag.some(b=>b.id===t.id)));
  assert.equal(next.bag.length,g.bag.length);assert.equal(next.turn,1);assert.equal(next.scoreless,1);
  g.bag=[];assert.throws(()=>applyAction(g,0,{id:"x",version:0,kind:"exchange",tileIds:[old[0].id]},valid),/bara 0/);
});
test("six non-placement turns finish and deduct each rack; valid play resets counter",()=>{
  let g=running();const deductions=g.racks.map(r=>-r.reduce((s,t)=>s+t.points,0));
  for(let i=0;i<6;i++)g=applyAction(g,g.turn,{id:`pass${i}`,version:g.version,kind:"pass"},valid);
  assert.equal(g.status,"finished");assert.deepEqual(g.scores,deductions);assert.deepEqual(g.adjustments,deductions);
  const reset=running();reset.scoreless=5;reset.racks[0]=tiles("BOK");
  assert.equal(applyAction(reset,0,{id:"b",version:0,kind:"play",placements:placements(reset.racks[0],111)},valid).scoreless,0);
});
test("empty bag and rack ends match, transfers opponent leftovers, partial rack gives no bingo",()=>{
  const g=running();g.bag=[];g.racks=[tiles("BOK"),tiles("XZ")];
  const next=applyAction(g,0,{id:"finish",version:0,kind:"play",placements:placements(g.racks[0],111)},valid);
  assert.equal(next.status,"finished");assert.deepEqual(next.adjustments,[8,-8]);assert.deepEqual(next.scores,[18,-8]);assert.equal(next.history[0].bonus,0);
});
