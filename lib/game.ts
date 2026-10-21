export const SIZE = 15;
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ";
export type Bonus = "DO" | "TO" | "DB" | "TB" | "";
export type Tile = { id: string; letter: string; points: number };
export type BoardTile = Tile & { blank?: boolean };
export type Placement = { tileId: string; index: number; letter?: string };
export type Word = { text: string; score: number; cells: number[] };
export type Move = {
  id: string; player: number; kind: "play" | "exchange" | "pass";
  words: Word[]; score: number; bonus: number; cells: number[]; at: string;
};
export type Game = {
  id: string; version: number; dictionaryVersion: string;
  status: "waiting" | "playing" | "finished";
  players: [string, string]; scores: [number, number];
  racks: [Tile[], Tile[]]; bag: Tile[]; board: (BoardTile | null)[];
  turn: number; scoreless: number; history: Move[];
  adjustments?: [number, number]; finishReason?: "empty" | "passes";
  rematchId?: string;
};
export type GameView = Omit<Game, "racks" | "bag"> & {
  me: number; rack: Tile[]; rackCounts: [number, number]; remaining: number;
};
export type Action = {
  id: string; version: number; kind: "play" | "exchange" | "pass";
  placements?: Placement[]; tileIds?: string[];
};
export class GameError extends Error {
  cells: number[];
  constructor(message: string, cells: number[] = []) { super(message); this.cells = cells; }
}
export const POINTS: Record<string, number> = {};
for (const [letters, points] of [["ADEILNORST", 1], ["BFGHKMPUV", 2], ["JYÅÄÖ", 3], ["CQWXZ", 4]] as const) {
  for (const letter of letters) POINTS[letter] = points;
}
export const DISTRIBUTION: Record<string, number> = {
  A:8,B:2,C:1,D:4,E:7,F:2,G:3,H:2,I:5,J:1,K:3,L:5,M:3,N:6,O:5,P:2,Q:1,R:7,S:7,T:7,U:3,V:2,W:1,X:1,Y:1,Z:1,Å:2,Ä:3,Ö:3,"":2,
};
export const BONUSES: Bonus[] = Array(225).fill("");
const bonusCells: Record<Exclude<Bonus, "">, number[][]> = {
  TO:[[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]],
  DO:[[1,1],[2,2],[3,3],[4,4],[7,7],[10,10],[11,11],[12,12],[13,13],[1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1]],
  TB:[[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]],
  DB:[[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],[7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]],
};
for (const [bonus, cells] of Object.entries(bonusCells)) for (const [r,c] of cells) BONUSES[r*15+c] = bonus as Bonus;

