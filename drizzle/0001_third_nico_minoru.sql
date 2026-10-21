CREATE TABLE `ord_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ord_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`requester` text NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ord_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ord_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ord_links` (
	`id` text PRIMARY KEY NOT NULL,
	`seat_hash` text NOT NULL,
	`kind` text NOT NULL,
	`game_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ord_players` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ord_players_code_unique` ON `ord_players` (`code`);--> statement-breakpoint
CREATE TABLE `ord_seats` (
	`player_id` text NOT NULL,
	`seat_hash` text NOT NULL,
	PRIMARY KEY(`player_id`, `seat_hash`)
);
