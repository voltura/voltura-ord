import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// A complete snapshot (including history) is updated with one compare-and-swap.
// This keeps the rack, bag, scores and history atomic even on concurrent retries.
export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  state: text("state").notNull(),
  player0: text("player0").notNull(),
  player1: text("player1"),
  invitation: text("invitation").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const players=sqliteTable("ord_players",{id:text("id").primaryKey(),code:text("code").unique()});
export const codeRoutes=sqliteTable("ord_code_routes",{code:text("code").primaryKey(),playerId:text("player_id").notNull()});
export const devices=sqliteTable("ord_devices",{id:text("id").primaryKey(),playerId:text("player_id").notNull()});
export const accounts=sqliteTable("ord_accounts",{id:text("id").primaryKey(),playerId:text("player_id").notNull()});
export const seats=sqliteTable("ord_seats",{playerId:text("player_id").notNull(),seatHash:text("seat_hash").notNull()},t=>[primaryKey({columns:[t.playerId,t.seatHash]})]);
export const links=sqliteTable("ord_links",{id:text("id").primaryKey(),seatHash:text("seat_hash").notNull(),kind:text("kind").notNull(),gameId:text("game_id").notNull()});
export const connections=sqliteTable("ord_connections",{
  id:text("id").primaryKey(),owner:text("owner").notNull(),requester:text("requester").notNull(),deviceId:text("device_id").notNull(),
  name:text("name").notNull(),status:text("status").notNull(),created:integer("created").notNull(),
});
export const limits=sqliteTable("ord_limits",{id:text("id").primaryKey(),count:integer("count").notNull(),expires:integer("expires").notNull()});
export const pushSubscriptions=sqliteTable("ord_push_subscriptions",{
  id:text("id").primaryKey(),deviceId:text("device_id").notNull(),origin:text("origin").notNull(),subscription:text("subscription").notNull(),
});
export const pushDeliveries=sqliteTable("ord_push_deliveries",{
  eventId:text("event_id").notNull(),subscriptionId:text("subscription_id").notNull(),
},t=>[primaryKey({columns:[t.eventId,t.subscriptionId]})]);