export function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length-1; i > 0; i--) { const j = randomInt(i+1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function newGame(id: string, name: string, dictionaryVersion: string): Game {
  const bag = shuffle(Object.entries(DISTRIBUTION).flatMap(([letter,count]) =>
    Array.from({length:count}, (_,i) => ({id:`${letter || "blank"}-${i}`, letter, points:POINTS[letter] || 0}))));
  return {id, version:0, dictionaryVersion, status:"waiting", players:[name,""], scores:[0,0],
    racks:[bag.splice(0,8),bag.splice(0,8)], bag, board:Array(225).fill(null), turn:0, scoreless:0, history:[]};
}
export function publicView(game: Game, me: number): GameView {
  const {racks,bag,...rest} = game;
  return {...rest, me, rack:racks[me], rackCounts:[racks[0].length,racks[1].length], remaining:bag.length};
}
function adjacent(index: number): number[] {
  const r = Math.floor(index/15), c = index%15;
  return [r>0?index-15:-1,r<14?index+15:-1,c>0?index-1:-1,c<14?index+1:-1].filter(i=>i>=0);
}
export function evaluate(board: (BoardTile|null)[], rack: Tile[], placements: Placement[], validWord?: (word:string)=>boolean) {
  if (!placements.length || placements.length>8) throw new GameError("Lägg ut minst en bricka, högst åtta.");
  const ids = new Set<string>(), cells = new Set<number>(), next = [...board];
  for (const p of placements) {
    if (!Number.isInteger(p.index) || p.index<0 || p.index>=225) throw new GameError("Brickan måste ligga på spelplanen.");
    if (cells.has(p.index) || board[p.index]) throw new GameError("Rutan är redan upptagen.",[p.index]);
    const tile = rack.find(t=>t.id===p.tileId);
    if (!tile || ids.has(p.tileId)) throw new GameError("Använd bara brickorna i ditt ställ.");
    const letter = tile.letter || p.letter?.normalize("NFC").toUpperCase();
    if (!letter || letter.length!==1 || !ALPHABET.includes(letter)) throw new GameError("Välj en bokstav för jokern.",[p.index]);
    next[p.index] = {...tile, letter, blank:tile.letter===""};
    cells.add(p.index); ids.add(p.tileId);
  }
  const indices = [...cells], sameRow = indices.every(i=>Math.floor(i/15)===Math.floor(indices[0]/15)), sameCol = indices.every(i=>i%15===indices[0]%15);
  if (!sameRow && !sameCol) throw new GameError("Lägg brickorna i samma rad eller kolumn.",indices);
  if (indices.length>1) {
    const step = sameRow?1:15;
    for (let i=Math.min(...indices);i<=Math.max(...indices);i+=step) if(!next[i]) throw new GameError("Det får inte finnas tomma rutor i ordet.",indices);
  }
  if (board.every(t=>!t)) {
    if (!cells.has(112)) throw new GameError("Första ordet måste täcka stjärnan i mitten.",indices);
  } else if (!indices.some(i=>adjacent(i).some(j=>board[j]))) {
    throw new GameError("Anslut ordet till minst en utlagd bokstav.",indices);
  }
  const words: Word[] = [], seen = new Set<string>();
  for (const index of indices) for (const step of [1,15]) {
    let start = index;
    const canStep = (from:number,to:number) => to>=0 && to<225 && (step===15 || Math.floor(from/15)===Math.floor(to/15));
    while(canStep(start,start-step) && next[start-step]) start-=step;
    const wordCells:number[] = [];
    for (let i=start; i<225 && next[i] && canStep(start,i); i+=step) wordCells.push(i);
    if(wordCells.length<2) continue;
    const key=`${start}:${step}`; if(seen.has(key)) continue; seen.add(key);
    let sum=0, multiplier=1;
    for(const i of wordCells) {
      const b=cells.has(i)?BONUSES[i]:"";
      sum += next[i]!.points*(b==="DB"?2:b==="TB"?3:1);
      multiplier *= b==="DO"?2:b==="TO"?3:1;
    }
    words.push({text:wordCells.map(i=>next[i]!.letter).join(""),score:sum*multiplier,cells:wordCells});
  }
  if (!words.length) throw new GameError("Bilda ett ord med minst två bokstäver.",indices);
  if(validWord) {
    const invalid = words.filter(w=>!validWord(w.text));
    if(invalid.length) throw new GameError(`${invalid.map(w=>w.text).join(", ")} finns inte i spelets ordlista.`,[...new Set(invalid.flatMap(w=>w.cells))]);
  }
  const bonus = placements.length===8?50:0;
  return {board:next,words,bonus,score:words.reduce((sum,w)=>sum+w.score,0)+bonus,cells:indices};
}
export function applyAction(original: Game, player:number, action:Action, validWord:(word:string)=>boolean, at=new Date().toISOString()): Game {
  // Check idempotency before version/turn: a retry after a lost response is harmless.
  if(original.history.some(m=>m.id===action.id && m.player===player)) return original;
  if(original.status!=="playing") throw new GameError(original.status==="waiting"?"Vänta tills din medspelare har anslutit.":"Matchen är avslutad.");
  if(original.version!==action.version) throw new GameError("Brädet har uppdaterats. Hämta det senaste läget och försök igen.");
  if(original.turn!==player) throw new GameError("Det är din medspelares tur.");
  const game = structuredClone(original), rack=game.racks[player];
  const move: Move = {id:action.id,player,kind:action.kind,words:[],score:0,bonus:0,cells:[],at};
  if(action.kind==="play") {
    const result=evaluate(game.board,rack,action.placements || [],validWord);
    game.board=result.board; Object.assign(move,{words:result.words,score:result.score,bonus:result.bonus,cells:result.cells});
    const used=new Set((action.placements || []).map(p=>p.tileId));
    game.racks[player]=rack.filter(t=>!used.has(t.id));
    game.racks[player].push(...game.bag.splice(0,8-game.racks[player].length));
    game.scores[player]+=result.score; game.scoreless=0;
  } else if(action.kind==="exchange") {
    const ids=action.tileIds || [];
    if(!ids.length || new Set(ids).size!==ids.length || ids.some(id=>!rack.some(t=>t.id===id))) throw new GameError("Välj vilka brickor du vill byta.");
    if(ids.length>game.bag.length) throw new GameError(`Det finns bara ${game.bag.length} brickor kvar i påsen.`);
    const returned=rack.filter(t=>ids.includes(t.id));
    game.racks[player]=[...rack.filter(t=>!ids.includes(t.id)),...game.bag.splice(0,ids.length)];
    game.bag=shuffle([...game.bag,...returned]); game.scoreless++;
  } else if(action.kind==="pass") game.scoreless++;
  else throw new GameError("Okänt drag.");
  game.history.push(move); game.version++; game.turn=1-player;
  const empty=game.bag.length===0 && game.racks[player].length===0;
  if(empty || game.scoreless>=6) {
    const remaining=game.racks.map(r=>r.reduce((s,t)=>s+t.points,0));
    game.adjustments=[-remaining[0],-remaining[1]];
    if(empty) game.adjustments[player]+=remaining[1-player];
    game.scores=[game.scores[0]+game.adjustments[0],game.scores[1]+game.adjustments[1]];
    game.status="finished"; game.finishReason=empty?"empty":"passes";
  }
  return game;
}
