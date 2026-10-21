import test from "node:test";
import assert from "node:assert/strict";
import { reconcileDraft } from "../lib/draft.ts";
import { applyAction, newGame, publicView, type Placement } from "../lib/game.ts";

function running() {
  const game = newGame("draft-test", "Anna", "test");
  game.status = "playing";
  game.players[1] = "Bo";
  game.turn = 1;
  game.racks[1] = [
    { id: "opponent-b", letter: "B", points: 2 },
    { id: "opponent-o", letter: "O", points: 1 },
    { id: "opponent-k", letter: "K", points: 2 },
  ];
  return game;
}

test("opponent move removes only overlapping draft tiles and keeps the player's rack unchanged", () => {
  const game = running(), before = publicView(game, 0);
  const draft: Placement[] = before.rack.slice(0, 3).map((tile, i) => ({ tileId: tile.id, index: 112 + i }));
  const after = applyAction(game, 1, { id: "opponent-move", version: game.version, kind: "play", placements: game.racks[1].map((tile, i) => ({ tileId: tile.id, index: 111 + i })) }, () => true);
  const view = publicView(after, 0);
  assert.equal(view.turn, 0);
  assert.deepEqual(reconcileDraft(draft, view), [draft[2]]);
  assert.deepEqual(view.rack, before.rack);
  assert.equal(draft.length, 3);
});

test("opponent pass preserves every draft tile", () => {
  const game = running(), view = publicView(game, 0);
  const draft = [{ tileId: view.rack[0].id, index: 112 }];
  const after = applyAction(game, 1, { id: "opponent-pass", version: game.version, kind: "pass" }, () => true);
  assert.deepEqual(reconcileDraft(draft, publicView(after, 0)), draft);
});

test("saved drafts keep their joker letter and survive a newer non-overlapping board", () => {
  const view = publicView(running(), 0);
  view.rack[0] = { id: "blank", letter: "", points: 0 };
  view.board[111] = { id: "other", letter: "A", points: 1 };
  const draft = [{ tileId: "blank", index: 112, letter: "Ö" }];
  assert.deepEqual(reconcileDraft(draft, view), draft);
});

test("unavailable tiles, duplicate placements, occupied cells and invalid coordinates are removed", () => {
  const view = publicView(running(), 0), id = view.rack[0].id;
  view.board[111] = { id: "other", letter: "A", points: 1 };
  assert.deepEqual(reconcileDraft([
    { tileId: "missing", index: 110 }, { tileId: id, index: 111 },
    { tileId: id, index: -1 }, { tileId: id, index: 225 }, { tileId: id, index: 1.5 },
    { tileId: id, index: 112 }, { tileId: id, index: 113 },
    { tileId: view.rack[1].id, index: 112 },
  ], view), [{ tileId: id, index: 112 }]);
});

test("finished games clear the draft and out-of-turn submissions are still rejected", () => {
  const game = running(), view = publicView(game, 0);
  const draft = [{ tileId: view.rack[0].id, index: 112 }];
  assert.deepEqual(reconcileDraft(draft, { ...view, status: "finished" }), []);
  assert.throws(() => applyAction(game, 0, { id: "too-early", version: game.version, kind: "play", placements: draft }, () => true));
});
