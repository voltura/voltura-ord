import type { GameView, Placement } from "./game.ts";

// Drafts stay private to this device. Reconcile against the latest board and
// our rack, including when a saved draft is restored after an opponent's move.
export function reconcileDraft(placements: Placement[], game: Pick<GameView, "board" | "rack" | "status">): Placement[] {
  if (game.status !== "playing") return [];
  const rackIds = new Set(game.rack.map(tile => tile.id));
  const usedTiles = new Set<string>(), usedCells = new Set<number>();
  return placements.filter(placement => {
    if (!Number.isInteger(placement.index) || placement.index < 0 || placement.index >= game.board.length ||
      game.board[placement.index] || !rackIds.has(placement.tileId) ||
      usedTiles.has(placement.tileId) || usedCells.has(placement.index)) return false;
    usedTiles.add(placement.tileId);
    usedCells.add(placement.index);
    return true;
  });
}
